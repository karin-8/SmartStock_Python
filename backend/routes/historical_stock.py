from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import SessionLocal
from models import HistoricalStock

router = APIRouter(prefix="/api/historical-stock", tags=["Historical Stock"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/")
def read_historical_stock(db: Session = Depends(get_db)):
    # Step 1: Find latest iso_year and iso_week
    latest = (
        db.query(HistoricalStock.iso_year, HistoricalStock.iso_week)
        .order_by(HistoricalStock.iso_year.desc(), HistoricalStock.iso_week.desc())
        .first()
    )

    if not latest:
        return []

    latest_year, latest_week = latest

    # Step 2: Get rows for W-4 to W-1
    target_weeks = []
    for offset in range(4, 0, -1):
        week = latest_week - offset
        year = latest_year
        if week <= 0:
            week += 52
            year -= 1
        target_weeks.append((year, week))

    # Step 3: Query rows matching target weeks and plant '15KA'
    results = (
        db.query(HistoricalStock)
        .filter(
            HistoricalStock.plnt == '15KA',
            tuple(
                HistoricalStock.iso_year,
                HistoricalStock.iso_week
            ).in_(target_weeks)
        )
        .order_by(HistoricalStock.iso_year, HistoricalStock.iso_week)
        .all()
    )

    return results
