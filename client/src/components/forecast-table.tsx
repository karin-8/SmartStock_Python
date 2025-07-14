import { useState, useEffect, useMemo, useRef } from "react"; // Import useRef
import { Filter, Download, X, Package, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox"; // Import Checkbox
import React from "react";
import { AllocationTable } from "@/components/allocation-table"; // Import AllocationTable component
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  LabelList,
  Label,
} from "recharts";

// Import your types and utilities
import { exportInventorySummary } from "@/lib/export-utils";
import type { InventoryItemWithForecast } from "@shared/schema";
import OrderPopup from "./order-popup";

type HistoricalStockItem = {
  material: string;
  week: number;
  openingStock: number;
  closingStock: number;
  change: number;
  moveIn: number;
  moveOut: number;
};

type StockChartProps = {
  data: Array<{ week: string; value: number; isForecast?: boolean }>;
  title: string;
  reorderPoint?: number;
  chartType?: "opening" | "change" | "remain";
  isConnected?: boolean;
  demandRange?: string;
  setDemandRange?: (v: string) => void;
};

interface IntegratedStockChartProps {
  title: string;
  data: any[];
  chartType: "opening" | "change" | "remain";
  reorderPoint?: number;
  safetyStock?: number;
  isConnected?: boolean;
  demandRange?: string;
  setDemandRange?: (value: string) => void;
}



interface ForecastTableProps {
  plant: string;
  inventory: InventoryItemWithForecast[];
  isLoading: boolean;
  selectedTags?: string[];
}


type Plant = { code: string; name: string };

function getStatusBadge(status: "okay" | "low" | "critical") {
  const style = {
    okay: "bg-green-100 text-green-800",
    low: "bg-yellow-100 text-yellow-800",
    critical: "bg-red-100 text-red-800",
  };
  const label = status === "critical" ? "Must Order" : status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <Badge className={`${style[status]} text-xs font-semibold px-2 py-0.5 rounded-md`}>
      {label}
    </Badge>
  );
}

