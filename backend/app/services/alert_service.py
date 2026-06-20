"""
RavenWatch alert service.

Sends email notifications via the Resend API after each scrape run.
If RESEND_API_KEY is not set, warnings are logged and emails are skipped silently.

Alert rule engine (OSINT-15):
  Critical — Deng Xijun co-mentioned with MNDAA/UWSA, or Chinese delegation in Lashio
  High     — Deng Xijun statement/travel, or MFA "peace process"+"Myanmar"
  Standard — any watchlist entity match
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

import httpx
from supabase import Client

logger = logging.getLogger(__name__)

RESEND_ENDPOINT = "https://api.resend.com/emails"
TELEGRAM_API = "https://api.telegram.org/bot{token}/sendMessage"

_PRIORITY_EMOJI = {"critical": "🔴", "high": "🟡", "standard": "🔵"}

# ---------------------------------------------------------------------------
# Alert rule definitions (matched against entity names, case-insensitive)
# ---------------------------------------------------------------------------

# Critical: Deng Xijun co-tagged with any MNDAA/UWSA entity in same article
_CRITICAL_ENTITIES_PRIMARY = {"deng xijun", "邓锡军"}
_CRITICAL_ENTITIES_SECONDARY = {"mndaa", "myanmar national democratic alliance army", "uwsa", "united wa state army", "wa state army"}
# Critical phrase pair: both must appear in article text
_CRITICAL_PHRASE_PAIRS: list[tuple[str, str]] = [
    ("chinese delegation", "lashio"),
]

# High: Deng Xijun alone, or MFA + peace process + myanmar in text
_HIGH_ENTITIES = {"deng xijun", "邓锡军", "mfa", "chinese foreign ministry", "ministry of foreign affairs"}
_HIGH_PHRASE_PAIRS: list[tuple[str, str]] = [
    ("peace process", "myanmar"),
]


# ---------------------------------------------------------------------------
# Internal Resend transport
# ---------------------------------------------------------------------------


async def _send_via_resend(to_email: str, subject: str, html: str) -> bool:
    """
    Send a single email via Resend API.
    POST https://api.resend.com/emails
    Returns True on success, False on any failure.
    """
    api_key = os.environ.get("RESEND_API_KEY", "")
    if not api_key:
        logger.warning("RESEND_API_KEY not set — skipping email to %s", to_email)
        return False

    from_address = os.environ.get("RESEND_FROM_EMAIL", "alerts@ravenwatch.local")
    from_field = f"RavenWatch <{from_address}>"

    payload = {
        "from": from_field,
        "to": [to_email],
        "subject": subject,
        "html": html,
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                RESEND_ENDPOINT,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

        if resp.status_code in (200, 201):
            logger.info("Email sent to %s (subject: %s)", to_email, subject)
            return True

        logger.warning(
            "Resend returned %s for %s — body: %s",
            resp.status_code,
            to_email,
            resp.text[:200],
        )
        return False

    except Exception as exc:
        logger.error("Resend exception for %s: %s", to_email, exc)
        return False


# ---------------------------------------------------------------------------
# Telegram transport
# ---------------------------------------------------------------------------


async def _send_telegram(text: str) -> bool:
    """Send a message to the configured Telegram channel. Returns True on success."""
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    channel_id = os.environ.get("TELEGRAM_CHANNEL_ID", "")
    if not token or not channel_id:
        logger.warning("TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID not set — skipping Telegram alert")
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                TELEGRAM_API.format(token=token),
                json={"chat_id": channel_id, "text": text, "parse_mode": "HTML"},
            )
        if resp.status_code == 200:
            return True
        logger.warning("Telegram API returned %s: %s", resp.status_code, resp.text[:200])
        return False
    except Exception as exc:
        logger.error("Telegram send exception: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Alert log helper
# ---------------------------------------------------------------------------


def _log_alert(
    db: Client,
    subject: str,
    channel: str = "email",
    article_id=None,
    priority: str = "standard",
    rule_name: str = "",
) -> None:
    """Insert a row into alert_log. Skips silently on failure."""
    row: dict = {
        "priority": priority,
        "channel": channel,
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "title": subject,
        "rule_name": rule_name,
    }
    if article_id is not None:
        row["article_id"] = str(article_id)

    try:
        db.table("alert_log").insert(row).execute()
    except Exception as exc:
        logger.warning("Failed to write alert_log entry: %s", exc)


# ---------------------------------------------------------------------------
# Rule engine — OSINT-15
# ---------------------------------------------------------------------------


def _entity_names_lower(entity_details: list[dict]) -> set[str]:
    """Flatten entity name + name_zh + aliases to a lowercase set."""
    names: set[str] = set()
    for e in entity_details:
        if e.get("name"):
            names.add(e["name"].lower())
        if e.get("name_zh"):
            names.add(e["name_zh"].lower())
        for alias in e.get("aliases") or []:
            if isinstance(alias, str):
                names.add(alias.lower())
    return names


def _check_critical(entity_names: set[str], text_lower: str) -> tuple[bool, str]:
    """Returns (triggered, rule_name)."""
    has_primary = bool(_CRITICAL_ENTITIES_PRIMARY & entity_names)
    has_secondary = bool(_CRITICAL_ENTITIES_SECONDARY & entity_names)
    if has_primary and has_secondary:
        return True, "critical_entity_pair"
    for phrase_a, phrase_b in _CRITICAL_PHRASE_PAIRS:
        if phrase_a in text_lower and phrase_b in text_lower:
            return True, "critical_phrase_pair"
    return False, ""


def _check_high(entity_names: set[str], text_lower: str) -> tuple[bool, str]:
    """Returns (triggered, rule_name)."""
    if _HIGH_ENTITIES & entity_names:
        return True, "high_key_entity"
    for phrase_a, phrase_b in _HIGH_PHRASE_PAIRS:
        if phrase_a in text_lower and phrase_b in text_lower:
            return True, "high_phrase_pair"
    return False, ""


async def evaluate_article_alerts(
    db: Client,
    article_id: str,
    entity_ids: list[str],
    article_text: str = "",
) -> str | None:
    """
    Evaluate priority rules for a newly tagged article and write to alert_log.
    Returns the priority that fired ('critical', 'high', 'standard') or None if no match.
    Skips if an alert was already logged for this article.
    """
    if not entity_ids:
        return None

    # Dedup: skip if we already have an alert for this article
    try:
        existing = (
            db.table("alert_log")
            .select("id")
            .eq("article_id", article_id)
            .limit(1)
            .execute()
        )
        if existing.data:
            return None
    except Exception as exc:
        logger.warning("Could not check existing alerts for %s: %s", article_id, exc)

    # Fetch full entity details for the matched IDs
    entity_details: list[dict] = []
    try:
        res = db.table("entities").select("id, name, name_zh, aliases").in_("id", entity_ids).execute()
        entity_details = res.data or []
    except Exception as exc:
        logger.warning("Could not fetch entity details for alert evaluation: %s", exc)

    entity_names = _entity_names_lower(entity_details)
    text_lower = article_text.lower()

    # Evaluate tiers top-down — highest wins
    triggered, rule_name = _check_critical(entity_names, text_lower)
    if triggered:
        priority = "critical"
    else:
        triggered, rule_name = _check_high(entity_names, text_lower)
        priority = "high" if triggered else "standard"
        if not triggered:
            rule_name = "standard_entity_match"

    # Fetch article title for the log entry
    title = "Untitled article"
    try:
        art_res = db.table("articles").select("title").eq("id", article_id).maybe_single().execute()
        if art_res.data and art_res.data.get("title"):
            title = art_res.data["title"]
    except Exception:
        pass

    alert_title = f"[{priority.upper()}] {title}"
    _log_alert(db, subject=alert_title, channel="internal", article_id=article_id, priority=priority, rule_name=rule_name)
    logger.info("Alert fired: article=%s priority=%s rule=%s", article_id, priority, rule_name)

    # Critical alerts fire immediately to Telegram
    if priority == "critical":
        emoji = _PRIORITY_EMOJI["critical"]
        # Fetch article URL for the link
        article_url = ""
        try:
            url_res = db.table("articles").select("url").eq("id", article_id).maybe_single().execute()
            if url_res.data:
                article_url = url_res.data.get("url", "")
        except Exception:
            pass
        msg = (
            f"{emoji} <b>CRITICAL ALERT</b>\n"
            f"{title}\n"
            f"Rule: <code>{rule_name}</code>\n"
        )
        if article_url:
            msg += f'<a href="{article_url}">Read article →</a>'
        await _send_telegram(msg)
        _log_alert(db, subject=alert_title, channel="telegram", article_id=article_id, priority=priority, rule_name=rule_name)

    return priority


# ---------------------------------------------------------------------------
# Email HTML builders
# ---------------------------------------------------------------------------


def _build_scrape_summary_html(scrape_result: dict, early_signal_count: int, top_entities: list[dict]) -> str:
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    sources_attempted = scrape_result.get("sources_attempted", 0)
    articles_found = scrape_result.get("articles_found", 0)
    articles_inserted = scrape_result.get("articles_inserted", 0)
    articles_translated = scrape_result.get("articles_translated", 0)
    articles_tagged = scrape_result.get("articles_tagged", 0)

    # Entity rows
    entity_rows = ""
    if top_entities:
        for ent in top_entities:
            entity_rows += (
                f"<tr>"
                f"<td style='padding:6px 12px;border-bottom:1px solid #e5e7eb;'>{ent.get('name', '—')}</td>"
                f"<td style='padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;'>{ent.get('article_count', 0)}</td>"
                f"</tr>"
            )
    else:
        entity_rows = "<tr><td colspan='2' style='padding:6px 12px;color:#6b7280;'>No entity matches recorded.</td></tr>"

    early_signal_row = (
        f"<p style='margin:16px 0;font-size:14px;color:#111827;'>"
        f"<strong>Early signals detected:</strong> {early_signal_count}"
        f"</p>"
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>RavenWatch — Scrape Complete</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#0f172a;padding:24px 32px;">
              <h1 style="margin:0;color:#f8fafc;font-size:20px;letter-spacing:0.5px;">
                RavenWatch
              </h1>
              <p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">Scrape Complete — {date_str}</p>
            </td>
          </tr>

          <!-- Summary stats -->
          <tr>
            <td style="padding:28px 32px 16px;">
              <h2 style="margin:0 0 16px;font-size:16px;color:#111827;">Run Summary</h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
                <thead>
                  <tr style="background:#f1f5f9;">
                    <th style="padding:8px 12px;text-align:left;font-size:13px;color:#374151;font-weight:600;">Metric</th>
                    <th style="padding:8px 12px;text-align:center;font-size:13px;color:#374151;font-weight:600;">Count</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="padding:8px 12px;border-top:1px solid #e5e7eb;font-size:14px;color:#374151;">Sources scraped</td>
                    <td style="padding:8px 12px;border-top:1px solid #e5e7eb;text-align:center;font-size:14px;font-weight:600;color:#111827;">{sources_attempted}</td>
                  </tr>
                  <tr style="background:#f9fafb;">
                    <td style="padding:8px 12px;border-top:1px solid #e5e7eb;font-size:14px;color:#374151;">New articles</td>
                    <td style="padding:8px 12px;border-top:1px solid #e5e7eb;text-align:center;font-size:14px;font-weight:600;color:#111827;">{articles_inserted} / {articles_found} found</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 12px;border-top:1px solid #e5e7eb;font-size:14px;color:#374151;">Translated</td>
                    <td style="padding:8px 12px;border-top:1px solid #e5e7eb;text-align:center;font-size:14px;font-weight:600;color:#111827;">{articles_translated}</td>
                  </tr>
                  <tr style="background:#f9fafb;">
                    <td style="padding:8px 12px;border-top:1px solid #e5e7eb;font-size:14px;color:#374151;">Tagged</td>
                    <td style="padding:8px 12px;border-top:1px solid #e5e7eb;text-align:center;font-size:14px;font-weight:600;color:#111827;">{articles_tagged}</td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Early signals -->
          <tr>
            <td style="padding:8px 32px 16px;">
              {early_signal_row}
            </td>
          </tr>

          <!-- Entity matches -->
          <tr>
            <td style="padding:8px 32px 28px;">
              <h2 style="margin:0 0 12px;font-size:16px;color:#111827;">Top Entity Matches</h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
                <thead>
                  <tr style="background:#f1f5f9;">
                    <th style="padding:8px 12px;text-align:left;font-size:13px;color:#374151;font-weight:600;">Entity</th>
                    <th style="padding:8px 12px;text-align:center;font-size:13px;color:#374151;font-weight:600;">Articles</th>
                  </tr>
                </thead>
                <tbody>
                  {entity_rows}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0f172a;padding:16px 32px;text-align:center;">
              <p style="margin:0;color:#64748b;font-size:12px;">RavenWatch Intelligence Platform</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def send_telegram_batch_summary(db: Client, scrape_result: dict) -> None:
    """
    Send a batched Telegram summary of High/Standard alerts from the latest scrape run.
    Called at end of each scrape run.
    """
    articles_inserted = scrape_result.get("articles_inserted", 0)
    if articles_inserted == 0:
        return  # Nothing to report

    # Fetch High/Standard alerts logged since last ~2h (covers current run)
    try:
        from datetime import timedelta
        since = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        result = (
            db.table("alert_log")
            .select("title, priority, article_id")
            .in_("priority", ["high", "standard"])
            .gte("sent_at", since)
            .eq("channel", "internal")
            .order("sent_at", desc=True)
            .limit(20)
            .execute()
        )
        alerts = result.data or []
    except Exception as exc:
        logger.warning("Could not fetch batch alerts for Telegram: %s", exc)
        return

    if not alerts:
        return

    high_alerts = [a for a in alerts if a["priority"] == "high"]
    std_alerts = [a for a in alerts if a["priority"] == "standard"]

    lines = [f"📊 <b>RavenWatch — Scrape Complete</b>"]
    lines.append(f"{articles_inserted} new articles added\n")

    if high_alerts:
        lines.append(f"🟡 <b>{len(high_alerts)} HIGH</b>")
        for a in high_alerts[:5]:
            title = (a.get("title") or "").replace("[HIGH] ", "").replace("[high] ", "")
            lines.append(f"  • {title}")
        if len(high_alerts) > 5:
            lines.append(f"  …and {len(high_alerts) - 5} more")

    if std_alerts:
        lines.append(f"\n🔵 <b>{len(std_alerts)} standard</b> entity matches")

    await _send_telegram("\n".join(lines))


async def send_scrape_summary_email(db: Client, scrape_result: dict) -> dict:
    """
    Send a scrape completion summary email to all registered users.

    scrape_result keys: sources_attempted, articles_found, articles_inserted,
                        articles_translated, articles_tagged

    Returns {"sent": N, "failed": N}.
    """
    if not os.environ.get("RESEND_API_KEY"):
        logger.warning("RESEND_API_KEY not set — skipping scrape summary email")
        return {"sent": 0, "failed": 0}

    # Fetch all users
    try:
        user_result = db.table("users").select("id, email").execute()
        users: list[dict] = user_result.data or []
    except Exception as exc:
        logger.error("Failed to fetch users for email: %s", exc)
        return {"sent": 0, "failed": 0}

    if not users:
        logger.info("No users registered — skipping scrape summary email")
        return {"sent": 0, "failed": 0}

    # Gather early signal count from the current scrape window
    early_signal_count = 0
    top_entities: list[dict] = []
    try:
        es_result = (
            db.table("articles")
            .select("id")
            .eq("is_early_signal", True)
            .order("scraped_at", desc=True)
            .limit(100)
            .execute()
        )
        early_signal_count = len(es_result.data or [])
    except Exception as exc:
        logger.warning("Could not fetch early signal count: %s", exc)

    # Fetch top entity matches (entity name + article count via article_entities join)
    try:
        ent_result = (
            db.table("article_entities")
            .select("entity_id, entities(name)")
            .limit(500)
            .execute()
        )
        # Aggregate counts client-side (avoids needing a group-by RPC)
        entity_counts: dict[str, dict] = {}
        for row in (ent_result.data or []):
            eid = row.get("entity_id")
            name = (row.get("entities") or {}).get("name", eid)
            if eid:
                if eid not in entity_counts:
                    entity_counts[eid] = {"name": name, "article_count": 0}
                entity_counts[eid]["article_count"] += 1

        top_entities = sorted(entity_counts.values(), key=lambda x: x["article_count"], reverse=True)[:10]
    except Exception as exc:
        logger.warning("Could not fetch entity matches: %s", exc)

    # Build email
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    subject = f"RavenWatch — Scrape Complete [{date_str}]"
    html = _build_scrape_summary_html(scrape_result, early_signal_count, top_entities)

    sent = 0
    failed = 0
    for user in users:
        email = user.get("email", "").strip()
        if not email:
            continue
        success = await _send_via_resend(email, subject, html)
        if success:
            sent += 1
        else:
            failed += 1

    # Log a single batch alert_log entry (article_id is NULL — allowed per model)
    _log_alert(db, subject=subject, channel="email", article_id=None)

    logger.info("Scrape summary emails: sent=%d failed=%d", sent, failed)
    return {"sent": sent, "failed": failed}


async def send_alert_email(db: Client, subject: str, body_html: str) -> dict:
    """
    Send a custom alert email to all registered users.
    Logs to alert_log table.
    Returns {"sent": N, "failed": N}.
    """
    if not os.environ.get("RESEND_API_KEY"):
        logger.warning("RESEND_API_KEY not set — skipping alert email")
        return {"sent": 0, "failed": 0}

    try:
        user_result = db.table("users").select("id, email").execute()
        users: list[dict] = user_result.data or []
    except Exception as exc:
        logger.error("Failed to fetch users for alert email: %s", exc)
        return {"sent": 0, "failed": 0}

    if not users:
        logger.info("No users registered — skipping alert email")
        return {"sent": 0, "failed": 0}

    sent = 0
    failed = 0
    for user in users:
        email = user.get("email", "").strip()
        if not email:
            continue
        success = await _send_via_resend(email, subject, body_html)
        if success:
            sent += 1
        else:
            failed += 1

    _log_alert(db, subject=subject, channel="email", article_id=None)

    logger.info("Alert emails: sent=%d failed=%d", sent, failed)
    return {"sent": sent, "failed": failed}
