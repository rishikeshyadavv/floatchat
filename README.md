# FloatChat 🌊 — Conversational AI for ARGO Ocean Data

> **Ask the ocean a question. Get a real answer back.**

FloatChat is an AI-powered, conversational oceanographic query engine that lets anyone — a student, a policymaker, a researcher, or a maritime operator — ask questions about real ARGO float data in plain English and instantly receive SQL results, depth-profile charts, interactive maps, and full data provenance.

Instead of wrestling with NetCDF files, SQL syntax, or GIS tooling, a user simply types a question — *"Show me the temperature profile of float 2902264"* — and FloatChat translates that into a safe, validated SQL query, executes it against real oceanographic data, and returns a rich, explorable answer in seconds.

**Built for Smart India Hackathon 2026 — Problem Statement SIH25040 (Ministry of Earth Sciences)**

🌐 **Live Demo:** [https://floatchat-uo10.onrender.com](https://floatchat-uo10.onrender.com)

<p align="left">
  <img alt="Node" src="https://img.shields.io/badge/Node.js-v18%2B-339933?logo=node.js&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-tsx-3178C6?logo=typescript&logoColor=white">
  <img alt="DuckDB" src="https://img.shields.io/badge/DuckDB-1.4-FFF000?logo=duckdb&logoColor=black">
  <img alt="Gemini" src="https://img.shields.io/badge/Gemini-3.6%20Flash-4285F4?logo=google&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/hackathon-SIH25040-e11d48">
</p>

---

## 📑 Table of Contents

- [Why FloatChat](#-why-floatchat)
- [Features](#-features)
- [Architecture](#-architecture)
- [Project Structure](#️-project-structure)
- [Quick Start](#-quick-start)
- [Usage Examples](#-usage-examples)
- [AI Engine & Modes](#-ai-engine--modes)
- [Database Schema](#️-database-schema)
- [API Reference](#-api-reference)
- [Deployment](#️-deployment)
- [Testing](#-testing)
- [Design System](#-design-system)
- [Tech Stack](#️-tech-stack)
- [Environment Variables](#-environment-variables)
- [Security Notes](#-security-notes)
- [Troubleshooting](#-troubleshooting)
- [FAQ](#-faq)
- [Roadmap](#️-roadmap)
- [Contributing](#-contributing)
- [License & Acknowledgments](#-license--acknowledgments)

---

## 🌊 Why FloatChat

Oceanographic data — especially from the international ARGO float network — is enormous, technical, and locked behind formats (NetCDF), tools (Python/MATLAB pipelines), and jargon that keep it out of reach for most people who could actually use it: students learning oceanography, policymakers assessing marine heatwaves, journalists covering climate change, or field operators planning missions.

FloatChat closes that gap. It sits between the raw, high-volume ARGO dataset and the person asking a question, using a large language model to translate natural language into precise, safe SQL — and then wraps the result in charts, maps, and explanations a non-specialist can actually use.

---

## ✨ Features

| Feature | Details |
|---|---|
| 🗣️ **Natural Language → SQL** | Type plain English; Gemini 3.6 Flash translates it into DuckDB SQL |
| 📊 **Interactive Data Tabs** | Data table, Chart.js scatter plots, Leaflet maps, and SQL inspection — all in one card |
| 🌡️ **Real ARGO Float Data** | 10 floats · 467,796 readings from Ifremer GDAC (Arabian Sea, Bay of Bengal, Equatorial Indian Ocean) |
| 🧪 **Biogeochemical Sensors** | Oxygen, Chlorophyll-a, pH, Nitrate, CDOM, Turbidity — BGC-Argo float array |
| 🔍 **10 Curated Query Categories** | Temperature, Salinity, Spatial, BGC, Anomaly, Depth, QC, Seasonal, Regional, Fleet Analytics |
| ⚡ **Multi-Mode AI Engine** | Standard · Low Latency · High Thinking — three reasoning modes, one dropdown |
| 💾 **Export & Copy** | Export as CSV, Export as JSON, Copy SQL — theme-matching pill buttons |
| 🎨 **Light & Dark Theme** | Default Light Theme with persistent Dark Mode toggle |
| 📈 **Analytics Dashboard** | Long-term hydrographic trends, OMZ dips, DCM peaks, depth stratification, QC audit |
| 🛡️ **SQL Safety Guard** | Blocks all destructive SQL (DROP, DELETE, ATTACH, PRAGMA) before execution |
| 🔄 **Self-Correcting AI** | Automatically retries failed AI-generated queries with error context |
| 📡 **Data Provenance** | Every response includes data source, version, and ingestion lineage |
| 🌍 **Multi-Region Coverage** | Arabian Sea, Bay of Bengal, and Equatorial Indian Ocean basins in a single queryable dataset |
| ⚙️ **Graceful Degradation** | Rule-based SQL fallback keeps the app functional even if the LLM is unreachable |

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  FloatChat SPA (Light/Dark Theme)                            │
│  frontend/index.html · frontend/app.js · frontend/style.css  │
└─────────────────────┬────────────────────────────────────────┘
                       │  POST /api/query
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  Node.js + Express Backend  (server.ts)                      │
│  Routes: /api/query · /ask · /api/floats · /api/analytics    │
└─────────────────────┬────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  SQL Agent  (src/agent.ts)                                   │
│  1. Safety pre-check    4. SQL safety guard                  │
│  2. LRU cache lookup    5. DuckDB execution                  │
│  3. Gemini LLM call     6. AI self-correction retry          │
│                         7. Rule-based fallback                │
└─────────────────────┬────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  DuckDB  (src/db.ts)                                         │
│  Primary : Parquet Gold Layer  (data/parquet/gold/)          │
│  Fallback: DuckDB file         (data/argo_data.db)           │
│  10 floats · 467,796 readings · real ARGO NetCDF data        │
└──────────────────────────────────────────────────────────────┘
```

### How a query flows through the system

1. **User types a question** in the chat dock (e.g. *"Compare salinity in the Arabian Sea vs Bay of Bengal"*).
2. **Frontend** (`app.js`) posts the raw text to `POST /api/query` along with the selected AI mode.
3. **Express backend** (`server.ts`) routes the request into the **SQL Agent**.
4. **SQL Agent** (`src/agent.ts`) runs a safety pre-check on the input, checks its LRU cache for an identical prior question, and — on a cache miss — calls Gemini to translate the question into DuckDB SQL.
5. The generated SQL passes through a **safety guard** that blocks destructive statements (`DROP`, `DELETE`, `ATTACH`, `PRAGMA`, etc.) before anything touches the database.
6. **DuckDB** (`src/db.ts`) executes the query against the Parquet Gold layer (falling back to the `.db` file if needed) and returns rows.
7. If execution fails, the agent **self-corrects**: it feeds the SQL error back to the LLM and retries once with that context.
8. If the LLM itself is unavailable, a **rule-based fallback** (`src/fallback.ts`) pattern-matches the question against known query templates so the app keeps working.
9. The response — data, generated SQL, latency, and provenance — flows back to the SPA, which renders it as a table, chart, and map simultaneously.

This layered design means a single point of failure (a slow LLM call, a malformed query, an API outage) degrades the experience gracefully instead of breaking it outright.

---

## 🗂️ Project Structure

```
floatchat/
├── server.ts                  # Express backend — all API routes
├── src/
│   ├── agent.ts               # SQL Agent: LLM calls, safety, caching, retry
│   ├── db.ts                  # DuckDB connection, Parquet loader, query runner
│   └── fallback.ts            # Rule-based SQL fallback engine
├── frontend/
│   ├── index.html             # SPA markup — nav, chat, input dock, modals
│   ├── app.js                 # SPA logic — chat, charts, maps, theme, export
│   └── style.css              # Full design system — Light/Dark themes, all components
├── tests/
│   └── dom.test.ts            # DOM verification tests (JSDOM — 32 assertions)
├── data/
│   ├── argo_data.db           # DuckDB database file
│   └── parquet/               # Bronze / Silver / Gold Parquet layers
├── api/
│   └── index.ts               # Vercel serverless entry point
├── Dockerfile.node            # Node.js Docker image
├── render.yaml                # Render.com deployment blueprint
├── vercel.json                # Vercel deployment config
├── .github/workflows/         # GitHub Actions CI
└── DevelopmentKit.md          # Full deployment and ops guide
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** v18 or v20+
- **Gemini API Key** — free from [Google AI Studio](https://aistudio.google.com/)
- (Optional) **Groq API Key** — used as a secondary LLM fallback
- (Optional) **Docker** — if you prefer a containerized setup

### 1. Clone & Install

```bash
git clone https://github.com/rishikeshyadavv/floatchat.git
cd floatchat
npm install
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
GEMINI_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here        # optional
FLOAT_API_KEY=your_secret_key_here         # for /ask endpoint
DATA_DIR=./data
```

### 3. Run the Development Server

```bash
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)**

### 4. (Optional) Build for Production

```bash
npm run build
npm start
```

---

## 💬 Usage Examples

FloatChat understands a wide range of oceanographic questions out of the box:

```
Show me the temperature profile of float 2902264
Compare salinity in the Arabian Sea vs Bay of Bengal
Find nearest ARGO floats to lat 12, lon 65
Detect marine heatwaves or thermal anomalies above 29°C
Show oxygen minimum zone (OMZ) profiles near lat 14, lon 67
Plot Chlorophyll-a concentration vs depth
Compare winter vs summer ocean temperature profiles
Which floats have BGC sensors active?
Show the deepest recorded readings for float 2902264
Flag any readings that failed quality control
```

Or click **Categories** in the nav bar to explore all 10 curated query domains — Temperature, Salinity, Spatial, BGC, Anomaly, Depth, QC, Seasonal, Regional, and Fleet Analytics.

Every response arrives with:

- A **data table** of the returned rows
- A **Chart.js** visualization (scatter/line depending on query shape)
- A **Leaflet map** plotting float positions where relevant
- The **exact SQL** that was generated and executed
- **Provenance metadata** — which model answered, and which dataset version was queried

---

## 🧠 AI Engine & Modes

The SQL Agent (`src/agent.ts`) supports three modes, selectable from a single dropdown in the UI:

| Mode | Model | Use Case |
|---|---|---|
| **Standard** | `gemini-3.6-flash` | All-around ocean intelligence & SQL translation |
| **Low Latency** | `gemini-3.1-flash-lite` | Fast, low-cost queries for simple lookups |
| **High Thinking** | `gemini-3.6-flash` (thinking) | Deep hydrographic reasoning & synthesis |

### AI Pipeline

1. **Safety Pre-check** — blocks destructive keywords before any LLM call
2. **LRU Cache** — instant response if query was seen before
3. **Gemini LLM** — translates natural language to DuckDB SQL
4. **SQL Safety Guard** — validates generated SQL before execution
5. **DuckDB Execution** — queries real ARGO float data
6. **Self-Correction** — retries with error context if DB execution fails
7. **Rule Fallback** — pattern-matched SQL if LLM is unavailable

This pipeline is intentionally defense-in-depth: no single stage is trusted to be the only safeguard against a bad or malicious query reaching the database.

---

## 🗄️ Database Schema

The `floats` table contains **467,796 sensor readings** from **10 ARGO floats**:

| Column | Type | Description |
|---|---|---|
| `float_id` | VARCHAR | WMO float ID (e.g. `2902264`) |
| `lat` | DOUBLE | Latitude (decimal degrees) |
| `lon` | DOUBLE | Longitude (decimal degrees) |
| `date` | VARCHAR | Date (`YYYY-MM-DD`) |
| `depth` | DOUBLE | Sensor depth in meters (0–2000m) |
| `temperature` | DOUBLE | Sea water temperature (°C) |
| `salinity` | DOUBLE | Sea water salinity (PSU) |
| `region` | VARCHAR | Ocean basin (`Arabian Sea`, `Bay of Bengal`, `Equatorial`, `Other`) |
| `oxygen` | DOUBLE | Dissolved oxygen — BGC parameter |
| `chlorophyll` | DOUBLE | Chlorophyll-a — BGC parameter |
| `ph` | DOUBLE | Ocean pH — BGC parameter |
| `nitrate` | DOUBLE | Nitrate concentration — BGC parameter |
| `cdom` | DOUBLE | CDOM — BGC parameter |
| `turbidity` | DOUBLE | Turbidity (NTU) — BGC parameter |
| `float_type` | VARCHAR | `core` or `bgc` |

Data flows through a **Bronze → Silver → Gold** Parquet layering scheme: Bronze holds raw ingested NetCDF-derived records, Silver applies cleaning and QC flag normalization, and Gold is the query-optimized layer FloatChat reads from at runtime.

---

## 🌐 API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/query` | None | Main query endpoint (used by frontend SPA) |
| `POST` | `/ask` | `X-API-Key` header | Authenticated endpoint for external clients |
| `GET` | `/api/floats` | None | List all floats with BGC parameter availability |
| `GET` | `/api/analytics/trends` | None | Dataset-wide time-series analytics |
| `GET` | `/api/health` | None | Health check — returns `{ status: "ok" }` |

### Request

```json
POST /api/query
{
  "question": "Show me the temperature profile of float 2902264",
  "mode": "standard"
}
```

### Response

```json
{
  "success": true,
  "sql": "SELECT date, depth, temperature FROM floats WHERE float_id = '2902264' ORDER BY depth ASC LIMIT 500",
  "data": [{ "date": "2024-01-01", "depth": 5.4, "temperature": 28.9 }],
  "analysis": "Optional deep synthesis (thinking mode only)",
  "latency_seconds": 1.23,
  "provenance": {
    "data_source": "gemini-3.6-flash",
    "dataset": "Ifremer GDAC ARGO floats"
  }
}
```

### Authenticated request example (`/ask`)

```bash
curl -X POST https://floatchat-uo10.onrender.com/ask \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_secret_key_here" \
  -d '{"question": "Which region has the highest average salinity?"}'
```

---

## ☁️ Deployment

### Option 1: Render (Recommended — 1-Click)

1. Push your repo to GitHub.
2. Go to [Render Dashboard](https://dashboard.render.com) → **New +** → **Blueprint**.
3. Connect your repository — Render auto-reads [`render.yaml`](./render.yaml).
4. Set `GEMINI_API_KEY` (and optionally `GROQ_API_KEY`, `FLOAT_API_KEY`) as environment variables.
5. Deploy — the service starts with `npm run build && npm start`.

### Option 2: Docker

```bash
docker build -f Dockerfile.node -t floatchat:latest .
docker run -p 3000:3000 -e GEMINI_API_KEY="your_key" floatchat:latest
```

### Option 3: Vercel (Serverless)

```bash
npm i -g vercel
vercel --prod
```

[`vercel.json`](./vercel.json) and [`api/index.ts`](./api/index.ts) handle serverless routing.

> For a deeper walkthrough of environment setup, scaling considerations, and platform-specific quirks, see [`DevelopmentKit.md`](./DevelopmentKit.md).

---

## 🧪 Testing

```bash
# DOM verification tests (32 assertions, JSDOM — no browser needed)
npm test

# TypeScript type-check & lint
npm run lint

# Build production bundle
npm run build
```

GitHub Actions CI (`.github/workflows/`) runs the lint, test, and build steps automatically on every push and pull request, so regressions in the SPA or the API surface are caught before merge.

---

## 🎨 Design System

Custom CSS design system — **Crumb Club Hydro-Retro palette** — no CSS frameworks:

| Token | Light | Dark |
|---|---|---|
| `--primary-blue` | `#0726b0` | `#4d6eff` |
| `--sand-white` | `#e5ded4` | `#1b2436` |
| `--birdhouse-brown` | `#6a4a3e` | `#d8c2b5` |
| `--teal-accent` | `#0d9488` | `#0d9488` |
| `--coral-accent` | `#e11d48` | `#e11d48` |

**Fonts:** Fredoka (display) · Poppins (body) · IBM Plex Mono (code)

Theme persists via `localStorage`. Default: **Light Theme**.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js, Express 5, TypeScript (`tsx`), DuckDB 1.4 |
| **AI / LLM** | Google Gemini 3.6 Flash, Gemini 3.1 Flash-Lite (`@google/genai`) |
| **Database** | DuckDB, Apache Parquet (hyparquet), Gold/Silver/Bronze layers |
| **Frontend** | Vanilla HTML5, CSS3 (custom design system), Vanilla JS SPA |
| **Charts** | Chart.js 4 |
| **Maps** | Leaflet 1.9 |
| **Testing** | JSDOM, tsx |
| **Deployment** | Render, Docker, Vercel, Firebase |
| **CI/CD** | GitHub Actions |
| **Data Source** | Ifremer GDAC ARGO float NetCDF profiles |

---

## 📁 Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | **Yes** | — | Google Gemini API key |
| `GROQ_API_KEY` | No | — | Groq Llama fallback key |
| `FLOAT_API_KEY` | No | — | Secret for `/ask` endpoint |
| `DATA_DIR` | No | `./data` | Parquet data layers directory |
| `PORT` | No | `3000` | HTTP server port |

---

## 🔒 Security Notes

- **No arbitrary SQL from users.** The frontend never accepts raw SQL — only natural language, which the agent translates.
- **SQL Safety Guard.** Every LLM-generated query is checked against a denylist of destructive keywords (`DROP`, `DELETE`, `ATTACH`, `PRAGMA`, `UPDATE`, `INSERT`, `COPY`, and similar) before it ever reaches DuckDB.
- **Read-only data access.** The Gold Parquet layer and `.db` fallback are treated as read-only from the API's perspective.
- **Optional endpoint auth.** The `/ask` endpoint requires an `X-API-Key` header, keeping it separate from the open `/api/query` route used by the public SPA.
- **Secrets stay server-side.** API keys (`GEMINI_API_KEY`, `GROQ_API_KEY`, `FLOAT_API_KEY`) are never exposed to the frontend bundle.

---

## 🩺 Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| `GEMINI_API_KEY is not set` on startup | Missing or misnamed `.env` file | Run `cp .env.example .env` and fill in your key |
| Queries always hit the rule-based fallback | Gemini API key invalid, rate-limited, or unreachable | Check the key in [Google AI Studio](https://aistudio.google.com/) and confirm network access |
| `/api/query` returns a SQL error repeatedly | Ambiguous or out-of-scope question | Rephrase using a float ID, region name, or parameter from the schema |
| Blank charts or maps | No rows returned for the given filters | Widen the query (e.g. drop a date range or depth filter) |
| Docker container exits immediately | Missing `GEMINI_API_KEY` env var at `docker run` | Pass `-e GEMINI_API_KEY="your_key"` as shown in the Docker deployment section |
| Local dev server won't start | Node version below v18 | Upgrade Node.js to v18 or v20+ |

---

## ❓ FAQ

**Does FloatChat use simulated or real ocean data?**
Real data — 467,796 sensor readings from 10 ARGO floats sourced from Ifremer GDAC, the official ARGO data assembly centre.

**Can I ask about regions outside the Arabian Sea, Bay of Bengal, or Equatorial Indian Ocean?**
The current dataset is scoped to those basins (plus an `Other` catch-all region). Expanding coverage is on the [roadmap](#️-roadmap).

**What happens if the Gemini API is down?**
The SQL Agent automatically falls back to a rule-based pattern-matching engine (`src/fallback.ts`) so basic queries still work.

**Can I self-host this with my own dataset?**
Yes — replace the Parquet files under `data/parquet/` and the `.db` file under `data/`, matching the schema described above.

**Is the SQL safe to run against production data?**
The safety guard blocks destructive statements, but FloatChat is designed for read-heavy analytical workloads, not as a general-purpose database gateway — don't point it at a live transactional database.

---

## 🗺️ Roadmap

- [ ] Expand float coverage beyond the current 10-float array
- [ ] Add historical trend forecasting (beyond descriptive analytics)
- [ ] Support voice input for accessibility
- [ ] Multi-language natural language query support
- [ ] Shareable, permalinked query results
- [ ] User-defined saved queries and dashboards

---

## 🤝 Contributing

Contributions, bug reports, and feature requests are welcome.

1. Fork the repository and create a feature branch.
2. Make your changes, following the existing TypeScript/ESLint conventions.
3. Run `npm run lint` and `npm test` before opening a PR.
4. Describe what changed and why in your pull request description.

For larger changes (new data sources, new AI modes, schema changes), please open an issue first to discuss the approach.

---

## 📜 License & Acknowledgments

Built for **Smart India Hackathon 2026** — Problem Statement **SIH25040** (Ministry of Earth Sciences, Government of India).

Real ARGO float oceanographic data provided by [**Ifremer GDAC**](https://data-argo.ifremer.fr) — the global data assembly centre for the international Argo Programme.

The ARGO Programme is part of the [Global Ocean Observing System (GOOS)](https://goosocean.org/).

---

<div align="center">
  <strong>FloatChat</strong> · ARGO Ocean Intelligence · SIH25040<br>
  <sub>Real data. Real science. Real answers.</sub>
</div>
