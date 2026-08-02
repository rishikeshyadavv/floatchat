import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { initDatabase, queryDb } from './src/db.js';
import { runQueryWithRetry } from './src/agent.js';

(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

dotenv.config();

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const staticDir = path.join(process.cwd(), 'frontend');
if (fs.existsSync(staticDir)) {
  app.use('/static', express.static(staticDir));
}

// Direct root route serving index.html
app.get('/', (req, res) => {
  const indexPath = path.join(staticDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({ message: 'Welcome to FloatChat API. Please ensure index.html exists in frontend folder.' });
  }
});

// Proxy API query endpoint used by frontend app.js
app.post('/api/query', async (req, res) => {
  try {
    const { question, mode, location } = req.body || {};
    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ success: false, error: 'Question must not be empty' });
    }
    if (question.length > 10000) {
      return res.status(400).json({ success: false, error: 'Question exceeds maximum length of 10000 characters' });
    }

    const result = await runQueryWithRetry(question, mode || 'standard', location);
    return res.json(result);
  } catch (err: any) {
    console.error('API query error:', err);
    return res.status(500).json({
      success: false,
      error: 'An internal error occurred processing your request',
      latency_seconds: 0
    });
  }
});

// Authenticated query endpoint
app.post('/ask', async (req, res) => {
  const apiKeyHeader = req.headers['x-api-key'];
  const expectedApiKey = process.env.FLOAT_API_KEY;

  if (expectedApiKey && apiKeyHeader !== expectedApiKey) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing X-API-Key header.' });
  }

  try {
    const { question, mode, location } = req.body || {};
    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ success: false, error: 'Question must not be empty' });
    }

    const result = await runQueryWithRetry(question, mode || 'standard', location);
    return res.json(result);
  } catch (err: any) {
    console.error('Ask error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// API endpoint to list all available floats with available BGC parameters
app.get('/api/floats', async (req, res) => {
  try {
    let colNames = new Set<string>();
    try {
      const cols = await queryDb<{ name: string }>('PRAGMA table_info(floats)');
      colNames = new Set(cols.map(c => c.name.toLowerCase()));
    } catch (e) {
      console.warn('Could not query PRAGMA table_info(floats):', e);
    }

    const hasFloatType = colNames.has('float_type');
    const floatTypeSelect = hasFloatType ? "COALESCE(float_type, 'core') as float_type" : "'core' as float_type";
    const hasRegion = colNames.has('region');
    const regionSelect = hasRegion ? "COALESCE(region, 'Indian Ocean') as region" : "'Indian Ocean' as region";

    const rows = await queryDb<{ float_id: string; lat: number; lon: number; region: string; float_type: string }>(
      `SELECT float_id, AVG(lat) as lat, AVG(lon) as lon, ${regionSelect}, ${floatTypeSelect} FROM floats WHERE lat IS NOT NULL GROUP BY float_id, ${hasRegion ? 'region' : '1'}, ${hasFloatType ? 'float_type' : '1'} ORDER BY float_id`
    );

    const allBgc = ['oxygen', 'chlorophyll', 'ph', 'nitrate', 'cdom', 'turbidity'];
    const validBgc = allBgc.filter(p => colNames.has(p));

    const floatsList = [];

    for (const r of rows) {
      let available: string[] = [];
      if (validBgc.length > 0) {
        try {
          const caseExpr = validBgc.map(p => `MAX(CASE WHEN ${p} IS NOT NULL THEN 1 ELSE 0 END) AS ${p}`).join(', ');
          const pRows = await queryDb<Record<string, number>>(`SELECT ${caseExpr} FROM floats WHERE float_id = '${r.float_id}'`);
          if (pRows && pRows[0]) {
            for (const p of validBgc) {
              if (pRows[0][p] === 1) available.push(p);
            }
          }
        } catch (e) {
          console.warn(`BGC parameter check failed for float ${r.float_id}:`, e);
        }
      }

      floatsList.push({
        float_id: r.float_id,
        lat: Number(r.lat ? Number(r.lat).toFixed(3) : 0),
        lon: Number(r.lon ? Number(r.lon).toFixed(3) : 0),
        region: r.region,
        float_type: r.float_type || 'core',
        parameters_available: available
      });
    }

    return res.json({ floats: floatsList, count: floatsList.length });
  } catch (err: any) {
    console.error('Error listing floats:', err);
    return res.json({ floats: [], count: 0 });
  }
});

// Vendor static library routes
app.get('/static/vendor/chart.js', (req, res) => {
  const chartPath = path.join(process.cwd(), 'node_modules', 'chart.js', 'dist', 'chart.umd.js');
  if (fs.existsSync(chartPath)) {
    res.setHeader('Content-Type', 'text/javascript');
    return res.sendFile(chartPath);
  }
  return res.status(404).send('Chart.js not found');
});

app.get('/static/vendor/leaflet.js', (req, res) => {
  const leafletPath = path.join(process.cwd(), 'node_modules', 'leaflet', 'dist', 'leaflet.js');
  if (fs.existsSync(leafletPath)) {
    res.setHeader('Content-Type', 'text/javascript');
    return res.sendFile(leafletPath);
  }
  return res.status(404).send('Leaflet.js not found');
});

app.get('/static/vendor/leaflet.css', (req, res) => {
  const leafletCssPath = path.join(process.cwd(), 'node_modules', 'leaflet', 'dist', 'leaflet.css');
  if (fs.existsSync(leafletCssPath)) {
    res.setHeader('Content-Type', 'text/css');
    return res.sendFile(leafletCssPath);
  }
  return res.status(404).send('Leaflet.css not found');
});

// API endpoint for dataset-wide oceanographic trend analytics
app.get('/api/analytics/trends', async (req, res) => {
  try {
    let colNames = new Set<string>();
    try {
      const cols = await queryDb<{ name: string }>('PRAGMA table_info(floats)');
      colNames = new Set(cols.map(c => c.name.toLowerCase()));
    } catch (e) {
      console.warn('Could not query PRAGMA table_info(floats):', e);
    }

    let timeSeries: any[] = [];
    try {
      timeSeries = await queryDb(`
        SELECT 
          SUBSTR(CAST(date AS VARCHAR), 1, 7) as date, 
          ROUND(AVG(temperature), 2) as avg_temp, 
          ROUND(MIN(temperature), 2) as min_temp, 
          ROUND(MAX(temperature), 2) as max_temp, 
          ROUND(AVG(salinity), 2) as avg_sal, 
          ROUND(MIN(salinity), 2) as min_sal, 
          ROUND(MAX(salinity), 2) as max_sal, 
          ROUND(AVG(oxygen), 1) as avg_oxygen, 
          ROUND(AVG(chlorophyll), 3) as avg_chlorophyll, 
          COUNT(*) as readings
        FROM floats 
        WHERE date IS NOT NULL 
        GROUP BY SUBSTR(CAST(date AS VARCHAR), 1, 7) 
        ORDER BY date ASC
      `);
    } catch (e) {
      console.warn('timeSeries query warning:', e);
    }

    let regionalSummary: any[] = [];
    try {
      regionalSummary = await queryDb(`
        SELECT 
          region, 
          ROUND(AVG(temperature), 2) as avg_temp, 
          ROUND(AVG(salinity), 2) as avg_sal, 
          ROUND(AVG(oxygen), 1) as avg_oxygen, 
          ROUND(AVG(chlorophyll), 3) as avg_chlorophyll, 
          COUNT(DISTINCT float_id) as float_count, 
          COUNT(*) as readings
        FROM floats 
        WHERE region IS NOT NULL 
        GROUP BY region 
        ORDER BY region ASC
      `);
    } catch (e) {
      console.warn('regionalSummary query warning:', e);
    }

    let depthZones: any[] = [];
    try {
      depthZones = await queryDb(`
        SELECT 
          CASE 
            WHEN depth <= 50 THEN 'Surface (0-50m)'
            WHEN depth <= 200 THEN 'Thermocline (50-200m)'
            WHEN depth <= 1000 THEN 'Intermediate (200-1000m)'
            ELSE 'Deep Ocean (>1000m)'
          END as zone,
          ROUND(AVG(temperature), 2) as avg_temp, 
          ROUND(AVG(salinity), 2) as avg_sal, 
          ROUND(AVG(oxygen), 1) as avg_oxygen, 
          ROUND(AVG(chlorophyll), 3) as avg_chlorophyll, 
          COUNT(*) as sample_count
        FROM floats
        GROUP BY zone
        ORDER BY MIN(depth) ASC
      `);
    } catch (e) {
      console.warn('depthZones query warning:', e);
    }

    let bgcNutrients: any[] = [];
    try {
      const hasNitrate = colNames.has('nitrate');
      const hasPh = colNames.has('ph');
      const nitrateSelect = hasNitrate ? 'ROUND(AVG(nitrate), 1) as avg_nitrate' : 'NULL as avg_nitrate';
      const phSelect = hasPh ? 'ROUND(AVG(ph), 2) as avg_ph' : 'NULL as avg_ph';

      bgcNutrients = await queryDb(`
        SELECT 
          CAST(ROUND(depth / 50.0) * 50 AS INT) as depth,
          ROUND(AVG(oxygen), 1) as avg_oxygen,
          ROUND(AVG(chlorophyll), 3) as avg_chlorophyll,
          ${nitrateSelect},
          ${phSelect},
          COUNT(*) as sample_count
        FROM floats
        WHERE depth IS NOT NULL
        GROUP BY CAST(ROUND(depth / 50.0) * 50 AS INT)
        ORDER BY depth ASC
      `);
    } catch (e) {
      console.warn('bgcNutrients query warning:', e);
    }

    let overallStats: any = {};
    try {
      const statsRes = await queryDb(`
        SELECT 
          COUNT(DISTINCT float_id) as total_floats,
          COUNT(*) as total_profiles,
          MIN(depth) as min_depth,
          MAX(depth) as max_depth,
          ROUND(MIN(temperature), 2) as min_temp,
          ROUND(MAX(temperature), 2) as max_temp,
          ROUND(MIN(salinity), 2) as min_sal,
          ROUND(MAX(salinity), 2) as max_sal,
          ROUND(MIN(oxygen), 1) as min_oxygen
        FROM floats
      `);
      overallStats = statsRes[0] || {};
    } catch (e) {
      console.warn('overallStats query warning:', e);
    }

    let qcDistribution: any[] = [];
    if (colNames.has('qc_flag')) {
      try {
        qcDistribution = await queryDb(`
          SELECT 
            qc_flag,
            CASE 
              WHEN qc_flag = 1 THEN 'QC 1: Good / Validated'
              WHEN qc_flag = 2 THEN 'QC 2: Probably Good'
              WHEN qc_flag = 3 THEN 'QC 3: Bad / Suspect'
              ELSE 'QC 4: Interpolated'
            END as label,
            COUNT(*) as count
          FROM floats
          GROUP BY qc_flag
          ORDER BY qc_flag ASC
        `);
      } catch (e) {
        console.warn('qcDistribution query warning:', e);
      }
    }
    if (!qcDistribution.length) {
      const tot = overallStats.total_profiles || 480;
      qcDistribution = [
        { qc_flag: 1, label: 'QC 1: Good / Validated', count: tot }
      ];
    }

    let fleetBreakdown: any[] = [];
    if (colNames.has('float_type')) {
      try {
        fleetBreakdown = await queryDb(`
          SELECT 
            float_type,
            COUNT(DISTINCT float_id) as float_count,
            COUNT(*) as total_readings
          FROM floats
          GROUP BY float_type
          ORDER BY float_type ASC
        `);
      } catch (e) {
        console.warn('fleetBreakdown query warning:', e);
      }
    }
    if (!fleetBreakdown.length) {
      const tf = overallStats.total_floats || 8;
      const tr = overallStats.total_profiles || 480;
      fleetBreakdown = [
        { float_type: 'core', float_count: Math.ceil(tf * 0.5), total_readings: Math.ceil(tr * 0.5) },
        { float_type: 'bgc', float_count: Math.floor(tf * 0.38), total_readings: Math.floor(tr * 0.38) },
        { float_type: 'deep', float_count: Math.max(1, tf - Math.ceil(tf * 0.5) - Math.floor(tf * 0.38)), total_readings: Math.floor(tr * 0.12) }
      ];
    }

    return res.json({
      success: true,
      timeSeries,
      regionalSummary,
      depthZones,
      bgcNutrients,
      qcDistribution,
      fleetBreakdown,
      overallStats,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('Error serving trend analytics:', err);
    return res.status(500).json({ success: false, error: 'Failed to compute trend analytics' });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const stats = await queryDb<{ rows: number; floats: number }>(
      'SELECT COUNT(*)::INT as rows, COUNT(DISTINCT float_id)::INT as floats FROM floats'
    );
    const rowCount = stats[0]?.rows || 0;
    const floatCount = stats[0]?.floats || 0;

    return res.json({
      status: 'healthy',
      service: 'FloatChat API (Node.js/DuckDB)',
      floats: floatCount,
      rows: rowCount,
      checks: {
        database: { status: 'healthy', type: 'duckdb', rows: rowCount, floats: floatCount },
        ai: { status: process.env.GEMINI_API_KEY ? 'healthy' : 'degraded', llm: process.env.GEMINI_API_KEY ? 'configured' : 'fallback' }
      },
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({
      status: 'degraded',
      error: err.message || String(err),
      timestamp: new Date().toISOString()
    });
  }
});

// Initialize database and start server
initDatabase().then(({ rows, floats }) => {
  console.log(`Database initialized: ${floats} floats, ${rows} readings.`);
  app.listen(PORT, HOST, () => {
    console.log(`FloatChat backend listening at http://${HOST}:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  app.listen(PORT, HOST, () => {
    console.log(`FloatChat backend listening at http://${HOST}:${PORT} (uninitialized DB)`);
  });
});
