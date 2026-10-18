from fastapi import FastAPI

from app.core.config import get_settings

settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0")


@app.get("/")
async def root() -> dict[str, str]:
    current_settings = get_settings()
    return {
        "name": current_settings.app_name,
        "status": "online",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
