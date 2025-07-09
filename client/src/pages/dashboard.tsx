import { useQuery } from "@tanstack/react-query";
import { Boxes, Plus, Filter, Download, RotateCcw } from "lucide-react";
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MetricsCards } from "@/components/metrics-cards";
import { ForecastTable } from "@/components/forecast-table";
import AIInsights from "@/components/ai-insights"; // ✅ CORRECT


import { getMetrics, getForecast } from "@/lib/api";
import { Link } from "wouter";

const referenceDate = new Date('2024-12-23');  // Start date of ISO Week 52, 2024
const now = new Date();

const formattedDate = referenceDate.toLocaleDateString(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

const formattedTime = now.toLocaleTimeString(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

// Define an interface for your plant object for better type safety
interface PlantOption {
  code: string;
  name: string;
}

export default function Dashboard() {
  // NEW: plant options, selected plant
  const [plantOptions, setPlantOptions] = useState<PlantOption[]>([]); // Change type to PlantOption[]
  const [selectedPlant, setSelectedPlant] = useState("34KA");

  // Fetch plant options on mount
  useEffect(() => {
    fetch("http://localhost:8000/api/plants")
      .then(res => res.json())
      .then((plants: PlantOption[]) => { // Type the incoming data
        setPlantOptions(plants);
        // Ensure selectedPlant is still valid, default to first if not
        setSelectedPlant(current =>
          plants.some(p => p.code === current) ? current : (plants[0]?.code ?? "")
        );
      });
  }, []);


  // Wrap query functions to pass plant as param
  const getMetricsWithPlant = () => getMetrics(selectedPlant);
  const getForecastWithPlant = () => getForecast(selectedPlant);

  // Refetch when selectedPlant changes
  const {
    data: metrics,
    isLoading: metricsLoading,
    refetch: refetchMetrics,
  } = useQuery({
    queryKey: ["metrics", selectedPlant],
    queryFn: getMetricsWithPlant,
    enabled: !!selectedPlant,
  });

  const {
    data: inventory,
    isLoading: inventoryLoading,
    refetch: refetchInventory,
  } = useQuery({
    queryKey: ["forecast", selectedPlant],
    queryFn: getForecastWithPlant,
    enabled: !!selectedPlant,
  });

  const handleRefresh = () => {
    refetchMetrics();
    refetchInventory();
  };

  const isLoading = metricsLoading || inventoryLoading;

  
return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Header Navigation */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Boxes className="text-blue-600 text-2xl" />
                <h1 className="text-2xl font-bold text-gray-900">Smart AI Stock</h1>
              </div>
              <nav className="hidden md:flex space-x-8">
                <a href="#dashboard" className="text-blue-600 border-b-2 border-blue-600 font-medium py-2">
                  Dashboard
                </a>
                <a href="#inventory" className="text-gray-600 hover:text-gray-900 py-2">
                  Inventory
                </a>
                <a href="#orders" className="text-gray-600 hover:text-gray-900 py-2">
                  Orders
                </a>
                <a href="#analytics" className="text-gray-600 hover:text-gray-900 py-2">
                  Analytics
                </a>
              </nav>
            </div>
            <div className="flex items-center space-x-3">
            {/* View Order Form Button */}
            <a
              href="/order-summary"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="ml-2">
                View Order Form
              </Button>
            </a>
            {/* Avatar/Login Button */}
            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
              {/* Placeholder, replace with user initials or icon */}
              <span className="text-gray-500 font-bold">K</span>
            </div>
          </div>
          </div>
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Dashboard Overview */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
            <div>
              <h2 className="text-xl font-semibold">
                Inventory Dashboard (as of {formattedDate}, {formattedTime})
              </h2>
              <p className="text-gray-600 mt-1">Monitor stock levels and optimize your inventory</p>
            </div>
            <div className="flex items-center space-x-2 mt-4 sm:mt-0">
              <span className="text-sm text-gray-500">Last updated:</span>
              <span className="text-sm font-medium text-gray-900">2 minutes ago</span>
              <Button variant="ghost" size="sm" onClick={handleRefresh}>
                <RotateCcw className="w-4 h-4 text-gray-400 hover:text-gray-600" />
              </Button>
            </div>
          </div>
          {/* NEW: Plant selector */}
          <div className="mb-6">
            <label className="font-semibold mr-2">Branch:</label>
            <select
              className="border rounded px-2 py-1"
              value={selectedPlant}
              onChange={e => setSelectedPlant(e.target.value)}
              disabled={plantOptions.length === 0}
            >
              {plantOptions.map((plant) => (
                <option key={plant.code} value={plant.code}>
                  {`${plant.name} (${plant.code})`}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-row flex-wrap sm:flex-nowrap gap-4 mb-6">
            <div className="w-full sm:w-1/2">
              <MetricsCards metrics={metrics} isLoading={isLoading} />
            </div>
            <div className="w-full sm:w-1/2">
              <AIInsights plant={selectedPlant} />
            </div>
          </div>
        {/* 7-Day Forecast Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-8">
          <ForecastTable plant={selectedPlant} inventory={inventory} isLoading={isLoading} />
        </div>
      </div>
    </div>
  </div>
  );
}