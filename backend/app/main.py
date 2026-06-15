import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import sentry_sdk
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.logging import LoggingIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

from app.db import get_db
from app.dependencies import get_current_user
from app.routers import (
    health,
    articles,
    entities,
    sources,
    scrape,
    export,
    settings,
    auth,
    narrative,
    translate,
    alerts,
)

_sentry_dsn = os.environ.get("SENTRY_DSN_BACKEND", "")
if _sentry_dsn:
    sentry_sdk.init(
        dsn=_sentry_dsn,
        integrations=[
            StarletteIntegration(),
            FastApiIntegration(),
            LoggingIntegration(level=logging.WARNING, event_level=logging.ERROR),
        ],
        traces_sample_rate=0.2,
        send_default_pii=False,
        server_name="ravenwatch-backend",
    )

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # On startup: close any scrape runs left open by a previous deployment
    try:
        db = next(get_db())
        now = datetime.now(timezone.utc).isoformat()
        result = (
            db.table("scrape_runs")
            .update({"status": "interrupted", "finished_at": now, "error_message": "Process restarted (redeployment)"})
            .eq("status", "running")
            .is_("finished_at", "null")
            .execute()
        )
        rows = result.data or []
        if rows:
            logger.warning("Closed %d interrupted scrape run(s) on startup.", len(rows))
    except Exception as exc:
        logger.error("Failed to clean up interrupted scrape runs on startup: %s", exc)
    yield


app = FastAPI(title="RavenWatch API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PREFIX = "/api/v1"

# Unprotected routes
app.include_router(health.router, prefix=PREFIX)
app.include_router(auth.router, prefix=PREFIX)

# Protected routes — all require a valid JWT
app.include_router(
    articles.router, prefix=PREFIX, dependencies=[Depends(get_current_user)]
)
app.include_router(
    entities.router, prefix=PREFIX, dependencies=[Depends(get_current_user)]
)
app.include_router(
    sources.router, prefix=PREFIX, dependencies=[Depends(get_current_user)]
)
app.include_router(scrape.router, prefix=PREFIX)
# Export router is registered without auth — the /csv endpoint is intentionally
# public so browsers can download files directly. See export.py for rationale.
app.include_router(export.router, prefix=PREFIX)
app.include_router(
    settings.router, prefix=PREFIX, dependencies=[Depends(get_current_user)]
)
app.include_router(
    narrative.router, prefix=PREFIX, dependencies=[Depends(get_current_user)]
)
app.include_router(
    translate.router, prefix=PREFIX, dependencies=[Depends(get_current_user)]
)
app.include_router(
    alerts.router, prefix=PREFIX, dependencies=[Depends(get_current_user)]
)


@app.get("/")
def root():
    return {"status": "ok", "service": "ravenwatch"}


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": str(exc)})
