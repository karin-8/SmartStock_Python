from fastapi import FastAPI, HTTPException, APIRouter, Body
from fastapi import Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Tuple
from datetime import datetime, timedelta
import asyncpg
import os
from dotenv import load_dotenv
from collections import defaultdict
import asyncio

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
        # Find the latest available closing stock
        latest_closing = None
        for week in sorted(weeks, reverse=True):
            row = week_dict.get(week)
            if row and row.get("closingStock") is not None:
                latest_closing = row["closingStock"]
                break

        # Now, iterate backwards and backfill
        for i in range(len(weeks) - 1, -1, -1):
            current_week = weeks[i]
            prev_week = weeks[i-1] if i > 0 else None

            current_row = week_dict.get(current_week)
            if current_row is None:
                continue

            # If openingStock is None, try to derive it
            if current_row["openingStock"] is None:
                # If we have a closing stock for the current week,
                # and a change for the current week,
                # opening stock = closing stock - change
                if current_row.get("closingStock") is not None and current_row.get("change") is not None:
                    current_row["openingStock"] = current_row["closingStock"] - current_row["change"]
                # If we have the closing stock from the *previous* week (which would be this week's opening stock)
                elif prev_week is not None:
                    prev_row = week_dict.get(prev_week)
                    if prev_row and prev_row.get("closingStock") is not None:
                        current_row["openingStock"] = prev_row["closingStock"]
                # If all else fails, and we have a `latest_closing` from somewhere, use it as a fallback for the earliest missing opening stock
                elif latest_closing is not None:
                    current_row["openingStock"] = latest_closing
                    # If this is the *earliest* week and openingStock is still None, use latest_closing
                    if current_week == weeks[0]:
                        current_row["openingStock"] = latest_closing


            # Ensure closingStock is also filled if it's None and we have openingStock and change
            if current_row["closingStock"] is None and \
               current_row.get("openingStock") is not None and \
               current_row.get("change") is not None:
                current_row["closingStock"] = current_row["openingStock"] + current_row["change"]
            
            # If after all logic, openingStock or closingStock is still None, default to 0
            if current_row["openingStock"] is None:
                current_row["openingStock"] = 0
            if current_row["closingStock"] is None:
                current_row["closingStock"] = 0


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

# Connection pool for better performance
connection_pool = None

async def init_db_pool():
    global connection_pool
    if connection_pool is None:
        connection_pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=5,
            max_size=20,
            command_timeout=60
        )

async def get_db_connection():
    if connection_pool is None:
        await init_db_pool()
    return await connection_pool.acquire()

async def release_db_connection(conn):
    if connection_pool:
        await connection_pool.release(conn)

# --- Define DC SKUs ---
dc_skus_master = {
    '91KA': [
        "1000065506", "1000065505", "901510015", "11620697", "18210013",
        "18210062", "18315580", "908180887", "1000376114", "20191466",
        "904115549", "11552056", "20250056", "11141223", "12114732",
        "1000957649", "1000036673", "904720009", "11216868",
        "904721296", "11213204", "904119996", "1000957648", "1000074851"
    ],
    '92KA': [
        "926093930", "26035352", "26033852", "1000023811"
    ]
}

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
    leadTimeDays: Optional[int] = None
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

class OrderRequest(BaseModel):
    item_id: int
    sku: str
    quantity: int
    order_type: str

class HistoricalStockItem(BaseModel):
    material: str
    item_desc: str
    plnt: str
    iso_year: int
    iso_week: int
    latest_daily_stock: float

# In-memory storage for demo
order_list: List[OrderRequest] = []

