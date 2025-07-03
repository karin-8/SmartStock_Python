from fastapi import FastAPI, HTTPException, APIRouter
from fastapi import Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List
from datetime import datetime, timedelta
import asyncpg
import os
from dotenv import load_dotenv
from collections import defaultdict

# Assume: result = [{material, week, openingStock, closingStock, change}, ...]

from collections import defaultdict

def patch_missing_weeks(result, weeks=(-4, -3, -2, -1)):
    # Build a dict of dicts: mat -> week -> data
    mat_weeks = defaultdict(dict)
    all_materials = set()
    for row in result:
        mat_weeks[row['material']][row['week']] = row
        all_materials.add(row['material'])

    # Fill in missing weeks with None or "-"
    padded = []
    for mat in sorted(all_materials):
        for w in weeks:
            row = mat_weeks[mat].get(w)
            if row:
                padded.append(row)
            else:
                padded.append({
                    "material": mat,
                    "week": w,
                    "openingStock": None,
                    "closingStock": None,
                    "change": None,
                })
    return padded

def backfill_opening_stock(result, weeks=[-4, -3, -2, -1]):
    # Group by material
    hist = defaultdict(dict)
    for row in result:
        hist[row["material"]][row["week"]] = row

    # For each material, work backwards to fill openingStock
    for material, week_dict in hist.items():
        # Find first week with nonzero opening (start from latest towards earliest)
        prev_open = None
        for week in sorted(weeks, reverse=True):  # W-1, W-2, ...
            row = week_dict.get(week)
            if row is None:
                continue
            if row.get("openingStock", 0) != 0:  # Already filled
                prev_open = row["openingStock"]
            elif prev_open is not None and "change" in row:
                # Backfill opening
                row["openingStock"] = prev_open - row["change"]
                prev_open = row["openingStock"]
    # Flatten back to list
    return [row for mat in hist.values() for row in mat.values()]

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
    import datetime as dt
    from datetime import datetime, timedelta
    conn = await get_db_connection()
    try:
        # 1. Define anchor and weeks (W-4 .. W-1)
        anchor_date = datetime(2024, 12, 23)  # <-- Use your actual anchor if needed!
        week_ranges = []
        for rel_week in range(-4, 0):  # W-4 to W-1
            # Each week starts on Monday!
            start = (anchor_date - timedelta(days=anchor_date.weekday())) + timedelta(weeks=rel_week)
            end = start + timedelta(days=6)
            week_ranges.append((rel_week, start.date(), end.date()))

        date_min = min(start for _, start, _ in week_ranges)
        date_max = max(end for _, _, end in week_ranges)

        # 2. Query ALL relevant data at once (for window functions to work!)
        stock_query = """
            WITH raw_data AS (
                SELECT
                    material,
                    plant,
                    d_period::date AS date,
                    EXTRACT(isoyear FROM d_period::date) AS iso_year,
                    EXTRACT(week FROM d_period::date) AS iso_week,
                    move_qty,
                    daily_stock
                FROM themall_poc.f_stock_daily_3
                WHERE plant = $1
                  AND d_period::date >= $2
                  AND d_period::date <= $3
            ),
            by_week AS (
                SELECT
                    material,
                    plant,
                    iso_year,
                    iso_week,
                    MIN(date) AS week_start,
                    MAX(date) AS week_end
                FROM raw_data
                GROUP BY material, plant, iso_year, iso_week
            ),
            weekly_change AS (
                SELECT
                    material,
                    plant,
                    iso_year,
                    iso_week,
                    SUM(move_qty) AS change
                FROM raw_data
                GROUP BY material, plant, iso_year, iso_week
            ),
            closing_stock AS (
                SELECT
                    r.material,
                    r.plant,
                    r.iso_year,
                    r.iso_week,
                    r.daily_stock AS closing_stock
                FROM raw_data r
                JOIN by_week b
                  ON r.material = b.material
                 AND r.plant = b.plant
                 AND r.iso_year = b.iso_year
                 AND r.iso_week = b.iso_week
                 AND r.date = b.week_end
            ),
            merged AS (
                SELECT
                    w.material,
                    w.plant,
                    w.iso_year,
                    w.iso_week,
                    w.change,
                    c.closing_stock
                FROM weekly_change w
                JOIN closing_stock c
                  ON w.material = c.material
                 AND w.plant = c.plant
                 AND w.iso_year = c.iso_year
                 AND w.iso_week = c.iso_week
            ),
            rolling AS (
                SELECT
                    *,
                    LAG(closing_stock) OVER (
                      PARTITION BY material, plant
                      ORDER BY iso_year, iso_week
                    ) AS opening_stock
                FROM merged
            )
            SELECT
              material,
              plant,
              iso_year,
              iso_week,
              opening_stock,
              closing_stock,
              change
            FROM rolling
            ORDER BY material, iso_year, iso_week;
        """
        # 3. Fetch all results
        stock_rows = await conn.fetch(
            stock_query,
            plant,
            date_min,
            date_max
        )

        # 4. Map iso_year/iso_week to rel_week (W-4..W-1) using your week_ranges
        week_lookup = {}
        for rel, start, end in week_ranges:
            # week key: (iso_year, iso_week)
            iso_year, iso_week, *_ = (
                start.isocalendar()  # (year, week, weekday)
            )
            week_lookup[(iso_year, iso_week)] = rel

        result = []
        for row in stock_rows:
            iso_year = int(row["iso_year"])
            iso_week = int(row["iso_week"])
            rel_week = week_lookup.get((iso_year, iso_week), None)
            if rel_week is None:
                continue
            result.append({
                "material": row["material"].strip(),
                "week": rel_week,
                "openingStock": int(row["opening_stock"]) if row["opening_stock"] is not None else 0,
                "closingStock": int(row["closing_stock"]) if row["closing_stock"] is not None else 0,
                "change": int(row["change"]) if row["change"] is not None else 0,
            })

        # (Optional) Patch missing weeks/materials with previous closingStock if needed!
        result = patch_missing_weeks(result)
        result = backfill_opening_stock(result, weeks=[-4, -3, -2, -1])

        return result

    except Exception as e:
        print(f"Historical Stock API Error: {e}")
        raise HTTPException(status_code=500, detail="Error fetching historical stock data")
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
            WHERE TRIM(sku) = ANY($1::text[]) AND plant = $2
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

