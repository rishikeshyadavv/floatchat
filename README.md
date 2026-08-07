# FloatChat 🌊 — Conversational AI for ARGO Ocean Data

> **Ask the ocean a question. Get a real answer back.**

FloatChat is an AI-powered, conversational oceanographic query engine that lets anyone — a student, a policymaker, a researcher, or a maritime operator — ask questions about real ARGO float data in plain English and instantly receive SQL results, depth-profile charts, interactive maps, and data provenance.

**Built for Smart India Hackathon 2026 — Problem Statement SIH25040 (Ministry of Earth Sciences)**

🌐 **Live Demo:** [https://floatchat-uo10.onrender.com](https://floatchat-uo10.onrender.com)

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

---

##  Architecture

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
│                         7. Rule-based fallback               │
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

### 3. Run Development Server

```bash
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)**

---

## 💬 Usage Examples

```
Show me the temperature profile of float 2902264
Compare salinity in the Arabian Sea vs Bay of Bengal
Find nearest ARGO floats to lat 12, lon 65
Detect marine heatwaves or thermal anomalies above 29°C
Show oxygen minimum zone (OMZ) profiles near lat 14, lon 67
Plot Chlorophyll-a concentration vs depth
Compare winter vs summer ocean temperature profiles
```

Or click **Categories** in the nav bar to explore all 10 curated query domains.

---

## 🧠 AI Engine & Modes

The SQL Agent (`src/agent.ts`) supports three modes:

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

## 📜 License & Acknowledgments:

Built for **Smart India Hackathon 2026** — Problem Statement **SIH25040** (Ministry of Earth Sciences, Government of India).

Real ARGO float oceanographic data provided by [**Ifremer GDAC**](https://data-argo.ifremer.fr) — the global data assembly centre for the international Argo Programme.

The ARGO Programme is part of the [Global Ocean Observing System (GOOS)](https://goosocean.org/).

---

<div align="center">
  <strong>FloatChat</strong> · ARGO Ocean Intelligence · SIH25040<br>
  <sub>Real data. Real science. Real answers.</sub>
</div>
