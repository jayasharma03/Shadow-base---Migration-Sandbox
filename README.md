# ShadowBase — Full Local Development Edition

ShadowBase is a local schema-migration testing sandbox. It clones a sample MySQL database to an isolated shadow database, runs a proposed migration there, checks saved application queries, and can optionally connect a Debezium MySQL CDC connector to Kafka for observing row-change events.

## Architecture

- **React + Vite** — dashboard, SQL editor, compatibility results, CDC controls
- **Node.js + Express** — REST API and migration/test orchestration
- **MySQL source** — seeded demo application database with binlog enabled
- **MySQL shadow** — isolated test database
- **Kafka (KRaft) + Debezium Kafka Connect** — optional row-change CDC event stream
- **Docker Compose** — reproducible local dependencies

### Important technical truth
Debezium CDC captures committed **row-level data changes from MySQL binlogs**; it does not capture every original SQL statement and does not automatically replay original application query traffic. This edition provides a CDC connector configuration and topic inspection/control endpoints. The migration compatibility test suite is separate and runs saved representative SQL queries against the shadow schema. Do not connect this demo to production.

## Requirements
- Docker Desktop (running)
- Node.js 20+
- npm

## Quick start

1. Extract the ZIP.
2. In the project root, start infrastructure:
   ```bash
   docker compose up -d
   ```
3. Wait until MySQL and Kafka Connect are healthy/ready (first image download can take a few minutes).
4. Install/start backend:
   ```bash
   cd backend
   cp .env.example .env
   npm install
   npm run dev
   ```
   On Windows CMD, use `copy .env.example .env`.
5. In another terminal, start frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
6. Open `http://localhost:5173`.

## Local services
- Dashboard: http://localhost:5173
- API: http://localhost:4000/api/health
- Source MySQL: `127.0.0.1:3307` (user `shadowbase`, password `shadowbase123`)
- Shadow MySQL: `127.0.0.1:3308` (same demo credentials)
- Kafka Connect REST: http://localhost:8083
- Kafka broker: `localhost:9092`

Demo credentials are deliberately simple and **must never be reused for production**.

## Demo steps
1. Click **Reset demo data**.
2. Click **Clone source → shadow**.
3. Try `ALTER TABLE Student DROP COLUMN department;` in the editor.
4. Click **Test migration**.
5. Open **Compatibility tests** and run the saved query suite. Queries referencing `department` should fail after it is dropped.
6. To observe CDC, first reset source data, then click **Register CDC connector**. Insert a row into source database and inspect CDC topic/connector status in the dashboard.

## SQL access
Example source database setup is seeded automatically by `docker/mysql/init/01-init.sql` on first volume initialization. If you change init SQL after the volume has already been initialized, run `docker compose down -v` (this deletes demo volumes) then `docker compose up -d` again.

## API
- `GET /api/health`
- `GET /api/status`
- `POST /api/demo/reset`
- `POST /api/shadow/clone`
- `POST /api/migrations/test` `{ "sql": "ALTER TABLE Student ADD COLUMN email VARCHAR(150)" }`
- `POST /api/queries/check`
- `GET /api/history`
- `POST /api/cdc/register`
- `GET /api/cdc/status`
- `DELETE /api/cdc/connector`

## Scope and limitations
- This is a local academic prototype, not a production deployment system.
- CDC connector registration is optional and requires Docker services to be ready.
- This edition observes CDC events through Kafka Connect connector status; it does not implement safe arbitrary SQL replay from CDC events.
- Shadow cloning covers base tables and rows for this demo, not every MySQL object (triggers, procedures, events, users, grants, views, or all table options).
- No production traffic mirroring, automatic rollback, schema-diff engine, load testing, or guaranteed zero downtime.
- Never configure it with production credentials or production database endpoints.
