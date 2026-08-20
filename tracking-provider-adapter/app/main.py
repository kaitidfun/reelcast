from fastapi import FastAPI

from app.routes import health, oauth, sync
from app.services import provider_registry


def create_app() -> FastAPI:
    app = FastAPI(title="tracking-provider-adapter", version="1.0.0")
    app.state.providers = provider_registry()
    app.include_router(health.router)
    app.include_router(oauth.router)
    app.include_router(sync.router)
    return app


app = create_app()
