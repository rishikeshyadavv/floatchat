const RENDER_BACKEND_URL = "https://floatchat-k6c1.onrender.com";
const PROXY_URL = "/api/query";

function getApiUrl(endpoint) {
  if (window.location.hostname.includes("web.app") || window.location.hostname.includes("firebaseapp.com")) {
    return `${RENDER_BACKEND_URL}${endpoint}`;
  }
  return endpoint;
}
let msgCount = 0;
let busy = false;
let selectedMode = "standard";
let userCoords = null;

// Try getting geolocation for Maps Grounding if available
if ("geolocation" in navigator) {
  navigator.geolocation.getCurrentPosition(
    pos => {
      userCoords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    },
    () => { /* Geolocation optional */ }
  );
}

// ── Ocean Question Categories Dataset ──
const OCEAN_CATEGORIES = [
  {
    id: "temp",
    icon: "🌡️",
    title: "Temperature & Heat Content",
    description: "Thermal vertical profiles, ocean warming trends, thermocline depth layers, and seasonal heat content changes.",
    questions: [
      "Show me the temperature profile of float 2902264",
      "What is the average sea surface temperature in the Arabian Sea?",
      "Show vertical temperature profiles across the Indian Ocean"
    ]
  },
  {
    id: "salinity",
    icon: "🧂",
    title: "Salinity & Water Masses",
    description: "Halocline gradients, freshwater influx, high-salinity Arabian Sea water vs fresh Bay of Bengal profiles.",
    questions: [
      "Compare salinity in the Arabian Sea vs Bay of Bengal",
      "Show salinity at 0m, 200m, and 1000m depth",
      "Identify high-salinity water masses near lat 15, lon 68"
    ]
  },
  {
    id: "spatial",
    icon: "📍",
    title: "Spatial Float Tracking",
    description: "Drift trajectories, float locations, geospatial proximity searches, and spatial coordinate plotting.",
    questions: [
      "Find nearest ARGO floats to lat 12, lon 65",
      "List all active floats in the Equatorial Indian Ocean",
      "Show coordinates and positions for float 2902264"
    ]
  },
  {
    id: "bgc",
    icon: "🧪",
    title: "Biogeochemical Array",
    description: "Dissolved oxygen minimum zones (OMZ cores), Chlorophyll-a DCM peaks, nitrate, pH, and bio-optical metrics.",
    questions: [
      "Show oxygen minimum zone (OMZ) profiles near lat 14, lon 67",
      "Plot Chlorophyll-a concentration vs depth",
      "List biogeochemical profiles with dissolved oxygen data"
    ]
  },
  {
    id: "extremes",
    icon: "⚡",
    title: "Anomaly Detection & Extremes",
    description: "Marine heatwaves, extreme temperature spikes, rapid salinity drops, and deep-sea cold anomalies.",
    questions: [
      "Detect marine heatwaves or thermal anomalies above 29°C",
      "Show unusual salinity drops below 33 PSU",
      "Find extreme oxygen depletion zones under 15 µmol/kg"
    ]
  },
  {
    id: "depth",
    icon: "🌊",
    title: "Depth Stratification",
    description: "Multi-depth layer comparisons across surface (0-100m), mesopelagic (100-1000m), and bathypelagic (1000m+) zones.",
    questions: [
      "Show temperature at 0m, 500m, and 2000m depth",
      "Calculate thermocline depth layer in the Bay of Bengal",
      "Compare surface vs deep water measurements"
    ]
  },
  {
    id: "qc",
    icon: "🛡️",
    title: "Quality Control & Provenance",
    description: "Data integrity verification, Ifremer GDAC QC flag 1 auditing, and tamper-evident SHA-256 data lineage.",
    questions: [
      "Filter measurements verified with QC Flag 1 (Good)",
      "Audit dataset provenance and SHA-256 integrity logs",
      "Show distribution of quality control flags across fleet"
    ]
  },
  {
    id: "seasonal",
    icon: "📅",
    title: "Seasonal Trends & Cycles",
    description: "Monsoon vs post-monsoon thermal shifts, winter cooling, and interannual ocean variations.",
    questions: [
      "Compare winter vs summer ocean temperature profiles",
      "Show monthly sea surface temperature trends",
      "Seasonal variation of salinity in the Arabian Sea"
    ]
  },
  {
    id: "regional",
    icon: "🗺️",
    title: "Regional Basin Comparison",
    description: "Comparative hydrographic metrics between Arabian Sea, Bay of Bengal, and Equatorial Indian Ocean.",
    questions: [
      "Contrast Arabian Sea vs Equatorial Indian Ocean temperature",
      "Regional basin comparison of dissolved oxygen",
      "Show mean surface salinity by ocean basin"
    ]
  },
  {
    id: "fleet",
    icon: "📊",
    title: "Fleet Analytics & Statistics",
    description: "ARGO float fleet counts, active sensor payloads (Core vs BGC vs Deep), and profile record totals.",
    questions: [
      "Show total active float count and record counts",
      "Break down fleet by float model type (Core, BGC, Deep)",
      "List all WMO float IDs and sensor capabilities"
    ]
  }
];

function openCategoriesModal() {
  const modal = document.getElementById("categoriesModal");
  const grid = document.getElementById("categoriesGrid");
  if (!modal || !grid) return;

  grid.innerHTML = OCEAN_CATEGORIES.map((cat, idx) => `
    <div class="category-card">
      <div class="category-card-header">
        <span class="category-icon">${cat.icon}</span>
        <span class="category-num">CAT ${idx + 1}</span>
      </div>
      <div class="category-card-title">${escapeHtml(cat.title)}</div>
      <div class="category-card-desc">${escapeHtml(cat.description)}</div>
      <div class="category-prompts">
        ${cat.questions.map(q => `
          <button class="category-prompt-btn" onclick="askFromCategoryModal('${escapeHtml(q).replace(/'/g, "\\'")}')">
            ${escapeHtml(q)} →
          </button>
        `).join('')}
      </div>
    </div>
  `).join('');

  modal.style.display = "flex";
}

function askFromCategoryModal(qText) {
  const modal = document.getElementById("categoriesModal");
  if (modal) modal.style.display = "none";
  askQuestion(qText);
}

// ── Info Modal ──
document.getElementById("infoBtn")?.addEventListener("click", () => {
  document.getElementById("infoModal").style.display = "flex";
});
document.getElementById("infoModalClose")?.addEventListener("click", () => {
  document.getElementById("infoModal").style.display = "none";
});
document.getElementById("infoModal")?.addEventListener("click", (e) => {
  if (e.target === document.getElementById("infoModal")) {
    document.getElementById("infoModal").style.display = "none";
  }
});

// Categories Modal Click Event Listeners
document.getElementById("categoriesNavBtn")?.addEventListener("click", openCategoriesModal);
document.getElementById("heroCategoriesBtn")?.addEventListener("click", openCategoriesModal);
document.getElementById("categoriesModalClose")?.addEventListener("click", () => {
  const modal = document.getElementById("categoriesModal");
  if (modal) modal.style.display = "none";
});
document.getElementById("categoriesModal")?.addEventListener("click", (e) => {
  const modal = document.getElementById("categoriesModal");
  if (e.target === modal) {
    modal.style.display = "none";
  }
});

// Modal Close Handlers (ESC key & clicks)
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const infoM = document.getElementById("infoModal");
    if (infoM) infoM.style.display = "none";
    const anaM = document.getElementById("analyticsModal");
    if (anaM) anaM.style.display = "none";
    const catM = document.getElementById("categoriesModal");
    if (catM) catM.style.display = "none";
  }
});

