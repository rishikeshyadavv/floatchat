import duckdb from 'duckdb';
import path from 'path';
import fs from 'fs';

(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

function convertBigInts(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') {
    return Number(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(convertBigInts);
  }
  if (typeof obj === 'object' && obj.constructor === Object) {
    const res: any = {};
    for (const key of Object.keys(obj)) {
      res[key] = convertBigInts(obj[key]);
    }
    return res;
  }
  return obj;
}

const db = new duckdb.Database(':memory:');
const conn = db.connect();

let isInitialized = false;

export function queryDb<T = any>(sql: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    conn.all(sql, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(convertBigInts(rows) as T[]);
      }
    });
  });
}

export async function initDatabase(): Promise<{ rows: number; floats: number }> {
  if (isInitialized) {
    const res = await queryDb<{ rows: number; floats: number }>(
      'SELECT COUNT(*)::INT as rows, COUNT(DISTINCT float_id)::INT as floats FROM floats'
    );
    return res[0] || { rows: 0, floats: 0 };
  }

  const projectRoot = process.cwd();
  const goldPattern = path.join(projectRoot, 'data', 'parquet', 'gold', 'floats_gold.parquet', '*', '*.parquet');
  const bronzePattern = path.join(projectRoot, 'data', 'parquet', 'bronze', '*.parquet');

  let loaded = false;

  // Try gold layer
  try {
    const goldDir = path.join(projectRoot, 'data', 'parquet', 'gold');
    if (fs.existsSync(goldDir)) {
      await queryDb(`CREATE TABLE floats AS SELECT * FROM read_parquet('${goldPattern.replace(/\\/g, '/')}')`);
      loaded = true;
      console.log('Successfully loaded gold parquet dataset into DuckDB');
    }
  } catch (err) {
    console.warn('Could not load gold parquet dataset:', err);
  }

  // Try bronze layer if gold failed
  if (!loaded) {
    try {
      const bronzeDir = path.join(projectRoot, 'data', 'parquet', 'bronze');
      if (fs.existsSync(bronzeDir)) {
        await queryDb(`CREATE TABLE floats AS SELECT * FROM read_parquet('${bronzePattern.replace(/\\/g, '/')}')`);
        loaded = true;
        console.log('Successfully loaded bronze parquet dataset into DuckDB');
      }
    } catch (err) {
      console.warn('Could not load bronze parquet dataset:', err);
    }
  }

  // Fallback sample data if no parquet files loaded
  if (!loaded) {
    console.log('Creating fallback sample floats table...');
    // Create complete schema for ARGO floats table
    await queryDb(`
      CREATE TABLE floats (
        float_id VARCHAR,
        lat DOUBLE,
        lon DOUBLE,
        date VARCHAR,
        depth DOUBLE,
        temperature DOUBLE,
        salinity DOUBLE,
        region VARCHAR,
        oxygen DOUBLE,
        chlorophyll DOUBLE,
        ph DOUBLE,
        nitrate DOUBLE,
        cdom DOUBLE,
        turbidity DOUBLE,
        float_type VARCHAR,
        qc_flag INT
      )
    `);

    // Scientific profile generator for realistic ARGO floats across Indian Ocean
    const floatMetadata = [
      { id: '2902264', name: 'Arabian Sea Core', region: 'Arabian Sea', lat: 14.2, lon: 66.8, type: 'core', sSurf: 36.25, tSurf: 28.8, omzMin: 14.5 },
      { id: '2902265', name: 'Bay of Bengal BGC', region: 'Bay of Bengal', lat: 15.8, lon: 89.1, type: 'bgc', sSurf: 32.60, tSurf: 29.4, omzMin: 45.0 },
      { id: '2902266', name: 'Equatorial Indian Ocean', region: 'Equatorial', lat: 0.5, lon: 78.2, type: 'core', sSurf: 35.10, tSurf: 29.1, omzMin: 85.0 },
      { id: '2902936', name: 'Lakshadweep Sea BGC', region: 'Arabian Sea', lat: 10.5, lon: 72.4, type: 'bgc', sSurf: 35.80, tSurf: 28.5, omzMin: 22.0 },
      { id: '5904663', name: 'Southern Ocean BGC', region: 'Southern Ocean', lat: -45.2, lon: 58.5, type: 'bgc', sSurf: 34.05, tSurf: 6.8, omzMin: 240.0 },
      { id: '6900186', name: 'Red Sea Outflow Core', region: 'Arabian Sea', lat: 18.5, lon: 61.2, type: 'core', sSurf: 36.80, tSurf: 27.9, omzMin: 18.0 },
      { id: '2902230', name: 'Andaman Sea Core', region: 'Bay of Bengal', lat: 11.2, lon: 93.5, type: 'core', sSurf: 33.10, tSurf: 29.2, omzMin: 60.0 },
      { id: '2903310', name: 'Central Indian Ocean Deep', region: 'Equatorial', lat: -12.4, lon: 80.1, type: 'deep', sSurf: 34.90, tSurf: 27.5, omzMin: 110.0 }
    ];

    const depths = [5, 10, 25, 50, 75, 100, 150, 200, 300, 400, 500, 750, 1000, 1500, 2000];
    const dates = ['2023-01-15', '2023-02-10', '2023-03-20', '2023-04-15'];

    for (const fm of floatMetadata) {
      for (let dateIdx = 0; dateIdx < dates.length; dateIdx++) {
        const dateStr = dates[dateIdx];
        // Float drift simulation across cycles
        const currentLat = Number((fm.lat + dateIdx * 0.15).toFixed(3));
        const currentLon = Number((fm.lon + dateIdx * 0.18).toFixed(3));

        for (const d of depths) {
          // Hydrographic curve modeling: Thermocline, Halocline, OMZ
          let temp = fm.tSurf;
          if (d <= 30) temp = fm.tSurf - (d * 0.01);
          else if (d <= 200) temp = fm.tSurf - 0.3 - (d - 30) * 0.085; // Main thermocline
          else if (d <= 1000) temp = 14.55 - (d - 200) * 0.012;
          else temp = 4.95 - (d - 1000) * 0.0018;
          temp = Number(Math.max(2.1, temp).toFixed(2));

          let sal = fm.sSurf;
          if (d <= 50) sal = fm.sSurf + (d * 0.004);
          else if (d <= 300) sal = fm.sSurf + 0.2 - (d - 50) * 0.0015;
          else if (d <= 1000) sal = 34.85 + (d - 300) * 0.0003;
          else sal = 34.72 - (d - 1000) * 0.00008;
          sal = Number(sal.toFixed(2));

          // Dissolved oxygen (µmol/kg) - OMZ dip between 200m and 800m
          let oxy = 210.0;
          if (d <= 40) oxy = 212.0 - d * 0.1;
          else if (d <= 300) oxy = 208.0 - (d - 40) * (208.0 - fm.omzMin) / 260.0;
          else if (d <= 800) oxy = fm.omzMin + (d - 300) * 0.02;
          else oxy = fm.omzMin + 10.0 + (d - 800) * 0.08;
          oxy = Number(Math.min(260.0, Math.max(8.0, oxy)).toFixed(1));

          // Chlorophyll-a (mg/m³) - DCM (Deep Chlorophyll Maximum) around 50-75m
          let chla = 0.15;
          if (d <= 30) chla = 0.35 + d * 0.01;
          else if (d <= 75) chla = 0.65 + (75 - Math.abs(d - 60)) * 0.02; // Peak at 60m
          else if (d <= 150) chla = 0.40 - (d - 75) * 0.0045;
          else chla = 0.01;
          chla = Number(Math.max(0.005, chla).toFixed(3));

          // pH (NBS scale)
          let ph = Number((8.15 - (d / 2000) * 0.45).toFixed(2));

          // Nitrate (µmol/kg) - Nutrient buildup in deep waters
          let nitrate = d <= 30 ? 0.2 : Number((0.2 + Math.min(32.0, (d / 1000) * 30.0)).toFixed(1));

          // CDOM (ppb) & Turbidity (FTU)
          let cdom = fm.type === 'bgc' ? Number((0.4 + (d <= 100 ? d * 0.005 : 0.5 - d * 0.0002)).toFixed(2)) : null;
          let turbidity = fm.type === 'bgc' ? Number((0.15 + (d <= 50 ? 0.2 : 0.02)).toFixed(2)) : null;

          const oxygenVal = (fm.type === 'bgc' || fm.type === 'core') ? oxy : null;
          const chlaVal = fm.type === 'bgc' ? chla : null;
          const phVal = fm.type === 'bgc' ? ph : null;
          const nitrateVal = fm.type === 'bgc' ? nitrate : null;

          await queryDb(`
            INSERT INTO floats VALUES (
              '${fm.id}', ${currentLat}, ${currentLon}, '${dateStr}', ${d}, ${temp}, ${sal}, '${fm.region}',
              ${oxygenVal ?? 'NULL'}, ${chlaVal ?? 'NULL'}, ${phVal ?? 'NULL'}, ${nitrateVal ?? 'NULL'},
              ${cdom ?? 'NULL'}, ${turbidity ?? 'NULL'}, '${fm.type}', 1
            )
          `);
        }
      }
    }
  }

  isInitialized = true;
  const res = await queryDb<{ rows: number; floats: number }>(
    'SELECT COUNT(*)::INT as rows, COUNT(DISTINCT float_id)::INT as floats FROM floats'
  );
  return res[0] || { rows: 0, floats: 0 };
}
