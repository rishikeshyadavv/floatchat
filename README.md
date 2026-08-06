# FloatChat 🌊 — Conversational AI for ARGO Ocean Data

FloatChat lets anyone — a student, a policymaker, a maritime operator — ask questions about ocean data in plain English and get real answers back, charts included. No SQL knowledge needed.

It was built for **Smart India Hackathon Problem Statement SIH25040** (Ministry of Earth Sciences), and it runs on **real oceanographic sensor data**, not simulated numbers — pulled directly from the global ARGO float network.

> Ask: *"Show me the temperature profile of float 2902264"*  
> Get: a working SQL query, matching rows, depth-vs-temperature scatter charts, interactive map locations, and data provenance — in seconds.

---

## 🎨 What's New in UI & Intelligence Engine

- **🚀 Dedicated Start Button**: Dedicated query initiation button (`#startBtn`) with auto-population of standard starter prompts.
- **⚡ Organized AI Mode Selector**: Select between 4 distinct AI reasoning modes:
  - **Standard** (`gemini-3.6-flash`) — All-around ocean intelligence & DuckDB SQL translation.
  - **Low Latency** (`gemini-3.1-flash-lite`) — Fast response engine for low-latency queries.
  - **High Thinking** (`gemini-3.6-flash`) — Deep hydrographic reasoning & synthesis.
  - **Search Grounding** (`gemini-3.6-flash`) — Live Google Search grounding for real-time marine science facts.
- **🌙 Dynamic Dark & Light Theme Switching**: Toggle seamlessly between Abyssal Ocean Dark Theme and Crisp Slate Light Theme with persistent `localStorage` preference and adaptive Chart.js/Leaflet themes.
- **📊 Interactive Analytics & Categories**: Explore curated domain categories and long-term oceanographic trend dashboards (OMZ core dips, DCM peaks, depth stratification).
- **🛡️ 1-Click Cloud Deployment**: Built-in `render.yaml` for Render, `Dockerfile.node` for Docker containers, and GitHub Actions CI.

---

## 🏗️ Architecture & How It Works

```
You type a question
        ↓
Interactive SPA Frontend (frontend/index.html — Abyssal Ocean UI & Dark/Light Theme)
        ↓  (POST to /api/query)
Node.js / Express Backend (server.ts)  OR  FastAPI Backend (src/backend/main.py)
        ↓
SQL Agent (src/agent.ts / src/ai/sql_agent.py)
        ↓                              ↓
ChromaDB Vector Store             Redis & Memory Cache
(few-shot query context)         (instant replay of cached queries)
        ↓
Gemini 3.6 Flash / Groq LLM — translates English question to SQL
        ↓
┌─────────────────────────────────────────┐
│  DuckDB Local Database (data/argo_data.db)│
│  ↘                                      │
│  Parquet Gold Layer (data/parquet/gold) │
│  DuckDB reads Parquet directly          │
└─────────────────────────────────────────┘
        ↓
Results returned with data table, Chart.js scatter plots, Leaflet maps, and SHA-256 provenance lineage
```

---

## 🚀 Quick Start & Running Locally

### Prerequisites
- **Node.js**: v18 or v20+
- **Gemini API Key**: Free key from [Google AI Studio](https://aistudio.google.com/)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Edit `.env` and set your keys:
```env
FLOAT_API_KEY=float_secret_key_2026
GEMINI_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here
```

### 3. Run Development Server
```bash
npm run dev
```
Open **http://localhost:3000** in your browser.

---

## ☁️ Deployment Guide

### Option 1: 1-Click Render Deployment (Recommended)
1. Push your code to GitHub.
2. Go to [Render Dashboard](https://dashboard.render.com/) and click **New +** → **Blueprint**.
3. Connect your `floatchat` repository. Render automatically uses [`render.yaml`](file:///d:/DOCUMENTSSS/RISHIKESH/b%20tech/projects/SHI%202026/floatchat.-main/render.yaml) to configure the build and start commands.
4. Set `GEMINI_API_KEY` under Environment Variables and deploy!

### Option 2: Docker Container Deployment
Build and run using [`Dockerfile.node`](file:///d:/DOCUMENTSSS/RISHIKESH/b%20tech/projects/SHI%202026/floatchat.-main/Dockerfile.node):
```bash
# Build Docker image
docker build -f Dockerfile.node -t floatchat:latest .

# Run Docker container
docker run -p 3000:3000 -e GEMINI_API_KEY="your_api_key" floatchat:latest
```

---

## 🧪 Testing & CI/CD Pipeline

FloatChat includes automated TypeScript linting and GitHub Actions CI workflow ([`.github/workflows/ci.yml`](file:///d:/DOCUMENTSSS/RISHIKESH/b%20tech/projects/SHI%202026/floatchat.-main/.github/workflows/ci.yml)):

```bash
# Run TypeScript compilation and lint check
npm run lint

# Audit Python dependencies
pip install -r requirements.txt
pip-audit -r requirements.txt
```

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, DuckDB Native, TypeScript (`tsx`), `@google/genai`
- **Frontend**: HTML5, CSS3 (Vanilla Glassmorphism), Vanilla JS (SPA), Chart.js, Leaflet Maps
- **AI Models**: Gemini 3.6 Flash, Gemini 3.1 Flash-Lite, Google Search Grounding, Groq Llama 3.3-70B
- **Analytics & Storage**: DuckDB, Apache Parquet (Snappy compression), ChromaDB, Redis
- **Infra & CI**: Docker, Render (`render.yaml`), GitHub Actions

---

## 📜 License & Acknowledgments

Built for **Smart India Hackathon 2026** — Problem Statement **SIH25040** (Ministry of Earth Sciences). Real ARGO float dataset provided by Ifremer GDAC.
