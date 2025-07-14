import { Package, AlertTriangle, Clock, Flame } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardMetrics } from "@shared/schema";

interface MetricsCardsProps {
  metrics?: DashboardMetrics;
  urgentCount: number;
  isLoading: boolean;
  onFilterSelect?: (filters: string[]) => void;
}


export function MetricsCards({ metrics, isLoading, onFilterSelect }: MetricsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="p-6">
            <Skeleton className="h-16 w-full" />
          </Card>
        ))}
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Total SKUs */}
      <Card 
        className="flex flex-col justify-between p-4 shadow-sm border border-gray-100 cursor-pointer transition hover:shadow-md hover:border-blue-300 hover:bg-blue-50"
        onClick={() => onFilterSelect?.(["Okay", "Low", "Must-Order"])}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 font-medium">Total SKUs</p>
            <p className="text-2xl font-bold text-blue-600">{metrics.totalItems}</p>
          </div>
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Package className="w-5 h-5 text-blue-600" />
          </div>
        </div>
        <div className="mt-3 text-sm text-green-600">+1 from last week</div>
      </Card>

      {/* Low Stock SKUs */}
      <Card 
        className="flex flex-col justify-between p-4 shadow-sm border border-gray-100 cursor-pointer transition hover:shadow-md hover:border-blue-300 hover:bg-blue-50"
        onClick={() => onFilterSelect?.(["Low", "Must-Order"])}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 font-medium">Low Stock SKUs</p>
            <p className="text-2xl font-bold text-orange-600">{metrics.lowStockItems}</p>
          </div>
          <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
          </div>
        </div>
        <div className="mt-3 text-sm text-orange-600">Action required</div>
      </Card>

      {/* Must-Order SKUs */}
      <Card 
        className="flex flex-col justify-between p-4 shadow-sm border border-gray-100 cursor-pointer transition hover:shadow-md hover:border-blue-300 hover:bg-blue-50"
        onClick={() => onFilterSelect?.(["Must-Order"])}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 font-medium">Must-Order SKUs</p>
            <p className="text-2xl font-bold text-red-600">{metrics.urgentItems}</p>
          </div>
          <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
            <Flame className="w-5 h-5 text-red-600" />
          </div>
        </div>
        <div className="mt-3 text-sm text-red-600 font-medium">Immediate attention</div>
      </Card>

      {/* Pending Orders */}
      <Card className="flex flex-col justify-between p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 font-medium">Pending Orders</p>
            <p className="text-2xl font-bold text-orange-500">{metrics.pendingOrders}</p>
          </div>
          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
            <Clock className="w-5 h-5 text-orange-500" />
          </div>
        </div>
        <div className="mt-3 text-sm text-gray-600">Due this week</div>
      </Card>
    </div>
  );
}
