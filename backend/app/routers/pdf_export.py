"""
RavenWatch PDF export router.

GET /api/v1/export/pdf — generates a printable intelligence report from
filtered articles and returns it as a PDF download.

Requires a valid Bearer token (protected via get_current_user dependency).
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from io import BytesIO

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from supabase import Client
from weasyprint import HTML

from app.db import get_db
from app.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/export", tags=["export"])

EXPORT_LIMIT = 1000
TRUNCATE_CHARS = 400


def _truncate(text: str, limit: int = TRUNCATE_CHARS) -> str:
    if len(text) <= limit:
        return text
    return text[:limit].rsplit(" ", 1)[0] + " …"


def _source_name(article: dict) -> str:
    sources_data = article.get("sources")
    if isinstance(sources_data, dict):
        return sources_data.get("name", "")
    if isinstance(sources_data, list) and sources_data:
        return sources_data[0].get("name", "")
    return ""


def _format_date(iso: str | None) -> str:
    if not iso:
        return "—"
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%d")
    except ValueError:
        return iso


def _build_html(
    articles: list[dict],
    entity_map: dict[str, list[str]],
    topic_map: dict[str, list[str]],
    filters: dict[str, str | None],
) -> str:
    """Render articles into a clean HTML string suitable for PDF conversion."""
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    # Build filter summary rows
    filter_rows = ""
    labels = {
        "entity_id": "Entity ID",
        "source_id": "Source ID",
        "topic": "Topic",
        "search": "Search",
        "from_date": "From",
        "to_date": "To",
        "limit": "Row limit",
    }
    for key, label in labels.items():
        val = filters.get(key)
        if val:
            filter_rows += f"<tr><td class='flabel'>{label}</td><td>{val}</td></tr>"
    filter_section = (
        f"<table class='filters'>{filter_rows}</table>" if filter_rows else "<p><em>No filters applied.</em></p>"
    )

    # Build article cards
    cards_html = ""
    for article in articles:
        aid = str(article["id"])
        title = article.get("title") or "(no title)"
        url = article.get("url") or ""
        published = _format_date(article.get("published_at"))
        source = _source_name(article)
        summary = article.get("summary_en") or ""
        raw_text = article.get("raw_text_en") or ""
        body = summary or _truncate(raw_text)
        entities = ", ".join(entity_map.get(aid, [])) or "—"
        topics = ", ".join(topic_map.get(aid, [])) or "—"

        title_html = f'<a href="{url}">{title}</a>' if url else title

        cards_html += f"""
        <div class="article">
          <h3>{title_html}</h3>
          <div class="meta">
            <span class="source">{source}</span>
            <span class="date">{published}</span>
          </div>
          <p class="body">{body}</p>
          <div class="tags">
            <span class="tag-label">Entities:</span> {entities}<br>
            <span class="tag-label">Topics:</span> {topics}
          </div>
        </div>
        """

    if not cards_html:
        cards_html = "<p class='empty'>No articles matched the selected filters.</p>"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>RavenWatch Intelligence Report</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: Georgia, "Times New Roman", serif;
      font-size: 11pt;
      color: #1a1a1a;
      background: #ffffff;
      padding: 2cm;
    }}
    header {{
      border-bottom: 2px solid #1a1a1a;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }}
    header h1 {{
      font-size: 22pt;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }}
    header .meta {{
      font-size: 9pt;
      color: #555;
      margin-top: 4px;
    }}
    h2 {{
      font-size: 13pt;
      margin: 20px 0 8px;
      border-bottom: 1px solid #ccc;
      padding-bottom: 4px;
    }}
    table.filters {{
      border-collapse: collapse;
      font-size: 9.5pt;
      margin-bottom: 10px;
    }}
    table.filters td {{
      padding: 2px 8px 2px 0;
      vertical-align: top;
    }}
    td.flabel {{
      color: #555;
      font-style: italic;
      white-space: nowrap;
    }}
    .article {{
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 12px 14px;
      margin-bottom: 14px;
      page-break-inside: avoid;
    }}
    .article h3 {{
      font-size: 11.5pt;
      margin-bottom: 4px;
    }}
    .article h3 a {{
      color: #1a1a1a;
      text-decoration: none;
    }}
    .meta {{
      font-size: 9pt;
      color: #666;
      margin-bottom: 6px;
    }}
    .meta .source {{
      font-weight: bold;
      margin-right: 12px;
    }}
    .body {{
      font-size: 10pt;
      line-height: 1.5;
      margin-bottom: 8px;
    }}
    .tags {{
      font-size: 9pt;
      color: #555;
      line-height: 1.6;
    }}
    .tag-label {{
      font-weight: bold;
      color: #333;
    }}
    .empty {{
      color: #888;
      font-style: italic;
    }}
    @page {{
      size: A4;
      margin: 1.5cm 2cm;
    }}
  </style>
</head>
<body>
  <header>
    <h1>RavenWatch Intelligence Report</h1>
    <div class="meta">Generated: {generated_at} &nbsp;|&nbsp; Articles: {len(articles)}</div>
  </header>

  <h2>Filters Applied</h2>
  {filter_section}

  <h2>Articles</h2>
  {cards_html}
</body>
</html>"""


