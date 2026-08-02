const MEASUREMENT_PATTERNS: [RegExp, string][] = [
  [/\bdissolved oxygen\b|\boxygen\b|\bdo concentration\b/i, 'oxygen'],
  [/\bchlorophyll-a?\b|\bchlorophyll\b|\bchla\b|\bchl\b/i, 'chlorophyll'],
  [/\bnitrate\b|\bno3\b/i, 'nitrate'],
  [/\bph\b/i, 'ph'],
  [/\bcdom\b/i, 'cdom'],
  [/\bturbidity\b|\bturb\b|\bntu\b/i, 'turbidity'],
  [/\bsalinity\b|\bsal\b|\bconductivity\b|\bpsu\b/i, 'salinity'],
  [/\btemperature\b|\btemp\b|\bthermal\b/i, 'temperature'],
];

export function extractMeasurement(question: string): string | null {
  for (const [pattern, col] of MEASUREMENT_PATTERNS) {
    if (pattern.test(question)) {
      return col;
    }
  }
  return null;
}

const REGION_PATTERNS: [RegExp, string][] = [
  [/\barabian sea\b/i, 'Arabian Sea'],
  [/\bbay of bengal\b/i, 'Bay of Bengal'],
  [/\bequatorial\b|\bequator\b/i, 'Equatorial'],
  [/\bsouthern ocean\b|\bartarctic\b/i, 'Other'],
  [/\bmediterranean\b|\bmed sea\b|\bmediterranean sea\b/i, 'Other'],
];

export function extractRegion(question: string): string | null {
  for (const [pattern, region] of REGION_PATTERNS) {
    if (pattern.test(question)) {
      return region;
    }
  }
  return null;
}

const MONTH_NAMES: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5,
  june: 6, july: 7, august: 8, september: 9, october: 10,
  november: 11, december: 12,
};

const LAST_DAY: Record<number, number> = {
  1: 31, 2: 28, 3: 31, 4: 30, 5: 31, 6: 30, 7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31
};

function extractDateRange(question: string): [string, string] | null {
  const isoMatch = question.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    const formatted = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    return [formatted, formatted];
  }

  const monthMatch = question.toLowerCase().match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b(?:\s+of)?\s+(20\d{2})/);
  if (monthMatch) {
    const month = MONTH_NAMES[monthMatch[1]];
    const year = parseInt(monthMatch[2], 10);
    const start = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-01`;
    const end = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${LAST_DAY[month].toString().padStart(2, '0')}`;
    return [start, end];
  }

  const yearMatch = question.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    return [`${year}-01-01`, `${year}-12-31`];
  }

  return null;
}

function extractFloatId(question: string): string | null {
  const m = question.match(/\b(\d{7})\b/);
  return m ? m[1] : null;
}

function extractDepth(question: string): number | null {
  const m = question.match(/\b(\d{1,4})\s*m(?:etres?|eters?)?\b/i);
  if (m) {
    const d = parseInt(m[1], 10);
    if (d >= 0 && d <= 12000) return d;
  }
  return null;
}

function dateFilter(question: string): string {
  const rng = extractDateRange(question);
  if (rng) {
    return ` AND date BETWEEN '${rng[0]}' AND '${rng[1]}'`;
  }
  return '';
}

function ruleParametersForFloat(q: string): string | null {
  const m = /\b(parameters?|measurements?|sensors?|variables?)\b/i.test(q);
  const floatId = extractFloatId(q);
  if (!(m && floatId)) return null;

  const cols = ['oxygen', 'chlorophyll', 'ph', 'nitrate', 'cdom', 'turbidity'];
  const branches = cols.map(c =>
    `SELECT '${c}' AS parameter, MAX(CASE WHEN ${c} IS NOT NULL THEN 1 ELSE 0 END) AS available FROM floats WHERE float_id = '${floatId}'`
  ).join(' UNION ALL ');

  return `SELECT parameter, available FROM (${branches}) ORDER BY parameter`;
}

function ruleWhichFloatsMeasured(q: string): string | null {
  const m = /\b(which|what|all|list)\b\s+\bfloats?\b[^.]*\b(measured|have|has|with|carry)\b/i.test(q);
  if (!m) return null;
  const col = extractMeasurement(q);
  if (!col) return 'SELECT DISTINCT float_id, float_type FROM floats ORDER BY float_id';
  return `SELECT DISTINCT float_id, float_type FROM floats WHERE ${col} IS NOT NULL ORDER BY float_id`;
}

