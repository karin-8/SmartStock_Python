from fastapi import FastAPI, HTTPException, APIRouter
from fastapi import Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List
from datetime import datetime, timedelta
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

app = FastAPI()

# --- CORS Setup ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Database Connection ---
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise Exception("DATABASE_URL is not set. Please check your .env file.")

async def get_db_connection():
    try:
        conn = await asyncpg.connect(DATABASE_URL)
        return conn
    except Exception as e:
        print(f"Database connection failed: {e}")
        raise HTTPException(status_code=500, detail="Database connection error.")

# --- Models ---

class StockStatus(BaseModel):
    week: int
    projectedStock: int
    isHistorical: bool
    status: str
    moveIn: int = 0
    moveOut: int = 0
    forecastedDemand: int = 0

class InventoryItemWithForecast(BaseModel):
    id: int
    name: str
    sku: str
    currentStock: int
    reorderPoint: int
    category: str
    supplier: str
    stockStatus: List[StockStatus]

class Order(BaseModel):
    id: int
    itemId: int = Field(..., alias="item_id")
    quantity: int
    status: str
    orderDate: datetime = Field(..., alias="order_date")
    expectedDeliveryDate: datetime = Field(..., alias="expected_delivery_date")
    cost: float

    class Config:
        allow_population_by_field_name = True

# ✅ Order data model
class OrderRequest(BaseModel):
    item_id: int
    sku: str
    quantity: int
    order_type: str  # "manual" or "recommended"


class HistoricalStockItem(BaseModel):
    material: str
    item_desc: str
    plnt: str
    iso_year: int
    iso_week: int
    latest_daily_stock: float

# ✅ In-memory storage for demo
order_list: List[OrderRequest] = []

# --- API Routes ---

@app.get("/api/historical-stock")
async def get_historical_stock(plant: str = Query("15KA")):
    conn = await get_db_connection()
    try:
        import datetime as dt
        from datetime import datetime

        # ✅ Step 1: Calculate relative week mapping for W-4 to W-1
        week_map_query = """
            WITH week_series AS (
                SELECT generate_series(-4, -1) AS relative_week
            ),
            target_weeks AS (
                SELECT
                    (DATE '2024-12-23' - (8 - relative_week) * INTERVAL '1 week') AS target_date,
                    relative_week
                FROM week_series
            )
            SELECT
                relative_week,
                EXTRACT(ISOYEAR FROM target_date)::INT AS iso_year,
                EXTRACT(WEEK FROM target_date)::INT AS iso_week
            FROM target_weeks
            ORDER BY relative_week;
        """
        week_rows = await conn.fetch(week_map_query)
        week_map = {row["relative_week"]: (row["iso_year"], row["iso_week"]) for row in week_rows}

        # ✅ Step 2: Map each week to date range (start & end date)
        week_date_ranges = {}
        for rel_week, (iso_year, iso_week) in week_map.items():
            week_start = datetime.strptime(f"{iso_year}-W{iso_week - 1}-1", "%G-W%V-%u").date()
            week_end = week_start + dt.timedelta(days=6)
            week_date_ranges[rel_week] = (week_start, week_end)

        result = []

        # ✅ Step 3: For each week, fetch stock and movement
        for rel_week, (week_start, week_end) in week_date_ranges.items():
            # --- Stock: Get latest daily stock of that week from f_stock_daily_2
            stock_query = """WITH daily_with_iso AS (
                SELECT
                    material,
                    EXTRACT(ISODOW FROM d_period::date) AS dow,
                    EXTRACT('isoyear' FROM d_period::date)::INT AS iso_year,
                    EXTRACT('week' FROM d_period::date)::INT AS iso_week,
                    daily_stock
                FROM themall_poc.f_stock_daily_2
                WHERE plant = $3
            ),
            latest_day_per_week AS (
                SELECT
                    material,
                    iso_year,
                    iso_week,
                    MAX(dow) AS latest_dow
                FROM daily_with_iso
                WHERE iso_year = $1 AND iso_week = $2
                GROUP BY material, iso_year, iso_week
            )
            SELECT
                d.material,
                d.daily_stock AS latest_daily_stock
            FROM daily_with_iso d
            JOIN latest_day_per_week l
            ON d.material = l.material
            AND d.iso_year = l.iso_year
            AND d.iso_week = l.iso_week
            AND d.dow = l.latest_dow;
            """

            iso_year, iso_week = week_map[rel_week]
            stock_rows = await conn.fetch(stock_query, iso_year, iso_week, plant)

            # --- Movement: Sum move_in and move_out from f_mb51_top50 for this week
            movement_query = """
                SELECT
                    material,
                    SUM(CASE WHEN unit_entry_qty > 0 THEN unit_entry_qty ELSE 0 END) AS move_in,
                    SUM(CASE WHEN unit_entry_qty < 0 THEN ABS(unit_entry_qty) ELSE 0 END) AS move_out
                FROM themall_poc.f_mb51_top50
                WHERE plant = $3
                  AND posting_date >= $1
                  AND posting_date <= $2
                GROUP BY material;
            """
            move_rows = await conn.fetch(movement_query, str(week_start), str(week_end), plant)
            move_map = {row["material"].strip(): row for row in move_rows}

            # --- Combine stock and movement into result
            for row in stock_rows:
                material = row["material"].strip()
                latest_stock = row["latest_daily_stock"] or 0
                move_data = move_map.get(material, {})

                result.append({
                    "material": material,
                    "week": rel_week,
                    "projectedStock": int(latest_stock),
                    "moveIn": int(move_data.get("move_in", 0)),
                    "moveOut": int(move_data.get("move_out", 0)),
                })

        return result

    except Exception as e:
        print(f"Historical Stock API Error: {e}")
        raise HTTPException(status_code=500, detail="Error fetching historical stock data")
    finally:
        await conn.close()



