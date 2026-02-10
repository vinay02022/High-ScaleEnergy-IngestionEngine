# High-Scale Energy Ingestion Engine

NestJS + Prisma + PostgreSQL service for high-throughput energy meter and vehicle data ingestion with real-time analytics.

## Architecture

```
src/
├── db/            # PrismaService (extends PrismaClient, onModuleInit)
├── ingest/        # POST meter + vehicle readings (single & batch)
├── analytics/     # GET 24h summaries, per-meter, per-vehicle stats
├── common/        # GET /health (SELECT 1 via Prisma)
├── app.module.ts
└── main.ts

prisma/
├── schema.prisma  # 5 models: MeterReading, VehicleReading,
│                  #   MeterCurrent, VehicleCurrent, VehicleMeterMap
├── prisma.config.ts
└── seed.ts        # Sample data seeder
```

### Data stores

| Store | Table | Write strategy | Purpose |
|-------|-------|----------------|---------|
| History | `meter_readings` | INSERT (append-only) | All meter readings |
| History | `vehicle_readings` | INSERT (append-only) | All vehicle readings |
| Current | `meter_current` | UPSERT (by meterId PK) | Latest state per meter |
| Current | `vehicle_current` | UPSERT (by vehicleId PK) | Latest state per vehicle |
| Mapping | `vehicle_meter_map` | UPSERT (by vehicleId PK) | Vehicle ↔ Meter link |

### Indexes

- `meter_readings(meterId, ts)` — last-24h analytics → index scan, no full-table scan
- `vehicle_readings(vehicleId, ts)` — same for vehicles

## Quick start

```bash
# 1. Copy env file
cp .env.example .env

# 2. Start everything
docker compose up --build

# 3. Verify
curl http://localhost:3000/health
```

## Local development (without Docker for the API)

```bash
# Start only Postgres
docker compose up postgres -d

# Install deps + generate Prisma client
npm install
npx prisma generate

# Create / apply migrations
npx prisma migrate dev

# Seed sample data
npx prisma db seed

# Start dev server
npm run start:dev
```

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | DB connectivity check (`SELECT 1`) |
| `POST` | `/api/ingest/meter` | Ingest single meter reading |
| `POST` | `/api/ingest/meter/batch` | Ingest batch of meter readings |
| `POST` | `/api/ingest/vehicle` | Ingest single vehicle reading |
| `POST` | `/api/ingest/vehicle/batch` | Ingest batch of vehicle readings |
| `GET` | `/api/analytics/meter/summary` | Meter aggregate — last 24 h |
| `GET` | `/api/analytics/vehicle/summary` | Vehicle aggregate — last 24 h |
| `GET` | `/api/analytics/meter/:meterId` | Per-meter current + history stats |
| `GET` | `/api/analytics/vehicle/:vehicleId` | Per-vehicle current + history stats |
| `GET` | `/docs` | Swagger UI |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://energy_user:energy_pass@localhost:5432/energy_db?schema=public` | Prisma connection string |
| `PORT` | `3000` | API listen port |
