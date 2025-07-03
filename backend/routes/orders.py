from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from models import AppOrder
from database import SessionLocal
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/orders", tags=["Orders"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Pydantic Schema
class OrderCreate(BaseModel):
    item_id: int
    quantity: int
    status: Optional[str] = "pending"
    cost: float

@router.get("/")
def read_orders(db: Session = Depends(get_db)):
    return db.query(Order).all()

@router.post("/")
def create_order(order: OrderCreate, db: Session = Depends(get_db)):
    db_order = Order(
        item_id=order.item_id,
        quantity=order.quantity,
        status=order.status,
        cost=order.cost
    )
    db.add(db_order)
    db.commit()
    db.refresh(db_order)
    return db_order

@router.put("/{order_id}")
def update_order(order_id: int, order: OrderCreate, db: Session = Depends(get_db)):
    db_order = db.query(Order).filter(Order.id == order_id).first()
    if not db_order:
        raise HTTPException(status_code=404, detail="Order not found")
    db_order.item_id = order.item_id
    db_order.quantity = order.quantity
    db_order.status = order.status
    db_order.cost = order.cost
    db.commit()
    db.refresh(db_order)
    return db_order

@router.delete("/{order_id}")
def delete_order(order_id: int, db: Session = Depends(get_db)):
    db_order = db.query(Order).filter(Order.id == order_id).first()
    if not db_order:
        raise HTTPException(status_code=404, detail="Order not found")
    db.delete(db_order)
    db.commit()
    return {"message": "Order deleted"}
