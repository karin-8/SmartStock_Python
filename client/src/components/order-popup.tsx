import React, { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { InventoryItemWithForecast } from "@shared/schema";

interface OrderPopupProps {
  item: InventoryItemWithForecast;
  onClose: () => void;
}

const OrderPopup: React.FC<OrderPopupProps> = ({ item, onClose }) => {
  // Default to 4 weeks (approximately 1 month)
  const [weeksToLast, setWeeksToLast] = useState<number>(2);
  const [quantity, setQuantity] = useState<number>(0); // Holds the actual quantity in the input
  const [isQuantityManuallyEdited, setIsQuantityManuallyEdited] = useState<boolean>(false); // Tracks if user manually edited quantity
  const [error, setError] = useState<string | null>(null);
  const [weeksToLastError, setWeeksToLastError] = useState<string | null>(null);

  // Calculate recommended quantity based on weeksToLast
  const calculatedRecommendedQty = useMemo(() => {
    const safetyStock = Math.ceil(item.reorderPoint * 0.1);
    const currentStock = item.currentStock ?? 0;

    if (weeksToLast <= 0 || isNaN(weeksToLast)) {
      setWeeksToLastError("Weeks to last must be a positive number.");
      return 0;
    }
    setWeeksToLastError(null);

    let totalDemandInPeriod = 0;
    for (let i = 0; i < weeksToLast; i++) {
      const weekData = item.stockStatus.find(s => s.week === i);
      if (weekData) {
        totalDemandInPeriod += weekData.forecastedDemand ?? 0;
      }
    }

    const totalNeeded = totalDemandInPeriod + safetyStock;
    return Math.max(0, totalNeeded - currentStock);
  }, [weeksToLast, item.stockStatus, item.currentStock, item.reorderPoint]);

  // Effect to update quantity when calculatedRecommendedQty changes,
  // but only if the user hasn't manually edited it.
  useEffect(() => {
    if (!isQuantityManuallyEdited) {
      setQuantity(calculatedRecommendedQty);
    }
  }, [calculatedRecommendedQty, isQuantityManuallyEdited]);


  const handleSubmit = async () => {
    if (quantity <= 0 || isNaN(quantity)) {
      setError("Order quantity must be at least 1.");
      return;
    }
    if (weeksToLast <= 0 || isNaN(weeksToLast)) {
      setWeeksToLastError("Weeks to last must be a positive number.");
      return;
    }

    await fetch("http://localhost:8000/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_id: item.id,
        sku: item.sku,
        quantity: quantity,
        order_type: "manual",
      }),
    });

    onClose();
  };

  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQty = Number(e.target.value);
    setQuantity(newQty);
    setIsQuantityManuallyEdited(true); // Mark as manually edited
    if (newQty > 0) setError(null);
  };

  const handleWeeksToLastChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newWeeks = Number(e.target.value);
    setWeeksToLast(newWeeks);
    // When weeksToLast changes, we want to reset manual edit flag
    // so quantity updates to the new recommended value
    setIsQuantityManuallyEdited(false);
    if (newWeeks > 0) setWeeksToLastError(null);
  };

  // Removed handleIncrementWeeks and handleDecrementWeeks as they are no longer needed

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white p-6 rounded shadow w-96 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">Order Profile</h2>

        {/* ✅ Grid with clean dark blue labels */}
        <div className="space-y-1 text-sm text-gray-700">
          <div className="grid grid-cols-2 gap-x-2 py-1">
            <div className="font-medium text-blue-800">Item:</div>
            <div>{item.name}</div>
          </div>

          <div className="grid grid-cols-2 gap-x-2 py-1 bg-gray-50">
            <div className="font-medium text-blue-800">Supplier:</div>
            <div>{item.supplier}</div>
          </div>

          <div className="grid grid-cols-2 gap-x-2 py-1">
            <div className="font-medium text-blue-800">Current Stock:</div>
            <div>{item.currentStock} units</div>
          </div>

          {/* Added Lead Time (Days) here */}
          <div className="grid grid-cols-2 gap-x-2 py-1 bg-gray-50">
            <div className="font-medium text-blue-800">Lead Time (Days):</div>
            <div>{item.leadTimeDays !== null && item.leadTimeDays !== undefined ? item.leadTimeDays : 'N/A'}</div>
          </div>

          <div className="grid grid-cols-2 gap-x-2 py-1">
            <div className="font-medium text-blue-800">Reorder Point:</div>
            <div>{item.reorderPoint} units</div>
          </div>

          <div className="grid grid-cols-2 gap-x-2 py-1 bg-gray-50">
            <div className="font-medium text-blue-800">Safety Stock:</div>
            <div>{Math.ceil(item.reorderPoint * 0.1)} units</div>
          </div>

          {/* Input for Weeks to Last - now relying on native number input controls */}
          <div className="grid grid-cols-2 gap-x-2 py-1">
            <label htmlFor="weeksToLast" className="font-medium text-blue-800 self-center">Weeks to Last:</label>
            <div>
              <Input
                id="weeksToLast"
                type="number"
                value={weeksToLast}
                onChange={handleWeeksToLastChange}
                min={1}
                className="w-12 text-center" // Adjusted width, removed flex container
              />
            </div>
            {weeksToLastError && <p className="text-red-600 text-xs mt-1 col-span-2">{weeksToLastError}</p>}
          </div>

          <div className="grid grid-cols-2 gap-x-2 py-1 bg-gray-50">
            <div className="font-medium text-blue-800">Suggested Order Qty:</div>
            <div>
              {calculatedRecommendedQty} units {/* Display the calculated recommended quantity */}
              <div className="text-xs text-gray-500">
                Enough for next {weeksToLast} week{weeksToLast === 1 ? '' : 's'}
              </div>
            </div>
          </div>
        </div>

        {/* ✅ Divider */}
        <hr className="my-4 border-gray-300" />

        {/* ✅ Quantity Input */}
        <div>
          <label className="block text-sm font-medium">Order Quantity</label>
          <Input
            type="number"
            value={quantity} // This is the value that can be manually edited
            onChange={handleQuantityChange}
            min={1}
            placeholder={`Suggested: ${calculatedRecommendedQty}`}
          />
          {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
        </div>

        {/* ✅ Buttons */}
        <div className="flex justify-end gap-2 mt-4">
          <Button onClick={handleSubmit} className="bg-blue-600 text-white hover:bg-blue-700">
            Confirm
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
};

export default OrderPopup;
