"""
RavenWatch alert service.

Sends email notifications via the Resend API after each scrape run.
If RESEND_API_KEY is not set, warnings are logged and emails are skipped silently.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

import httpx
from supabase import Client

logger = logging.getLogger(__name__)

RESEND_ENDPOINT = "https://api.resend.com/emails"


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
# Alert log helper
# ---------------------------------------------------------------------------


def _log_alert(db: Client, subject: str, channel: str = "email", article_id=None) -> None:
    """Insert a row into alert_log. Skips silently on failure."""
    row: dict = {
        "priority": "standard",
        "channel": channel,
        "sent_at": datetime.now(timezone.utc).isoformat(),
    }
    # article_id is nullable per the AlertLog model — include only if provided
    if article_id is not None:
        row["article_id"] = str(article_id)

    try:
        db.table("alert_log").insert(row).execute()
    except Exception as exc:
        logger.warning("Failed to write alert_log entry: %s", exc)


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
