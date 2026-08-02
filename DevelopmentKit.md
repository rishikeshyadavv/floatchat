# FloatChat Development Kit (Deployment Guide)

> **Target audience:** The developer/operator who will deploy, host, and run FloatChat in production or staging.

This guide lists every external product, API key, and configuration that must be provisioned **before** deployment, along with step-by-step instructions for each.

---

## Table of Contents

1. [Prerequisites Checklist](#1-prerequisites-checklist)
2. [External APIs & Services](#2-external-apis--services)
3. [Environment Variables Reference](#3-environment-variables-reference)
4. [Database Setup](#4-database-setup)
5. [Docker / Cloud Deployment](#5-docker--cloud-deployment)
6. [Security Hardening](#6-security-hardening)
7. [Monitoring & Logging](#7-monitoring--logging)
8. [Data Refresh & Maintenance](#8-data-refresh--maintenance)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Prerequisites Checklist

| Item | Required? | Default / Notes |
|---|---|---|
| Python 3.10+ | Required (local dev) | 3.12 recommended; matches CI |
| Docker + Docker Compose | Required (Docker deploy) | v20+ recommended |
| `FLOAT_API_KEY` | **Required** | Generate a strong secret; never commit to git |
| Network access to `data-argo.ifremer.fr` | Required for real data | Fallback: synthetic data generator |
| Groq API key | Optional | Enables live LLM SQL generation; otherwise demo cache only |
| Gemini API key | Optional | Fallback if Groq unavailable |
| Redis | Optional | For caching; falls back to in-memory if not configured |
| PostgreSQL + TimescaleDB | Optional | For production DB; DuckDB works for local/dev |
| `libsnappy-dev` (Linux) | Required if building Docker image | For Parquet Snappy compression |

---

## 2. External APIs & Services

### 2.1 Ifremer GDAC (Data Source) — No configuration needed

- **URL:** https://data-argo.ifremer.fr
- **What it provides:** Real ARGO float NetCDF profile files
- **Authentication:** None (public archive)
- **Rate limits:** None documented, but be respectful — the ETL downloads 6 small NetCDF files (~1–5 MB each)
- **Network requirement:** Outbound HTTPS (port 443) to `data-argo.ifremer.fr`
- **Failure mode:** If unreachable, the ETL falls back to synthetic data

### 2.2 Groq API (Primary LLM)

- **URL:** https://console.groq.com
- **What it provides:** Llama 3.3-70B model for natural-language → SQL translation
- **Authentication:** API key required
- **Setup steps:**
  1. Sign up at https://console.groq.com
  2. Navigate to **API Keys** → **Create API Key**
  3. Copy the key and set `GROQ_API_KEY` in `.env`
- **Cost model:** Pay-per-token; ~0.0001 USD per query (very low)
- **Quotas:** Default free tier allows 300,000 tokens/minute
- **Failure mode:** If unavailable, the system automatically falls back to Gemini

### 2.3 Google Gemini API (Fallback LLM)

- **URL:** https://aistudio.google.com
- **What it provides:** Gemini 2.5 Flash / 1.5 Flash fallback for SQL generation
- **Authentication:** API key required
- **Setup steps:**
  1. Sign up at https://aistudio.google.com
  2. Create a new API key
  3. Set `GEMINI_API_KEY` in `.env`
- **Failure mode:** If neither Groq nor Gemini is configured, new questions will fail with "No LLM API keys provided."

### 2.4 Redis (Cache Layer)

- **URL:** https://redis.io
- **What it provides:** Distributed caching for repeated queries and AI responses
- **Authentication:** Optional password
- **Setup steps (Docker):**
  1. The `docker-compose.yml` includes a Redis service with password auth
  2. Set `REDIS_PASSWORD` in `.env` (defaults to `floatchat_redis_secret`)
  3. Set `REDIS_URL` to `redis://:password@redis-host:6379/0`
- **Failure mode:** If Redis is unavailable, the app falls back to in-memory caching. Set `DISABLE_CACHE=true` to skip caching entirely.

### 2.5 ChromaDB (RAG Vector Store)

- **URL:** https://www.trychroma.com
- **What it provides:** Vector similarity search for few-shot question examples and schema metadata
- **Authentication:** None (local persistent store)
- **Configuration:**
  - `CHROMA_DB_PATH` — directory for the persistent ChromaDB store (default: `data/chroma_db`)
  - Initialized automatically on first startup by `src/ai/vector_store.py`
- **Failure mode:** If ChromaDB fails to initialize, the app falls back to built-in default schema and few-shot examples in `vector_store.py`

### 2.6 PostgreSQL + TimescaleDB (Alternative Database)

- **URL:** https://www.timescale.com
- **What it provides:** Production-grade time-series database for the `floats` table
- **Authentication:** Username/password via environment variables
- **Configuration (set in `.env`):**
  - `DB_TYPE=postgres`
  - `POSTGRES_HOST` — hostname
  - `POSTGRES_PORT` — port (default: 5432)
  - `POSTGRES_DB` — database name
  - `POSTGRES_USER` — username
  - `POSTGRES_PASSWORD` — password
- **Setup steps (Docker):**
  1. The `docker-compose.yml` includes a TimescaleDB service
  2. Create a database and user: `CREATE DATABASE floats_db; CREATE USER postgres WITH PASSWORD 'postgres';`
  3. Run `python -m src.database.db_client.init_db` to create tables
- **Failure mode:** If PostgreSQL is unavailable with `DB_TYPE=postgres`, all queries fail. Use `DB_TYPE=duckdb` for local development.

---

## 3. Environment Variables Reference

Copy `.env.example` to `.env` and fill in the values:

| Variable | Required | Default | Description |
|---|---|---|---|
| `FLOAT_API_KEY` | **Yes** | — | API key for `/ask` endpoint; generate with `python -c "import secrets; print(secrets.token_hex(24))"` |
| `GROQ_API_KEY` | No | — | Groq LLM API key (primary) |
| `GEMINI_API_KEY` | No | — | Gemini LLM API key (fallback) |
| `DB_TYPE` | No | `duckdb` | `duckdb` or `postgres` |
| `DB_PATH` | No | `data/argo_data.db` | DuckDB database file path (when `DB_TYPE=duckdb`) |
| `ARGO_MAX_PROFILES` | No | `30` | Profiles per float to ingest from Ifremer GDAC |
| `ARGO_MAX_DEPTH` | No | `2000` | Maximum depth in meters |
| `CHROMA_DB_PATH` | No | `data/chroma_db` | ChromaDB persistent storage path |
| `REDIS_URL` | No | `redis://localhost:6379/0` | Redis cache URL |
| `REDIS_PASSWORD` | No | — | Redis password (if applicable) |
| `CACHE_TTL` | No | `3600` | Cache time-to-live in seconds |
| `MEMORY_CACHE_MAX` | No | `200` | Max entries in the in-memory fallback cache (LRU eviction) |
| `DISABLE_CACHE` | No | `false` | Set to `true` to disable all caching |
| `DATA_DIR` | No | `./data` | Base data directory (Parquet layers under `DATA_DIR/parquet/`) |
| `POSTGRES_HOST` | No | `localhost` | PostgreSQL host (when `DB_TYPE=postgres`) |
| `POSTGRES_PORT` | No | `5432` | PostgreSQL port |
| `POSTGRES_DB` | No | `floats_db` | PostgreSQL database name |
| `POSTGRES_USER` | No | `postgres` | PostgreSQL username |
| `POSTGRES_PASSWORD` | No | `postgres` | PostgreSQL password |

---

## 4. Database Setup

### DuckDB (default, local development)

No setup required. The database file `data/argo_data.db` is created automatically:

```bash
python -m src.etl.seed_db
```

### PostgreSQL + TimescaleDB (production)

1. Start the TimescaleDB container:
   ```bash
   docker-compose up -d db
   ```
2. Wait for health check to pass:
   ```bash
   docker-compose ps
   ```
3. Set environment variables:
   ```bash
   export DB_TYPE=postgres
   export POSTGRES_HOST=localhost
   export POSTGRES_PORT=5432
   export POSTGRES_DB=floats_db
   export POSTGRES_USER=postgres
   export POSTGRES_PASSWORD=postgres
   ```
4. Initialize the database:
   ```bash
   python -m src.database.db_client.init_db
   ```
5. Seed the database:
   ```bash
   python -m src.etl.seed_db
   ```

---

## 5. Docker / Cloud Deployment

### 5.1 Docker Compose (recommended)

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Edit `.env` with your API keys:
   ```bash
   FLOAT_API_KEY=$(python -c "import secrets; print(secrets.token_hex(24))")
   GROQ_API_KEY=your_groq_key_here
   GEMINI_API_KEY=your_gemini_key_here
   REDIS_PASSWORD=your_redis_password_here
   ```
3. Build and start:
   ```bash
   docker-compose up --build -d
   ```
4. Verify health:
   ```bash
   curl http://localhost:8000/api/health
   ```

### 5.2 Docker (standalone)

```bash
docker build -t floatchat .
docker run -d \
  -p 8000:8000 \
  -e FLOAT_API_KEY=$(python -c "import secrets; print(secrets.token_hex(24))") \
  -e GROQ_API_KEY=your_groq_key \
  -e GEMINI_API_KEY=your_gemini_key \
  -v $(pwd)/data:/app/data \
  --name floatchat \
  floatchat
```

### 5.3 Cloud Deployment (Azure / AWS / GCP)

- **Python app:** Deploy the FastAPI backend as a container or Python app service
- **Volume:** Mount a persistent volume for `data/` (DuckDB DB, Parquet layers, ChromaDB, logs, cache)
- **Redis:** Use a managed Redis service (Azure Cache for Redis, AWS ElastiCache, GCP Memorystore)
- **PostgreSQL (optional):** Use managed PostgreSQL (Azure Database for PostgreSQL, AWS RDS, GCP Cloud SQL)
- **Network:** Ensure outbound HTTPS (port 443) to `data-argo.ifremer.fr` for data fetching and to LLM provider endpoints
- **Health check:** Configure the orchestrator health check against `http://<host>:8000/api/health`

### 5.4 CORS Configuration

The backend allows CORS from `http://localhost:8000` and `http://127.0.0.1:8000`. For production, update the `allow_origins` list in `src/backend/main.py` to include your production domain.

---

## 6. Security Hardening

Before deploying to production:

1. **Generate a strong `FLOAT_API_KEY`:**
   ```bash
   python -c "import secrets; print(secrets.token_hex(24))"
   ```
2. **Rotate keys regularly:** Change API keys every 90 days.
3. **Set Redis password:** Don't use the default `floatchat_redis_secret` — set `REDIS_PASSWORD` to a strong value.
4. **Restrict network access:**
   - Only expose port 8000 (HTTP) to the internet.
   - Keep Redis (6379) and PostgreSQL (5432) on internal/private networks only.
5. **Use HTTPS:** Place behind a reverse proxy (nginx, Caddy, Azure App Gateway) with TLS termination.
6. **Non-root container:** The Docker image runs as `appuser` (UID 1001) — do not override to root.
7. **Disable debug mode:** Ensure `DEBUG=false` or no debug flag is set.
8. **Regular dependency audit:**
   ```bash
   pip-audit -r requirements.txt
   ```
9. **Review logs:** Check `data/backend.log` and `data/ingestion_log.jsonl` for anomalies.
10. **Rate limiting:** The app enforces 30 requests/minute per IP. For production, consider increasing the limit or adding a distributed rate limiter.

---

## 7. Monitoring & Logging

- **Logs:** Application logs are written to `data/backend.log` (rotated at 10MB, 10-day retention) using loguru.
- **Health endpoint:** `GET /api/health` returns `{"status": "healthy", "floats": N, "rows": N, "parquet_layer": {...}}`.
- **Query logging:** All queries are logged to the `query_logs` database table with timestamp, question, SQL, success/failure, latency, model used, cache status, and retry attempts.
- **Data provenance:** `data/ingestion_log.jsonl` records every NetCDF download with SHA-256 checksums.
- **Parquet lineage:** `data/parquet/lineage.jsonl` records every transformation with checksums.

Recommended monitoring setup:
- Configure log forwarding (e.g., to Azure Monitor, Datadog, or a SIEM)
- Set up alerts on error rate spikes in `backend.log`
- Monitor DuckDB/PostgreSQL connection pool metrics
- Add a synthetic health-check probe that queries the database

---

## 8. Data Refresh & Maintenance

### 8.1 Re-fetching real ARGO data

To update the database with the latest float profiles from Ifremer GDAC:

```bash
python -m src.etl.seed_db
```

This:
1. Clears the existing `floats` table
2. Downloads fresh NetCDF files from Ifremer GDAC for all 6 configured WMO floats
3. Parses with xarray (using quality-adjusted values with raw fallback)
4. Inserts into the database
5. Regenerates Parquet bronze/silver/gold layers (incremental)

### 8.2 Incremental Parquet refresh (no network needed)

If the DuckDB database already has data but the Parquet layers are stale or missing:

```bash
# Incremental: only re-processes floats whose data hash has changed
python -c "from src.etl.seed_db import refresh_parquet_layers; refresh_parquet_layers()"

# Full refresh: re-writes all Parquet layers
python -c "from src.etl.seed_db import refresh_parquet_layers; refresh_parquet_layers(incremental=False)"
```

### 8.3 Changing the ARGO floats

To fetch different floats, edit the `floats_to_fetch` list in `src/etl/fetch_argo.py`:

```python
floats_to_fetch = [
    {"id": "2902264", "dac": "incois"},
    # Add more floats here...
]
```

Then run `python -m src.etl.seed_db`.

### 8.4 Viewing provenance

```bash
python -m src.etl.show_provenance    # View ingestion log
python -m src.ai.test_queries        # Run manual test queries
python -m src.ai.eval_harness        # Run 50-question evaluation
```

---

## 9. Troubleshooting

### Server won't start

- **Error: "FLOAT_API_KEY environment variable is not set":** Set `FLOAT_API_KEY` in `.env` or as an environment variable.
- **Error: "No LLM API keys provided":** Set `GROQ_API_KEY` or `GEMINI_API_KEY` in `.env` to enable live LLM queries.

### Database errors

- **SQLite/DuckDB lock errors:** Ensure only one process writes to the database. In Docker, the `db_data` volume is mounted read-write.
- **"table floats already exists":** The `init_db()` function uses `CREATE TABLE IF NOT EXISTS` — this is safe to re-run.

### Parquet layer not detected

- **Symptom:** `/api/health` shows `parquet_layer.available: false`
- **Fix:** Run `python -m src.etl.seed_db` to generate the Parquet layers. Or run `python -c "from src.etl.seed_db import refresh_parquet_layers; refresh_parquet_layers()"`.
- **Check:** `ls data/parquet/gold/floats_gold.parquet`

### Offline mode

If there's no internet access:
1. The ETL falls back to synthetic data automatically
2. Set `DISABLE_CACHE=true` to bypass all caching
3. Queries will return data from the database (seeded with synthetic data if real fetch fails)
4. No LLM calls will succeed without API keys (questions will return an error message)

### Port conflicts

- Default port is **8000**. To change:
  ```bash
  uvicorn src.backend.main:app --host 0.0.0.0 --port 9000
  ```

---

## Quick Start (All-in-One)

```bash
# 1. Copy env
cp .env.example .env
# 2. Set FLOAT_API_KEY (required)
# 3. Optionally set GROQ_API_KEY and GEMINI_API_KEY
# 4. Seed database + generate Parquet layers
python -m src.etl.seed_db
# 5. Start server
uvicorn src.backend.main:app --host 0.0.0.0 --port 8000
# 6. Open http://localhost:8000 and ask questions
```
