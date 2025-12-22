from __future__ import annotations

import os
import uuid

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from server.app.deps import init_metadata_db


def create_app() -> FastAPI:
    load_dotenv()

    allow_origins = os.getenv("BACKEND_ALLOW_ORIGINS", "http://localhost:3000").split(",")

    app = FastAPI()
    os.environ["USE_FRONTEND"] = "true"

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def add_request_id(request: Request, call_next):
        request.state.request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        response = await call_next(request)
        response.headers["x-request-id"] = request.state.request_id
        return response

    @app.on_event("startup")
    async def _startup() -> None:
        init_metadata_db()

    from server.app.routes import audit as audit_routes
    from server.app.routes import auth as auth_routes
    from server.app.routes import data_center as data_center_routes
    from server.app.routes import runs as runs_routes
    from server.app.routes import users as users_routes

    app.include_router(auth_routes.router)
    app.include_router(users_routes.router)
    app.include_router(audit_routes.router)
    app.include_router(runs_routes.router)
    app.include_router(data_center_routes.router)

    from server.app.routes import convert, filesystem, pipeline, pipelines

    app.include_router(pipeline.router)
    app.include_router(convert.router)
    app.include_router(filesystem.router, prefix="/fs")
    app.include_router(pipelines.router)

    @app.get("/")
    async def root() -> dict[str, str]:
        return {"message": "DocETL API is running"}

    @app.get("/health")
    async def health_check() -> dict[str, str]:
        return {"status": "healthy"}

    return app