function ruleListUniqueFloats(q: string): string | null {
  if (/\b(list\s+(?:of|all|unique)\s+(?:all\s+)?(?:unique\s+)?floats?|all\s+(?:unique\s+)?float\s+ids?|show\s+all\s+floats?|which\s+floats?\s+are\s+there|list\s+the\s+floats?)\b/i.test(q)) {
    return 'SELECT DISTINCT float_id, float_type FROM floats ORDER BY float_id';
  }
  return null;
}

function ruleNearestFloats(q: string): string | null {
  if (!/\b(nearest|closest|near)\b/i.test(q)) return null;
  const latM = q.match(/\blat(?:itude)?\s*[=:]?\s*(-?\d+(?:\.\d+)?)\b/i);
  const lonM = q.match(/\blon(?:gitude)?\s*[=:]?\s*(-?\d+(?:\.\d+)?)\b/i);
  if (!latM || !lonM) return null;
  const lat = parseFloat(latM[1]);
  const lon = parseFloat(lonM[1]);
  return `SELECT float_id, MIN((lat - ${lat})*(lat - ${lat}) + (lon - ${lon})*(lon - ${lon})) AS distance_sq FROM floats GROUP BY float_id ORDER BY distance_sq LIMIT 5`;
}

function ruleMaxMin(q: string): string | null {
  const mm = q.match(/\b(maximum|max|highest|largest|minimum|min|lowest|smallest)\b/i);
  if (!mm) return null;
  let col = extractMeasurement(q) || 'temperature';
  const agg = ['maximum', 'max', 'highest', 'largest'].includes(mm[1].toLowerCase()) ? 'MAX' : 'MIN';
  const alias = `${agg.toLowerCase()}_${col}`;
  const floatId = extractFloatId(q);
  const where = floatId ? ` WHERE float_id = '${floatId}' AND ${col} IS NOT NULL` : ` WHERE ${col} IS NOT NULL`;
  return `SELECT ${agg}(${col}) AS ${alias} FROM floats${where}`;
}

function ruleCompareRegions(q: string): string | null {
  if (!/\bcompare\b/i.test(q)) return null;
  const regions: string[] = [];
  for (const [pattern, reg] of REGION_PATTERNS) {
    if (pattern.test(q)) {
      if (!regions.includes(reg)) regions.push(reg);
    }
  }
  if (regions.length < 2) return null;
  const col = extractMeasurement(q) || 'temperature';
  const regionList = regions.slice(0, 4).map(r => `'${r}'`).join(', ');
  return `SELECT region, AVG(${col}) AS avg_${col} FROM floats WHERE region IN (${regionList}) AND ${col} IS NOT NULL GROUP BY region ORDER BY avg_${col} DESC`;
}

function ruleProfile(q: string): string | null {
  if (!/\b(profile|vertical profile|depth profile)\b/i.test(q)) return null;
  const col = extractMeasurement(q) || 'temperature';
  const floatId = extractFloatId(q);
  const region = extractRegion(q);
  if (floatId) {
    return `SELECT depth, ${col} FROM floats WHERE float_id = '${floatId}' AND ${col} IS NOT NULL ORDER BY depth LIMIT 500`;
  }
  if (region) {
    return `SELECT depth, AVG(${col}) AS avg_${col} FROM floats WHERE region = '${region}' AND ${col} IS NOT NULL GROUP BY depth ORDER BY depth LIMIT 500`;
  }
  return `SELECT float_id, depth, ${col} FROM floats WHERE ${col} IS NOT NULL ORDER BY float_id, depth LIMIT 500`;
}