@app.get("/api/pending-orders", response_model=List[Order])
async def get_peding_orders():
    conn = await get_db_connection()
    enriched_orders = []
    try:
        for order in order_list:
            item = await conn.fetchrow(
                """
                SELECT name, category, supplier
                FROM themall_poc.app_inventory_items_cal
                WHERE TRIM(sku) = $1 AND plnt = $2
                """,
                order.sku.strip()
            )

            enriched_orders.append({
                **order.dict(),
                "name": item["name"] if item else "Unknown",
                "category": item["category"] if item else "Unknown",
                "supplier": item["supplier"] if item else "Unknown",
            })
        return {"orders": enriched_orders}
    except Exception as e:
        print(f"Error in get_orders: {e}")
        raise HTTPException(status_code=500, detail="Error fetching order details")
    finally:
        await conn.close()


@app.get("/api/dashboard/metrics")
async def get_dashboard_metrics(plant: str = Query("15KA")):
    conn = await get_db_connection()

    try:
        # ✅ Step 1: First get SKUs that passed historical check
        sku_query = """
            WITH latest AS (
                SELECT iso_year, iso_week
                FROM themall_poc.app_historical_stock
                WHERE plnt = $1
                ORDER BY iso_year DESC, iso_week DESC
                LIMIT 1
            ),
            target_weeks AS (
                SELECT (iso_year * 100 + iso_week - offs) AS week_key
                FROM latest, generate_series(1, 4) AS offs
            ),
            good_materials AS (
                SELECT material
                FROM themall_poc.app_historical_stock h
                JOIN target_weeks tw
                  ON (h.iso_year * 100 + h.iso_week) = tw.week_key
                WHERE h.plnt = $1
                  AND h.latest_daily_stock > 0
                GROUP BY material
                HAVING COUNT(DISTINCT (h.iso_year * 100 + h.iso_week)) = 4
            )
            SELECT material AS sku
            FROM good_materials;
        """
        sku_rows = await conn.fetch(sku_query, plant)
        good_skus = [row["sku"].strip() for row in sku_rows]

        if not good_skus:
            return {
                "totalItems": 0,
                "lowStockItems": 0,
                "urgentItems": 0
            }

        # ✅ Step 2: Now get current stock + reorder point for these SKUs only
        forecast_rows = await conn.fetch("""
            SELECT id, name, sku, current_stock, reorder_point, category, supplier
            FROM themall_poc.app_inventory_items_cal
            WHERE TRIM(sku) = ANY($1::text[]) AND plnt = $2
        """, good_skus, plant)

        low_stock_items = 0
        urgent_items = 0

        for item in forecast_rows:
            stock = item["current_stock"]
            reorder_point = item["reorder_point"]

            # ✅ Same logic as frontend
            if stock <= reorder_point:
                urgent_items += 1
            if stock <= reorder_point*1.1:
                low_stock_items += 1

        return {
            "totalItems": len(forecast_rows),
            "lowStockItems": low_stock_items,
            "urgentItems": urgent_items
        }

    except Exception as e:
        print(f"Dashboard Metrics Error: {e}")
        raise HTTPException(status_code=500, detail="Error calculating dashboard metrics")
    finally:
        await conn.close()


