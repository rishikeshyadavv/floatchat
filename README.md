# FloatChat 🌊 — Conversational AI for ARGO Ocean Data

FloatChat lets anyone — a student, a policymaker, a maritime operator — ask questions about ocean data in plain English and get real answers back, charts included. No SQL knowledge needed.

It was built for **Smart India Hackathon Problem Statement SIH25040** (Ministry of Earth Sciences), and it runs on **real oceanographic sensor data**, not simulated numbers — pulled directly from the global ARGO float network.

> Ask: *"Show me the temperature profile of float 2902264"*
> Get: a working SQL query, the matching rows, and a depth-vs-temperature scatter chart — in seconds.

---

## What problem this solves

ARGO floats are autonomous robots drifting through the world's oceans, diving every few days to measure temperature, salinity, and pressure at different depths. All of that data is public — but it's locked inside raw NetCDF binary files that only trained oceanographers know how to open.

FloatChat is the bridge: it downloads the real files, understands them, and lets you talk to the data instead of parsing scientific file formats yourself.

---

## How it works, end to end

```
You type a question
        ↓
Static SPA frontend (frontend/index.html — served by FastAPI at /)
        ↓  (same-origin POST to /api/query)
FastAPI backend     (src/backend/main:app)
        ↓
SQL Agent           (src/ai/sql_agent.py)
        ↓                          ↓
ChromaDB                      Redis cache
(finds similar                (instant replay
past questions                 of repeated
for context)                   questions)
        ↓
Groq (Llama 3.3-70B) — or Gemini as fallback —
translates your question into SQL
        ↓
┌─────────────────────────────────────────┐
│  DuckDB local DB (data/argo_data.db)    │
│  ↘                                      │
│  Parquet Gold Layer                    │
│  (data/parquet/gold/)                  │
│  DuckDB reads Parquet directly         │
│  (lazy, partition pruning, projection) │
└─────────────────────────────────────────┘
        ↓
Results flow back as a table + Chart.js scatter + Leaflet map,
with dataset provenance (source, version, timestamp)
```

The SQL Agent automatically routes analytical queries through the **Parquet gold layer** (read by DuckDB without loading into memory) when available, falling back to the DuckDB database file if Parquet is not initialized. Every response includes a `provenance` field documenting the data source.

If the AI writes SQL with a mistake, the system catches the database error, feeds it back to the AI, and lets it retry automatically — you never see the failure.

If someone tries to ask the system to delete or modify data (accidentally or on purpose), a safety layer blocks it before it ever reaches the database.

---

## Where the data actually comes from

This is not synthetic or made-up data. The ETL pipeline (`src/etl/fetch_argo.py`) downloads real profile files directly from the **Ifremer Global Data Assembly Centre (GDAC)** — the official public archive that mirrors ARGO float data from every country operating floats.