function ruleDepthLookup(q: string): string | null {
  const depth = extractDepth(q);
  if (depth === null) return null;
  const col = extractMeasurement(q);
  if (!col) return null;
  const dLo = Math.max(0, depth - 5);
  const dHi = depth + 5;
  const floatId = extractFloatId(q);
  const region = extractRegion(q);
  if (floatId) {
    return `SELECT depth, ${col} FROM floats WHERE float_id = '${floatId}' AND ${col} IS NOT NULL AND depth BETWEEN ${dLo} AND ${dHi} ORDER BY depth LIMIT 500`;
  }
  if (q.toLowerCase().includes('bgc') && ['oxygen', 'chlorophyll', 'ph', 'nitrate', 'cdom', 'turbidity'].includes(col)) {
    return `SELECT float_id, lat, lon, depth, ${col} FROM floats WHERE float_type = 'bgc' AND ${col} IS NOT NULL AND depth BETWEEN ${dLo} AND ${dHi} ORDER BY depth LIMIT 500`;
  }
  if (region) {
    return `SELECT depth, AVG(${col}) AS avg_${col} FROM floats WHERE region = '${region}' AND ${col} IS NOT NULL AND depth BETWEEN ${dLo} AND ${dHi} GROUP BY depth ORDER BY depth LIMIT 500`;
  }
  return `SELECT float_id, depth, ${col} FROM floats WHERE ${col} IS NOT NULL AND depth BETWEEN ${dLo} AND ${dHi} ORDER BY depth LIMIT 500`;
}

function ruleRecordsForFloat(q: string): string | null {
  const floatId = extractFloatId(q);
  if (!floatId) return null;
  if (!/\b(records?|data|readings?|measurements?|rows|all|history|series)\b/i.test(q)) return null;
  return `SELECT * FROM floats WHERE float_id = '${floatId}' ORDER BY date, depth LIMIT 500`;
}

function ruleCount(q: string): string | null {
  if (!/\bhow many\b/i.test(q)) return null;
  const region = extractRegion(q);
  const floatId = extractFloatId(q);
  if (region) return `SELECT COUNT(*) AS count FROM floats WHERE region = '${region}'`;
  if (floatId) return `SELECT COUNT(*) AS count FROM floats WHERE float_id = '${floatId}'`;
  return 'SELECT COUNT(*) AS count FROM floats';
}

function ruleRegionCoverage(q: string): string | null {
  if (/\b(which\s+regions?|regions?\s+.*(?:covered|exist)|coverage|where are the floats)\b/i.test(q)) {
    return 'SELECT region, COUNT(*) AS records, COUNT(DISTINCT float_id) AS floats FROM floats GROUP BY region ORDER BY records DESC';
  }
  return null;
}

function ruleByRegion(q: string): string | null {
  const col = extractMeasurement(q);
  if (!col) return null;
  if (!/\b(by region|per region|in each region|across regions)\b/i.test(q)) return null;
  return `SELECT region, AVG(${col}) AS avg_${col} FROM floats WHERE ${col} IS NOT NULL GROUP BY region ORDER BY avg_${col} DESC`;
}

function ruleAverage(q: string): string | null {
  if (!/\b(average|avg|mean|typical|typical\s+values?)\b/i.test(q)) return null;
  const col = extractMeasurement(q);
  if (!col) return null;
  const region = extractRegion(q);
  const dFilter = dateFilter(q);
  if (region) {
    return `SELECT AVG(${col}) AS avg_${col} FROM floats WHERE region = '${region}' AND ${col} IS NOT NULL${dFilter}`;
  }
  if (dFilter) {
    return `SELECT AVG(${col}) AS avg_${col} FROM floats WHERE ${col} IS NOT NULL${dFilter}`;
  }
  return null;
}

function ruleGenericMeasurement(q: string): string | null {
  const col = extractMeasurement(q);
  if (!col) return null;
  const floatId = extractFloatId(q);
  const region = extractRegion(q);
  let where = `${col} IS NOT NULL`;
  if (floatId) {
    where = `float_id = '${floatId}' AND ${col} IS NOT NULL`;
  } else if (region) {
    where = `region = '${region}' AND ${col} IS NOT NULL`;
  }
  const dFilter = dateFilter(q);
  return `SELECT float_id, lat, lon, date, depth, ${col} FROM floats WHERE ${where}${dFilter} ORDER BY date, depth LIMIT 500`;
}

const RULES = [
  ruleParametersForFloat,
  ruleWhichFloatsMeasured,
  ruleListUniqueFloats,
  ruleNearestFloats,
  ruleMaxMin,
  ruleCompareRegions,
  ruleProfile,
  ruleDepthLookup,
  ruleRecordsForFloat,
  ruleCount,
  ruleRegionCoverage,
  ruleByRegion,
  ruleAverage,
  ruleGenericMeasurement,
];

export function generateFallbackSql(question: string): string | null {
  for (const rule of RULES) {
    try {
      const sql = rule(question);
      if (sql) return sql;
    } catch (e) {
      console.warn(`Fallback rule ${rule.name} error:`, e);
    }
  }
  return null;
}