import httpx
from fastapi import Query, HTTPException
from typing import List

@app.get("/api/forecast", response_model=List[InventoryItemWithForecast])
async def get_forecast(plant: str = Query("15KA")):
    import datetime as dt
    from datetime import datetime

    conn = await get_db_connection()
    try:
        # --- Week mapping (-4 to +8) ---
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
        w_minus_1_year, w_minus_1_week = week_map[-1]

        # --- Get SKUs & metadata ---
        sku_query = """
            SELECT DISTINCT material AS sku, item_desc
            FROM themall_poc.final_order_table
            WHERE plnt = $1
        """
        sku_rows = await conn.fetch(sku_query, plant)
        sku_list = [{"sku": row["sku"].strip(), "item_desc": row["item_desc"].strip()} for row in sku_rows]

        stock_query = """
            SELECT sku, reorder_point, category, supplier
            FROM themall_poc.app_inventory_items_cal
            WHERE plant = $1
        """
        stock_rows = await conn.fetch(stock_query, plant)
        stock_map = {
            row["sku"].strip(): {
                "reorder_point": row["reorder_point"],
                "category": row["category"].strip(),
                "supplier": row["supplier"].strip(),
            }
            for row in stock_rows
        }

        # --- Demand (predicted order quantity for weeks 0 to 8) ---
        all_weeks = [(year, week) for _, (year, week) in week_map.items()]
        year_list = [year for year, week in all_weeks]
        week_list = [week for year, week in all_weeks]
        demand_query = """
            SELECT material, iso_year, iso_week, pred_order_qty
            FROM themall_poc.final_order_table
            WHERE plnt = $3
              AND (iso_year, iso_week) IN (SELECT UNNEST($1::int[]), UNNEST($2::int[]))
        """
        demand_rows = await conn.fetch(demand_query, year_list, week_list, plant)
        demand_lookup = {}
        for row in demand_rows:
            key = (row["material"].strip(), row["iso_year"], row["iso_week"])
            demand_lookup[key] = int(row["pred_order_qty"] or 0)

        # --- Historical closing stock for W-1 (pull via API!) ---
        async with httpx.AsyncClient() as client:
            hist_url = f"http://localhost:8000/api/historical-stock?plant={plant}"
            resp = await client.get(hist_url)
            hist_data = resp.json()
            # index by material, week
            hist_lookup = {}
            for row in hist_data:
                hist_lookup[(row["material"].strip(), row["week"])] = row["closingStock"]

        # --- Forecast computation ---
        forecast_results = []
        for idx, sku_info in enumerate(sku_list):
            sku = sku_info["sku"]
            name = sku_info["item_desc"]
            stock_info = stock_map.get(sku)
            if not stock_info:
                continue

            reorder_point = int(stock_info["reorder_point"])
            category = stock_info["category"]
            supplier = stock_info["supplier"]

            # Start from closing stock of W-1
            seed_stock = hist_lookup.get((sku, -1), 0)
            stock = seed_stock
            stock_status_list = []

            for rel_week in range(0, 9):  # 0 (current) to 8 weeks ahead
                iso_year, iso_week = week_map[rel_week]
                key = (sku, iso_year, iso_week)
                forecasted_demand = demand_lookup.get(key, 0)
                if forecasted_demand is None:
                    forecasted_demand = 0
                if stock is None:
                    stock = 0
                next_stock = stock - forecasted_demand if rel_week < 8 else None

                # Status logic (tweak as needed)
                if stock <= 0 or stock <= reorder_point:
                    status = "critical"
                elif next_stock is not None and (next_stock <= 0 or next_stock <= reorder_point):
                    status = "low"
                else:
                    status = "okay"

                stock_status_list.append({
                    "week": rel_week,
                    "projectedStock": int(stock),
                    "forecastedDemand": int(forecasted_demand),
                    "isHistorical": False,
                    "status": status,
                })
                if forecasted_demand is None:
                    forecasted_demand = 0
                if stock is None:
                    stock = 0

                stock -= int(forecasted_demand)
                stock -= forecasted_demand

            forecast_results.append(InventoryItemWithForecast(
                id=idx + 1,
                name=name,
                sku=sku,
                currentStock=seed_stock or 0,
                reorderPoint=reorder_point or 0,
                category=category,
                supplier=supplier,
                stockStatus=stock_status_list,
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
        rows = await conn.fetch("SELECT DISTINCT plant FROM themall_poc.app_inventory_items_cal")
        return [row['plant'] for row in rows]
    finally:
        await conn.close()
