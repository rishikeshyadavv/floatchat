# AGENTS.md — FloatChat Project Guide

## Project Overview

FloatChat is an AI-powered, conversational oceanographic query engine for ARGO float data.
It translates natural-language questions into SQL queries against a DuckDB (or PostgreSQL/TimescaleDB)
database containing real ARGO float profiles fetched from the Ifremer GDAC.

## Project Structure

```
src/
  backend/
    main.py              — FastAPI app, endpoints, auth, CORS, rate limiting, static file serving
  database/
    db_client.py         — DuckDB/PostgreSQL connection, init_db, execute_query, insert_dataframe
  data_layer/            — Apache Parquet + DuckDB data layer (bronze/silver/gold)
    config.py            — Paths, schema definitions, validation rules
    parquet_io.py        — Parquet read/write (PyArrow + Snappy compression)
    validation.py        — Data validation (schema, coordinates, timestamps, duplicates, nulls, ranges)
    etl.py               — Bronze/silver/gold transformation pipeline, incremental refresh
    duckdb_reader.py     — DuckDB Parquet querying (lazy loading, partition pruning, column projection)
    metadata.py          — Metadata catalog (JSON-based dataset registry + lineage)
  etl/
    seed_db.py           — ETL entry point: fetch data + generate Parquet layers
    fetch_argo.py        — Real NetCDF download from Ifremer GDAC + synthetic fallback
    provenance.py        — Tamper-evident ingestion log (JSONL with SHA-256)
  ai/
    sql_agent.py         — Core orchestrator: safety checks, LLM calls, self-correction, provenance
    vector_store.py      — ChromaDB for schema + few-shot RAG
    cache.py             — Redis + memory + file cache layers
    prompts.py           — System prompt template builder
  frontend/
    index.html           — SPA markup
    app.js               — SPA logic (chat, chart, map, provenance display)
    style.css            — Dark/light theme styling
tests/
  conftest.py            — Shared fixtures: session-scoped in-memory DuckDB + sample DataFrame
  test_*.py              — Unit and integration tests (121 total)
```

## Architecture

- **Frontend**: Static SPA served by FastAPI at `/` (same-origin proxy at `/api/query`)
- **Backend**: FastAPI with rate limiting (slowapi), API key auth (`/ask`), CORS
- **AI Pipeline**: RAG context (ChromaDB) → LLM (Groq → Gemini fallback) → SQL safety guard → DB execution
- **Data Layer**: Real ARGO data fetched from Ifremer GDAC (NetCDF) → DuckDB DB + Parquet (bronze/silver/gold)
- **Caching**: Redis → in-memory cache layers

## Lint and Test Commands

```bash
# Lint
ruff check src/ tests/

# Run all tests
python -m pytest tests/ -v

# Run only data layer tests
python -m pytest tests/test_data_layer.py -v

# Dependency audit
pip-audit -r requirements.txt
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| FLOAT_API_KEY | (required) | API key for `/ask` endpoint |
| DB_TYPE | duckdb | `duckdb` or `postgres` |
| DB_PATH | data/argo_data.db | DuckDB database file path |
| ARGO_MAX_PROFILES | 30 | Profiles per float to ingest |
| ARGO_MAX_DEPTH | 2000 | Maximum depth in meters |
| CHROMA_DB_PATH | data/chroma_db | ChromaDB vector store path |
| REDIS_URL | redis://localhost:6379/0 | Redis cache URL |
| CACHE_TTL | 3600 | Cache TTL in seconds |
| MEMORY_CACHE_MAX | 200 | Max in-memory cache entries (LRU eviction) |
| GROQ_API_KEY | (optional) | Groq LLM API key |
| GEMINI_API_KEY | (optional) | Gemini LLM API key |
| DISABLE_CACHE | false | Disable all caching |
| DATA_DIR | ./data | Base data directory (Parquet layers under DATA_DIR/parquet/) |

## Data Layer (Parquet + DuckDB)

The Parquet data layer provides an analytics-optimized read path alongside the
existing DuckDB database. It is organized into three layers:

- **Bronze**: Raw per-float Parquet files (one per WMO float ID)
- **Silver**: Cleaned, validated, standardized Parquet (all floats)
- **Gold**: Query-optimized Parquet partitioned by year and region

The SQL Agent (`sql_agent.py`) uses `route_query()` which automatically routes
queries through the Parquet gold layer when available, falling back to the DuckDB
database file. Every response includes a `provenance` field with data source,
version, and update timestamp.

To generate Parquet layers from existing database data:
```bash
python -m src.etl.seed_db
```

To incrementally refresh Parquet layers (only processes changed floats):
```bash
python -c "from src.etl.seed_db import refresh_parquet_layers; refresh_parquet_layers()"
```
