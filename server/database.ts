import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import * as schema from '@shared/schema';

dotenv.config();

let db: ReturnType<typeof drizzle> | null = null;
let isConnected = false;
let connectionError: string | null = null;

export function initializeDatabase() {
  try {
    const databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      console.warn('⚠️ DATABASE_URL environment variable not found. Falling back to in-memory storage.');
      connectionError = 'DATABASE_URL environment variable not set';
      return { db: null, isConnected: false, error: connectionError };
    }

    const pool = new Pool({ connectionString: databaseUrl });
    db = drizzle(pool, { schema });
    isConnected = true;
    connectionError = null;

    console.log('✅ PostgreSQL database connection established');
    return { db, isConnected, error: null };
  } catch (error) {
    console.error('❌ Failed to connect to PostgreSQL database:', error);
    connectionError = `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    db = null;
    isConnected = false;
    return { db: null, isConnected: false, error: connectionError };
  }
}

export function getDatabase() {
  if (!db && !connectionError) {
    return initializeDatabase();
  }
  return { db, isConnected, error: connectionError };
}

export async function testConnection(): Promise<boolean> {
  try {
    const { db } = getDatabase();
    if (!db) return false;

    // Simple query to test connection
    await db.select().from(schema.inventoryItems).limit(1);
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}