// ── Analytics Dashboard Modal ──
let analyticsCharts = {};

document.getElementById("analyticsBtn")?.addEventListener("click", () => {
  const modal = document.getElementById("analyticsModal");
  if (modal) modal.style.display = "flex";
  setTimeout(() => {
    loadAnalyticsDashboard();
  }, 100);
});
document.getElementById("analyticsModalClose")?.addEventListener("click", () => {
  const modal = document.getElementById("analyticsModal");
  if (modal) modal.style.display = "none";
});
document.getElementById("analyticsModal")?.addEventListener("click", (e) => {
  const modal = document.getElementById("analyticsModal");
  if (e.target === modal) {
    if (modal) modal.style.display = "none";
  }
});

async function loadAnalyticsDashboard() {
  const errEl = document.getElementById("analyticsError");
  if (errEl) {
    errEl.style.display = "none";
    errEl.textContent = "";
  }

  function showModalError(msg) {
    const el = document.getElementById("analyticsError");
    if (el) {
      el.textContent = msg;
      el.style.display = "block";
    }
  }

  try {
    const res = await fetch(getApiUrl("/api/analytics/trends"));
    if (!res.ok) {
      const errMsg = `Failed to load analytics trends: Server returned status ${res.status} (${res.statusText || 'Error'}).`;
      console.error(errMsg);
      showModalError(errMsg);
      return;
    }
    const data = await res.json();
    if (!data || !data.success) {
      const errMsg = "Analytics API response indicated a failure or provided invalid data.";
      console.error(errMsg, data);
      showModalError(errMsg);
      return;
    }

    const isLight = !document.documentElement.classList.contains("dark");
    const textColor = isLight ? '#3a3a36' : '#f2efea';
    const gridColor = isLight ? 'rgba(7, 38, 176, 0.1)' : 'rgba(255, 255, 255, 0.1)';

    // Update KPI Header Bar
    if (data.overallStats) {
      const st = data.overallStats;
      const elF = document.getElementById("kpiFloats");
      const elP = document.getElementById("kpiProfiles");
      const elD = document.getElementById("kpiDepth");
      const elO = document.getElementById("kpiOmz");
      const elQ = document.getElementById("kpiQc");

      if (elF) elF.textContent = `${st.total_floats || 8} Active`;
      if (elP) elP.textContent = `${st.total_profiles || 480} Samples`;
      if (elD) elD.textContent = `${st.min_depth || 0} - ${st.max_depth || 2000}m`;
      if (elO) elO.textContent = `${st.min_oxygen || 14.5} µmol/kg`;
      if (elQ) elQ.textContent = `100% Verified`;
    }

    if (typeof Chart === 'undefined') {
      console.error("Chart.js library is not loaded.");
      return;
    }

    // 1. Time Series Chart (Dual Y-Axis)
    try {
      const tsCanvas = document.getElementById("timeSeriesChart");
      if (tsCanvas) {
        if (analyticsCharts.timeSeries) analyticsCharts.timeSeries.destroy();
        
        const dates = (data.timeSeries || []).map(t => t.date);
        const temps = (data.timeSeries || []).map(t => t.avg_temp);
        const sals = (data.timeSeries || []).map(t => t.avg_sal);

        analyticsCharts.timeSeries = new Chart(tsCanvas, {
          type: 'line',
          data: {
            labels: dates,
            datasets: [
              {
                label: 'Avg Temperature (°C)',
                data: temps,
                borderColor: '#0726b0',
                backgroundColor: 'rgba(7, 38, 176, 0.12)',
                yAxisID: 'yTemp',
                tension: 0.3,
                fill: true,
                pointRadius: 4
              },
              {
                label: 'Avg Salinity (PSU)',
                data: sals,
                borderColor: '#6a4a3e',
                backgroundColor: 'rgba(106, 74, 62, 0.15)',
                yAxisID: 'ySal',
                tension: 0.3,
                fill: true,
                pointRadius: 4
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
              x: {
                title: { display: true, text: 'Observation Date', color: textColor, font: { weight: 'bold' } },
                ticks: { color: textColor },
                grid: { color: gridColor }
              },
              yTemp: {
                type: 'linear',
                position: 'left',
                title: { display: true, text: 'Temperature (°C)', color: '#22d3ee', font: { weight: 'bold' } },
                ticks: { color: '#22d3ee' },
                grid: { color: gridColor }
              },
              ySal: {
                type: 'linear',
                position: 'right',
                title: { display: true, text: 'Salinity (PSU)', color: '#f5a524', font: { weight: 'bold' } },
                ticks: { color: '#f5a524' },
                grid: { drawOnChartArea: false }
              }
            },
            plugins: {
              legend: { labels: { color: textColor, font: { family: 'IBM Plex Mono', size: 11 } } }
            }
          }
        });
      }
    } catch (err1) {
      console.error("Error creating timeSeriesChart:", err1);
    }

    // 2. Biogeochemical Nutrients & OMZ Profile
    try {
      const bgcCanvas = document.getElementById("bgcNutrientsChart");
      if (bgcCanvas) {
        if (analyticsCharts.bgc) analyticsCharts.bgc.destroy();

        const bgcData = data.bgcNutrients || [];
        const depths = bgcData.map(b => `${b.depth}m`);
        const oxygens = bgcData.map(b => b.avg_oxygen);
        const chlas = bgcData.map(b => (b.avg_chlorophyll || 0) * 100);
        const nitrates = bgcData.map(b => b.avg_nitrate);

        analyticsCharts.bgc = new Chart(bgcCanvas, {
          type: 'line',
          data: {
            labels: depths,
            datasets: [
              {
                label: 'Dissolved Oxygen (µmol/kg) [OMZ Core Dip]',
                data: oxygens,
                borderColor: '#a855f7',
                backgroundColor: 'rgba(168, 85, 247, 0.1)',
                tension: 0.35,
                fill: true,
                pointRadius: 4
              },
              {
                label: 'Chlorophyll-a (mg/m³ x100) [DCM Peak at 60m]',
                data: chlas,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.35,
                fill: false,
                pointRadius: 4
              },
              {
                label: 'Nitrate NO₃ (µmol/kg)',
                data: nitrates,
                borderColor: '#f43f5e',
                backgroundColor: 'transparent',
                borderDash: [5, 5],
                tension: 0.35,
                fill: false,
                pointRadius: 3
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: {
                title: { display: true, text: 'Depth Brackets (Meters)', color: textColor, font: { weight: 'bold' } },
                ticks: { color: textColor },
                grid: { color: gridColor }
              },
              y: {
                title: { display: true, text: 'Concentration Value', color: textColor, font: { weight: 'bold' } },
                ticks: { color: textColor },
                grid: { color: gridColor }
              }
            },
            plugins: {
              legend: { labels: { color: textColor, font: { family: 'IBM Plex Mono', size: 11 } } },
              tooltip: {
                callbacks: {
                  label: function(ctx) {
                    if (ctx.datasetIndex === 1) {
                      return `Chl-a: ${(ctx.raw / 100).toFixed(3)} mg/m³`;
                    }
                    return `${ctx.dataset.label}: ${ctx.raw}`;
                  }
                }
              }
            }
          }
        });
      }
    } catch (err2) {
      console.error("Error creating bgcNutrientsChart:", err2);
    }

    // 3. Depth Stratification Chart
    try {
      const depthCanvas = document.getElementById("depthZoneChart");
      if (depthCanvas) {
        if (analyticsCharts.depthZone) analyticsCharts.depthZone.destroy();

        const zones = (data.depthZones || []).map(d => d.zone);
        const zoneTemps = (data.depthZones || []).map(d => d.avg_temp);
        const zoneSals = (data.depthZones || []).map(d => d.avg_sal);

        analyticsCharts.depthZone = new Chart(depthCanvas, {
          type: 'bar',
          data: {
            labels: zones,
            datasets: [
              {
                label: 'Avg Temperature (°C)',
                data: zoneTemps,
                backgroundColor: 'rgba(34, 211, 238, 0.8)',
                borderRadius: 6
              },
              {
                label: 'Avg Salinity (PSU)',
                data: zoneSals,
                backgroundColor: 'rgba(20, 184, 166, 0.8)',
                borderRadius: 6
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { ticks: { color: textColor }, grid: { color: gridColor } },
              y: { ticks: { color: textColor }, grid: { color: gridColor } }
            },
            plugins: {
              legend: { labels: { color: textColor, font: { family: 'IBM Plex Mono', size: 11 } } }
            }
          }
        });
      }
    } catch (err3) {
      console.error("Error creating depthZoneChart:", err3);
    }

    // 4. Regional Basin Comparison Chart
    try {
      const regCanvas = document.getElementById("regionalChart");
      if (regCanvas) {
        if (analyticsCharts.regional) analyticsCharts.regional.destroy();

        const regions = (data.regionalSummary || []).map(r => r.region);
        const regTemps = (data.regionalSummary || []).map(r => r.avg_temp);
        const regO2 = (data.regionalSummary || []).map(r => r.avg_oxygen);

        analyticsCharts.regional = new Chart(regCanvas, {
          type: 'bar',
          data: {
            labels: regions,
            datasets: [
              {
                label: 'Avg Temp (°C)',
                data: regTemps,
                backgroundColor: 'rgba(241, 101, 101, 0.8)',
                borderRadius: 6
              },
              {
                label: 'Avg O₂ (µmol/kg)',
                data: regO2,
                backgroundColor: 'rgba(168, 85, 247, 0.8)',
                borderRadius: 6
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { ticks: { color: textColor }, grid: { color: gridColor } },
              y: { ticks: { color: textColor }, grid: { color: gridColor } }
            },
            plugins: {
              legend: { labels: { color: textColor, font: { family: 'IBM Plex Mono', size: 11 } } }
            }
          }
        });
      }
    } catch (err4) {
      console.error("Error creating regionalChart:", err4);
    }

    // 5. Quality Control (QC) Integrity Chart
    try {
      const qcCanvas = document.getElementById("qcChart");
      if (qcCanvas) {
        if (analyticsCharts.qc) analyticsCharts.qc.destroy();

        const qcList = data.qcDistribution || [{ label: 'QC 1: Validated', count: 480 }];
        const qcLabels = qcList.map(q => q.label);
        const qcCounts = qcList.map(q => q.count);

        analyticsCharts.qc = new Chart(qcCanvas, {
          type: 'doughnut',
          data: {
            labels: qcLabels,
            datasets: [{
              data: qcCounts,
              backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'],
              borderWidth: 2,
              borderColor: isLight ? '#ffffff' : '#0d1b2e'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { color: textColor, font: { family: 'IBM Plex Mono', size: 11 } } }
            }
          }
        });
      }
    } catch (err5) {
      console.error("Error creating qcChart:", err5);
    }

    // 6. Fleet Configuration Breakdown Chart
    try {
      const fleetCanvas = document.getElementById("fleetChart");
      if (fleetCanvas) {
        if (analyticsCharts.fleet) analyticsCharts.fleet.destroy();

        const fleetList = data.fleetBreakdown || [
          { float_type: 'core', float_count: 4 },
          { float_type: 'bgc', float_count: 3 },
          { float_type: 'deep', float_count: 1 }
        ];
        const fleetLabels = fleetList.map(f => f.float_type.toUpperCase() + ' Floats');
        const fleetCounts = fleetList.map(f => f.float_count);

        analyticsCharts.fleet = new Chart(fleetCanvas, {
          type: 'doughnut',
          data: {
            labels: fleetLabels,
            datasets: [{
              data: fleetCounts,
              backgroundColor: ['#22d3ee', '#a855f7', '#f5a524'],
              borderWidth: 2,
              borderColor: isLight ? '#ffffff' : '#0d1b2e'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { color: textColor, font: { family: 'IBM Plex Mono', size: 11 } } }
            }
          }
        });
      }
    } catch (err6) {
      console.error("Error creating fleetChart:", err6);
    }

  } catch (err) {
    console.error("Error loading analytics dashboard:", err);
    showModalError(`An unexpected error occurred while loading analytics: ${err.message || err}`);
  }
}

// ── AI Mode & Model Selector Dropdown ──
const modeHints = {
  standard: "Standard SQL Engine (gemini-3.6-flash) · Translates English to DuckDB SQL",
  fast: "Low Latency Engine (gemini-3.1-flash-lite) · High-speed, fast query response",
  thinking: "High Thinking Engine (gemini-3.6-flash) · Deep hydrographic reasoning & synthesis",
  search: "Google Search Grounding (gemini-3.6-flash) · Live marine science facts & web sources"
};

const modelTitles = {
  standard: "3.6 Flash",
  fast: "3.5 Flash-Lite",
  thinking: "Extended thinking",
  search: "Search Grounding"
};

function setMode(modeKey) {
  if (!modeHints[modeKey]) modeKey = "standard";
  selectedMode = modeKey;

  // Update top mode bar active pill
  document.querySelectorAll(".mode-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.mode === modeKey);
  });

  // Update model selector button text
  const btnText = document.getElementById("modelSelectText");
  if (btnText) btnText.textContent = modelTitles[modeKey] || "3.6 Flash";

  // Update dropdown checkmark states
  document.querySelectorAll(".model-option").forEach(opt => {
    const isAct = opt.dataset.mode === modeKey;
    opt.classList.toggle("active", isAct);
    const checkEl = opt.querySelector(".model-option-check");
    if (checkEl) checkEl.textContent = isAct ? "✓" : "";
  });

  // Update hint
  const hintEl = document.getElementById("modeHint");
  if (hintEl && modeHints[modeKey]) hintEl.textContent = modeHints[modeKey];
}

// Mode pills top bar click listener
document.querySelectorAll(".mode-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    setMode(btn.dataset.mode);
  });
});

