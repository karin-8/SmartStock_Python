/**
 * Inventory management calculation utilities
 */



export interface ROPParams {
  dailyDemand: number;
  leadTimeDays: number;
  safetyStock: number;
}

export interface SafetyStockParams {
  demandVariability: number;
  leadTimeDays: number;
  serviceLevel: number; // Z-score (e.g., 1.65 for 95%)
}



/**
 * Calculate Reorder Point (ROP)
 * Formula: ROP = (Daily Demand × Lead Time) + Safety Stock
 */
export function calculateROP({ dailyDemand, leadTimeDays, safetyStock }: ROPParams): number {
  return (dailyDemand * leadTimeDays) + safetyStock;
}

/**
 * Calculate Safety Stock
 * Formula: Safety Stock = Z-score × √(Lead Time) × Demand Variability
 */
export function calculateSafetyStock({ demandVariability, leadTimeDays, serviceLevel }: SafetyStockParams): number {
  return serviceLevel * Math.sqrt(leadTimeDays) * demandVariability;
}

/**
 * Calculate annual demand from daily demand
 */
export function calculateAnnualDemand(dailyDemand: number, workingDaysPerYear: number = 365): number {
  return dailyDemand * workingDaysPerYear;
}



/**
 * Calculate demand variability (standard deviation)
 */
export function calculateDemandVariability(demandHistory: number[]): number {
  if (demandHistory.length <= 1) return 0;
  
  const mean = demandHistory.reduce((sum, demand) => sum + demand, 0) / demandHistory.length;
  const variance = demandHistory.reduce((sum, demand) => sum + Math.pow(demand - mean, 2), 0) / demandHistory.length;
  
  return Math.sqrt(variance);
}

/**
 * Calculate moving average for demand forecasting
 */
export function calculateMovingAverage(data: number[], periods: number): number[] {
  const result: number[] = [];
  
  for (let i = periods - 1; i < data.length; i++) {
    const sum = data.slice(i - periods + 1, i + 1).reduce((acc, val) => acc + val, 0);
    result.push(sum / periods);
  }
  
  return result;
}

/**
 * Simple linear trend forecasting
 */
export function forecastLinearTrend(data: number[], periodsToForecast: number): number[] {
  if (data.length < 2) return Array(periodsToForecast).fill(data[0] || 0);
  
  // Calculate slope using least squares
  const n = data.length;
  const xSum = (n * (n - 1)) / 2;
  const ySum = data.reduce((sum, val) => sum + val, 0);
  
  let xySum = 0;
  let xSquaredSum = 0;
  
  for (let i = 0; i < n; i++) {
    xySum += i * data[i];
    xSquaredSum += i * i;
  }
  
  const slope = (n * xySum - xSum * ySum) / (n * xSquaredSum - xSum * xSum);
  const intercept = (ySum - slope * xSum) / n;
  
  // Generate forecast
  const forecast: number[] = [];
  for (let i = 0; i < periodsToForecast; i++) {
    const value = intercept + slope * (n + i);
    forecast.push(Math.max(0, value)); // Ensure non-negative
  }
  
  return forecast;
}

/**
 * Calculate inventory turnover ratio
 */
export function calculateInventoryTurnover(costOfGoodsSold: number, averageInventoryValue: number): number {
  if (averageInventoryValue <= 0) return 0;
  return costOfGoodsSold / averageInventoryValue;
}

/**
 * Calculate days sales in inventory
 */
export function calculateDaysSalesInInventory(averageInventoryValue: number, costOfGoodsSold: number): number {
  const inventoryTurnover = calculateInventoryTurnover(costOfGoodsSold, averageInventoryValue);
  if (inventoryTurnover <= 0) return 0;
  return 365 / inventoryTurnover;
}

/**
 * Classify inventory using ABC analysis
 */
export function classifyABCInventory(items: Array<{ value: number }>): Array<'A' | 'B' | 'C'> {
  const totalValue = items.reduce((sum, item) => sum + item.value, 0);
  const sortedItems = items
    ?.map((item, index) => ({ ...item, originalIndex: index }))
    .sort((a, b) => b.value - a.value);
  
  let cumulativeValue = 0;
  const classifications: Array<'A' | 'B' | 'C'> = new Array(items.length);
  
  for (const item of sortedItems) {
    cumulativeValue += item.value;
    const percentage = cumulativeValue / totalValue;
    
    let classification: 'A' | 'B' | 'C';
    if (percentage <= 0.8) {
      classification = 'A';
    } else if (percentage <= 0.95) {
      classification = 'B';
    } else {
      classification = 'C';
    }
    
    classifications[item.originalIndex] = classification;
  }
  
  return classifications;
}
