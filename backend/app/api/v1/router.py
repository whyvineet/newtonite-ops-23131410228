from fastapi import APIRouter

from app.api.v1.endpoints import activity, auth, comments, dashboard, teams, work_items

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(teams.router)
api_router.include_router(work_items.router)
api_router.include_router(comments.router)
api_router.include_router(activity.router)
api_router.include_router(dashboard.router)