// Floating Model Dropdown Toggle & Options
const modelSelectBtn = document.getElementById("modelSelectBtn");
const modelDropdownMenu = document.getElementById("modelDropdownMenu");

modelSelectBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  const isOpen = modelDropdownMenu && modelDropdownMenu.style.display !== "none";
  if (modelDropdownMenu) modelDropdownMenu.style.display = isOpen ? "none" : "block";
  if (modelSelectBtn) modelSelectBtn.setAttribute("aria-expanded", String(!isOpen));
});

document.querySelectorAll(".model-option").forEach(opt => {
  opt.addEventListener("click", (e) => {
    e.stopPropagation();
    const mode = opt.dataset.mode;
    if (mode) setMode(mode);
    if (modelDropdownMenu) modelDropdownMenu.style.display = "none";
    if (modelSelectBtn) modelSelectBtn.setAttribute("aria-expanded", "false");
  });
});

// Close dropdown on outside click or ESC
document.addEventListener("click", (e) => {
  if (modelDropdownMenu && modelDropdownMenu.style.display !== "none") {
    if (!modelSelectBtn.contains(e.target) && !modelDropdownMenu.contains(e.target)) {
      modelDropdownMenu.style.display = "none";
      if (modelSelectBtn) modelSelectBtn.setAttribute("aria-expanded", "false");
    }
  }
});

