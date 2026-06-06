from fastapi import APIRouter

router = APIRouter(prefix="/narrative", tags=["narrative"])


@router.get("/trends")
def narrative_trends():
    return []