For each float, the pipeline:
1. Downloads its `[WMO_ID]_prof.nc` file from Ifremer (trying India's, the US's, and France's data centers in turn, since floats are archived under whichever agency owns them).
2. Opens it with `xarray` and extracts temperature, salinity, pressure, position, and date for every dive.
3. Cleans and loads the readings into the database.
4. Writes Parquet bronze/silver/gold layers for analytics-optimized reads.
5. Deletes the raw file (it's no longer needed once parsed) — but first records a permanent proof-of-download entry (see below).

**Currently ingested:** 10 ARGO floats (6 core WMO IDs: 2902264, 2902265, 2902266, 5904664, 6900186; 5 BGC WMO IDs: 5904663, 2902936, 6901864, 6901865, 6901866), with real sensor readings spanning the Arabian Sea, Bay of Bengal, Equatorial Indian Ocean, Southern Ocean, and Mediterranean. BGC floats are served from the unified GDAC `_Sprof.nc` files (which carry both core and biogeochemical variables: oxygen, chlorophyll, pH, nitrate, CDOM, turbidity).

> **Offline-first:** If network access is unavailable, the ETL falls back to generating oceanographically realistic synthetic data — so the app is always demo-ready with zero setup.

### Proof it's real: the provenance log

Every successful (or failed) download is permanently logged to `data/ingestion_log.jsonl` — a tamper-evident record containing the source URL, timestamp, record count, and a SHA-256 checksum of the exact file that was downloaded.

The Parquet data layer also maintains a metadata catalog (`data/parquet/catalog.json`) and lineage log (`data/parquet/lineage.jsonl`) tracking dataset versions, schemas, quality metrics, spatial/temporal coverage, and transformation history.

Run this to see the ingestion log:

```bash
python -m src.etl.show_provenance
```

---

## Parquet Data Layer

FloatChat stores dataset in Apache Parquet with Snappy compression, organized into three layers:

| Layer | Description | Location |
|---|---|---|
| **Bronze** | Raw per-float Parquet files (one per WMO float ID) — raw parsed data before cleaning | `data/parquet/bronze/` |
| **Silver** | Cleaned, validated, standardized data across all floats | `data/parquet/silver/` |
| **Gold** | Query-optimized Parquet partitioned by year and region, with an added `year` column | `data/parquet/gold/` |

The metadata catalog (`data/parquet/catalog.json`) tracks each dataset's source, schema, version, creation/update timestamps, row count, quality metrics, and spatial/temporal coverage.

The lineage log (`data/parquet/lineage.jsonl`) records every transformation with SHA-256 checksums, enabling audit trails.

Queries are routed through DuckDB's Parquet reader, which provides **lazy loading**, **partition pruning**, and **column projection** — so only the needed data is read, never the full files.

**Incremental refresh:** Only floats whose data hash has changed since the last run are re-processed, minimizing I/O on subsequent loads.

```bash
# Generate Parquet layers from existing database
python -m src.etl.seed_db

# Incremental refresh (only processes changed floats)
python -c "from src.etl.seed_db import refresh_parquet_layers; refresh_parquet_layers()"
```

---

## Key features

| Feature | What it does |
|---|---|
| **Text-to-SQL translation** | Converts natural-language questions into safe, correct SQL using Groq's Llama-3.3-70B, with Gemini as an automatic fallback if Groq is unavailable. |
| **Few-shot retrieval (RAG)** | ChromaDB stores past question-to-SQL examples and pulls the most similar ones into the prompt, improving accuracy on new questions. |
| **Self-correction loop** | If the generated SQL has an error, the database's error message is fed back to the AI, which fixes and retries automatically. |
| **Two-layer SQL safety guard** | Only read-only `SELECT` statements are allowed. Destructive keywords (`DROP`, `DELETE`, `ATTACH`, `PRAGMA`, etc.) and cross-table data exfiltration attempts are blocked before execution — this has been adversarially security-tested. |
| **Redis caching** | Repeated or common questions return instantly instead of re-querying the AI, with automatic fallback to a local cache if Redis is offline. |
| **Parquet data layer** | Bronze/silver/gold Parquet files queried via DuckDB with lazy loading, partition pruning, and column projection for efficient analytics. |
| **Dataset provenance** | Every response includes a `provenance` field with data source, version, and update timestamp. |
| **Incremental refresh** | Only changed floats are re-processed in the Parquet layers, minimizing I/O. |
| **Interactive visualizations** | Vertical depth profiles (Chart.js scatter) and geographic float locations (Leaflet maps) render automatically based on the kind of question asked. |
| **API authentication & rate limiting** | The backend requires an API key and rate-limits requests per IP to prevent abuse. |
| **Dual database support** | Runs on DuckDB locally for fast, zero-setup development, or PostgreSQL + TimescaleDB in Docker for a production-style deployment. |
| **Automated testing & CI** | A 121-test pytest suite and a 50-question text-to-SQL evaluation harness run automatically via GitHub Actions on every push. |
| **Ingestion provenance logging** | Every real data download is permanently and verifiably logged (see above) — proof the data isn't synthetic. |

---

## Repository structure

```
├── data/
│   ├── argo_data.db          # DuckDB database — the actual ocean sensor readings
│   ├── ingestion_log.jsonl   # Proof-of-download log for every real NetCDF file fetched
│   ├── chroma_db/            # ChromaDB vector store (few-shot examples for the AI)
│   └── parquet/              # Parquet data layer (bronze/silver/gold + catalog + lineage)
│       ├── bronze/           # Raw per-float Parquet files
│       ├── silver/           # Cleaned, validated Parquet
│       ├── gold/             # Analytics-optimized, partitioned Parquet
│       ├── catalog.json      # Metadata catalog (source, schema, version, quality, coverage)
│       └── lineage.jsonl     # Transformation lineage log
├── frontend/
│   ├── index.html            # Static SPA — chat UI with tabs (data, chart, map)
│   ├── app.js                # Frontend logic — same-origin proxy calls to /api/query
│   ├── style.css             # Dark-mode-first styling
│   └── assets/               # logo.png, bg_wave.png, favicon.ico
├── src/
│   ├── ai/
│   │   ├── sql_agent.py      # Core AI logic: prompt building, safety checks, retries, provenance
│   │   ├── vector_store.py   # ChromaDB wrapper for few-shot example retrieval
│   │   ├── cache.py          # Redis + memory cache layers
│   │   ├── prompts.py        # System prompts fed to the LLM
│   ├── backend/
│   │   └── main.py           # FastAPI server — auth, rate limiting, /api/query, /ask, /api/health
│   ├── database/
│   │   └── db_client.py      # Unified DuckDB / TimescaleDB connection layer
│   ├── data_layer/           # Apache Parquet + DuckDB analytics data layer
│   │   ├── config.py         # Paths, schema definitions, validation rules
│   │   ├── parquet_io.py     # Parquet read/write (PyArrow + Snappy compression)
│   │   ├── validation.py     # Data validation (schema, coords, timestamps, nulls, ranges)
│   │   ├── etl.py            # Bronze/silver/gold transformation pipeline, incremental refresh
│   │   ├── duckdb_reader.py  # DuckDB Parquet querying (lazy loading, partition pruning)
│   │   ├── metadata.py       # Metadata catalog (JSON-based dataset registry + lineage)
│   │   └── __init__.py       # Package exports
│   └── etl/
│       ├── fetch_argo.py     # Downloads and parses real ARGO NetCDF files
│       ├── seed_db.py        # Entry point — fetch real data + generate Parquet layers
│       ├── provenance.py     # Writes the tamper-evident ingestion log
│       └── show_provenance.py # CLI tool to view the ingestion log as a table
├── tests/                     # pytest suite (121 tests: safety, API auth, cache, data layer, ETL, DB migration)
│   ├── conftest.py           # Shared test fixtures (in-memory DuckDB)
│   ├── test_agent.py         # SQL safety guard tests
│   ├── test_api_endpoints.py # API auth and rate limiting tests
│   ├── test_cache.py         # Cache layer tests
│   ├── test_data_layer.py    # Parquet data layer tests
│   ├── test_db_client.py     # DB schema migration tests
│   ├── test_etl.py           # ETL logic tests
│   ├── test_proxy.py         # /api/query proxy tests
│   └── test_security.py      # Adversarial security tests
├── .github/workflows/ci.yml   # Runs lint + tests automatically on every push
├── Dockerfile / docker-compose.yml
├── docker-entrypoint.sh       # Seeds DB + generates Parquet if missing on container start
├── requirements.txt
├── run_server.ps1             # One-click Windows startup script
├── .env.example               # Template for environment variables
├── AGENTS.md                  # Project guide for AI coding agents
├── DevelopmentKit.md          # Deployment guide for operators
├── security_audit_report.md   # Full adversarial security audit report
└── security_audit_raw_results.json
```

---

## Getting started

### Option A: Quick start (Docker)

```bash
docker-compose up --build
```

This spins up the backend (with pre-built seed database), Redis, and TimescaleDB together. The FastAPI backend serves the SPA frontend at `http://localhost:8000`.

### Option B: Local development

#### 1. Prerequisites

- Python 3.10+
- A free [Groq API key](https://console.groq.com) (optional — app works offline with demo cache)

#### 2. Install dependencies

```bash
pip install -r requirements.txt
```

#### 3. Set up your environment variables

```bash
cp .env.example .env
# Edit .env and set FLOAT_API_KEY to your own value
# Optionally set GROQ_API_KEY and GEMINI_API_KEY
```

#### 4. Seed the database

```bash
python -m src.etl.seed_db
```

This fetches real ARGO float profiles from the Ifremer GDAC and generates Parquet bronze/silver/gold layers. If the network is unavailable, it falls back to synthetic data — so the app always runs.

> **Note:** If you don't have network access, the seed step generates synthetic data. Run `python -m src.etl.seed_db` later when you do have connectivity to replace it with real data.

---

## Try these questions

Once the app is running, try asking:

- *"Show me the temperature profile of float 2902264"* → depth-vs-temperature chart
- *"What's the salinity in the Arabian Sea in January 2023?"* → map view with markers
- *"Compare salinity in the Arabian Sea vs Bay of Bengal"* → comparison chart
- *"Find nearest ARGO floats to lat 12, lon 65"* → distance-based lookup
- *"What are the real-time readings from float 5904663?"* → map + table view
- *"Delete all data from the database"* → watch the safety guard block it

### API usage

**Browser / proxy** (same-origin, no key needed — the browser talks to `/api/query` which uses the server-side key):

```bash
curl -X POST http://localhost:8000/api/query \
  -H "Content-Type: application/json" \
  -d '{"question":"Show me the temperature profile of float 2902264"}'
```

**Authenticated API** (`/ask` requires `X-API-Key` header):

```bash
curl -X POST http://localhost:8000/ask \
  -H "X-API-Key: your_float_api_key" \
  -H "Content-Type: application/json" \
  -d '{"question":"Show me the temperature profile of float 2902264"}'
```

**Response format:**

```json
{
  "success": true,
  "sql": "SELECT depth, temperature FROM floats WHERE float_id = '2902264'...",
  "data": [{"depth": 5.4, "temperature": 28.58}, ...],
  "latency_seconds": 0.73,
  "provenance": {
    "data_source": "parquet_gold",
    "source": "Ifremer GDAC",
    "source_url": "https://data-argo.ifremer.fr",
    "version": "1.0.0",
    "updated_at": "2026-07-31T16:55:00Z",
    "row_count": 49767,
    "spatial_coverage": {"min_lat": -10.0, "max_lat": 25.0},
    "temporal_coverage": {"min_date": "2005-01-01", "max_date": "2023-12-31"}
  }
}
```

---

## Running the test suite

```bash
pytest
```

Lint:

```bash
ruff check src/ tests/
```

---

## Security notes

This project has been through an adversarial security audit covering authentication bypass, SQL injection, prompt injection, input fuzzing, and dependency CVE checks. Key protections currently in place:

- API key required on all data-returning endpoints
- Per-IP rate limiting (uses socket-level IP, not spoofable headers)
- SQL safety guard blocking destructive statements and restricted-table access
- No hardcoded credentials or default fallback keys
- Non-root Docker containers with health checks
- Redis password-protected and network-isolated in Docker
- DB error messages sanitized before returning to the caller
- SQL omitted from all error responses

If you're extending this project, rotate your API keys immediately if you ever suspect `.env` was exposed, and never commit it to git.

---

## Tech stack

**Backend:** FastAPI, slowapi (rate limiting), loguru (logging), uvicorn
**AI:** Groq (Llama 3.3-70B), Gemini (fallback), ChromaDB (RAG), Redis (caching)
**Data:** DuckDB / PostgreSQL + TimescaleDB, PyArrow + Parquet (Snappy), xarray + netCDF4
**Frontend:** Static HTML/CSS/JS SPA with Chart.js and Leaflet
**Infra:** Docker, Docker Compose, GitHub Actions (CI)
**Testing:** pytest (121 tests), ruff
**Lint:** ruff

---

## About

Built for Smart India Hackathon 2026 — Problem Statement SIH25040, Ministry of Earth Sciences.
# Floatchart
