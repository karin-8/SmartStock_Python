import { useState, useEffect, useMemo } from "react";
import { Filter, Download, X, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { exportInventorySummary } from "@/lib/export-utils";
import type { InventoryItemWithForecast } from "@shared/schema";
import { ChevronRight, ChevronDown } from "lucide-react"; // Add this to your imports
import OrderPopup from "./order-popup";
import React from "react";


type HistoricalStockItem = {
  material: string;
  week: number;
  openingStock: number;
  closingStock: number;
  change: number;
};


function getStatusBadge(status: "okay" | "low" | "critical") {
  const style = {
    okay: "bg-green-100 text-green-800",
    low: "bg-yellow-100 text-yellow-800",
    critical: "bg-red-100 text-red-800",
  };
  // Use "Must Order" for critical
  const label = status === "critical" ? "Must Order" : status.charAt(0).toUpperCase() + status.slice(1);

  // 🟢 Add tight padding and slim radius!
  return (
    <Badge className={`${style[status]} text-xs font-semibold px-2 py-0.5 rounded-md`}>
      {label}
    </Badge>
  );
}


export function ForecastTable({ plant }: { plant: string }) {
  const [forecastData, setForecastData] = useState<InventoryItemWithForecast[]>([]);
  const [historicalData, setHistoricalData] = useState<HistoricalStockItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [selectedItem, setSelectedItem] = useState<InventoryItemWithForecast | null>(null);
  const [showOrderPopup, setShowOrderPopup] = useState(false);

  const [stockViewMode, setStockViewMode] = useState<"open" | "movement" | "remaining" | "forecast">("open");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const weeks = [-4, -3, -2, -1, 0, 1, 2, 3, 4];

  const handleOpenOrderPopup = (item: InventoryItemWithForecast) => {
    setSelectedItem(item);
    setShowOrderPopup(true);
  };

  useEffect(() => {
    if (!plant) return;
    setIsLoading(true); // (optional) Start loading when plant changes
    async function fetchData() {
      try {
        const [forecastRes, historicalRes] = await Promise.all([
          fetch(`http://localhost:8000/api/forecast?plant=${plant}`),
          fetch(`http://localhost:8000/api/historical-stock?plant=${plant}`),
        ]);
        const forecastJson = await forecastRes.json();
        const historicalJson = await historicalRes.json();
        setForecastData(forecastJson);
        setHistoricalData(historicalJson);
      } catch (e) {
        console.error("Error fetching inventory/historical data", e);
      } finally {
        setIsLoading(false); // <<< THIS LINE IS CRITICAL!
      }
    }
    fetchData();
  }, [plant]);



  const categories = useMemo(() => [...new Set(forecastData.map(i => i.category))], [forecastData]);
  const suppliers = useMemo(() => [...new Set(forecastData.map(i => i.supplier))], [forecastData]);

  const filteredInventory = useMemo(() => {
    return forecastData.filter(item => {
      const matchCategory = categoryFilter === "all" || item.category === categoryFilter;
      const matchSupplier = supplierFilter === "all" || item.supplier === supplierFilter;
      const currentStatus = item.stockStatus.find(s => s.week === 0)?.status;

      let matchStatus = true;
      if (statusFilter === "critical") matchStatus = currentStatus === "critical";
      else if (statusFilter === "low") matchStatus = currentStatus === "low";
      else if (statusFilter === "okay") matchStatus = currentStatus === "okay";

      return matchCategory && matchSupplier && matchStatus;
    });
  }, [forecastData, categoryFilter, statusFilter, supplierFilter]);

  const clearFilters = () => {
    setCategoryFilter("all");
    setStatusFilter("all");
    setSupplierFilter("all");
  };

  const handleExport = () => exportInventorySummary(filteredInventory);

  const getDisplayValue = (item: InventoryItemWithForecast, weekNum: number) => {
    if (weekNum >= 0) {
      const weekData = item.stockStatus.find(s => s.week === weekNum);
      if (!weekData) return "-";

      switch (stockViewMode) {
        case "open":
          return Math.round(weekData.projectedStock);
        case "forecast":
          return weekData.forecastedDemand ?? "-";
        case "remaining":
          // ✅ For W0 and onward → Remaining = OpenStock - Forecasted Demand
          const remaining = weekData.projectedStock - (weekData.forecastedDemand ?? 0);
          return Math.round(remaining);
        case "movement":
          return "-";  // No movement for future weeks
        default:
          return "-";
      }
    } else {
      const hist = historicalData.find(
        h => String(h.material).trim() === String(item.sku).trim() && h.week === weekNum
      );
      if (!hist) return "-";

      switch (stockViewMode) {
        case "open":
          return Math.round(hist.openingStock);
        case "movement":
          return `${hist.moveIn} ; ${hist.moveOut}`;
        case "remaining":
          return Math.round(hist.projectedStock - hist.moveOut);
        case "forecast":
          return "-";
        default:
          return "-";
      }
    }
  };



  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  return (
  <>
    {/* Top Control Bar */}
    <div className="px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center">
      <div>
        <h3 className="text-xl font-semibold text-gray-900">8-Week Stock Forecast</h3>
        <p className="text-sm text-gray-600 mt-1">
          Showing {filteredInventory.length} of {forecastData.length} items
        </p>
      </div>
      <div className="flex items-center space-x-2 mt-4 sm:mt-0">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={categoryFilter !== "all" || statusFilter !== "all" || supplierFilter !== "all" ? "bg-blue-50" : ""}
            >
              <Filter className="w-4 h-4 mr-1" /> Filter
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4">
            <FilterSelect label="Category" value={categoryFilter} setValue={setCategoryFilter} options={categories} />
            <FilterSelect label="Status" value={statusFilter} setValue={setStatusFilter} options={["critical", "low", "okay"]} allOption />
            <FilterSelect label="Supplier" value={supplierFilter} setValue={setSupplierFilter} options={suppliers} />
            {(categoryFilter !== "all" || statusFilter !== "all" || supplierFilter !== "all") && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs mt-2">
                <X className="w-3 h-3 mr-1" /> Clear Filters
              </Button>
            )}
          </PopoverContent>
        </Popover>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="w-4 h-4 mr-1" /> Export
        </Button>
      </div>
    </div>
    {/* Forecast Table */}
    <div className="overflow-x-auto">
      <table className="w-full table-auto">
        <thead className="bg-gray-50">
          <tr>
            <th className="w-6"></th> {/* Chevron column */}
            <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Item</th>
            {weeks.map(week => (
              <th
                key={week}
                className={
                  "px-1 py-1 text-center text-xs text-gray-500 " +
                  (week === 0 ? "font-bold text-gray-900" : "")
                }
              >
                {week < 0 ? `W${week}` : week === 0 ? "Current" : `W+${week}`}
              </th>
            ))}
            <th className="px-3 py-2 text-right text-xs text-gray-500">Action</th>
          </tr>
        </thead>
        <tbody className="bg-white">
          {filteredInventory.map(item => {
            // Get status for current week (week === 0)
            const currentStatus = item.stockStatus.find(s => s.week === 0)?.status;

            return (
              <React.Fragment key={item.id}>
                {/* Main Row: Opening Stock only */}
                <tr className="hover:bg-gray-50 border-b">
                  {/* Chevron */}
                  <td className="px-2 py-2 text-center align-middle">
                    <button
                      onClick={() => {
                        setExpandedRows(prev =>
                          prev.has(item.id)
                            ? new Set([...prev].filter(id => id !== item.id))
                            : new Set([...prev, item.id])
                        );
                      }}
                      className="focus:outline-none"
                      aria-label={expandedRows.has(item.id) ? "Collapse details" : "Expand details"}
                    >
                      {expandedRows.has(item.id) ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>
                  </td>
                  {/* Name & SKU, with Status Badge */}
                  <td className="px-4 py-2 align-middle">
                    <div className="flex items-center justify-between min-w-0">
                      <span className="text-sm font-medium text-left block truncate max-w-[12rem]">
                        {item.name}
                      </span>
                      <span className="ml-2 whitespace-nowrap">{currentStatus && getStatusBadge(currentStatus)}</span>
                    </div>
                    <div className="text-xs text-gray-500 text-left truncate">
                      SKU: {item.sku}
                      <span className="mx-2">|</span>
                      Reorder Point: {item.reorderPoint}
                    </div>
                  </td>
                  {/* Opening stock for all weeks */}
                  {weeks.map(weekNum => (
                    <td
                      key={weekNum}
                      className={
                        "px-1 py-2 text-center" +
                        (weekNum === 0 ? " font-bold text-gray-900" : "")
                      }
                    >
                      {getDisplayValue(item, weekNum)}
                    </td>
                  ))}
                  {/* Action */}
                  <td className="px-3 py-2 text-right">
                    <Button variant="outline" size="sm" onClick={() => handleOpenOrderPopup(item)}>
                      Create Order
                    </Button>
                  </td>
                </tr>
                {/* Expanded Attribute Rows */}
                {expandedRows.has(item.id) && (
                  <>
                    {/* Change [Forecast] */}
                    <tr className="bg-gray-50 text-xs text-center">
                      <td></td>
                      <td className="font-semibold text-gray-600 text-right pr-3">
                        Change [Forecast]
                      </td>
                      {weeks.map(weekNum => {
                        let value;
                        if (weekNum < 0) {
                          // Historical: +N for positive, N for negative/zero, "-" for missing
                          const hist = historicalData.find(
                            h => h.material.trim() === item.sku.trim() && h.week === weekNum
                          );
                          if (hist?.change === undefined || hist?.change === null) {
                            value = "-";
                          } else if (hist.change > 0) {
                            value = `+${hist.change}`;
                          } else {
                            value = `${hist.change}`;
                          }
                        } else {
                          // Forecast: Always show as [-N] (even if original is positive)
                          const weekData = item.stockStatus.find(s => s.week === weekNum);
                          if (
                            weekData &&
                            weekData.forecastedDemand !== undefined &&
                            weekData.forecastedDemand !== null
                          ) {
                            const val = -Math.abs(weekData.forecastedDemand);
                            value = `[${val}]`;
                          } else {
                            value = "-";
                          }
                        }
                        return <td key={weekNum}>{value}</td>;
                      })}
                      <td></td>
                    </tr>
                    {/* Remain */}
                   <tr className="bg-gray-50 text-xs text-center font-bold border-b rounded-b-xl">
                      <td></td>
                      <td className="font-semibold text-gray-600 text-right pr-3">Remain</td>
                      {weeks.map(weekNum => {
                        let value;
                        if (weekNum < 0) {
                          const hist = historicalData.find(
                            h => h.material.trim() === item.sku.trim() && h.week === weekNum
                          );
                          value = hist ? Math.round(hist.openingStock + hist.change) : "-";
                        } else {
                          const weekData = item.stockStatus.find(s => s.week === weekNum);
                          value = weekData
                            ? Math.round(weekData.projectedStock - (weekData.forecastedDemand ?? 0))
                            : "-";
                        }
                        return <td key={weekNum}>{value}</td>;
                      })}
                      <td></td>
                    </tr>
                  </>
                )}
              </React.Fragment>
            );

          })}
        </tbody>
      </table>
    </div>
    {/* Popup */}
    {showOrderPopup && selectedItem && (
      <OrderPopup item={selectedItem} onClose={() => setShowOrderPopup(false)} />
    )}
  </>
  );
}

function FilterSelect({
  label, value, setValue, options, allOption = true
}: {
  label: string;
  value: string;
  setValue: (val: string) => void;
  options: string[];
  allOption?: boolean;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700 block mb-2">{label}</label>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allOption && <SelectItem value="all">All</SelectItem>}
          {options.map(option => (
            <SelectItem key={option} value={option}>{option}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
