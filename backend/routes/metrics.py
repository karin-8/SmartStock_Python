from fastapi import APIRouter

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("/metrics")
def get_metrics():
    return {
        "total_stock": 1500,
        "low_stock_items": 10,
        "pending_orders": 5,
        "turnoverRate": 2.5,          # Dummy but present ✅
        "stockoutFrequency": 15.4      # Dummy but present ✅
    }

