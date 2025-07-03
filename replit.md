# SmartStock - Inventory Management System

## Overview
A full-stack inventory management system with demand forecasting, stock optimization, and analytics for warehouse managers. The system uses weekly granularity for demand forecasting and provides 12-week predictions.

## Project Architecture
- **Frontend**: React with TypeScript, Wouter routing, shadcn/ui components
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM, automatic fallback to in-memory storage
- **Data**: Smart storage system with environment-based configuration
- **Charts**: Chart.js for stock level visualization
- **Export**: jsPDF and xlsx for order exports

## Key Features
- Dashboard with key metrics (total SKU, low stock alerts, total value, pending orders)
- 8-week stock forecast table with 4 historical weeks and color-coded status indicators
- Stock numbers displayed in forecast table alongside status badges
- Advanced filtering by category, status, and supplier
- AI-powered insights and recommendations
- Order creation form with EOQ calculations
- Interactive stock level charts with historical and forecast data
- PDF and Excel export functionality

## Recent Changes
**2025-06-27**: Database Configuration & Fallback System
- Refactored to support PostgreSQL with automatic in-memory fallback
- Added environment variable configuration for DATABASE_URL
- Implemented PostgreSQLStorage class with graceful error handling
- Created smart storage factory that chooses between database and memory storage
- Added comprehensive logging for database connection status
- Updated project documentation and setup instructions

**2025-06-26**: Updated metrics and forecast display
- Changed "Items" to "SKU" in metrics cards
- Modified forecast from 12 weeks to 8 weeks future + 4 weeks historical
- Added stock numbers to forecast table showing projected quantities
- Updated all calculations to use weekly demand patterns
- Fixed order creation functionality
- Implemented comprehensive filtering and export features

## User Preferences
- Prefers weekly granularity over daily for better long-term planning
- Wants to see 8-week forecasts with 4 weeks of historical context
- Prefers "SKU" terminology over "Items"
- Wants stock quantities displayed alongside status indicators

## Technical Decisions
- Using in-memory storage for development/demo purposes
- Weekly demand calculations based on historical data grouping
- AI insights based on weekly consumption patterns
- Export functionality supports both filtered and full inventory data