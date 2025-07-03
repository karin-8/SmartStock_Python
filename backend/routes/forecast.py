from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from models import InventoryItem
from database import SessionLocal

router = APIRouter(prefix="/api/forecast", tags=["Forecast"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/")
def read_forecast(db: Session = Depends(get_db)):
    return db.query(InventoryItem).all()
