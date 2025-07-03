import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, FileText, FileSpreadsheet, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { exportOrderToPDF, exportOrderToExcel } from "@/lib/export-utils";
import type { InventoryItemWithForecast, InsertOrder } from "@shared/schema";


interface OrderFormProps {
  inventory?: InventoryItemWithForecast[];
  selectedItem?: InventoryItemWithForecast | null;
  onClearSelection?: () => void;
}

export function OrderForm({ inventory, selectedItem: preSelectedItem, onClearSelection }: OrderFormProps) {
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [orderQuantity, setOrderQuantity] = useState<number>(0);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Use either the pre-selected item or the manually selected item
  const activeItem = preSelectedItem || inventory?.find(item => item.id.toString() === selectedItemId);

  // Effect to handle pre-selected item
  useEffect(() => {
    if (preSelectedItem) {
      setSelectedItemId(preSelectedItem.id.toString());
      // Set default order quantity based on reorder point and safety stock
      const suggestedQuantity = Math.max(preSelectedItem.reorderPoint + preSelectedItem.safetyStock, Math.ceil(preSelectedItem.weeklyDemand * 4));
      setOrderQuantity(suggestedQuantity);
    }
  }, [preSelectedItem]);

  const createOrderMutation = useMutation({
    mutationFn: async (order: InsertOrder) => {
      // Convert Date objects to ISO strings for JSON serialization
      const orderData = {
        ...order,
        expectedDeliveryDate: order.expectedDeliveryDate?.toISOString() || null
      };
      const response = await apiRequest("POST", "/api/orders", orderData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Order Created",
        description: "Your order has been successfully created.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
      
      // Clear form state and pre-selected item
      setSelectedItemId("");
      setOrderQuantity(0);
      onClearSelection?.();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create order. Please try again.",
        variant: "destructive",
      });
      console.error("Error creating order:", error);
    },
  });

  const handleItemSelect = (value: string) => {
    setSelectedItemId(value);
    const item = inventory?.find(item => item.id.toString() === value);
    if (item) {
      // Set default order quantity based on reorder point and safety stock
      const suggestedQuantity = Math.max(item.reorderPoint + item.safetyStock, Math.ceil(item.weeklyDemand * 4));
      setOrderQuantity(suggestedQuantity);
    }
  };

  const handleCreateOrder = () => {
    if (!activeItem || orderQuantity <= 0) {
      toast({
        title: "Invalid Order",
        description: "Please select an item and enter a valid quantity.",
        variant: "destructive",
      });
      return;
    }

    const order: InsertOrder = {
      itemId: activeItem.id,
      quantity: orderQuantity,
      status: "pending",
      cost: orderQuantity * activeItem.unitCost,
      expectedDeliveryDate: new Date(Date.now() + activeItem.leadTimeDays * 24 * 60 * 60 * 1000),
    };

    createOrderMutation.mutate(order);
  };

  const handleExportPDF = () => {
    if (!activeItem) return;
    exportOrderToPDF(activeItem, orderQuantity);
  };

  const handleExportExcel = () => {
    if (!activeItem) return;
    exportOrderToExcel(activeItem, orderQuantity);
  };

  const getAIRecommendation = () => {
    if (!activeItem) return "";
    
    const weeksUntilStockout = activeItem.stockStatus.findIndex(s => s.status === "critical");
    const suggestedQuantity = Math.max(activeItem.reorderPoint + activeItem.safetyStock, Math.ceil(activeItem.weeklyDemand * 4));
    
    if (weeksUntilStockout >= 0) {
      return `Based on current trends, order ${suggestedQuantity} units now. Expected delivery in ${activeItem.leadTimeDays} days will prevent stockout.`;
    }
    
    return `Current stock levels are adequate. Next order recommended in ${Math.floor(activeItem.currentStock / activeItem.weeklyDemand)} weeks.`;
  };

  return (
    <Card className="shadow-sm border border-gray-100">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl font-semibold text-gray-900">Create New Order</CardTitle>
        <p className="text-sm text-gray-600">Generate optimized orders based on demand forecasting and stock levels</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label htmlFor="item-select" className="text-sm font-medium text-gray-700">
            Select Item
          </Label>
          <Select value={selectedItemId} onValueChange={handleItemSelect}>
            <SelectTrigger className="w-full mt-2">
              <SelectValue placeholder="Choose an item..." />
            </SelectTrigger>
            <SelectContent>
              {inventory?.map((item) => (
                <SelectItem key={item.id} value={item.id.toString()}>
                  {item.name} ({item.sku})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {preSelectedItem && (
            <div className="flex items-center justify-between mt-2 p-2 bg-blue-50 border border-blue-200 rounded">
              <p className="text-sm text-blue-700">
                <strong>{preSelectedItem.name}</strong> selected from forecast table
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={onClearSelection}
                className="text-blue-600 hover:text-blue-800"
              >
                Clear Selection
              </Button>
            </div>
          )}
        </div>

        {activeItem && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Current Stock</p>
                <p className="text-2xl font-bold text-gray-900 font-mono">
                  {activeItem.currentStock}
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Reorder Point (ROP)</p>
                <p className="text-2xl font-bold text-orange-600 font-mono">
                  {activeItem.reorderPoint}
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Safety Stock</p>
                <p className="text-2xl font-bold text-gray-600 font-mono">
                  {activeItem.safetyStock}
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Weekly Demand</p>
                <p className="text-2xl font-bold text-green-600 font-mono">
                  {Math.round(activeItem.weeklyDemand)}
                </p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start">
                <Lightbulb className="text-blue-600 mt-1 mr-3 w-5 h-5" />
                <div>
                  <h4 className="text-sm font-medium text-blue-600">AI Recommendation</h4>
                  <p className="text-sm text-blue-700 mt-1">
                    {getAIRecommendation()}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="quantity" className="text-sm font-medium text-gray-700">
                Order Quantity
              </Label>
              <Input
                id="quantity"
                type="number"
                value={orderQuantity}
                onChange={(e) => setOrderQuantity(Number(e.target.value))}
                className="w-full mt-2 font-mono"
                min="1"
              />
            </div>

            <div className="flex space-x-3">
              <Button 
                onClick={handleCreateOrder}
                disabled={createOrderMutation.isPending}
                className="flex-1 bg-blue-600 text-white hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                {createOrderMutation.isPending ? "Creating..." : "Create Order"}
              </Button>
              <Button variant="outline" onClick={handleExportPDF}>
                <FileText className="w-4 h-4 mr-2" />
                PDF
              </Button>
              <Button variant="outline" onClick={handleExportExcel}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Excel
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