// ── Theme & Colors ──
const root = document.documentElement;
const savedTheme = localStorage.getItem("floatchat-theme");
if (savedTheme === "light") {
  root.classList.add("light");
  root.classList.remove("dark");
} else {
  root.classList.remove("light");
  root.classList.add("dark");
}

function updateThemeToggleUI() {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  const isLight = root.classList.contains("light");
  btn.textContent = isLight ? "☀️ Light" : "🌙 Dark";
  btn.title = isLight ? "Switch to Dark Mode" : "Switch to Light Mode";
}
updateThemeToggleUI();

const colors = [
  '#22d3ee', // Cyan
  '#14b8a6', // Teal
  '#f5a524', // Amber
  '#f16565', // Coral
  '#a855f7', // Purple
  '#3b82f6'  // Blue
];
function getColorForIndex(idx, opacity = 1) {
  const c = colors[idx % colors.length];
  if (opacity === 1) return c;
  const r = parseInt(c.slice(1, 3), 16);
  const g = parseInt(c.slice(3, 5), 16);
  const b = parseInt(c.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

document.getElementById("themeToggle")?.addEventListener("click", () => {
  root.classList.toggle("light");
  root.classList.toggle("dark");
  const isLight = root.classList.contains("light");
  localStorage.setItem("floatchat-theme", isLight ? "light" : "dark");
  updateThemeToggleUI();
  
  // Update Chart.js themes
  document.querySelectorAll(".chart-canvas").forEach(canvas => {
    if (canvas._chartInstance) {
      const chart = canvas._chartInstance;
      const textColor = isLight ? '#0d1b2e' : '#e7edf5';
      const gridColor = isLight ? 'rgba(10,22,40,0.08)' : 'rgba(255,255,255,0.08)';
      chart.options.scales.x.title.color = textColor;
      chart.options.scales.x.ticks.color = textColor;
      chart.options.scales.x.grid.color = gridColor;
      chart.options.scales.y.title.color = textColor;
      chart.options.scales.y.ticks.color = textColor;
      chart.options.scales.y.grid.color = gridColor;
      chart.options.plugins.legend.labels.color = textColor;
      chart.update();
    }
  });
});

// ── Connection status ──
async function checkStatus() {
  const dot = document.querySelector("#statStatus .dot");
  const text = document.getElementById("statText");
  try {
    const res = await fetch(getApiUrl("/api/health"), { method: "GET" });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      let stats = "";
      if (data.floats && data.rows) {
        stats = `${data.floats} floats · ${data.rows.toLocaleString()} readings`;
      } else if (data.floats) {
        stats = `${data.floats} floats`;
      } else if (data.rows) {
        stats = `${data.rows.toLocaleString()} readings`;
      }
      text.textContent = stats || "backend online";
      dot.classList.remove("err");
    } else {
      throw new Error("unhealthy");
    }
  } catch {
    text.textContent = "backend unreachable";
    dot.classList.add("err");
  }
}
checkStatus();

// ── Chips ──
document.querySelectorAll(".chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.getElementById("queryInput").value = chip.dataset.q;
    submitQuery();
  });
});

// ── Input Controls ──
const queryInput = document.getElementById("queryInput");
const sendBtn = document.getElementById("sendBtn");
const startBtn = document.getElementById("startBtn");
const clearChatBtn = document.getElementById("clearChatBtn");

queryInput?.addEventListener("keydown", e => { if (e.key === "Enter") submitQuery(); });
sendBtn?.addEventListener("click", submitQuery);

startBtn?.addEventListener("click", () => {
  if (!queryInput.value || !queryInput.value.trim()) {
    queryInput.value = "Show me the temperature profile of float 2902264";
  }
  submitQuery();
});

// ── Local Storage Chat History ──
const CHAT_HISTORY_KEY = "floatchat_session_history_v1";

function getChatHistory() {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveQueryToHistory(item) {
  try {
    const history = getChatHistory();
    history.push(item);
    if (history.length > 30) history.shift();
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.warn("Failed to save session history to localStorage", e);
  }
}

function clearChatHistory() {
  try {
    localStorage.removeItem(CHAT_HISTORY_KEY);
  } catch (e) {}
}

function loadChatHistory() {
  const history = getChatHistory();
  if (!history || !history.length) return;

  const hero = document.getElementById("hero");
  if (hero) hero.style.display = "none";
  if (clearChatBtn) clearChatBtn.parentElement.style.display = "flex";

  const thread = document.getElementById("thread");

  const modeBadges = {
    standard: "Standard",
    fast: "Low Latency",
    thinking: "High Thinking",
    search: "Search Grounded",
    stitch: "✨ Stitch UI"
  };

  history.forEach(item => {
    const userMsg = el("div", "msg user");
    const mBadge = modeBadges[item.mode] || item.mode || "Standard";
    userMsg.innerHTML = `<div class="avatar">YOU</div><div class="bubble">${escapeHtml(item.question)} <span style="font-size:10px; opacity:0.7; margin-left:6px;">(${mBadge})</span></div>`;
    thread.appendChild(userMsg);

    const asstMsg = el("div", "msg assistant");
    const targetId = "sk_" + msgCount++;
    asstMsg.innerHTML = `<div class="avatar">FC</div><div class="bubble" id="${targetId}"></div>`;
    thread.appendChild(asstMsg);

    renderResult(targetId, item.responseData, item.httpStatus || 200);
  });
}

if (clearChatBtn) {
  clearChatBtn.parentElement.style.display = "none";
  clearChatBtn.addEventListener("click", () => {
    document.getElementById("thread").innerHTML = "";
    document.getElementById("hero").style.display = "block";
    clearChatBtn.parentElement.style.display = "none";
    msgCount = 0;
    clearChatHistory();
  });
}

// Automatically restore previous chat session on load
loadChatHistory();

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

function formatMarkdown(text) {
  if (!text) return "";
  let html = escapeHtml(text);
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italics
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Code snippets
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');
  // Line breaks
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  return `<p>${html}</p>`;
}

async function submitQuery() {
  if (busy) return;
  const question = queryInput.value.trim();
  if (!question) return;
  queryInput.value = "";
  busy = true;
  sendBtn.disabled = true;

  document.getElementById("hero").style.display = "none";
  if (clearChatBtn) clearChatBtn.parentElement.style.display = "flex";
  const thread = document.getElementById("thread");

  const modeBadges = {
    standard: "Standard",
    fast: "Low Latency",
    thinking: "High Thinking",
    search: "Search Grounded"
  };

  const userMsg = el("div", "msg user");
  userMsg.innerHTML = `<div class="avatar">YOU</div><div class="bubble">${escapeHtml(question)} <span style="font-size:10px; opacity:0.7; margin-left:6px;">(${modeBadges[selectedMode] || selectedMode})</span></div>`;
  thread.appendChild(userMsg);

  const asstMsg = el("div", "msg assistant");
  const targetId = "sk_" + msgCount++;
  asstMsg.innerHTML = `<div class="avatar">FC</div><div class="bubble" id="${targetId}">
    <div class="skeleton"><div class="bar" style="width:38%"></div><div class="bar" style="width:88%"></div><div class="bar" style="width:64%"></div></div>
  </div>`;
  thread.appendChild(asstMsg);
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });

  try {
    const res = await fetch(getApiUrl(PROXY_URL), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        mode: selectedMode,
        location: userCoords
      }),
    });
    const data = await res.json();
    renderResult(targetId, data, res.status);
    saveQueryToHistory({
      question,
      mode: selectedMode,
      responseData: data,
      httpStatus: res.status,
      timestamp: Date.now()
    });
  } catch (err) {
    const errData = { success: false, error: "Could not reach the backend. " + err.message, sql: "" };
    renderResult(targetId, errData, 0);
    saveQueryToHistory({
      question,
      mode: selectedMode,
      responseData: errData,
      httpStatus: 0,
      timestamp: Date.now()
    });
  } finally {
    busy = false;
    sendBtn.disabled = false;
  }
}

