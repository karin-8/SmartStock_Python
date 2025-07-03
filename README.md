# SmartStock - Inventory Management System

A full-stack inventory management system with demand forecasting, stock optimization, and analytics built for warehouse managers.

## Features

- **Dashboard Analytics**: Real-time metrics showing total SKU, low stock alerts, inventory value, and pending orders
- **Demand Forecasting**: 8-week stock predictions with 4 weeks of historical context
- **AI-Powered Insights**: Intelligent recommendations for stock management and ordering
- **Advanced Filtering**: Filter inventory by category, status, and supplier
- **Order Management**: Create and track purchase orders with EOQ calculations
- **Export Functionality**: Generate PDF and Excel reports for orders and inventory summaries
- **Interactive Charts**: Visual stock level tracking with forecast data

## Technology Stack

- **Frontend**: React 18 with TypeScript, Wouter routing, shadcn/ui components
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM (automatic fallback to in-memory storage)
- **Charts**: Chart.js for data visualization
- **Styling**: Tailwind CSS with dark mode support

## Database Configuration

### PostgreSQL (Production)

Set the `DATABASE_URL` environment variable to connect to your PostgreSQL database:

```bash
DATABASE_URL=postgresql://username:password@hostname:port/database_name
```

### Fallback Mode (Development)

If `DATABASE_URL` is not configured, the application automatically falls back to in-memory storage with sample data. This includes:

- 5 sample inventory items with realistic stock levels
- Historical demand data for forecasting
- Sample orders and metrics
- Full functionality for testing and development

### Environment Setup

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Update the `.env` file with your database connection string (optional)

3. For development without a database, simply run the application - it will use in-memory storage automatically

## Running the Application

### Development

```bash
npm run dev
```

The application will start on port 5000 with:
- Express server handling API routes
- Vite development server for the React frontend
- Automatic fallback to in-memory storage if no database is configured

### Database Setup (Optional)

If you want to use PostgreSQL:

1. Create a PostgreSQL database
2. Set the `DATABASE_URL` environment variable
3. Run database migrations (if applicable)
4. Restart the application

The system will automatically detect the database connection and switch from in-memory to PostgreSQL storage.

## Project Structure

```
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Application pages
│   │   ├── lib/            # Utilities and helpers
│   │   └── hooks/          # Custom React hooks
├── server/                 # Express backend
│   ├── database.ts         # Database connection handling
│   ├── storage.ts          # Storage interface and implementations
│   ├── routes.ts           # API route definitions
│   └── index.ts            # Server entry point
├── shared/                 # Shared types and schemas
│   └── schema.ts           # Database schema and type definitions
└── migrations/             # Database migration files
```

## API Endpoints

- `GET /api/inventory` - Get all inventory items
- `GET /api/inventory/forecast` - Get inventory with forecast data
- `GET /api/dashboard/metrics` - Get dashboard metrics
- `POST /api/orders` - Create new purchase order
- `GET /api/orders` - Get all orders

## Security Features

- Environment variable based configuration
- Input validation using Zod schemas
- Graceful error handling with fallback modes
- Secure client-server separation

## Development Notes

- The application automatically detects database availability and switches storage modes
- In-memory storage provides realistic sample data for development
- All API endpoints handle both PostgreSQL and fallback modes transparently
- Error messages and warnings are logged for debugging database connectivity issues