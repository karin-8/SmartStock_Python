
import httpx
import numpy as np
from typing import List, Dict
from datetime import datetime

async def fetch_forecast_data(plant: str) -> list:
    async with httpx.AsyncClient() as client:
        res = await client.get(f"http://localhost:8000/api/forecast?plant={plant}")
        res.raise_for_status()
        return res.json()

def rolling_slope(values: list[float], window: int = 2) -> list[float]:
    slopes = []
    x = np.arange(window)
    for i in range(len(values) - window + 1):
        y = values[i:i+window]
        slope, _ = np.polyfit(x, y, 1)
        slopes.append(round(slope, 2))
    return slopes

async def generate_analytics(plant: str) -> dict:
    start = datetime.now()
    forecast_data = await fetch_forecast_data(plant)

    demand_slopes = []
    stock_slopes = []

    for item in forecast_data:
        sku = item.get("sku")
        name = item.get("name")
        status_list = sorted(item.get("stockStatus", []), key=lambda w: w["week"])
        # print(status_list)

        demands = [week["forecastedDemand"] for week in status_list if 3 <= week['week'] < 6]
        stocks = [week["projectedStock"] for week in status_list if 3 <= week['week'] < 6]

        if len(demands) >= 3:
            demand_slopes.append({
                "sku": sku,
                "name": name,
                "slopes": rolling_slope(demands)
            })
        if len(stocks) >= 3:
            stock_slopes.append({
                "sku": sku,
                "name": name,
                "slopes": rolling_slope(stocks)
            })
    end = datetime.now()
    # Rank based on average slope to identify top changing SKUs
    top_demand_spike = sorted(demand_slopes, key=lambda x: -np.mean(x["slopes"]))[:5]
    top_stock_decline = sorted(stock_slopes, key=lambda x: np.mean(x["slopes"]))[:5]

    elapsed = end - start

    print(f"Delivered analytics: {elapsed.total_seconds():.2f} seconds elapsed")

    return {
        "demand_spike": top_demand_spike,
        "low_stock_trend": top_stock_decline
    }



def group_by_sku(data: List[Dict]) -> Dict[str, List[Dict]]:
    from collections import defaultdict
    grouped = defaultdict(list)
    for item in data:
        grouped[item["sku"]].append(item)
    return grouped