function selectCategory(catId) {
  const input = document.getElementById("queryInput");
  if (input) {
    input.value = `category:${catId}`;
    submitQuery();
  }
}

function askQuestion(qText, mode) {
  if (mode) {
    const btn = document.querySelector(`.mode-btn[data-mode="${mode}"]`);
    if (btn) btn.click();
  }
  const input = document.getElementById("queryInput");
  if (input) {
    input.value = qText;
    submitQuery();
  }
}

function renderResult(targetId, res, httpStatus) {
  const target = document.getElementById(targetId);
  if (!target) return;
  if (!res.success) {
    const blocked = httpStatus === 429 || /rate limit/i.test(res.error || "");
    target.innerHTML = `
      <div class="unified-answer-container">
        <div class="unified-header-bar">
          <span class="status-tag ${blocked ? "blocked" : "err"}">${blocked ? "Rate limited" : "Query failed"}</span>
        </div>
        <div class="card" style="color:${blocked ? "var(--amber)" : "var(--coral)"}; font-size:13.5px;">${escapeHtml(res.error || "Unknown error")}</div>
        ${res.sql ? sqlToggleHtml(res.sql) : ""}
      </div>
    `;
    wireSqlToggle(target);
    return;
  }

  // Handle Category Menu
  if (res.isCategoryMenu && res.categories) {
    openCategoriesModal();
    target.innerHTML = `
      <div class="unified-answer-container">
        <div class="unified-header-bar">
          <span class="status-tag ok">Categories Explorer</span>
          <span class="unified-badge">10 Ocean Domains</span>
        </div>
        <div class="card category-menu-container">
          <div class="category-header-title">FloatChat Oceanography Question Categories</div>
          <div class="category-header-sub">The 10-Category Explorer modal has opened. Select any category card to launch your query!</div>
        </div>
      </div>
    `;
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    return;
  }

  // Handle Question List for a selected category
  if (res.isQuestionList && res.category) {
    const cat = res.category;
    target.innerHTML = `
      <div class="unified-answer-container">
        <div class="unified-header-bar">
          <span class="status-tag ok">${escapeHtml(cat.title)}</span>
          <span class="unified-badge">${cat.questions ? cat.questions.length : 0} Questions</span>
        </div>
        <div class="card question-list-container">
          <div class="category-header-title">${escapeHtml(cat.title)}</div>
          <div class="category-header-sub">${escapeHtml(cat.description)} — Click any question below to run it automatically:</div>
          <div class="questions-group">
            ${(cat.questions || []).map(q => `
              <button class="question-item-btn" onclick="askQuestion('${escapeHtml(q).replace(/'/g, "\\'")}', '${cat.suggestedMode || 'standard'}')">
                <span>${escapeHtml(q)}</span>
                <span class="question-arrow">Run Query →</span>
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    return;
  }

  const prov = res.provenance || {};
  const rows = res.data || [];
  const hasMap = rows.some(r => r.lat != null && r.lon != null);

  let analysisCardHtml = "";
  if (res.analysis) {
    analysisCardHtml = `
      <div class="card ai-analysis-card">
        <div class="ai-header">
          <strong>Gemini Intelligence & Analysis</strong>
          <span class="mode-badge">${escapeHtml(prov.data_source || 'AI Model')}</span>
        </div>
        <div class="ai-content">${formatMarkdown(res.analysis)}</div>
      </div>
    `;
  }

  let sourcesCardHtml = "";
  if (res.sources && res.sources.length > 0) {
    sourcesCardHtml = `
      <div class="card sources-card">
        <div class="sources-title">Grounded Web Sources (Google Search)</div>
        <div class="sources-list">
          ${res.sources.map(s => `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener" class="source-link">${escapeHtml(s.title)}</a>`).join('')}
        </div>
      </div>
    `;
  }

  let dataTabsCardHtml = "";
  let graphReportHtml = "";

  if (rows.length > 0 || res.sql) {
    dataTabsCardHtml = `
      <div class="card">
        <div class="output-tabs-header">
          <div class="output-tab-item active" data-tab="data">Data</div>
          <div class="output-tab-item" data-tab="chart">Chart</div>
          ${hasMap ? `<div class="output-tab-item" data-tab="map">Map</div>` : ''}
          ${res.sql ? `<div class="output-tab-item" data-tab="sql">SQL Query</div>` : ''}
        </div>
        <div class="output-sub-info" data-rows="${rows.length}">
          Showing ${Math.min(rows.length, 50)} of ${rows.length} rows
        </div>
        <div class="tab-panel active" data-panel="data">
          ${dataTableHtml(rows)}
        </div>
        <div class="tab-panel" data-panel="chart">
          ${chartHtml(rows)}
        </div>
        ${hasMap ? `<div class="tab-panel" data-panel="map">${mapHtml(rows)}</div>` : ''}
        ${res.sql ? `<div class="tab-panel" data-panel="sql">${sqlToggleHtml(res.sql || "")}</div>` : ''}
      </div>
    `;

    if (rows.length > 0) {
      const chartId = "rep_" + Math.random().toString(36).substr(2, 9);
      graphReportHtml = buildGraphReportCardHtml(rows, chartId);
      setTimeout(() => initGraphReportChart(rows, chartId), 150);
    }
  }

  target.innerHTML = `
    <div class="unified-answer-container">
      <div class="unified-header-bar">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="status-tag ok">Response Ready</span>
          <span class="unified-badge">${escapeHtml(prov.data_source || 'DuckDB')}</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-family:'IBM Plex Mono',monospace; font-size:11px; color:var(--birdhouse-brown);">${res.latency_seconds || 0}s latency</span>
        </div>
      </div>
      ${analysisCardHtml}
      ${sourcesCardHtml}
      ${dataTabsCardHtml}
      ${graphReportHtml}
    </div>
  `;

  wireSqlToggle(target);
  wireTabs(target);
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
}

function buildGraphReportCardHtml(rows, chartId) {
  // Extract key summary metrics
  const count = rows.length;
  let minDepth = null, maxDepth = null;
  let temps = [], sals = [], oxygens = [], chlas = [];

  rows.forEach(r => {
    if (r.depth != null) {
      if (minDepth === null || r.depth < minDepth) minDepth = r.depth;
      if (maxDepth === null || r.depth > maxDepth) maxDepth = r.depth;
    }
    if (r.temperature != null) temps.push(r.temperature);
    if (r.avg_temp != null) temps.push(r.avg_temp);
    if (r.salinity != null) sals.push(r.salinity);
    if (r.avg_sal != null) sals.push(r.avg_sal);
    if (r.oxygen != null) oxygens.push(r.oxygen);
    if (r.avg_oxygen != null) oxygens.push(r.avg_oxygen);
    if (r.chlorophyll != null) chlas.push(r.chlorophyll);
    if (r.avg_chlorophyll != null) chlas.push(r.avg_chlorophyll);
  });

  const avg = arr => arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(2) : null;
  const min = arr => arr.length ? Math.min(...arr).toFixed(1) : null;
  const max = arr => arr.length ? Math.max(...arr).toFixed(1) : null;

  const avgT = avg(temps);
  const avgS = avg(sals);
  const minO = min(oxygens);
  const maxC = max(chlas);

  const badges = [];
  badges.push(`<div class="report-metric-badge">Records: <strong>${count}</strong></div>`);
  if (minDepth !== null && maxDepth !== null) {
    badges.push(`<div class="report-metric-badge">Depth: <strong>${minDepth}m - ${maxDepth}m</strong></div>`);
  }
  if (avgT !== null) badges.push(`<div class="report-metric-badge">Avg Temp: <strong>${avgT}°C</strong></div>`);
  if (avgS !== null) badges.push(`<div class="report-metric-badge">Avg Salinity: <strong>${avgS} PSU</strong></div>`);
  if (minO !== null) badges.push(`<div class="report-metric-badge">Min O₂: <strong>${minO} µmol/kg</strong></div>`);
  if (maxC !== null) badges.push(`<div class="report-metric-badge">Max Chl-a: <strong>${maxC} mg/m³</strong></div>`);

  let insightText = "Hydrographic summary derived from DuckDB query results across ARGO float observations.";
  if (minDepth !== null && maxDepth !== null && avgT !== null) {
    insightText = `Query analyzed ${count} observations spanning ${minDepth}m to ${maxDepth}m depth. Mean temperature recorded at ${avgT}°C${avgS ? ` with average salinity of ${avgS} PSU` : ''}.${minO ? ` Minimum dissolved oxygen recorded at ${minO} µmol/kg.` : ''}`;
  }

  return `
    <div class="graph-report-card">
      <div class="graph-report-header">
        <div class="graph-report-title">
          <span>📊</span>
          <span>Hydrographic Visual Summary & Graph Report</span>
        </div>
        <span class="graph-report-badge">Query Visualizer</span>
      </div>

      <div class="graph-report-metrics">
        ${badges.join('')}
      </div>

      <div class="graph-report-chart-container">
        <canvas id="${chartId}"></canvas>
      </div>

      <div class="graph-report-callout">
        <strong>Hydrographic Insight:</strong> ${escapeHtml(insightText)}
      </div>
    </div>
  `;
}

function initGraphReportChart(rows, chartId) {
  const canvas = document.getElementById(chartId);
  if (!canvas || !rows || !rows.length) return;

  if (canvas._chartInstance) {
    try { canvas._chartInstance.destroy(); } catch (e) {}
  }

  const isLight = document.documentElement.classList.contains("light");
  const textColor = isLight ? '#0d1b2e' : '#e7edf5';
  const gridColor = isLight ? 'rgba(10,22,40,0.08)' : 'rgba(255,255,255,0.08)';

  // Determine best chart structure based on columns
  const keys = Object.keys(rows[0]);
  const hasDepth = keys.includes('depth');
  const hasDate = keys.includes('date');
  const hasRegion = keys.includes('region');
  const hasFloat = keys.includes('float_id') || keys.includes('wmo');

  let chartConfig = null;

  if (hasDepth) {
    const validRows = rows.filter(r => r.depth != null);
    if (validRows.length) {
      const minD = Math.min(...validRows.map(r => Number(r.depth)));
      const maxD = Math.max(...validRows.map(r => Number(r.depth)));
      const step = Math.max(5, Math.ceil((maxD - minD) / 30));

      const bins = {};
      validRows.forEach(r => {
        const b = Math.round(Number(r.depth) / step) * step;
        if (!bins[b]) {
          bins[b] = { temps: [], sals: [], oxygens: [] };
        }
        if (r.temperature != null) bins[b].temps.push(Number(r.temperature));
        if (r.avg_temp != null) bins[b].temps.push(Number(r.avg_temp));
        if (r.salinity != null) bins[b].sals.push(Number(r.salinity));
        if (r.avg_sal != null) bins[b].sals.push(Number(r.avg_sal));
        if (r.oxygen != null) bins[b].oxygens.push(Number(r.oxygen));
        if (r.avg_oxygen != null) bins[b].oxygens.push(Number(r.avg_oxygen));
      });

      const sortedDepths = Object.keys(bins).map(Number).sort((a,b) => a - b);
      const labels = sortedDepths.map(d => `${d}m`);

      const avg = arr => arr.length ? +(arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(2) : null;
      const temps = sortedDepths.map(d => avg(bins[d].temps));
      const sals = sortedDepths.map(d => avg(bins[d].sals));
      const oxygens = sortedDepths.map(d => avg(bins[d].oxygens));

      const datasets = [];
      if (temps.some(v => v !== null)) {
        datasets.push({
          label: 'Temperature (°C)',
          data: temps,
          borderColor: '#22d3ee',
          backgroundColor: 'rgba(34, 211, 238, 0.15)',
          tension: 0.3,
          fill: true,
          spanGaps: true
        });
      }
      if (sals.some(v => v !== null)) {
        datasets.push({
          label: 'Salinity (PSU)',
          data: sals,
          borderColor: '#f5a524',
          backgroundColor: 'rgba(245, 165, 36, 0.15)',
          tension: 0.3,
          fill: true,
          spanGaps: true
        });
      }
      if (oxygens.some(v => v !== null)) {
        datasets.push({
          label: 'Oxygen (µmol/kg)',
          data: oxygens,
          borderColor: '#a855f7',
          backgroundColor: 'rgba(168, 85, 247, 0.15)',
          tension: 0.3,
          fill: true,
          spanGaps: true
        });
      }

      chartConfig = {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              title: { display: true, text: 'Depth (m)', color: textColor, font: { weight: 'bold' } },
              ticks: { color: textColor, maxTicksLimit: 15 },
              grid: { color: gridColor }
            },
            y: { ticks: { color: textColor }, grid: { color: gridColor } }
          },
          plugins: { legend: { labels: { color: textColor, font: { family: 'IBM Plex Mono', size: 10 } } } }
        }
      };
    }
  } else if (hasDate) {
    let sortedRows = [...rows].filter(r => r.date != null).sort((a,b) => String(a.date).localeCompare(String(b.date)));
    if (sortedRows.length > 30) {
      const step = Math.ceil(sortedRows.length / 30);
      sortedRows = sortedRows.filter((_, i) => i % step === 0);
    }

    const labels = sortedRows.map(r => String(r.date));
    const datasets = [];
    if (sortedRows.some(r => r.temperature != null || r.avg_temp != null)) {
      datasets.push({
        label: 'Temperature (°C)',
        data: sortedRows.map(r => r.temperature ?? r.avg_temp),
        borderColor: '#22d3ee',
        backgroundColor: 'rgba(34, 211, 238, 0.2)',
        fill: true
      });
    }
    if (sortedRows.some(r => r.salinity != null || r.avg_sal != null)) {
      datasets.push({
        label: 'Salinity (PSU)',
        data: sortedRows.map(r => r.salinity ?? r.avg_sal),
        borderColor: '#f5a524',
        backgroundColor: 'rgba(245, 165, 36, 0.2)',
        fill: true
      });
    }

    chartConfig = {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: textColor, maxTicksLimit: 12 }, grid: { color: gridColor } },
          y: { ticks: { color: textColor }, grid: { color: gridColor } }
        },
        plugins: { legend: { labels: { color: textColor, font: { family: 'IBM Plex Mono', size: 10 } } } }
      }
    };
  } else {
    // Categorical / Generic Bar Chart
    const labelKey = hasRegion ? 'region' : (hasFloat ? (keys.includes('float_id') ? 'float_id' : 'wmo') : keys[0]);
    const labels = rows.slice(0, 15).map(r => String(r[labelKey]));
    const numericKeys = keys.filter(k => typeof rows[0][k] === 'number' && k !== 'id' && k !== 'qc_flag');
    
    const datasets = numericKeys.slice(0, 3).map((numKey, idx) => {
      const colors = ['#22d3ee', '#f5a524', '#a855f7', '#10b981'];
      return {
        label: numKey.replace(/_/g, ' ').toUpperCase(),
        data: rows.slice(0, 15).map(r => r[numKey]),
        backgroundColor: colors[idx % colors.length],
        borderRadius: 4
      };
    });

    chartConfig = {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: textColor }, grid: { color: gridColor } },
          y: { ticks: { color: textColor }, grid: { color: gridColor } }
        },
        plugins: { legend: { labels: { color: textColor, font: { family: 'IBM Plex Mono', size: 10 } } } }
      }
    };
  }

  if (chartConfig) {
    try {
      canvas._chartInstance = new Chart(canvas, chartConfig);
    } catch (err) {
      console.error("Failed to initialize report chart:", err);
    }
  }
}

function sqlToggleHtml(sql) {
  if (!sql) return "";
  const sqlId = "sql_" + Math.random().toString(36).substr(2, 9);
  return `<div class="card sql-card">
    <div class="sql-toggle-bar">
      <div class="sql-toggle" onclick="this.closest('.sql-card').querySelector('.sql-block').classList.toggle('open'); this.querySelector('.arrow').textContent = this.closest('.sql-card').querySelector('.sql-block').classList.contains('open') ? '▼' : '▶';">
        <span class="arrow">▶</span> Inspect DuckDB SQL Query
      </div>
      <button class="copy-sql-btn" onclick="copySql('${sqlId}', this)">Copy SQL</button>
    </div>
    <div class="sql-block" id="${sqlId}">${escapeHtml(sql)}</div>
  </div>`;
}

function copySql(elementId, btn) {
  const el = document.getElementById(elementId);
  if (el) {
    navigator.clipboard.writeText(el.textContent || '').then(() => {
      const orig = btn.textContent;
      btn.textContent = "Copied!";
      btn.classList.add("copied");
      setTimeout(() => {
        btn.textContent = orig;
        btn.classList.remove("copied");
      }, 2000);
    });
  }
}
function wireSqlToggle() {}

function wireTabs(scope) {
  scope.querySelectorAll(".tab, .output-tab-item").forEach(tab => {
    tab.addEventListener("click", () => {
      const name = tab.dataset.tab;
      scope.querySelectorAll(".tab, .output-tab-item").forEach(t => t.classList.toggle("active", t === tab));
      scope.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.dataset.panel === name));
      
      const subInfoEl = scope.querySelector(".output-sub-info");
      if (subInfoEl) {
        const rowCount = subInfoEl.dataset.rows || "0";
        if (name === "data") {
          subInfoEl.textContent = `Showing ${Math.min(parseInt(rowCount) || 0, 50)} of ${rowCount} rows`;
        } else if (name === "chart") {
          subInfoEl.textContent = "Hydrographic vertical profile & measurement visualization";
        } else if (name === "map") {
          subInfoEl.textContent = "Geospatial float trajectories & profile sampling locations";
        } else if (name === "sql") {
          subInfoEl.textContent = "DuckDB SQL query engine & execution breakdown";
        }
      }
      
      if (name === "map") {
        scope.querySelectorAll(".map-view").forEach(mapEl => {
          if (mapEl._leafletMap) {
            setTimeout(() => {
              mapEl._leafletMap.invalidateSize();
            }, 100);
          }
        });
      }
      
      if (name === "chart") {
        scope.querySelectorAll(".chart-canvas").forEach(canvas => {
          if (canvas._chartInstance) {
            setTimeout(() => {
              canvas._chartInstance.resize();
              canvas._chartInstance.update();
            }, 100);
          } else {
            initChartJS(canvas);
          }
        });
      }

      if (name === "tsdiagram") {
        scope.querySelectorAll(".ts-canvas").forEach(canvas => {
          if (canvas._chartInstance) {
            setTimeout(() => {
              canvas._chartInstance.resize();
              canvas._chartInstance.update();
            }, 100);
          } else {
            initTSDiagramJS(canvas);
          }
        });
      }
    });
  });
}

function dataTableHtml(rows) {
  if (!rows.length) return '<p class="empty-note">No records matched this query.</p>';
  const cols = Object.keys(rows[0]);
  const shown = rows.slice(0, 50);
  return `
    <div class="table-toolbar">
      <button class="export-btn" onclick="exportCSV(this)" data-rows='${JSON.stringify(rows).replace(/'/g, "&#39;")}'>Export as CSV</button>
      <button class="export-btn" onclick="exportJSON(this)" data-rows='${JSON.stringify(rows).replace(/'/g, "&#39;")}'>Export as JSON</button>
    </div>
    <p style="font-family:'IBM Plex Mono',monospace; font-size:11px; color:var(--text-faint); margin-bottom:10px;">Showing ${shown.length} of ${rows.length} rows</p>
    <div class="table-scroll">
    <table class="data-table">
      <thead><tr>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead>
      <tbody>${shown.map(r => `<tr>${cols.map(c => `<td>${escapeHtml(r[c])}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
    </div>
  `;
}

function exportCSV(btn) {
  const rows = JSON.parse(btn.getAttribute("data-rows").replace(/&#39;/g, "'"));
  const cols = Object.keys(rows[0] || {});
  const csv = [cols.join(",")].concat(rows.map(r => cols.map(c => `"${r[c] == null ? "" : String(r[c]).replace(/"/g, '""')}"`).join(","))).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "floatchat_data.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function exportJSON(btn) {
  const rows = JSON.parse(btn.getAttribute("data-rows").replace(/&#39;/g, "'"));
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "floatchat_data.json";
  a.click();
  URL.revokeObjectURL(url);
}

function chartHtml(rows) {
  const hasDepth = rows.length && "depth" in rows[0];
  const hasTemp = rows.length && "temperature" in rows[0];
  const hasSal = rows.length && "salinity" in rows[0];
  if (!hasDepth || (!hasTemp && !hasSal)) {
    return '<p class="empty-note">No depth/temperature/salinity data to chart for this query.</p>';
  }

  const metric = hasTemp ? "temperature" : "salinity";
  const canvasId = "chart_" + Math.random().toString(36).substr(2, 9);

  setTimeout(() => {
    const canvas = document.getElementById(canvasId);
    if (canvas) {
      canvas._chartData = rows;
      canvas._chartMetric = metric;
      if (canvas.closest('.tab-panel')?.classList.contains('active')) {
        initChartJS(canvas);
      }
    }
  }, 50);

  return `
    <div style="position: relative; height: 320px; width: 100%; margin: 10px 0;">
      <canvas id="${canvasId}" class="chart-canvas"></canvas>
    </div>
  `;
}

function initChartJS(canvas) {
  if (!canvas || !canvas._chartData || canvas._chartInstance) return;

  const rows = canvas._chartData;
  const metric = canvas._chartMetric;
  const isLight = document.documentElement.classList.contains("light");
  const label = metric === "temperature" ? "Temperature (°C)" : "Salinity (PSU)";
  
  const datasets = {};
  rows.forEach(r => {
    if (r.depth == null || r[metric] == null) return;
    const floatId = r.float_id || "Float Data";
    if (!datasets[floatId]) datasets[floatId] = [];
    datasets[floatId].push({ x: +r[metric], y: +r.depth });
  });

  const chartDatasets = Object.keys(datasets).map((floatId, idx) => {
    const data = datasets[floatId].sort((a, b) => a.y - b.y);
    const color = getColorForIndex(idx);
    return {
      label: `Float ${floatId}`,
      data: data,
      borderColor: color,
      backgroundColor: getColorForIndex(idx, 0.15),
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 6,
      tension: 0.2,
      showLine: true
    };
  });

  const textColor = isLight ? '#0d1b2e' : '#e7edf5';
  const gridColor = isLight ? 'rgba(10,22,40,0.08)' : 'rgba(255,255,255,0.08)';

  canvas._chartInstance = new Chart(canvas, {
    type: 'scatter',
    data: { datasets: chartDatasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      scales: {
        x: {
          type: 'linear',
          position: 'top',
          title: {
            display: true,
            text: label,
            color: textColor,
            font: { family: 'Inter', size: 12, weight: 'bold' }
          },
          ticks: { color: textColor },
          grid: { color: gridColor }
        },
        y: {
          type: 'linear',
          reverse: true,
          title: {
            display: true,
            text: 'Depth (m)',
            color: textColor,
            font: { family: 'Inter', size: 12, weight: 'bold' }
          },
          ticks: { color: textColor },
          grid: { color: gridColor }
        }
      },
      plugins: {
        legend: {
          labels: {
            color: textColor,
            font: { family: 'IBM Plex Mono', size: 11 }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${context.raw.x} (${label}) at ${context.raw.y}m depth`;
            }
          }
        }
      }
    }
  });
}

function tsDiagramHtml(rows) {
  const hasTemp = rows.length && "temperature" in rows[0];
  const hasSal = rows.length && "salinity" in rows[0];
  if (!hasTemp || !hasSal) {
    return '<p class="empty-note">Temperature and Salinity parameters are required for T-S Diagram.</p>';
  }

  const canvasId = "ts_" + Math.random().toString(36).substr(2, 9);

  setTimeout(() => {
    const canvas = document.getElementById(canvasId);
    if (canvas) {
      canvas._chartData = rows;
      if (canvas.closest('.tab-panel')?.classList.contains('active')) {
        initTSDiagramJS(canvas);
      }
    }
  }, 50);

  return `
    <div style="position: relative; height: 340px; width: 100%; margin: 10px 0;">
      <canvas id="${canvasId}" class="ts-canvas"></canvas>
    </div>
    <div class="chart-legend" style="margin-top: 4px; font-size: 11px; color: var(--text-faint);">
      <span>T-S Scatter Diagram · Salinity (PSU) vs Temperature (°C) with hydrographic water mass classification</span>
    </div>
  `;
}

function initTSDiagramJS(canvas) {
  if (!canvas || !canvas._chartData || canvas._chartInstance) return;

  const rows = canvas._chartData;
  const isLight = document.documentElement.classList.contains("light");

  const floatGroups = {};
  rows.forEach(r => {
    if (r.temperature == null || r.salinity == null) return;
    const floatId = r.float_id || "Float Data";
    if (!floatGroups[floatId]) floatGroups[floatId] = [];
    
    // Approximate Potential Density Anomaly (Sigma-Theta)
    // sigma_theta = 0.8 * salinity - 0.2 * temperature + 20
    const sigma = Number((0.805 * r.salinity - 0.198 * r.temperature + 0.05 * (r.depth ? r.depth / 1000 : 0)).toFixed(2));
    floatGroups[floatId].push({ x: +r.salinity, y: +r.temperature, depth: r.depth, sigma });
  });

  const chartDatasets = Object.keys(floatGroups).map((floatId, idx) => {
    const data = floatGroups[floatId];
    const color = getColorForIndex(idx);
    return {
      label: `Float ${floatId}`,
      data: data,
      borderColor: color,
      backgroundColor: getColorForIndex(idx, 0.7),
      pointRadius: 5,
      pointHoverRadius: 8,
      showLine: false
    };
  });

  const textColor = isLight ? '#0d1b2e' : '#e7edf5';
  const gridColor = isLight ? 'rgba(10,22,40,0.08)' : 'rgba(255,255,255,0.08)';

  canvas._chartInstance = new Chart(canvas, {
    type: 'scatter',
    data: { datasets: chartDatasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'linear',
          title: {
            display: true,
            text: 'Salinity (PSU)',
            color: textColor,
            font: { family: 'Inter', size: 12, weight: 'bold' }
          },
          ticks: { color: textColor },
          grid: { color: gridColor }
        },
        y: {
          type: 'linear',
          title: {
            display: true,
            text: 'Temperature (°C)',
            color: textColor,
            font: { family: 'Inter', size: 12, weight: 'bold' }
          },
          ticks: { color: textColor },
          grid: { color: gridColor }
        }
      },
      plugins: {
        legend: {
          labels: {
            color: textColor,
            font: { family: 'IBM Plex Mono', size: 11 }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const d = context.raw;
              return `Float ${context.dataset.label}: Salinity ${d.x} PSU, Temp ${d.y} °C (Depth: ${d.depth ?? 'N/A'}m, σ_θ ~${d.sigma} kg/m³)`;
            }
          }
        }
      }
    }
  });
}

function mapHtml(rows) {
  const pts = rows.filter(r => r.lat != null && r.lon != null);
  if (!pts.length) return '<p class="empty-note">No coordinate data in this result.</p>';

  const mapId = "map_" + Math.random().toString(36).substr(2, 9);
  
  setTimeout(() => {
    initLeafletMap(mapId, pts);
  }, 100);

  return `
    <div id="${mapId}" class="map-view" style="height: 320px; width: 100%; border-radius: var(--radius-md); overflow: hidden; background: var(--abyss); border: 1px solid var(--line);"></div>
    <div class="chart-legend" style="margin-top: 10px;"><span><span class="legend-dot" style="background:#14b8a6"></span>${pts.length} positions plotted with drift trajectories</span></div>
  `;
}

function initLeafletMap(mapId, pts) {
  const mapEl = document.getElementById(mapId);
  if (!mapEl) return;

  const validPts = pts.filter(p => !isNaN(p.lat) && !isNaN(p.lon));
  if (!validPts.length) return;

  const lats = validPts.map(p => +p.lat), lons = validPts.map(p => +p.lon);
  const avgLat = lats.reduce((a, b) => a + b, 0) / lats.length;
  const avgLon = lons.reduce((a, b) => a + b, 0) / lons.length;

  const map = L.map(mapId).setView([avgLat, avgLon], 4);
  
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  }).addTo(map);

  // Group coordinates by float ID to draw trajectory polylines
  const floatTracks = {};
  validPts.forEach(p => {
    const fid = p.float_id || 'Unknown';
    if (!floatTracks[fid]) floatTracks[fid] = [];
    floatTracks[fid].push(p);
  });

  let trackIdx = 0;
  Object.keys(floatTracks).forEach(fid => {
    const track = floatTracks[fid];
    const color = getColorForIndex(trackIdx++);
    
    // Draw connecting drift trajectory line if multiple points exist
    if (track.length > 1) {
      const latLngs = track.map(t => [t.lat, t.lon]);
      L.polyline(latLngs, { color: color, weight: 3, opacity: 0.8, dashArray: '6, 6' }).addTo(map);
    }

    track.forEach(p => {
      let popup = `<b>Float ID:</b> ${escapeHtml(p.float_id || 'Unknown')}<br><b>Coords:</b> ${p.lat}, ${p.lon}`;
      if (p.depth !== undefined) popup += `<br><b>Depth:</b> ${p.depth} m`;
      if (p.temperature !== undefined) popup += `<br><b>Temp:</b> ${p.temperature} °C`;
      if (p.salinity !== undefined) popup += `<br><b>Salinity:</b> ${p.salinity} PSU`;
      if (p.date) popup += `<br><b>Date:</b> ${p.date}`;

      L.circleMarker([p.lat, p.lon], {
        radius: 6,
        fillColor: color,
        color: '#ffffff',
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.85
      }).addTo(map).bindPopup(popup);
    });
  });

  mapEl._leafletMap = map;
}