export default function IntegratedStockChart({
  title,
  data,
  chartType,
  reorderPoint,
  isConnected,
  demandRange,
  setDemandRange,
}: IntegratedStockChartProps) {


  // Calculate safety stock (10% of ROP, rounded up)
  const safetyStock = (typeof reorderPoint === 'number' && reorderPoint >= 0) 
  ? Math.ceil(reorderPoint * 0.1) 
  : undefined;

  // Calculate Y-axis domain to ensure ROP is visible
  const yAxisDomain = useMemo(() => {
    const values = data.map(d => d.value);
    let domainMin = Math.min(...values);
    let domainMax = Math.max(...values);

    const maybeInclude = (v?: number) => {
      if (typeof v === "number") {
        domainMin = Math.min(domainMin, v);
        domainMax = Math.max(domainMax, v);
      }
    };

    // Force ROP and Safety into the domain, always
    maybeInclude(reorderPoint);
    maybeInclude(safetyStock);

    const padding = Math.max(10, (domainMax - domainMin) * 0.1);
    domainMin = Math.max(0, domainMin - padding);
    domainMax = domainMax + padding;

    return [domainMin, domainMax];

  }, [data, reorderPoint, safetyStock, chartType]);

  // Find the index of "Current" to determine forecast area
  const currentIndex = data.findIndex(d => d.week === 'Current');
  const forecastStartIndex =
    data.findIndex(d => d.week === 'Current') >= 0
      ? data.findIndex(d => d.week === 'Current')
      : data.findIndex(d => d.week.startsWith('W+'));
  const lastIndex = data.length - 1;

  // Later inside <LineChart>
  {forecastStartIndex >= 0 && forecastStartIndex < lastIndex && (
    <ReferenceArea
      x1={data[forecastStartIndex].week}
      x2={data[lastIndex].week}
      fill="#FFFFCC"
      fillOpacity={0.6}
      stroke="none"
    />
  )}


  // Custom tooltip for better annotations
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const value = payload[0].value;
      const isHistorical = typeof label === "string" && label.includes('W-');
      const isCurrentWeek = label === 'Current';

      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-800">{label}</p>
          <p className="text-blue-600">
            {title}: <span className="font-bold">
              {chartType === "change" ?
                Math.round(value) :
                Math.round(value)
              }
            </span>
          </p>
          {reorderPoint && (
            <p className="text-red-600 text-sm">
              ROP: {reorderPoint}
            </p>
          )}
          {safetyStock && (
            <p className="text-orange-600 text-sm">
              Safety: {safetyStock}
            </p>
          )}
          {isHistorical && (
            <p className="text-gray-500 text-xs">Historical Data</p>
          )}
          {isCurrentWeek && (
            <p className="text-orange-600 text-xs font-medium">Current Week</p>
          )}
        </div>
      );
    }
    return null;
  };

  // Custom label formatter for data points
  const formatDataLabel = (value) => {
    return Math.round(value);
  };

  // Determine line color based on chart type
  const lineColor = useMemo(() => {
    if (chartType === "opening") return "#10b981"; // Green for opening
    if (chartType === "remain") return "#f97316";  // Orange for remaining
    return isConnected ? "#3b82f6" : "#6b7280"; // Blue for others, or default grey
  }, [chartType, isConnected]);


  // Find critical points for annotations
  const criticalPoints = data.filter(point =>
    reorderPoint && point.value <= reorderPoint
  );

  return (
    <div className={`p-4 rounded-lg transition-all duration-200 ${
      isConnected
        ? 'bg-blue-50 border-l-4 border-blue-400 ml-4 mr-2'
        : 'bg-gray-50'
    }`}>
      <h4 className="font-semibold text-sm mb-2 flex items-center justify-between">
        <div className="flex items-center">
          {isConnected && <div className="w-2 h-2 bg-blue-400 rounded-full mr-2"></div>}
          {title}
          {(typeof reorderPoint === 'number') && (typeof safetyStock === 'number') && (
            <span className="ml-2 text-xs text-gray-600">
              (ROP={reorderPoint}, Safety={safetyStock})
            </span>
          )}
        </div>
        {criticalPoints.length > 0 && (
          <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
            {criticalPoints.length} Critical Point{criticalPoints.length > 1 ? 's' : ''}
          </span>
        )}
      </h4>

      <div className="relative">
        {chartType === "change" && demandRange && setDemandRange && (
          <div className="absolute -top-4 right-0 z-10">
            <Select onValueChange={setDemandRange} defaultValue={demandRange}>
              <SelectTrigger className="text-xs w-[110px] border-gray-300 bg-white shadow-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1m">1 Month</SelectItem>
                <SelectItem value="6m">6 Months</SelectItem>
                <SelectItem value="12m">12 Months</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 25, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="week"
              tick={{ fontSize: 11 }}
              tickLine={{ stroke: '#9ca3af' }}
              tickFormatter={(tick) => {
                const anchorDate = new Date("2024-10-21");
                const rel = parseInt(tick.replace("W+", "").replace("W", "").replace("Current", "0"));
                if (isNaN(rel)) return tick;
                const targetDate = new Date(anchorDate);
                targetDate.setDate(anchorDate.getDate() + rel * 7);
                return targetDate.toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short"
                }); // e.g., "30 Dec"
              }}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={{ stroke: '#9ca3af' }}
              domain={yAxisDomain}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Yellow shading for forecast area */}
            {forecastStartIndex >= 0 && forecastStartIndex < lastIndex && (
              <ReferenceArea
                x1={data[forecastStartIndex].week}
                x2={data[lastIndex].week}
                fill="#FFFFCC"
                fillOpacity={0.6}
                stroke="none"
              />
            )}

            <Line
              type="monotone"
              dataKey="value"
              stroke={lineColor}
              // Use dynamic lineColor
              strokeWidth={isConnected ? 3 : 2}
              dot={{ fill: lineColor, r: 4 }}
              activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2 }}
            >
              {/* Add value labels on all data points */}
              <LabelList
                dataKey="value"
                position="top"
                style={{ fontSize: '10px', fill: '#374151', fontWeight: 'bold' }}
                formatter={formatDataLabel}
              />
            </Line>

            {/* Reorder Point Reference Line */}
            {reorderPoint && (
              <ReferenceLine
                y={reorderPoint}
                stroke="#ef4444"
                strokeDasharray="5 5"
                strokeWidth={2}
              >
                <Label
                  value={`ROP=${reorderPoint}`}
                  position="insideRight"
                  offset={10}
                  dy={-12}
                  style={{
                    fontSize: '11px',
                    fill: '#dc2626',
                    fontWeight: 'bold',
                    backgroundColor: 'rgba(255,255,255,0.8)',
                    padding: '2px 4px',
                    borderRadius: '2px',
                  }}
                />
              </ReferenceLine>
            )}

            {/* Safety Stock Reference Line */}
            {safetyStock !== undefined && (chartType === "opening" || chartType === "remain") && (
              <ReferenceLine
                y={safetyStock}
                stroke=" #f59e0b"
                strokeDasharray="3 3"
                strokeWidth={2}
              >
                <Label
                  value={`SAFETY=${safetyStock}`}
                  position="insideRight"
                  offset={10}
                  dy={12}
                  style={{
                    fontSize: '11px',
                    fill: '#d97706',
                    fontWeight: 'bold',
                    backgroundColor: 'rgba(255,255,255,0.8)',
                    padding: '2px 4px',
                    borderRadius: '2px',
                  }}
                />
              </ReferenceLine>
            )}

            {/* Add vertical line to separate historical from forecast */}
            <ReferenceLine
              x="Current"
              stroke="#f59e0b"
              strokeDasharray="2 2"
              strokeWidth={1}
              label={{
                value: "Now",
                position: "top",
                style: { fontSize: '10px', fill: '#f59e0b' }
              }}
            />

            {/* Add "Forecast" label in the middle of the shaded area */}
            {forecastStartIndex >= 0 && forecastStartIndex < lastIndex && (
              <ReferenceLine
                x={data[Math.floor((forecastStartIndex + lastIndex) / 2)].week}
                stroke="none"
                label={{
                  value: "Forecast",
                  position: "center",
                  offset: 10,
                  style: {
                    fontSize: '12px',
                    fill: 'rgba(40, 36, 36)',
                    fontWeight: 'bold',
                    backgroundColor: 'rgba(255,255,255,0.8)',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    border: '1px rgba(40, 36, 36)'
                  }
                }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// New MultiSelectFilter Component
interface MultiSelectFilterProps {
  label: string;
  options: string[];
  selectedValues: Set<string>;
  onValuesChange: (newValues: Set<string>) => void;
  displayValueMap?: { [key: string]: string }; // Optional map for display values
}

const MultiSelectFilter: React.FC<MultiSelectFilterProps> = ({
  label,
  options,
  selectedValues,
  onValuesChange,
  displayValueMap = {},
}) => {
  // "All" is considered selected if the selectedValues set contains all options.
  // If options is empty, "All" is also true (nothing to select, so everything is implicitly selected).
  const isAllExplicitlySelected = options.length > 0 && selectedValues.size === options.length;
  // Indeterminate state: some options are selected, but not all.
  const isIndeterminate = selectedValues.size > 0 && selectedValues.size < options.length;

  const handleCheckboxChange = (value: string, checked: boolean) => {
    let newSet = new Set(selectedValues);

    if (isAllExplicitlySelected && !checked) {
      // If currently all are selected and user is unchecking one,
      // start with all options and remove the unchecked one.
      newSet = new Set(options);
      newSet.delete(value);
    } else if (checked) {
      newSet.add(value);
    } else {
      newSet.delete(value);
    }
    onValuesChange(newSet);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onValuesChange(new Set(options)); // Explicitly select all options
    } else {
      onValuesChange(new Set()); // Explicitly deselect all options (empty set)
    }
  };

  const displaySelected = useMemo(() => {
    if (isAllExplicitlySelected) {
      return "All";
    }
    if (selectedValues.size === 0) { // If nothing is selected
      return "None";
    }
    if (selectedValues.size === 1) {
      const val = Array.from(selectedValues)[0];
      return displayValueMap[val] || val;
    }
    return `${selectedValues.size} selected`;
  }, [selectedValues, isAllExplicitlySelected, displayValueMap]);

  return (
    <div className="mb-4">
      <label className="text-sm font-medium text-gray-700 block mb-2">{label}</label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            {displaySelected}
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-60 p-2">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id={`select-all-${label}`}
                checked={isAllExplicitlySelected}
                onCheckedChange={handleSelectAll}
                indeterminate={isIndeterminate} // Set indeterminate state
              />
              <label
                htmlFor={`select-all-${label}`}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                All
              </label>
            </div>
            {options.map(option => (
              <div key={option} className="flex items-center space-x-2">
                <Checkbox
                  id={`${label}-${option}`}
                  checked={selectedValues.has(option)} // Check if this specific option is in the set
                  onCheckedChange={(checked: boolean) => handleCheckboxChange(option, checked)}
                />
                <label
                  htmlFor={`${label}-${option}`}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {displayValueMap[option] || option}
                </label>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};


export function ForecastTable({
  plant,
  selectedTags,
}: ForecastTableProps) {

  const [forecastData, setForecastData] = useState<InventoryItemWithForecast[]>([]);
  const [historicalData, setHistoricalData] = useState<HistoricalStockItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Changed filter states to Sets, initialized as empty
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [supplierFilter, setSupplierFilter] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<InventoryItemWithForecast | null>(null);
  const [showOrderPopup, setShowOrderPopup] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [expandedCharts, setExpandedCharts] = useState<Record<number, {
    opening: boolean;
    change: boolean;
    remain: boolean;
    allocation?: boolean;
  }>>({});
  const [demandChartData, setDemandChartData] = useState<Record<string, any[]>>({});
  const [loadingCharts, setLoadingCharts] = useState<Record<string, boolean>>({});

  const [allocationData, setAllocationData] = useState<Record<string, any>>({});
  const [loadingAllocation, setLoadingAllocation] = useState<Record<string, boolean>>({});
  const [plants, setPlants] = useState<Plant[]>([]);
  const [internalSelectedTags, setInternalSelectedTags] = useState<string[]>(selectedTags ?? []);
  const [demandRange, setDemandRange] = useState("12m");  // <-- ✅ ADD THIS HERE


  useEffect(() => {
    if (selectedTags) {
      setInternalSelectedTags(selectedTags);
    }
  }, [selectedTags]);

  useEffect(() => {
    // Map incoming tags to your internal status keys
    const statusMap: Record<string, string> = {
      "Low": "low",
      "Must-Order": "critical",
      "Okay": "okay",
    };

    // If incoming tags include stock-related ones, update status filter accordingly
    const mappedStatuses = internalSelectedTags
      .map(tag => statusMap[tag])
      .filter(Boolean);

    if (mappedStatuses.length > 0) {
      setStatusFilter(new Set(mappedStatuses));
    }
  }, [internalSelectedTags]);



  useEffect(() => {
    fetch("http://localhost:8000/api/plants")
      .then(res => res.json())
      .then(setPlants)
      .catch(() => setPlants([]));
  }, []);

  useEffect(() => {
    // Clear allocation data and collapse charts when plant changes
    setAllocationData({});
    setExpandedCharts(prev => {
      const newExpanded = { ...prev };
      Object.keys(newExpanded).forEach(id => {
        newExpanded[id] = {
          ...newExpanded[id],
          allocation: false,
        };
      });
      return newExpanded;
    });
  }, [plant]);


  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10); // You can adjust this value

  const weeks = [-4, -3, -2, -1, 0, 1, 2, 3, 4];

  const toggleChart = (id: number, chart: "opening" | "change" | "remain") => {
    setExpandedCharts(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [chart]: !prev[id]?.[chart],
      },
    }));
  };

  const handleOpenOrderPopup = (item: InventoryItemWithForecast) => {
    setSelectedItem(item);
    setShowOrderPopup(true);
  };

  // Use a ref to track if initial filters have been set
  const isInitialFilterSetup = useRef(false);

  // Restore your original data fetching
  useEffect(() => {
    if (!plant) return;
    setIsLoading(true);
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
        setIsLoading(false);
      }
    }
    fetchData();
  }, [plant]);

  useEffect(() => {
  Object.entries(expandedCharts).forEach(([id, charts]) => {
    const item = forecastData.find(i => i.id === Number(id));
    if (!item) return;

    const key = `${item.sku}-${demandRange}`;
    const demandRangeWeeksMap = {
      "1m": 4,
      "6m": 24,
      "12m": 52
    };

    if (charts.change && !demandChartData[key] && !loadingCharts[key]) {
      setLoadingCharts(prev => ({ ...prev, [key]: true }));

      fetch(`http://localhost:8000/api/demand-chart?sku=${item.sku}&plant=${plant}&timerange=${demandRangeWeeksMap[demandRange]}`)
        .then(res => res.json())
        .then(data => {
          const anchorDate = new Date("2024-10-21");
          const transformed = data.map((d: any) => {
            const currentDate = new Date(d.weekStartDate);
            const relWeeks = Math.round((currentDate.getTime() - anchorDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
            return {
              week: relWeeks < 0 ? `W${relWeeks}` : relWeeks === 0 ? "Current" : `W+${relWeeks}`,
              value: d.moveOut ?? d.forecastedDemand ?? 0,
              isForecast: d.forecasted === true
            };
          });

          setDemandChartData(prev => ({ ...prev, [key]: transformed }));
        })
        .catch(() => {
          setDemandChartData(prev => ({ ...prev, [key]: [] }));
        })
        .finally(() => {
          setLoadingCharts(prev => ({ ...prev, [key]: false }));
        });
    }
  });
}, [expandedCharts, demandRange, forecastData, plant]);


  const categories = useMemo(() => [...new Set(forecastData.map(i => i.category))], [forecastData]);
  const suppliers = useMemo(() => [...new Set(forecastData.map(i => i.supplier))], [forecastData]);

  // Define status options and their display names (ordered)
  const statusOptions = ["critical", "low", "okay"];
  const statusDisplayMap = {
    critical: "Must Order",
    low: "Low",
    okay: "Okay",
  };

  // Effect to set initial filters to "all selected" after data load
  // This now runs only once
  useEffect(() => {
    if (forecastData.length > 0 && isLoading === false && !isInitialFilterSetup.current) {
      setCategoryFilter(new Set(categories));
      setStatusFilter(new Set(statusOptions));
      setSupplierFilter(new Set(suppliers));
      isInitialFilterSetup.current = true; // Mark as setup
    }
  }, [forecastData, isLoading, categories, suppliers, statusOptions]);

  const filteredInventory = useMemo(() => {
    const filtered = forecastData.filter(item => {
      const currentStatus = item.stockStatus.find(s => s.week === 0)?.status;

      // Filtering logic: if a filter set is empty, it means "nothing is selected" for that filter
      // The initial useEffect ensures they are all selected by default.
      const matchCategory = categoryFilter.has(item.category);
      const matchSupplier = supplierFilter.has(item.supplier);
      const matchStatus = currentStatus && statusFilter.has(currentStatus);

      // If ALL filter sets are empty, it means the user has explicitly deselected "All" from ALL filters
      // (e.g., by clicking "Clear Filters" or unchecking "All" in each), so show nothing.
      // This ensures the "Deselect All -> Show None" behavior.
      if (categoryFilter.size === 0 && statusFilter.size === 0 && supplierFilter.size === 0) {
          return false;
      }

      return matchCategory && matchSupplier && matchStatus;
    });
    // Reset page to 1 when filters change
    setCurrentPage(1);
    return filtered;
  }, [forecastData, categoryFilter, statusFilter, supplierFilter]);

  const clearFilters = () => {
    setCategoryFilter(new Set(categories));
    setStatusFilter(new Set(statusOptions));
    setSupplierFilter(new Set(suppliers));
  };


  const handleExport = () => exportInventorySummary(filteredInventory);

  const getDisplayValue = (item: InventoryItemWithForecast, weekNum: number) => {
    if (weekNum >= 0) {
      const weekData = item.stockStatus.find(s => s.week === weekNum);
      if (!weekData) return "-";
      return Math.round(weekData.projectedStock);
    } else {
      const hist = historicalData.find(
        h => String(h.material).trim() === String(item.sku).trim() && h.week === weekNum
      );
      if (!hist) return "-";
      return Math.round(hist.openingStock);
    }
  };

  const getChartData = (item: InventoryItemWithForecast, type: "opening" | "change" | "remain") => {
    return weeks.map(weekNum => {
      const weekLabel = weekNum < 0 ? `W${weekNum}` : weekNum === 0 ? "Current" : `W+${weekNum}`;
      let value = 0;

      if (weekNum >= 0) {
        const weekData = item.stockStatus.find(s => s.week === weekNum);
        if (weekData) {
          switch (type) {
            case "opening":
              value = weekData.projectedStock;
              break;
            case "change":
              // For forecast weeks, show forecasted demand as positive value
              value = weekData.forecastedDemand || 0;
              break;
            case "remain":
              value = weekData.projectedStock - (weekData.forecastedDemand || 0);
              break;
          }
        }
      } else {
        const hist = historicalData.find(
          h => String(h.material).trim() === String(item.sku).trim() && h.week === weekNum
        );
        if (hist) {
          switch (type) {
            case "opening":
              value = hist.openingStock;
              break;
            case "change":
              // For historical weeks, show actual demand (moveOut) as positive value
              value = hist.moveOut || 0;
              break;
            case "remain":
              value = hist.openingStock + hist.change;
              break;
          }
        }
      }

      return { week: weekLabel, value };
    });
  };

  // Pagination Logic
  const totalPages = Math.ceil(filteredInventory.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = filteredInventory.slice(startIndex, endIndex);

  const goToNextPage = () => {
    setCurrentPage(prevPage => Math.min(prevPage + 1, totalPages));
  };

  const goToPreviousPage = () => {
    setCurrentPage(prevPage => Math.max(prevPage - 1, 1));
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }
  


  return (
    <div className="bg-white rounded-lg shadow-sm border">
      {/* Top Control Bar */}
      <div className="px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
          <h3 className="text-xl font-semibold text-gray-900">4-Week Stock Forecast</h3>
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
                className={
                  categoryFilter.size < categories.length || statusFilter.size < statusOptions.length || supplierFilter.size < suppliers.length
                    ? "bg-blue-50"
                    : ""
                }
              >
                <Filter className="w-4 h-4 mr-1" /> Filter
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4">
              {/* Reordered filters */}
              <MultiSelectFilter
                label="Status"
                options={statusOptions}
                selectedValues={statusFilter}
                onValuesChange={setStatusFilter}
                displayValueMap={statusDisplayMap}
              />
              <MultiSelectFilter
                label="Category"
                options={categories}
                selectedValues={categoryFilter}
                onValuesChange={setCategoryFilter}
              />
              <MultiSelectFilter
                label="Supplier"
                options={suppliers}
                selectedValues={supplierFilter}
                onValuesChange={setSupplierFilter}
              />
              {(categoryFilter.size > 0 || statusFilter.size > 0 || supplierFilter.size > 0) && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs mt-2">
                  <X className="w-3 h-3 mr-1" /> Clear Filters
                </Button>
              )}
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-1" /> Export
          </Button>
          {/* <Select onValueChange={(v) => setDemandRange(v as any)} defaultValue="1m">
            <SelectTrigger className="w-[120px] text-sm">
              <SelectValue placeholder="Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1m">1 Month</SelectItem>
              <SelectItem value="6m">6 Months</SelectItem>
              <SelectItem value="12m">12 Months</SelectItem>
            </SelectContent>
          </Select> */}
        </div>
      </div>

      {/* Forecast Table */}
      <div className="overflow-x-auto">
        <table className="w-full table-auto">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-6"></th>
              <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Item</th>
                {weeks.map(week => {
                  const monday = new Date(2024, 9, 21 + week * 7); // 11 = December (0-based)
                  const label = monday.toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                  }); // e.g., "25 Nov"
                  return (
                    <th
                      key={week}
                      className={
                        "px-1 py-1 text-center text-xs text-gray-500 " +
                        (week === 0 ? "font-bold text-gray-900" : "")
                      }
                    >
                      {label}
                    </th>
                  );
                })}
              <th className="px-3 py-2 text-right text-xs text-gray-500">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {currentItems.map(item => { 
              const currentStatus = item.stockStatus.find(s => s.week === 0)?.status;
              const isExpanded = expandedRows.has(item.id);

              return (
                <React.Fragment key={item.id}>
                  {/* Main Row - with visual connection indicator */}
                  <tr className={`hover:bg-gray-50 border-b transition-colors duration-150 ${
                    isExpanded ? 'bg-blue-50/30 border-blue-200' : ''
                  }`}>
                    <td className="px-2 py-2 text-center align-middle">
                      <button
                        onClick={() => {
                          setExpandedRows(prev =>
                            prev.has(item.id)
                              ? new Set([...prev].filter(id => id !== item.id))
                              : new Set([...prev, item.id])
                          );
                        }}
                        className="focus:outline-none p-1 rounded hover:bg-gray-200 transition-colors"
                        aria-label={isExpanded ? "Collapse details" : "Expand details"}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-blue-600" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-2 align-middle">
                      <div className="flex items-center justify-between min-w-0">
                        <div className="flex items-center">
                          {/* Visual connection indicator */}
                          {isExpanded && (
                            <div className="w-1 h-8 bg-blue-400 rounded-full mr-3 -ml-1"></div>
                          )}
                          <div>
                            <span className="text-sm font-medium text-left block truncate max-w-[12rem]">
                              {item.name}
                            </span>
                            <div className="text-xs text-gray-500 text-left truncate">
                              SKU: {item.sku}
                              <span className="mx-2">|</span>
                              Reorder Point: {item.reorderPoint}
                            </div>
                          </div>
                        </div>
                        <span className="ml-2 whitespace-nowrap">{currentStatus && getStatusBadge(currentStatus)}</span>
                      </div>
                    </td>
                    {weeks.map(weekNum => (
                      <td
                        key={weekNum}
                        className={
                          "px-1 py-2 text-center" +
                          (weekNum === 0 ? " font-bold text-gray-900" : "") +
                          (isExpanded ? " bg-blue-50/20" : "")
                        }
                      >
                        {getDisplayValue(item, weekNum)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right">
                      <Button variant="outline" size="sm" onClick={() => handleOpenOrderPopup(item)}>
                        Create Order
                      </Button>
                    </td>
                  </tr>

                  {/* Expanded Rows */}
                  {isExpanded && (
                    <>
                      {/* Demand Row - Updated to show actual demand */}
                      <tr className="bg-blue-50/20 text-xs text-center border-l-4">
                        <td className="px-2">
                          <div className="w-4 h-4 border-l-2 ml-2"></div>
                        </td>
                        {/* Apply blue color to 'Forecast' in the header */}
                        <td className="font-semibold text-gray-600 text-right pr-3">
                          Demand [Actual/<span className="text-gray-400">Forecast</span>]
                        </td>
                        {weeks.map(weekNum => {
                          let value;
                          // Keep the existing cell background (bg-blue-50/20 from parent row)
                          let cellClasses = "px-2 py-1"; // Base classes for all cells

                          if (weekNum < 0) {
                            // Historical weeks - show actual demand (moveOut)
                            const hist = historicalData.find(
                              h => h.material.trim() === item.sku.trim() && h.week === weekNum
                            );
                            value = hist?.moveOut !== undefined ? hist.moveOut : "-";
                            // No specific text color class here, will inherit default gray
                          } else {
                            // Forecast weeks - show forecasted demand
                            const weekData = item.stockStatus.find(s => s.week === weekNum);
                            if (
                              weekData &&
                              weekData.forecastedDemand !== undefined &&
                              weekData.forecastedDemand !== null
                            ) {
                              value = weekData.forecastedDemand;
                            } else {
                              value = "-";
                            }
                            // Apply blue text color for forecasted numbers
                            cellClasses += " text-gray-400 font-semibold"; // Blue text, slightly bolded for emphasis
                          }
                          return <td key={weekNum} className={cellClasses}>{value}</td>;
                        })}
                        <td></td>
                      </tr>

                      {/* Remain Row */}
                      <tr className="bg-blue-50/20 text-xs text-center font-bold border-l-4 border-blue-400">
                        <td className="px-2">
                          <div className="w-4 h-4 border-l-2 border-blue-400 ml-2"></div>
                        </td>
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
                          return <td key={weekNum} className="bg-blue-50/20">{value}</td>;
                        })}
                        <td></td>
                      </tr>

                      {/* Charts Row - Side by side layout */}
                      <tr className="bg-white border-l-4 border-blue-400">
                        <td className="px-2 py-4">
                          <div className="w-4 h-full border-l-2 border-blue-400 ml-2"></div>
                        </td>
                        <td colSpan={weeks.length + 2} className="p-4 pl-2">
                          <div className="space-y-4">
                            {/* Chart Toggle Buttons - updated labels */}
                            <div className="flex justify-center gap-2 mb-4">
                              {[
                                { key: "opening", label: "Opening Stock" },
                                { key: "change", label: "Demand" },
                                { key: "remain", label: "Remaining Stock" }
                              ].map(({ key, label }) => (
                                <button
                                  key={key}
                                  onClick={() => toggleChart(item.id, key as "opening" | "change" | "remain")}
                                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                                    expandedCharts[item.id]?.[key as "opening" | "change" | "remain"]
                                      ? 'bg-blue-600 text-white shadow-md'
                                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                  }`}
                                >
                                  {label}
                                </button>
                              ))}
                              {["91KA", "92KA"].includes(plant) && (
                                <button
                                  key="allocation"
                                  onClick={async () => {
                                    setExpandedCharts(prev => ({
                                      ...prev,
                                      [item.id]: {
                                        ...prev[item.id],
                                        allocation: !prev[item.id]?.allocation,
                                      },
                                    }));
                                    // Only fetch if not already fetched
                                    if (!allocationData[item.sku] && !loadingAllocation[item.sku]) {
                                      setLoadingAllocation(prev => ({ ...prev, [item.sku]: true }));
                                      try {
                                        const res = await fetch(
                                          "http://localhost:8000/api/allocate?weeks=2",
                                          {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ skus: [item.sku] }),
                                          }
                                        );
                                        const json = await res.json();
                                        setAllocationData(prev => ({
                                          ...prev,
                                          [item.sku]: json[0]?.allocations || [],
                                        }));
                                      } catch {
                                        setAllocationData(prev => ({ ...prev, [item.sku]: [] }));
                                      } finally {
                                        setLoadingAllocation(prev => ({ ...prev, [item.sku]: false }));
                                      }
                                    }
                                  }}
                                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                                    expandedCharts[item.id]?.allocation
                                      ? 'bg-blue-600 text-white shadow-md'
                                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                  }`}
                                >
                                  Allocation
                                </button>
                              )}
                            </div>

                            {/* Charts displayed side by side */}
                            {(() => {
                              const activeCharts = [];
                              const demandRangeWeeksMap = {
                                "1m": 4,
                                "6m": 24,
                                "12m": 52
                              };
                              if (expandedCharts[item.id]?.opening) {
                                activeCharts.push(
                                  <IntegratedStockChart
                                    key="opening"
                                    title="Opening Stock"
                                    reorderPoint={item.reorderPoint}
                                    data={getChartData(item, "opening")}
                                    chartType="opening"
                                    isConnected={true}
                                  />
                                );
                              }
                              if (expandedCharts[item.id]?.change) {
                                const key = `${item.sku}-${demandRange}`;
                                if (!demandChartData[key] && !loadingCharts[key]) {
                                  setLoadingCharts(prev => ({ ...prev, [key]: true }));

                                  fetch(`http://localhost:8000/api/demand-chart?sku=${item.sku}&plant=${plant}&timerange=${demandRangeWeeksMap[demandRange]}`)
                                    .then(res => res.json())
                                    .then(data => {
                                      const anchorDate = new Date("2024-10-21");
                                      const transformed = data.map((d: any) => {
                                        const currentDate = new Date(d.weekStartDate);
                                        const relWeeks = Math.round((currentDate.getTime() - anchorDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
                                        return {
                                          week: relWeeks < 0 ? `W${relWeeks}` : relWeeks === 0 ? "Current" : `W+${relWeeks}`,
                                          value: d.moveOut ?? d.forecastedDemand ?? 0,
                                          isForecast: d.forecasted === true
                                        };
                                      });

                                      // ✅ Now this is *inside* the .then
                                      setDemandChartData(prev => ({ ...prev, [key]: transformed }));
                                    })
                                    .catch(() => {
                                      setDemandChartData(prev => ({ ...prev, [key]: [] }));
                                    })
                                    .finally(() => {
                                      setLoadingCharts(prev => ({ ...prev, [key]: false }));
                                    });
                                }

                                activeCharts.push(
                                  <IntegratedStockChart
                                    key={`change-${demandRange}`}
                                    title={`Demand (${demandRange})`}
                                    data={demandChartData[key] || []}
                                    chartType="change"
                                    isConnected={true}
                                    demandRange={demandRange}
                                    setDemandRange={setDemandRange}
                                  />
                                );
                              }
                              if (expandedCharts[item.id]?.remain) {
                                activeCharts.push(
                                  <IntegratedStockChart
                                    key="remain"
                                    title="Remaining Stock"
                                    reorderPoint={item.reorderPoint}
                                    data={getChartData(item, "remain")}
                                    chartType="remain"
                                    isConnected={true}
                                  />
                                );
                              }
                              // In the place you render all the charts:
                              const isOnlyAllocation =
                                !!expandedCharts[item.id]?.allocation &&
                                !expandedCharts[item.id]?.opening &&
                                !expandedCharts[item.id]?.change &&
                                !expandedCharts[item.id]?.remain;

                              if (expandedCharts[item.id]?.allocation) {
                                activeCharts.push(
                                  <AllocationTable
                                    key="allocation"
                                    allocations={allocationData[item.sku] || []}
                                    plants={plants}
                                    isSolo={isOnlyAllocation}
                                  />
                                );
                              }
                              if (activeCharts.length === 0) return null;

                              return (
                                <div className={`grid gap-4 ${
                                  activeCharts.length === 1 ? 'grid-cols-1' :
                                  activeCharts.length === 2 ? 'grid-cols-1 lg:grid-cols-2' :
                                  'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3'
                                }`}>
                                  {activeCharts}
                                </div>
                              );
                            })()}
                          </div>
                        </td>
                      </tr>
                    </>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div className="flex justify-between items-center px-6 py-4 border-t border-gray-200">
        <Button
          variant="outline"
          size="sm"
          onClick={goToPreviousPage}
          disabled={currentPage === 1}
        >
          Previous
        </Button>
        <span className="text-sm text-gray-700">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={goToNextPage}
          disabled={currentPage === totalPages}
        >
          Next
        </Button>
      </div>

      {/* Order Popup */}
      {showOrderPopup && selectedItem && (
        <OrderPopup item={selectedItem} onClose={() => setShowOrderPopup(false)} />
      )}
    </div>
  );
}