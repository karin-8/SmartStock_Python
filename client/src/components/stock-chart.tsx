import { useEffect, useRef, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { getForecast, getHistorical } from "@/lib/api";

interface StockChartProps {}

export function StockChart({}: StockChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);
  const [selectedItemId, setSelectedItemId] = useState<string>("");

  const { data: forecast } = useQuery({
    queryKey: ["forecast"],
    queryFn: getForecast,
  });

  const { data: historical } = useQuery({
    queryKey: ["historical"],
    queryFn: getHistorical,
  });

  const selectedItem = useMemo(() => {
    return forecast?.find(
      (item) => item.id != null && item.id.toString() === selectedItemId
    );
  }, [forecast, selectedItemId]);

  const fullStockStatus = useMemo(() => {
    if (!selectedItem) return [];

    const historicalForItem = historical
      ?.filter((h) => h.material.trim() === selectedItem.sku.trim())
      .sort(
        (a, b) =>
          a.iso_year * 100 + a.iso_week - (b.iso_year * 100 + b.iso_week)
      )
      .map((h, idx) => ({
        week: idx - 4, // Map to W-4 to W-1
        projectedStock: h.latest_daily_stock,
        isHistorical: true,
      })) ?? [];

    const futureStatus = selectedItem.stockStatus.map((s) => ({
      week: s.week,
      projectedStock: s.projectedStock,
      isHistorical: false,
    }));

    return [...historicalForItem, ...futureStatus];
  }, [historical, selectedItem]);

  useEffect(() => {
    if (forecast && forecast.length > 0 && !selectedItemId) {
      const firstItemId = forecast[0]?.id;
      if (firstItemId != null) setSelectedItemId(firstItemId.toString());
    }
  }, [forecast, selectedItemId]);

  useEffect(() => {
    const loadChart = async () => {
      if (!selectedItem || !canvasRef.current) return;

      const { Chart, registerables } = await import("chart.js");
      Chart.register(...registerables);

      if (chartRef.current) {
        chartRef.current.destroy();
      }

      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;

      const labels = fullStockStatus.map((week, idx) => {
        const w = week.week;
        if (w < 0) return `W${w}`;
        if (w === 0) return "Current";
        return `W+${w}`;
      });

      const stockData = fullStockStatus.map((week) => Math.max(0, week.projectedStock));
      const reorderPointData = fullStockStatus.map(() => selectedItem.reorderPoint);

      chartRef.current = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Stock Level",
              data: stockData,
              borderColor: "hsl(207, 90%, 54%)",
              backgroundColor: "hsl(207, 90%, 54%)",
              borderWidth: 2,
              tension: 0.1,
              pointRadius: 3,
            },
            {
              label: "Reorder Point",
              data: reorderPointData,
              borderColor: "hsl(0, 84.2%, 60.2%)",
              borderWidth: 2,
              borderDash: [5, 5],
              pointRadius: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: "Stock Quantity",
              },
            },
            x: {
              title: {
                display: true,
                text: "Week",
              },
            },
          },
          plugins: {
            legend: { display: true },
            tooltip: { mode: "index", intersect: false },
          },
        },
      });
    };

    loadChart();

    return () => {
      if (chartRef.current) chartRef.current.destroy();
    };
  }, [selectedItem, fullStockStatus]);

  if (!forecast || forecast.length === 0) {
    return (
      <Card className="shadow-sm border border-gray-100">
        <CardHeader>
          <CardTitle>Stock Level Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-gray-500">No inventory data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm border border-gray-100">
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
          <div>
            <CardTitle className="text-xl font-semibold text-gray-900">Stock Level Trends</CardTitle>
          </div>
          <Select
            value={selectedItemId}
            onValueChange={(val) => setSelectedItemId(val)}
          >
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Select Item" />
            </SelectTrigger>
            <SelectContent className="max-h-60 overflow-y-auto">
              {forecast
                ?.filter((item) => item.id != null)
                .map((item) => (
                  <SelectItem key={item.id} value={item.id.toString()}>
                    {item.name} ({item.sku})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <canvas ref={canvasRef} className="w-full h-full" />
        </div>
        <div className="flex justify-center mt-4 space-x-6">
          <LegendDot color="hsl(207, 90%, 54%)" label="Stock Level" />
          <LegendDot color="hsl(0, 84.2%, 60.2%)" label="Reorder Point" />
        </div>
      </CardContent>
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center">
      <div className="w-3 h-3 rounded mr-2" style={{ backgroundColor: color }}></div>
      <span className="text-sm text-gray-600">{label}</span>
    </div>
  );
}
