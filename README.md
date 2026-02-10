# High-Scale Energy Ingestion Engine

Write-heavy ingestion + read-heavy analytics for EV charging infrastructure.
**NestJS + Prisma 7 + PostgreSQL 16.**

---

## Architecture

```
                     POST /v1/ingest
                          │
              ┌───────────┴───────────┐
              │  polymorphic detect   │
              │  meterId → meter      │
              │  vehicleId → vehicle  │
              └───────────┬───────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                                   ▼
  ┌───────────┐                     ┌──────────────┐
  │  HISTORY  │  INSERT (append)    │   CURRENT    │  UPSERT (raw SQL)
  │  tables   │                     │   tables     │  only if ts > existing
  └───────────┘                     └──────────────┘
  meter_readings                    meter_current
  vehicle_readings                  vehicle_current
```

### Hot (Current) vs Cold (History)

| Layer | Tables | Write | Read | Purpose |
|-------|--------|-------|------|---------|
| **Hot** | `meter_current`, `vehicle_current` | UPSERT (1 row per device) | Dashboard "latest state" | O(1) lookup by PK |
| **Cold** | `meter_readings`, `vehicle_readings` | INSERT (append-only) | Analytics, time-range queries | Full audit trail |

**Why this split matters:**
Dashboard reads hit the tiny current tables (one row per device = fast PK lookup).
Analytics queries hit the history tables but always use indexed `(device_id, ts)` range scans — never full-table scans.
The two workloads don't compete for the same rows or locks.

### Conditional UPSERT — out-of-order safety

The current-table UPSERT uses a `WHERE` guard so stale (out-of-order) packets never overwrite newer state:

```sql
INSERT INTO meter_current (meter_id, kwh_consumed_ac, voltage, ts)
VALUES ($1, $2, $3, $4)
ON CONFLICT (meter_id)
DO UPDATE SET
  kwh_consumed_ac = EXCLUDED.kwh_consumed_ac,
  voltage         = EXCLUDED.voltage,
  ts              = EXCLUDED.ts
WHERE meter_current.ts < EXCLUDED.ts;
```

---

## Schema overview

```
meter_readings          vehicle_readings
├── id (uuid PK)        ├── id (uuid PK)
├── meter_id            ├── vehicle_id
├── kwh_consumed_ac     ├── soc
├── voltage             ├── kwh_delivered_dc
└── ts (timestamptz)    ├── battery_temp
                        └── ts (timestamptz)

meter_current           vehicle_current
├── meter_id (PK)       ├── vehicle_id (PK)
├── kwh_consumed_ac     ├── soc
├── voltage             ├── kwh_delivered_dc
└── ts                  ├── battery_temp
                        └── ts

vehicle_meter_map
├── vehicle_id (PK)
├── meter_id
└── created_at
```

### Indexes

| Table | Index | Why |
|-------|-------|-----|
| `meter_readings` | `(meter_id, ts)` | Analytics WHERE meter_id = $1 AND ts BETWEEN — index range scan |
| `vehicle_readings` | `(vehicle_id, ts)` | Same for vehicle queries |
| `meter_current` | PK on `meter_id` | O(1) upsert + dashboard lookup |
| `vehicle_current` | PK on `vehicle_id` | Same |

These indexes mean the 24 h analytics query **never does a sequential scan** on the history tables. Postgres uses a B-tree range scan on `(device_id, ts)`, reading only the matching rows.

---

## Quick start

```bash
# 1. Clone and configure
cp .env.example .env

# 2. Start everything (Postgres + API with auto-migrate)
docker compose up --build

# 3. Verify
curl http://localhost:3000/health
```

### Local development

```bash
docker compose up postgres -d    # Postgres only
npm install
npx prisma generate
npx prisma migrate dev           # create tables
npx prisma db seed               # sample data
npm run start:dev                 # NestJS with hot reload
```

---

## API endpoints

### Ingestion