# --- SHARED DATA FUNCTIONS ---
async def get_historical_stock_data(plant: str) -> List[Dict]:
    """Shared function to get historical stock data"""
    import datetime as dt
    from datetime import datetime, timedelta
    
    conn = await connection_pool.acquire()  # Use shared pool
    try:
        anchor_date = datetime(2024, 12, 23)
        week_ranges = []
        for rel_week in range(-4, 0):
            start = (anchor_date - timedelta(days=anchor_date.weekday())) + timedelta(weeks=rel_week)
            end = start + timedelta(days=6)
            week_ranges.append((rel_week, start.date(), end.date()))

        date_min = min(start for _, start, _ in week_ranges)
        date_max = max(end for _, _, end in week_ranges)

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
            WHERE plant = $3
              AND d_period::date BETWEEN $1::date AND $2::date
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
        ),
        raw_mb51 AS (
            SELECT
                material,
                plant,
                TO_DATE(posting_date, 'YYYY-MM-DD') AS date,
                EXTRACT(isoyear FROM TO_DATE(posting_date, 'YYYY-MM-DD')) AS iso_year,
                EXTRACT(week FROM TO_DATE(posting_date, 'YYYY-MM-DD')) AS iso_week,
                unit_entry_qty::numeric AS unit_entry_qty
            FROM themall_poc.f_mb51_top50
            WHERE plant = $3
            AND TO_DATE(posting_date, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date
        ),
        move_summary AS (
            SELECT
                material,
                plant,
                iso_year,
                iso_week,
                SUM(CASE WHEN unit_entry_qty > 0 THEN unit_entry_qty ELSE 0 END) AS move_in,
                SUM(CASE WHEN unit_entry_qty < 0 THEN ABS(unit_entry_qty) ELSE 0 END) AS move_out
            FROM raw_mb51
            GROUP BY material, plant, iso_year, iso_week
        )
        SELECT
          r.material,
          r.plant,
          r.iso_year,
          r.iso_week,
          r.opening_stock,
          r.closing_stock,
          r.change,
          COALESCE(m.move_in, 0) AS move_in,
          COALESCE(m.move_out, 0) AS move_out
        FROM rolling r
        LEFT JOIN move_summary m
          ON r.material = m.material
         AND r.plant = m.plant
         AND r.iso_year = m.iso_year
         AND r.iso_week = m.iso_week
        ORDER BY r.material, r.iso_year, r.iso_week;
        """

        stock_rows = await conn.fetch(stock_query, date_min, date_max, plant)

        week_lookup = {}
        for rel, start, end in week_ranges:
            iso_year, iso_week, *_ = start.isocalendar()
            week_lookup[(iso_year, iso_week)] = rel

        result = []
        for row in stock_rows:
            iso_year = int(row["iso_year"])
            iso_week = int(row["iso_week"])
            rel_week = week_lookup.get((iso_year, iso_week), None)
            if rel_week is None:
                continue
            if plant in ['91KA', '92KA'] and row["material"].strip() not in dc_skus_master[plant]:
                continue
            elif plant in ['91KA', '92KA']:
                result.append({
                    "material": row["material"].strip(),
                    "week": rel_week,
                    "openingStock": int(row["opening_stock"]) if row["opening_stock"] is not None else None,
                    "closingStock": int(row["closing_stock"]) if row["closing_stock"] is not None else None,
                    "change": int(row["change"]) if row["change"] is not None else 0,
                    "moveIn": int(row["move_in"]) if row["move_in"] is not None else 0,
                    "moveOut": int(row["move_out"]) if row["move_out"] is not None else 0,
                })
                continue
            result.append({
                "material": row["material"].strip(),
                "week": rel_week,
                "openingStock": int(row["opening_stock"]) if row["opening_stock"] is not None else None,
                "closingStock": int(row["closing_stock"]) if row["closing_stock"] is not None else None,
                "change": int(row["change"]) if row["change"] is not None else 0,
                "moveIn": int(row["move_in"]) if row["move_in"] is not None else 0,
                "moveOut": int(row["move_out"]) if row["move_out"] is not None else 0,
            })

        result = patch_missing_weeks(result)
        result = backfill_opening_stock(result, weeks=[-4, -3, -2, -1])
        return result

    finally:
        await connection_pool.release(conn)  # Release to the same pool

async def get_forecast_data(plant: str) -> List[InventoryItemWithForecast]:
    """Shared function to get forecast data"""
    import datetime as dt
    from datetime import datetime

    conn = await connection_pool.acquire()  # Use shared pool
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
        if plant in ['91KA', '92KA']:
            skus_for_plant = dc_skus_master.get(plant, [])
            sku_query = """
                SELECT DISTINCT material AS sku, item_desc
                FROM themall_poc.final_order_table
                WHERE material = ANY($1::text[])
            """
            sku_rows = await conn.fetch(sku_query, skus_for_plant)
        else:
            sku_query = """
                SELECT DISTINCT material AS sku, item_desc
                FROM themall_poc.final_order_table
                WHERE plnt = $1
            """
            sku_rows = await conn.fetch(sku_query, plant)
        
        unique_skus = {}
        for row in sku_rows:
            sku = row["sku"].strip()
            if sku not in unique_skus:
                unique_skus[sku] = row["item_desc"].strip()
        sku_list = [{"sku": sku, "item_desc": desc} for sku, desc in unique_skus.items()]

        stock_query = """
            SELECT sku, reorder_point, category, supplier, lead_time_days
            FROM themall_poc.app_inventory_items_cal
            WHERE plant = $1
        """
        stock_rows = await conn.fetch(stock_query, plant)
        stock_map = {
            row["sku"].strip(): {
                "reorder_point": row["reorder_point"]*11 if plant in ['91KA', '92KA'] else row["reorder_point"],
                "category": row["category"].strip(),
                "supplier": row["supplier"].strip(),
                "lead_time_days": row["lead_time_days"],
            }
            for row in stock_rows
        }

        # --- Demand (predicted order quantity for weeks 0 to 8) ---
        all_weeks = [(year, week) for _, (year, week) in week_map.items()]
        year_list = [year for year, week in all_weeks]
        week_list = [week for year, week in all_weeks]

        # Conditional demand query based on plant
        if plant in ['91KA', '92KA']:
            skus_for_plant = dc_skus_master.get(plant, [])
            
            if not skus_for_plant:
                demand_rows = []
            else:
                demand_query = """
                    SELECT material, iso_year, iso_week, SUM(pred_order_qty) AS pred_order_qty
                    FROM themall_poc.final_order_table
                    WHERE (iso_year, iso_week) IN (SELECT UNNEST($1::int[]), UNNEST($2::int[]))
                    AND material = ANY($3::text[])
                    GROUP BY material, iso_year, iso_week
                """
                demand_rows = await conn.fetch(demand_query, year_list, week_list, skus_for_plant)
        else:
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

        # --- Get historical closing stock for W-1 (call shared function) ---
        hist_data = await get_historical_stock_data(plant)
        hist_lookup = {}
        for row in hist_data:
            hist_lookup[(row["material"].strip(), row["week"])] = row["closingStock"]

        # --- Forecast computation ---
        forecast_results = []
        for idx, sku_info in enumerate(sku_list):
            sku = sku_info["sku"]
            name = sku_info["item_desc"]
            if plant in ['91KA', '92KA'] and sku not in dc_skus_master[plant]:
                continue
            
            stock_info = stock_map.get(sku)
            if not stock_info:
                stock_info = {
                    "reorder_point": 0,
                    "category": "",
                    "supplier": "",
                    "lead_time_days": None,
                    "current_stock": 0
                }

            reorder_point = int(stock_info["reorder_point"])
            category = stock_info["category"]
            supplier = stock_info["supplier"]
            lead_time_days = stock_info["lead_time_days"]

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

                # Status logic
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

            forecast_results.append(InventoryItemWithForecast(
                id=idx + 1,
                name=name,
                sku=sku,
                currentStock=seed_stock or 0,
                reorderPoint=reorder_point or 0,
                category=category,
                supplier=supplier,
                leadTimeDays=lead_time_days,
                stockStatus=stock_status_list,
            ))

        return forecast_results

    finally:
        await connection_pool.release(conn)  # Release to the same pool

# --- API Routes ---

@app.get("/api/historical-stock")
async def get_historical_stock(plant: str = Query("15KA")):
    """Historical stock endpoint - now uses shared function"""
    try:
        result = await get_historical_stock_data(plant)
        return result
    except Exception as e:
        print(f"Historical Stock API Error: {e}")
        raise HTTPException(status_code=500, detail="Error fetching historical stock data")

@app.get("/api/dashboard/metrics")
async def get_dashboard_metrics(plant: str = Query("15KA")) -> Dict:
    """Dashboard metrics - now uses shared forecast function instead of HTTP call"""
    try:
        # Use shared function instead of HTTP call
        forecast_data = await get_forecast_data(plant)

        total_items = len(forecast_data)
        low_stock_items = 0
        urgent_items = 0

        for item in forecast_data:
            # Get the status for the current week (week 0)
            current_week_status = next(
                (s['status'] for s in item.stockStatus if s['week'] == 0),
                "okay"
            )

            if current_week_status == "critical":
                urgent_items += 1
                low_stock_items += 1
            elif current_week_status == "low":
                low_stock_items += 1

        return {
            "totalItems": total_items,
            "lowStockItems": low_stock_items,
            "urgentItems": urgent_items,
            "pendingOrders": 12
        }

    except Exception as e:
        print(f"Dashboard Metrics Error: {e}")
        raise HTTPException(status_code=500, detail="Error calculating dashboard metrics")

@app.get("/api/forecast", response_model=List[InventoryItemWithForecast])
async def get_forecast(plant: str = Query("15KA")):
    """Forecast endpoint - now uses shared function"""
    try:
        return await get_forecast_data(plant)
    except Exception as e:
        print(f"Forecast error: {e}")
        raise HTTPException(status_code=500, detail="Error generating forecast")

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
    conn = await connection_pool.acquire()  # Use shared pool
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
        await connection_pool.release(conn)  # Release to the same pool

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
    conn = await connection_pool.acquire()  # Use shared pool
    try:
        rows = await conn.fetch("""
            SELECT
                plant AS plant_code,
                plant_name_1 AS plant_name
            FROM themall_poc.d_plant_master
            ORDER BY plant_code
        """)

        return [
            {
                "code": row['plant_code'],
                "name": row['plant_name'] if row['plant_name'] else row['plant_code']
            }
            for row in rows
        ]
    except Exception as e:
        print(f"Error fetching plants: {e}")
        raise HTTPException(status_code=500, detail="Error fetching plant data")
    finally:
        await connection_pool.release(conn)  # Release to the same pool

@app.post("/api/allocate")
async def allocate_sku_demand(
    skus: List[str] = Body(..., embed=True),
    weeks: int = Query(2, ge=1, le=8)
):
    """
    For each SKU, return total predicted demand per plant over the next {weeks} weeks.
    """
    conn = await connection_pool.acquire()  # Use shared pool
    try:
        # Calculate week/year pairs
        week_map_query = """
            WITH week_series AS (
                SELECT generate_series(0, $1-1) AS relative_week
            ),
            target_weeks AS (
                SELECT
                    (DATE '2024-12-23' + relative_week * INTERVAL '1 week') AS target_date,
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
        week_rows = await conn.fetch(week_map_query, weeks)
        week_pairs = [(row["iso_year"], row["iso_week"]) for row in week_rows]

        iso_years = [wp[0] for wp in week_pairs]
        iso_weeks = [wp[1] for wp in week_pairs]

        demand_query = """
            SELECT material AS sku, plnt AS plant, SUM(pred_order_qty) AS total_demand
            FROM themall_poc.final_order_table
            WHERE material = ANY($1::text[])
              AND iso_year = ANY($2::int[])
              AND iso_week = ANY($3::int[])
            GROUP BY material, plnt
            ORDER BY material, plnt;
        """
        rows = await conn.fetch(demand_query, skus, iso_years, iso_weeks)
        
        allocation_map = defaultdict(dict)
        for row in rows:
            allocation_map[row["sku"]][row["plant"]] = int(row["total_demand"] or 0)

        result = []
        for sku in skus:
            allocations = []
            for plant, demand in allocation_map.get(sku, {}).items():
                allocations.append({"plant": plant, "demand": demand})
            result.append({"sku": sku, "allocations": allocations})

        return result

    except Exception as e:
        print(f"Allocation API error: {e}")
        raise HTTPException(status_code=500, detail="Error allocating SKU demand")
    finally:
        await connection_pool.release(conn)  # Release to the same pool

@app.get("/api/test-allocate")
async def test_allocate():
    """
    Test the allocation endpoint with hardcoded dummy SKUs and weeks=2.
    """
    dummy_skus = ["1000065506", "901510015", "FAKE1234"]  # Add real & fake SKUs for fun
    weeks = 2
    conn = await connection_pool.acquire()  # Use shared pool
    try:
        # --- Copy allocation logic ---
        week_map_query = """
            WITH week_series AS (
                SELECT generate_series(0, $1-1) AS relative_week
            ),
            target_weeks AS (
                SELECT
                    (DATE '2024-12-23' + relative_week * INTERVAL '1 week') AS target_date,
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
        week_rows = await conn.fetch(week_map_query, weeks)
        week_pairs = [(row["iso_year"], row["iso_week"]) for row in week_rows]

        iso_years = [wp[0] for wp in week_pairs]
        iso_weeks = [wp[1] for wp in week_pairs]

        demand_query = """
            SELECT material AS sku, plnt AS plant, SUM(pred_order_qty) AS total_demand
            FROM themall_poc.final_order_table
            WHERE material = ANY($1::text[])
              AND iso_year = ANY($2::int[])
              AND iso_week = ANY($3::int[])
            GROUP BY material, plnt
            ORDER BY material, plnt;
        """
        rows = await conn.fetch(demand_query, dummy_skus, iso_years, iso_weeks)
        
        from collections import defaultdict
        allocation_map = defaultdict(dict)
        for row in rows:
            allocation_map[row["sku"]][row["plant"]] = int(row["total_demand"] or 0)

        result = []
        for sku in dummy_skus:
            allocations = []
            for plant, demand in allocation_map.get(sku, {}).items():
                allocations.append({"plant": plant, "demand": demand})
            result.append({"sku": sku, "allocations": allocations})

        return result

    except Exception as e:
        print(f"Test Allocate API error: {e}")
        raise HTTPException(status_code=500, detail="Test allocate failed")
    finally:
        await conn.close()
