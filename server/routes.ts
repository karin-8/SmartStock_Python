import type { Express } from "express";
import { createServer, type Server } from "http";
import { MemStorage, PostgreSQLStorage, type IStorage } from "./storage";
import { getDatabase } from "./database";
import { insertInventoryItemSchema, insertOrderSchema } from "@shared/schema";
import { z } from "zod";

// Initialize storage dynamically
function getStorage(): IStorage {
  const { isConnected, error } = getDatabase();
  
  if (isConnected) {
    console.log('🗄️  Using PostgreSQL database storage');
    return new PostgreSQLStorage();
  } else {
    console.log('📦 Using in-memory storage (fallback mode)');
    if (error) {
      console.log(`   Reason: ${error}`);
    }
    return new MemStorage();
  }
}

const storage = getStorage();

export async function registerRoutes(app: Express): Promise<Server> {
  // Get all inventory items
  app.get("/api/inventory", async (req, res) => {
    try {
      const items = await storage.getInventoryItems();
      res.json(items);
    } catch (error) {
      console.error("Error fetching inventory:", error);
      res.status(500).json({ error: "Failed to fetch inventory" });
    }
  });

  // Get inventory with forecast data
  app.get("/api/inventory/forecast", async (req, res) => {
    try {
      const itemsWithForecast = await storage.getInventoryWithForecast();
      res.json(itemsWithForecast);
    } catch (error) {
      console.error("Error fetching inventory forecast:", error);
      res.status(500).json({ error: "Failed to fetch inventory forecast" });
    }
  });

  // Get single inventory item
  app.get("/api/inventory/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const item = await storage.getInventoryItem(id);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      res.json(item);
    } catch (error) {
      console.error("Error fetching inventory item:", error);
      res.status(500).json({ error: "Failed to fetch inventory item" });
    }
  });

  // Create new inventory item
  app.post("/api/inventory", async (req, res) => {
    try {
      const data = insertInventoryItemSchema.parse(req.body);
      const item = await storage.createInventoryItem(data);
      res.status(201).json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error creating inventory item:", error);
      res.status(500).json({ error: "Failed to create inventory item" });
    }
  });

  // Update inventory item
  app.put("/api/inventory/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const data = insertInventoryItemSchema.partial().parse(req.body);
      const item = await storage.updateInventoryItem(id, data);
      res.json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error updating inventory item:", error);
      res.status(500).json({ error: "Failed to update inventory item" });
    }
  });

  // Get demand history for an item
  app.get("/api/inventory/:id/demand", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const days = req.query.days ? parseInt(req.query.days as string) : undefined;
      const demandHistory = await storage.getDemandHistory(id, days);
      res.json(demandHistory);
    } catch (error) {
      console.error("Error fetching demand history:", error);
      res.status(500).json({ error: "Failed to fetch demand history" });
    }
  });

  // Get all orders
  app.get("/api/orders", async (req, res) => {
    try {
      const orders = await storage.getOrders();
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  // Create new order
  app.post("/api/orders", async (req, res) => {
    try {
      // Parse and convert expectedDeliveryDate string to Date
      const requestData = { ...req.body };
      if (requestData.expectedDeliveryDate && typeof requestData.expectedDeliveryDate === 'string') {
        requestData.expectedDeliveryDate = new Date(requestData.expectedDeliveryDate);
      }
      
      const data = insertOrderSchema.parse(requestData);
      const order = await storage.createOrder(data);
      res.status(201).json(order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error creating order:", error);
      res.status(500).json({ error: "Failed to create order" });
    }
  });

  // Update order status
  app.put("/api/orders/:id/status", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;
      if (!status || typeof status !== "string") {
        return res.status(400).json({ error: "Status is required" });
      }
      const order = await storage.updateOrderStatus(id, status);
      res.json(order);
    } catch (error) {
      console.error("Error updating order status:", error);
      res.status(500).json({ error: "Failed to update order status" });
    }
  });

  // Get dashboard metrics
  app.get("/api/dashboard/metrics", async (req, res) => {
    try {
      const metrics = await storage.getDashboardMetrics();
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching dashboard metrics:", error);
      res.status(500).json({ error: "Failed to fetch dashboard metrics" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