@router.get("/pdf")
async def export_pdf(
    limit: int = Query(EXPORT_LIMIT, ge=1, le=EXPORT_LIMIT),
    entity_id: str | None = Query(None),
    source_id: str | None = Query(None),
    topic: str | None = Query(None),
    search: str | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    db: Client = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    """
    Export filtered articles as a PDF intelligence report.

    Query params mirror GET /articles: entity_id, source_id, topic,
    from_date, to_date, search, limit (max 1000).

    Returns a streaming PDF download.
    """
    # Build article query
    query = (
        db.table("articles")
        .select("id, title, url, published_at, summary_en, raw_text_en, sources(name)")
        .order("published_at", desc=True)
        .limit(limit)
    )

    if from_date:
        query = query.gte("published_at", from_date)
    if to_date:
        query = query.lte("published_at", f"{to_date}T23:59:59")
    if source_id:
        query = query.eq("source_id", source_id)
    if search:
        query = query.ilike("title", f"%{search}%")

    try:
        result = query.execute()
        articles: list[dict] = result.data or []
    except Exception as exc:
        logger.error("Failed to fetch articles for PDF export: %s", exc)
        articles = []

    article_ids = [str(a["id"]) for a in articles]

    # Fetch entity associations
    entity_map: dict[str, list[str]] = {}
    if article_ids:
        try:
            ae_result = (
                db.table("article_entities")
                .select("article_id, entities(name)")
                .in_("article_id", article_ids)
                .execute()
            )
            for row in ae_result.data or []:
                aid = str(row["article_id"])
                entity_name = (row.get("entities") or {}).get("name", "")
                if entity_name:
                    entity_map.setdefault(aid, []).append(entity_name)
        except Exception as exc:
            logger.error("Failed to fetch entity associations for PDF export: %s", exc)

    # Filter by entity_id if requested (post-filter)
    if entity_id and article_ids:
        try:
            ae_filter_result = (
                db.table("article_entities")
                .select("article_id")
                .eq("entity_id", entity_id)
                .in_("article_id", article_ids)
                .execute()
            )
            matching_ids = {str(r["article_id"]) for r in ae_filter_result.data or []}
            articles = [a for a in articles if str(a["id"]) in matching_ids]
        except Exception as exc:
            logger.error("Failed to filter by entity_id for PDF export: %s", exc)

    # Fetch topic associations
    topic_map: dict[str, list[str]] = {}
    if article_ids:
        try:
            at_result = (
                db.table("article_topics")
                .select("article_id, topic")
                .in_("article_id", article_ids)
                .execute()
            )
            for row in at_result.data or []:
                aid = str(row["article_id"])
                t = row.get("topic", "")
                if t:
                    topic_map.setdefault(aid, []).append(t)
        except Exception as exc:
            logger.error("Failed to fetch topic associations for PDF export: %s", exc)

    # Filter by topic if requested
    if topic:
        articles = [a for a in articles if topic in topic_map.get(str(a["id"]), [])]

    filters: dict[str, str | None] = {
        "entity_id": entity_id,
        "source_id": source_id,
        "topic": topic,
        "search": search,
        "from_date": from_date,
        "to_date": to_date,
        "limit": str(limit) if limit != EXPORT_LIMIT else None,
    }

    html_content = _build_html(articles, entity_map, topic_map, filters)

    try:
        pdf_bytes: bytes = HTML(string=html_content).write_pdf()
    except Exception as exc:
        logger.error("WeasyPrint failed to render PDF: %s", exc)
        raise

    filename = f"ravenwatch-{date.today().isoformat()}.pdf"

    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
