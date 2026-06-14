import os

import sentry_sdk
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

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
)

_sentry_dsn = os.environ.get("SENTRY_DSN", "")
if _sentry_dsn:
    sentry_sdk.init(
        dsn=_sentry_dsn,
        integrations=[StarletteIntegration(), FastApiIntegration()],
        traces_sample_rate=0.2,
        send_default_pii=False,
    )

app = FastAPI(title="RavenWatch API")

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


@app.get("/")
def root():
    return {"status": "ok", "service": "ravenwatch"}


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": str(exc)})