```bash
# Meter reading
curl -X POST http://localhost:3000/v1/ingest \
  -H 'Content-Type: application/json' \
  -d '{
    "meterId": "METER-001",
    "kwhConsumedAc": 12.5,
    "voltage": 230.4,
    "timestamp": "2026-02-11T10:30:00Z"
  }'
# → 202 { "type": "meter" }

# Vehicle reading
curl -X POST http://localhost:3000/v1/ingest \
  -H 'Content-Type: application/json' \
  -d '{
    "vehicleId": "VEH-001",
    "soc": 78.5,
    "kwhDeliveredDc": 6.2,
    "batteryTemp": 32.1,
    "timestamp": "2026-02-11T10:30:00Z"
  }'
# → 202 { "type": "vehicle" }
```

### Analytics

```bash
# Vehicle charging performance (last 24 h)
curl http://localhost:3000/v1/analytics/performance/VEH-001
# → {
#     "vehicleId": "VEH-001",
#     "meterId": "METER-001",
#     "windowStart": "...",
#     "windowEnd": "...",
#     "acConsumedTotal": 150.5,
#     "dcDeliveredTotal": 127.9,
#     "efficiencyRatio": 0.8499,
#     "avgBatteryTemp": 31.2
#   }

# Meter summary (last 24 h)
curl http://localhost:3000/api/analytics/meter/summary

# Vehicle summary (last 24 h)
curl http://localhost:3000/api/analytics/vehicle/summary

# Per-meter stats
curl http://localhost:3000/api/analytics/meter/METER-001

# Per-vehicle stats
curl http://localhost:3000/api/analytics/vehicle/VEH-001
```

### Health & docs

```bash
curl http://localhost:3000/health     # { "status": "ok", "db": "connected" }
open http://localhost:3000/docs       # Swagger UI
```

---

## Load testing

```bash
# 10 devices, 1 reading/sec each (default)
npm run load

# 100 devices, 500 ms interval
DEVICES=100 INTERVAL_MS=500 npm run load

# Burst: 1000 devices, no delay
DEVICES=1000 INTERVAL_MS=0 npm run load
```

---

## Connection pooling

Pool is configured via `DATABASE_URL` params:

```
?connection_limit=20&pool_timeout=30
```

The `@prisma/adapter-pg` driver manages the underlying `pg` connection pool. For production with many API replicas, use an external pooler like **PgBouncer** in transaction mode.

---

## How this scales to millions of readings/day

| Technique | Benefit |
|-----------|---------|
| **Append-only history tables** | No row-level locking contention — INSERTs don't block each other |
| **Tiny current tables** | Dashboard reads are always O(1) by PK — never touch history |
| **Composite indexes `(device_id, ts)`** | Analytics queries do index range scans, not sequential scans |
| **Conditional UPSERT** | Out-of-order packets handled at DB level — no app-level locking |
| **Connection pooling** | 20 connections shared across requests — prevents connection storms |
| **Raw SQL for hot path** | Avoids Prisma ORM overhead for the critical UPSERT path |

### Trade-offs

- `synchronize: true` in dev — migrations should be used in production
- No partitioning yet — at >100M rows, partition history by month
- Single-node Postgres — for true HA, add read replicas

---

## Future improvements

| Improvement | Impact |
|-------------|--------|
| **Table partitioning** (by month on `ts`) | Prune old partitions instead of DELETE; faster range scans |
| **TimescaleDB** hypertables | Automatic partitioning + compression + continuous aggregates |
| **Retention policies** | Auto-drop partitions older than N months |
| **Continuous aggregates** | Pre-computed hourly/daily rollups — analytics in <1 ms |
| **Kafka/NATS ingest queue** | Decouple ingestion from DB writes; buffer spikes |
| **Read replicas** | Route analytics queries to replicas; keep primary for writes |
| **BRIN indexes** | For append-only tables where ts is naturally ordered — smaller than B-tree |

---

## Running tests

```bash
npm test              # 37 tests, ~6 s
npm run test:cov      # with coverage report
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | see `.env.example` | Prisma connection string with pool params |
| `PORT` | `3000` | API listen port |