@app.get("/api/forecast", response_model=List[InventoryItemWithForecast])
async def get_forecast(plant: str = Query("15KA")):
    conn = await get_db_connection()
    try:
        import datetime as dt
        from datetime import datetime

        # ✅ Step 1: Generate week mapping (-4 to +8)
        week_map_query = """
            WITH week_series AS (
                SELECT generate_series(-4, 8) AS relative_week
            ),
            target_weeks AS (
                SELECT
                    (DATE '2024-12-23' - (8 - relative_week) * INTERVAL '1 week') AS target_date,
                    relative_week
                FROM week_series
            )
            SELECT
                relative_week,
                EXTRACT('isoyear' FROM target_date)::INT AS iso_year,
                EXTRACT('week' FROM target_date)::INT AS iso_week
            FROM target_weeks
            ORDER BY relative_week;
        """
        week_rows = await conn.fetch(week_map_query)
        week_map = {row["relative_week"]: (row["iso_year"], row["iso_week"]) for row in week_rows}

        # ✅ Step 2: Get distinct SKUs and item names
        sku_query = """
            SELECT DISTINCT material AS sku, item_desc
            FROM themall_poc.final_order_table
            WHERE plnt = $1
        """
        sku_rows = await conn.fetch(sku_query, plant)
        sku_list = [{"sku": row["sku"].strip(), "item_desc": row["item_desc"].strip()} for row in sku_rows]

        # ✅ Step 3: Get actual stock and reorder point
        stock_query = """
            SELECT sku, current_stock, reorder_point, category, supplier
            FROM themall_poc.app_inventory_items_cal
            WHERE plnt = $1
        """
        stock_rows = await conn.fetch(stock_query, plant)
        stock_map = {
            row["sku"].strip(): {
                "current_stock": row["current_stock"],
                "reorder_point": row["reorder_point"],
                "category": row["category"].strip(),
                "supplier": row["supplier"].strip(),
            }
            for row in stock_rows
        }

        # ✅ Step 4: Load demand (actual + predicted)
        all_weeks = [(year, week) for _, (year, week) in week_map.items()]
        year_list = [year for year, week in all_weeks]
        week_list = [week for year, week in all_weeks]

        demand_query = """
            SELECT material, iso_year, iso_week, actual_order_qty, pred_order_qty
            FROM themall_poc.final_order_table
            WHERE plnt = $3
              AND (iso_year, iso_week) IN (SELECT UNNEST($1::int[]), UNNEST($2::int[]))
        """
        demand_rows = await conn.fetch(demand_query, year_list, week_list, plant)

        # ✅ Demand lookup
        demand_lookup = {}
        for row in demand_rows:
            key = (row["material"].strip(), row["iso_year"], row["iso_week"])
            demand_lookup[key] = {
                "actual": row["actual_order_qty"] or 0,
                "predict": row["pred_order_qty"] or 0,
            }

        # ✅ Step 5: Build result
        forecast_results = []

        for idx, sku_info in enumerate(sku_list):
            sku = sku_info["sku"]
            name = sku_info["item_desc"]

            stock_info = stock_map.get(sku)
            if not stock_info:
                continue

            stock = int(stock_info["current_stock"])
            reorder_point = int(stock_info["reorder_point"])
            category = stock_info["category"]
            supplier = stock_info["supplier"]

            stock_status_list = []
            total_demand = 0

            for rel_week in range(0, 9):  # ✅ Week 0 to Week +8
                iso_year, iso_week = week_map[rel_week]
                key = (sku, iso_year, iso_week)

                forecasted_demand = demand_lookup.get(key, {}).get("predict", 0)
                demand = forecasted_demand  # ✅ For stock deduction

                # Calculate next week's stock for status logic
                next_key = (sku, *week_map.get(rel_week + 1, (0, 0)))
                next_demand = demand_lookup.get(next_key, {}).get("predict", 0)
                next_stock = stock - next_demand if rel_week < 8 else None

                # ✅ Status logic
                if stock <= 0 or stock <= reorder_point:
                    status = "critical"
                elif next_stock is not None and (next_stock <= 0 or next_stock <= reorder_point):
                    status = "low"
                else:
                    status = "okay"

                stock_status_list.append({
                    "week": rel_week,
                    "projectedStock": int(stock),
                    "moveIn": 0,
                    "moveOut": 0,
                    "forecastedDemand": int(forecasted_demand),
                    "isHistorical": False,
                    "status": status,
                })

                stock -= int(demand)
                total_demand += demand

            if total_demand == 0:
                continue

            forecast_results.append(InventoryItemWithForecast(
                id=idx + 1,
                name=name,
                sku=sku,
                currentStock=int(stock_info["current_stock"]),
                reorderPoint=reorder_point,
                category=category,
                supplier=supplier,
                stockStatus=stock_status_list
            ))

        return forecast_results

    except Exception as e:
        print(f"Forecast error: {e}")
        raise HTTPException(status_code=500, detail="Error generating forecast")

    finally:
        await conn.close()





