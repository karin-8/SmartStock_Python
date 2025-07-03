import type { DashboardMetrics, InventoryItemWithForecast } from "@shared/schema";

export async function getMetrics(plant: string): Promise<DashboardMetrics> {
  const res = await fetch(`http://localhost:8000/api/dashboard/metrics?plant=${plant}`);
  if (!res.ok) {
    throw new Error("Failed to fetch dashboard metrics");
  }
  return res.json();
}

export async function getForecast(plant: string): Promise<InventoryItemWithForecast[]> {
  const res = await fetch(`http://localhost:8000/api/forecast?plant=${plant}`);
  if (!res.ok) {
    throw new Error("Failed to fetch forecast data");
  }
  return res.json();
}

export async function getHistorical(): Promise<any[]> {
  const res = await fetch(`http://localhost:8000/api/historical-stock?plant=${plant}`);
  if (!res.ok) {
    throw new Error("Failed to fetch historical stock data");
  }
  return res.json();
}
