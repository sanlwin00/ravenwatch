from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from supabase import Client

from app.db import get_db

router = APIRouter(prefix="/narrative", tags=["narrative"])

TERM_LABELS = {
    "peace": "Peace 和平",
    "stability": "Stability 稳定",
    "ceasefire": "Ceasefire 停火",
    "elections": "Elections 选举",
    "sovereignty": "Sovereignty 主权",
}


@router.get("/trends")
def narrative_trends(db: Client = Depends(get_db)):
    # Last 90 days
    since = (date.today() - timedelta(days=90)).isoformat()

    result = (
        db.table("narrative_metrics")
        .select("term, date, frequency")
        .gte("date", since)
        .order("date", desc=False)
        .execute()
    )
    rows = result.data or []

    # Group by term → {date: frequency}
    by_term: dict[str, dict[str, int]] = defaultdict(dict)
    for row in rows:
        by_term[row["term"]][row["date"]] = row["frequency"]

    output = []
    for term, label in TERM_LABELS.items():
        date_map = by_term.get(term, {})
        data_points = [{"date": d, "count": f} for d, f in sorted(date_map.items())]
        output.append({"term": term, "label": label, "data": data_points})

    return output
