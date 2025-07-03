from sqlalchemy import Column, Integer, String, Float, DateTime
from database import Base

class InventoryItem(Base):
    __tablename__ = "app_inventory_items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    sku = Column(String, unique=True, nullable=False)
    current_stock = Column(Integer, nullable=False)
    reorder_point = Column(Integer, nullable=False)
    safety_stock = Column(Integer, nullable=False)
    unit_cost = Column(Float, nullable=False)
    lead_time_days = Column(Integer, nullable=False)
    category = Column(String, nullable=False)
    supplier = Column(String, nullable=False)
    last_updated = Column(DateTime, nullable=False)

class DemandHistory(Base):
    __tablename__ = "app_demand_history"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, nullable=False)
    date = Column(DateTime, nullable=False)
    quantity = Column(Integer, nullable=False)

class AppOrder(Base):
    __tablename__ = "app_orders"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, nullable=False)
    quantity = Column(Integer, nullable=False)
    status = Column(String, nullable=False, default="pending")
    order_date = Column(DateTime, nullable=False)
    expected_delivery_date = Column(DateTime)
    cost = Column(Float, nullable=False)

from sqlalchemy import Column, Integer, String, Float
from database import Base

class HistoricalStock(Base):
    __tablename__ = "app_historical_stock"
    __table_args__ = {'schema': 'themall_poc'}

    id = Column(Integer, primary_key=True, index=True)
    material = Column(String, nullable=False)
    item_desc = Column(String)
    plnt = Column(String, nullable=False)
    iso_year = Column(Integer, nullable=False)
    iso_week = Column(Integer, nullable=False)
    latest_daily_stock = Column(Float)

