from datetime import date
from io import StringIO

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from supabase import Client

from app.db import get_db
from app.services.export_service import export_articles_csv

router = APIRouter(prefix="/export", tags=["export"])


# NOTE: /csv is intentionally NOT protected by auth so browsers can download
# the file directly via window.open / <a href> without needing to attach an
# Authorization header (which browsers cannot do for plain navigation requests).
# If stronger access control is needed in future, switch to a signed-URL approach.
@router.get("/csv")
async def export_csv(
    entity_id: str | None = Query(None),
    source_id: str | None = Query(None),
    topic: str | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    search: str | None = Query(None),
    db: Client = Depends(get_db),
):
    """
    Export filtered articles as a CSV file.

    Query params mirror GET /articles: entity_id, source_id, topic,
    from_date, to_date, search.

    Returns a streaming CSV download (up to 1 000 rows).
    """
    csv_string = await export_articles_csv(
        db=db,
        entity_id=entity_id,
        source_id=source_id,
        topic=topic,
        from_date=from_date,
        to_date=to_date,
        search=search,
    )

    filename = f"ravenwatch-{date.today().isoformat()}.csv"

    return StreamingResponse(
        iter([csv_string]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/pdf")
def export_pdf():
    return {"message": "not implemented"}
