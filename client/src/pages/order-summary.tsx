"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { exportOrderToPDF, exportOrderToExcel } from "@/lib/export-utils";

interface Order {
  item_id: number;
  quantity: number;
  order_type: string;
  name: string;
  category: string;
  supplier: string;
}

export default function OrderSummaryPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrders = async () => {
      const res = await fetch("http://localhost:8000/api/orders");
      const data = await res.json();
      setOrders(data.orders);
      setLoading(false);
    };

    fetchOrders();
  }, []);

  const toggleSelect = (id: number) => {
    setSelectedOrders((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedOrders.length === orders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(orders.map((o) => o.item_id));
    }
  };

  const handleQuantityChange = (index: number, newQty: number) => {
    setOrders((prev) => {
      const updated = [...prev];
      updated[index].quantity = newQty > 0 ? newQty : 1;
      return updated;
    });
  };

  const handleDelete = async (id: number) => {
    await fetch(`http://localhost:8000/api/orders/${id}`, { method: "DELETE" });
    setOrders((prev) => prev.filter((o) => o.item_id !== id));
    setSelectedOrders((prev) => prev.filter((x) => x !== id));
  };

  const handleBatchDelete = async () => {
    await Promise.all(selectedOrders.map(id =>
      fetch(`http://localhost:8000/api/orders/${id}`, { method: "DELETE" })
    ));
    setOrders((prev) => prev.filter((o) => !selectedOrders.includes(o.item_id)));
    setSelectedOrders([]);
  };

  const handleExportPDF = () => {
    exportOrderToPDF(orders);
  };

  const handleExportExcel = () => {
    exportOrderToExcel(orders);
  };

  if (loading) return <p>Loading orders...</p>;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Order Summary</CardTitle>
          <p className="text-sm text-gray-600">Review, adjust, and manage your current orders.</p>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex justify-between items-center">
            <div>
              <Button variant="outline" onClick={toggleSelectAll}>
                {selectedOrders.length === orders.length ? "Unselect All" : "Select All"}
              </Button>
              {selectedOrders.length > 0 && (
                <Button
                  variant="destructive"
                  className="ml-2"
                  onClick={handleBatchDelete}
                >
                  Delete Selected
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleExportPDF}>Export PDF</Button>
              <Button onClick={handleExportExcel}>Export Excel</Button>
            </div>
          </div>

          <table className="min-w-full table-auto text-sm border">
            <thead>
              <tr className="bg-gray-100">
                <th className="p-2 border text-left">Select</th>
                <th className="p-2 border text-left">Item ID</th>
                <th className="p-2 border text-left">Name</th>
                <th className="p-2 border text-left">Category</th>
                <th className="p-2 border text-left">Supplier</th>
                <th className="p-2 border text-left">Quantity</th>
                <th className="p-2 border text-left">Order Type</th>
                <th className="p-2 border text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order, idx) => (
                <tr key={order.item_id}>
                  <td className="p-2 border">
                    <input
                      type="checkbox"
                      checked={selectedOrders.includes(order.item_id)}
                      onChange={() => toggleSelect(order.item_id)}
                    />
                  </td>
                  <td className="p-2 border">{order.item_id}</td>
                  <td className="p-2 border">{order.name}</td>
                  <td className="p-2 border">{order.category}</td>
                  <td className="p-2 border">{order.supplier}</td>
                  <td className="p-2 border">
                    <Input
                      type="number"
                      value={order.quantity}
                      onChange={(e) => handleQuantityChange(idx, Number(e.target.value))}
                      min={1}
                    />
                  </td>
                  <td className="p-2 border">{order.order_type}</td>
                  <td className="p-2 border">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(order.item_id)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
