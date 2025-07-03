
from fastapi import APIRouter

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

@router.get("/metrics")
async def get_dashboard_metrics():
    return {"status": "ok", "metrics": []}
