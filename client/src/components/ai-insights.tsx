import { AlertCircle, TrendingUp, Settings, ArrowRight } from "lucide-react";
import { useInventory } from "@/hooks/useInventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { InventoryItemWithForecast, DashboardMetrics } from "@shared/schema";

interface AIInsightsProps {
  inventory?: InventoryItemWithForecast[];
  metrics?: DashboardMetrics;
}

export function AIInsights({ inventory, metrics }: AIInsightsProps) {
  const getCriticalAlert = () => {
    if (!inventory) return null;
    
    const criticalItem = inventory.find(item => 
      item.stockStatus?.some(status => status.status === "order")
    );

    
    if (criticalItem) {
      const weeksUntilStockout = criticalItem.stockStatus.findIndex(s => s.status === "order") + 1;
      return {
        item: criticalItem,
        weeksUntilStockout
      };
    }
    
    return null;
  };

  const getTrendInsight = () => {
    if (!inventory) return null;
    
    const highDemandItem = inventory.find(item => item.weeklyDemand > 70);
    if (highDemandItem) {
      return {
        item: highDemandItem,
        demandIncrease: Math.floor((highDemandItem.weeklyDemand - 56) / 56 * 100)
      };
    }
    
    return null;
  };

  const getOptimizationOpportunity = () => {
    if (!inventory) return null;
    
    const sameSupplierItems = inventory.filter(item => 
      item.supplier === "TechCorp" && 
      item.stockStatus.some(s => s.status === "order")
    );
    
    if (sameSupplierItems.length >= 2) {
      return {
        supplier: "TechCorp",
        itemCount: sameSupplierItems.length,
        savings: 240
      };
    }
    
    return null;
  };

  const criticalAlert = getCriticalAlert();
  const trendInsight = getTrendInsight();
  const optimizationOpportunity = getOptimizationOpportunity();

  return (
    <Card className="shadow-sm border border-gray-100">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl font-semibold text-gray-900">AI Insights</CardTitle>
        <p className="text-sm text-gray-600">Automated analysis of inventory patterns</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Critical Alert */}
        {criticalAlert && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start">
              <AlertCircle className="text-red-600 mt-1 mr-3 w-5 h-5" />
              <div>
                <h4 className="text-sm font-medium text-red-600">Critical Stock Alert</h4>
                <p className="text-sm text-red-700 mt-1">
                  {criticalAlert.item.name} will be out of stock in {criticalAlert.weeksUntilStockout} weeks. 
                  Immediate action required to avoid stockout.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Trend Insight */}
        {trendInsight && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start">
              <TrendingUp className="text-green-600 mt-1 mr-3 w-5 h-5" />
              <div>
                <h4 className="text-sm font-medium text-green-600">Demand Trend</h4>
                <p className="text-sm text-green-700 mt-1">
                  {trendInsight.item.name} showing {trendInsight.demandIncrease}% increase in demand. 
                  Consider increasing order quantities for next purchase.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Optimization */}
        {optimizationOpportunity && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <Settings className="text-blue-600 mt-1 mr-3 w-5 h-5" />
              <div>
                <h4 className="text-sm font-medium text-blue-600">Optimization Opportunity</h4>
                <p className="text-sm text-blue-700 mt-1">
                  Consolidate orders for {optimizationOpportunity.itemCount} items from {optimizationOpportunity.supplier} 
                  to reduce shipping costs by ${optimizationOpportunity.savings}.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Performance Metrics */}
        {metrics && (
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="text-center">
              <p className="text-sm text-gray-600">Turnover Rate</p>
              <p className="text-2xl font-bold text-gray-900">
                {metrics?.turnoverRate !== undefined ? `${metrics.turnoverRate.toFixed(1)}x` : "-"}%</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Stockout Frequency</p>
              <p className="text-2xl font-bold text-gray-900">
                {metrics?.stockoutFrequency !== undefined ? `${metrics.stockoutFrequency.toFixed(1)}%` : "-"}%
              </p>
            </div>
          </div>
        )}

        <Button variant="outline" className="w-full">
          View Detailed Analytics
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}