@app.get("/api/healthcheck")
async def healthcheck():
    return {"status": "ok"}

# ✅ Create Order API
@app.post("/api/orders")
async def create_order(order: OrderRequest, plant: str = Query("15KA")):
    order_list.append(order)
    return {"status": "success", "order": order, "total_orders": len(order_list)}

# ✅ Get All Orders API
@app.get("/api/orders")
async def get_orders(plant: str = Query("15KA")):
    conn = await get_db_connection()
    enriched_orders = []
    try:
        for order in order_list:
            item = await conn.fetchrow(
                """
                SELECT name, category, supplier
                FROM themall_poc.app_inventory_items_cal
                WHERE id = $1
                """,
                order.item_id
            )
            enriched_orders.append({
                **order.dict(),
                "name": item["name"] if item else "Unknown",
                "category": item["category"] if item else "Unknown",
                "supplier": item["supplier"] if item else "Unknown",
            })
        return {"orders": enriched_orders}
    except Exception as e:
        print(f"Error in get_orders: {e}")
        raise HTTPException(status_code=500, detail="Error fetching order details")
    finally:
        await conn.close()




@app.put("/api/orders/{order_id}")
async def update_order(order_id: int, order: OrderRequest):
    for idx, existing_order in enumerate(order_list):
        if existing_order.item_id == order_id:
            order_list[idx] = order
            return {"status": "updated", "order": order}
    return {"status": "error", "message": "Order not found"}, 404

@app.delete("/api/orders/{order_id}")
async def delete_order(order_id: int):
    global order_list
    original_count = len(order_list)
    order_list = [o for o in order_list if o.item_id != order_id]
    if len(order_list) < original_count:
        return {"status": "deleted", "order_id": order_id}
    else:
        return {"status": "not_found", "order_id": order_id}, 404

@app.get("/api/plants")
async def get_plants():
    conn = await get_db_connection()
    try:
        rows = await conn.fetch("SELECT DISTINCT plnt FROM themall_poc.app_inventory_items_cal")
        return [row['plnt'] for row in rows]
    finally:
        await conn.close()
