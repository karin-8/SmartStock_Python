import { pgTable, serial, text, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const inventoryItems = pgTable("app_inventory_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sku: text("sku").notNull().unique(),
  currentStock: integer("current_stock").notNull(),
  reorderPoint: integer("reorder_point").notNull(),
  safetyStock: integer("safety_stock").notNull(),
  unitCost: real("unit_cost").notNull(),
  leadTimeDays: integer("lead_time_days").notNull(),
  category: text("category").notNull(),
  supplier: text("supplier").notNull(),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
});

export const demandHistory = pgTable("app_demand_history", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => inventoryItems.id),
  date: timestamp("date").notNull(),
  quantity: integer("quantity").notNull(),
});

export const orders = pgTable("app_orders", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => inventoryItems.id),
  quantity: integer("quantity").notNull(),
  status: text("status").notNull().default("pending"),
  orderDate: timestamp("order_date").defaultNow().notNull(),
  expectedDeliveryDate: timestamp("expected_delivery_date"),
  cost: real("cost").notNull(),
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({
  id: true,
  lastUpdated: true,
});

export const insertDemandHistorySchema = createInsertSchema(demandHistory).omit({
  id: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  orderDate: true,
});

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type DemandHistory = typeof demandHistory.$inferSelect;
export type InsertDemandHistory = z.infer<typeof insertDemandHistorySchema>;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;

// Extended types for frontend calculations
export type InventoryItemWithForecast = InventoryItem & {
  forecast: number[];
  weeklyDemand: number;
  demandVariability: number;
  stockStatus: Array<{
    week: number;
    weekStartDate: string;
    weekEndDate: string;
    status: "okay" | "low" | "critical";
    projectedStock: number;
    isHistorical: boolean;
  }>;
  aiInsights?: string[];  // ✅ Add this line;
};

export type DashboardMetrics = {
  totalItems: number;
  lowStockItems: number;
  urgentItems: number;          // ✅ Newly added
  pendingOrders: number;
  turnoverRate: number;
  stockoutFrequency: number;
};

export type HistoricalStockItem = {
  material: string;
  week: number;
  openingStock: number;
  closingStock: number;
  change: number;
  moveIn: number;
  moveOut: number;
};
