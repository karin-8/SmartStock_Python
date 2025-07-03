import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { InventoryItemWithForecast } from "@shared/schema";

interface OrderPopupProps {
  item: InventoryItemWithForecast;
  onClose: () => void;
}

const OrderPopup: React.FC<OrderPopupProps> = ({ item, onClose }) => {
  const stockAtW4 = item.stockStatus.find((s) => s.week === 4)?.projectedStock ?? 0;
  const safetyStock = Math.ceil(item.reorderPoint * 0.1);
  const targetStockAtW4 = safetyStock;

  const gap = targetStockAtW4 - stockAtW4;
  const recommendedQty = Math.max(0, gap);


  const [quantity, setQuantity] = useState<number>(recommendedQty);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (quantity <= 0 || isNaN(quantity)) {
      setError("Quantity must be at least 1.");
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQty = Number(e.target.value);
    setQuantity(newQty);
    if (newQty > 0) setError(null);
  };

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

          <div className="grid grid-cols-2 gap-x-2 py-1 bg-gray-50">
            <div className="font-medium text-blue-800">Reorder Point:</div>
            <div>{item.reorderPoint} units</div>
          </div>

          <div className="grid grid-cols-2 gap-x-2 py-1">
            <div className="font-medium text-blue-800">Safety Stock:</div>
            <div>{safetyStock} units</div>
          </div>

          <div className="grid grid-cols-2 gap-x-2 py-1 bg-gray-50">
            <div className="font-medium text-blue-800">Suggested Order Qty:</div>
            <div>
              {recommendedQty} units
              <div className="text-xs text-gray-500">Enough for next 1 month (4 weeks)</div>
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
            value={quantity}
            onChange={handleChange}
            min={1}
            placeholder={`Suggested: ${recommendedQty}`}
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
