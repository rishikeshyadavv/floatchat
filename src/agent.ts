import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { queryDb } from './db.js';
import { generateFallbackSql } from './fallback.js';

const cache = new Map<string, { sql: string; data: any[] }>();

const BLOCKED_KEYWORDS = [
  'DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE', 'REPLACE', 'TRUNCATE',
  'ATTACH', 'DETACH', 'COPY', 'EXPORT', 'IMPORT', 'PRAGMA', 'EXEC', 'EXECUTE'
];

const RESTRICTED_TABLES = [
  'query_logs', 'information_schema', 'sqlite_master', 'sqlite_temp_master',
  'duckdb_tables', 'duckdb_columns', 'duckdb_schemas', 'pg_catalog', 'pg_tables'
];

export function isSafeSql(sql: string): boolean {
  const upper = sql.toUpperCase().trim();
  for (const kw of BLOCKED_KEYWORDS) {
    const reg = new RegExp(`\\b${kw}\\b`, 'i');
    if (reg.test(upper)) return false;
  }
  if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
    return false;
  }
  const normalized = upper.replace(/\s+/g, ' ');
  for (const tbl of RESTRICTED_TABLES) {
    const reg = new RegExp(`\\b${tbl}\\b`, 'i');
    if (reg.test(normalized)) return false;
  }
  return true;
}

export function isSafeQuestion(question: string): boolean {
  const lower = question.toLowerCase();
  const destructive = [
    /\b(drop|truncate|delete|insert|alter|replace)\b/,
    /\bupdate\b/
  ];
  for (const pat of destructive) {
    if (pat.test(lower)) return false;
  }
  return true;
}

export function cleanSql(sql: string): string {
  let cleaned = sql.replace(/```sql|```/gi, '');
  cleaned = cleaned.split(';')[0];
  cleaned = cleaned.split('--')[0];
  return cleaned.trim();
}

const SYSTEM_PROMPT = `
You are FloatChat SQL Generator, an AI expert in translating oceanographic data questions into DuckDB SQL queries.

Database Schema:
Table name: floats
Columns:
- float_id (VARCHAR): WMO ID of the ARGO float (e.g. '2902264')
- lat (DOUBLE): Latitude in decimal degrees (-90 to 90)
- lon (DOUBLE): Longitude in decimal degrees (-180 to 180)
- date (VARCHAR): Date string 'YYYY-MM-DD'
- depth (DOUBLE): Sensor reading depth in meters (0 to 2000)
- temperature (DOUBLE): Sea water temperature in Celsius
- salinity (DOUBLE): Sea water salinity in PSU
- region (VARCHAR): Ocean region name ('Arabian Sea', 'Bay of Bengal', 'Equatorial', 'Other')
- oxygen (DOUBLE): Dissolved oxygen (BGC parameter)
- chlorophyll (DOUBLE): Chlorophyll-a (BGC parameter)
- ph (DOUBLE): Ocean pH (BGC parameter)
- nitrate (DOUBLE): Nitrate concentration (BGC parameter)
- cdom (DOUBLE): CDOM concentration (BGC parameter)
- turbidity (DOUBLE): Turbidity in NTU (BGC parameter)
- float_type (VARCHAR): 'core' or 'bgc'

Rules:
1. Return ONLY the raw SQL query. No markdown formatting, no code blocks, no explanations.
2. Only write read-only SELECT or WITH statements.
3. Order results intuitively (e.g. BY depth ASC or BY date DESC).
4. ALWAYS add LIMIT 500 to multi-row SELECT queries.
`;

function getGeminiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'your_gemini_key_here') {
    return null;
  }
  try {
    return new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  } catch {
    return null;
  }
}

// Low-latency fast AI call (gemini-3.1-flash-lite)
export async function callFastGemini(prompt: string, sysPrompt: string = SYSTEM_PROMPT): Promise<string> {
  const ai = getGeminiClient();
  if (!ai) throw new Error('Gemini API key not configured.');

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: [prompt],
    config: {
      temperature: 0.1,
      systemInstruction: sysPrompt,
    },
  });

  return (response.text || '').trim();
}

// Standard AI call (gemini-3.6-flash)
export async function callStandardGemini(prompt: string, sysPrompt: string = SYSTEM_PROMPT): Promise<string> {
  const ai = getGeminiClient();
  if (!ai) throw new Error('Gemini API key not configured.');

  const response = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: [prompt],
    config: {
      temperature: 0.0,
      systemInstruction: sysPrompt,
    },
  });

  return (response.text || '').trim();
}

// High thinking AI reasoning call (gemini-3.6-flash or gemini-3.1-pro-preview with thinkingLevel HIGH)
export async function callThinkingGemini(prompt: string, sysPrompt: string = 'You are a Senior Oceanographer and Marine Hydrodynamics Expert.'): Promise<string> {
  const ai = getGeminiClient();
  if (!ai) throw new Error('Gemini API key not configured.');

  const response = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: [prompt],
    config: {
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.HIGH
      },
      systemInstruction: sysPrompt,
    },
  });

  return (response.text || '').trim();
}

// Google Search Grounding call (gemini-3.6-flash with googleSearch tool)
export async function callSearchGrounding(prompt: string): Promise<{ text: string; sources: Array<{ title: string; url: string }> }> {
  const ai = getGeminiClient();
  if (!ai) throw new Error('Gemini API key not configured.');

  const response = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      systemInstruction: 'You are an oceanographic research assistant with live Google Search capabilities. Provide accurate, up-to-date facts about marine science, climate events, and ARGO float programs.',
    },
  });

  const text = response.text || 'No response generated.';
  const sources: Array<{ title: string; url: string }> = [];

  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (Array.isArray(chunks)) {
    for (const chunk of chunks) {
      if (chunk.web?.uri) {
        sources.push({
          title: chunk.web.title || chunk.web.uri,
          url: chunk.web.uri,
        });
      }
    }
  }

  return { text, sources };
}

export const QUESTION_CATEGORIES = [
  {
    id: "vertical_profiles",
    title: "1. Vertical Profiles & Depth Hydrography",
    description: "Explore sea water temperature, salinity, and dissolved oxygen changing by depth (0–2000m).",
    suggestedMode: "standard",
    questions: [
      "Show me the vertical temperature profile for float 2902264",
      "Plot salinity vs depth in the Arabian Sea",
      "Find oxygen concentration profile down to 1000m depth",
      "Show temperature and salinity profile for float 5904663",
      "What are the deepest readings recorded in the Bay of Bengal?"
    ]
  },
  {
    id: "regional_comparisons",
    title: "2. Regional & Ocean Basin Comparisons",
    description: "Cross-examine hydrographic metrics across Arabian Sea, Bay of Bengal, Equatorial Indian Ocean, and Southern Ocean.",
    suggestedMode: "standard",
    questions: [
      "Compare salinity between the Arabian Sea and Bay of Bengal",
      "Which ocean region has the highest average temperature?",
      "Compare average dissolved oxygen levels across regions",
      "Show nitrate concentration differences in Equatorial vs Arabian Sea",
      "List average temperature and salinity grouped by ocean region"
    ]
  },
  {
    id: "float_trajectories",
    title: "3. Float Tracking & Trajectory Drift",
    description: "Locate ARGO floats, trace drift patterns, and inspect geographic coordinate spreads across profile cycles.",
    suggestedMode: "standard",
    questions: [
      "List all ARGO float locations and their coordinates",
      "Find the nearest ARGO floats to lat 12, lon 65",
      "Which floats are currently active in the Bay of Bengal?",
      "Show latitude and longitude drift for float 2902265 over time",
      "Show all floats carrying biogeochemical sensors with their current coordinates"
    ]
  },
  {
    id: "bgc_sensing",
    title: "4. Biogeochemical (BGC) Float Sensing",
    description: "Analyze ocean acidification (pH), chlorophyll-a blooms, nitrate nutrients, CDOM, and turbidity.",
    suggestedMode: "standard",
    questions: [
      "Which floats carry biogeochemical (BGC) sensor suites?",
      "Show pH and nitrate readings for float 2902265",
      "List available BGC parameters for float 5904663",
      "Show turbidity and CDOM measurements in the top 100 meters",
      "Find chlorophyll-a bloom concentrations greater than 0.5 mg/m3"
    ]
  },
  {
    id: "quality_control",
    title: "5. Quality Control (QC) & Data Integrity",
    description: "Audit profile QC flags, isolate validated good profiles (qc_flag = 1), and identify suspect measurements.",
    suggestedMode: "standard",
    questions: [
      "How many profile readings passed quality control (qc_flag = 1)?",
      "List all floats and count total profile readings per float",
      "Find any profile records with unverified or suspect QC flags",
      "Show validated temperature and salinity profiles for float 2902936",
      "What percentage of readings in the dataset are fully QC validated?"
    ]
  },
  {
    id: "ts_watermass",
    title: "6. Water Mass Signatures & T-S Diagrams",
    description: "Identify ocean water masses using potential density (sigma-theta), thermocline gradients, and salinity extrema.",
    suggestedMode: "standard",
    questions: [
      "Show temperature and salinity values to construct a T-S diagram for float 2902264",
      "Find thermocline boundary where temperature drops below 15 degrees Celsius",
      "Compare surface salinity vs deep salinity across all floats",
      "Identify low-salinity surface water mass signatures in the Bay of Bengal",
      "Find high-salinity Arabian Sea water mass profiles"
    ]
  },
  {
    id: "extrema_thresholds",
    title: "7. Extrema & Environmental Thresholds",
    description: "Discover absolute maximums/minimums, oxygen minimum zones (OMZ), and deep-sea extreme boundaries.",
    suggestedMode: "fast",
    questions: [
      "What is the maximum recorded ocean temperature in the dataset?",
      "Find the lowest recorded salinity at 500m depth",
      "Where is the lowest dissolved oxygen (oxygen minimum zone) recorded?",
      "What is the deepest reading recorded by float 6900186?",
      "Find readings where sea water temperature is below 5 degrees Celsius"
    ]
  },
  {
    id: "temporal_trends",
    title: "8. Temporal Trends & Seasonal Variations",
    description: "Track ocean changes across months, monsoon seasons, and annual observation periods.",
    suggestedMode: "fast",
    questions: [
      "Show temperature measurements taken in January 2023",
      "How did salinity change between cycles for float 2902264?",
      "Find all sensor readings recorded in the Bay of Bengal during spring",
      "Show monthly average temperature trends in the Arabian Sea",
      "Compare winter vs spring salinity averages in the Equatorial region"
    ]
  },
  {
    id: "high_thinking",
    title: "9. Deep Hydrographic Reasoning (High Thinking)",
    description: "Engage Gemini High Thinking mode for thermocline dynamics, halocline stratification, and hydrodynamics.",
    suggestedMode: "thinking",
    questions: [
      "Analyze thermocline stratification and mixed layer depth for float 2902264",
      "Explain oxygen depletion mechanism in the Arabian Sea oxygen minimum zone",
      "Assess halocline gradients and freshwater input effects in the Bay of Bengal",
      "Discuss biogeochemical coupling between chlorophyll bloom and nitrate depletion",
      "Provide a full thermodynamic profile analysis for float 5904663"
    ]
  },
  {
    id: "web_search",
    title: "10. Live Marine Research & Search Grounding",
    description: "Leverage Google Search Grounding for live 2026 ARGO deployment data, climate events, and research.",
    suggestedMode: "search",
    questions: [
      "What are the latest international ARGO program deployment statistics in 2026?",
      "Search for recent marine heatwave events in the Indian Ocean",
      "How do Deep ARGO floats differ from standard core ARGO floats?",
      "What is the role of ARGO floats in validating satellite sea surface temperature?",
      "Find recent scientific publications on Indian Ocean dipole and ARGO data"
    ]
  }
];

export async function runQueryWithRetry(
  question: string,
  mode: 'standard' | 'fast' | 'thinking' | 'search' = 'standard',
  userLocation?: { latitude: number; longitude: number }
): Promise<{
  success: boolean;
  sql?: string;
  data?: any[];
  error?: string;
  analysis?: string;
  sources?: Array<{ title: string; url: string }>;
  isCategoryMenu?: boolean;
  isQuestionList?: boolean;
  categories?: typeof QUESTION_CATEGORIES;
  category?: typeof QUESTION_CATEGORIES[0];
  latency_seconds: number;
  provenance: Record<string, string>;
}> {
  const startTime = Date.now();
  const cleanQ = question.trim().toLowerCase().replace(/[?.!]+$/, '');

  // 1. Handle special modes: Search Grounding
  if (mode === 'search') {
    try {
      const { text, sources } = await callSearchGrounding(question);
      const latency = Math.round((Date.now() - startTime) / 10) / 100;
      return {
        success: true,
        analysis: text,
        sources,
        latency_seconds: latency,
        provenance: { data_source: 'gemini-3.6-flash (Google Search Grounding)' }
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Search Grounding failed: ${err.message || String(err)}`,
        latency_seconds: Math.round((Date.now() - startTime) / 10) / 100,
        provenance: { data_source: 'error' }
      };
    }
  }

  // 3. Intercept 'start' command and greetings
  if (cleanQ === 'start' || cleanQ === 'categories' || cleanQ === 'show categories' || cleanQ === 'help categories') {
    return {
      success: true,
      isCategoryMenu: true,
      categories: QUESTION_CATEGORIES,
      latency_seconds: 0.01,
      provenance: { data_source: 'system_explorer' }
    };
  }

  if (cleanQ.startsWith('category:') || cleanQ.startsWith('category ')) {
    const catId = cleanQ.replace(/^category[:\s]+/, '').trim();
    const foundCat = QUESTION_CATEGORIES.find(c => c.id === catId || c.title.toLowerCase().includes(catId));
    if (foundCat) {
      return {
        success: true,
        isQuestionList: true,
        category: foundCat,
        latency_seconds: 0.01,
        provenance: { data_source: 'system_explorer' }
      };
    }
  }

  const greetings = ['hi', 'hello', 'hey', 'greetings', 'yo', 'help', 'who are you', 'what is this'];
  if (greetings.includes(cleanQ)) {
    return {
      success: false,
      error: "Hello! I am FloatChat, your conversational assistant for ARGO oceanographic floats. Type 'start' anytime to explore all 8 categorized question sets, or ask directly about temperature, salinity, or float profiles!",
      sql: 'SELECT * FROM floats LIMIT 5;',
      latency_seconds: 0.01,
      provenance: { data_source: 'system' }
    };
  }

  // 4. Security pre-check
  if (!isSafeQuestion(question)) {
    return {
      success: false,
      error: 'Security Block: The question contains destructive keywords. Data modification is not permitted.',
      latency_seconds: Math.round((Date.now() - startTime) / 10) / 100,
      provenance: { data_source: 'security_filter' }
    };
  }

  // 5. Cache check
  const cacheKey = `${mode}:${question.trim().toLowerCase()}`;
  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey)!;
    return {
      success: true,
      sql: cached.sql,
      data: cached.data,
      latency_seconds: 0.01,
      provenance: { data_source: 'cache' }
    };
  }

  let generatedSql: string | null = null;
  let isAiGenerated = false;
  let modelUsed = 'rule_fallback';

  // 6. Gemini LLM Call based on mode
  if (process.env.GEMINI_API_KEY) {
    try {
      let rawText = '';
      if (mode === 'fast') {
        rawText = await callFastGemini(`Translate this question to SQL: "${question}"`);
        modelUsed = 'gemini-3.1-flash-lite (low-latency)';
      } else if (mode === 'thinking') {
        rawText = await callThinkingGemini(`Translate this question to DuckDB SQL carefully: "${question}"`, SYSTEM_PROMPT);
        modelUsed = 'gemini-3.6-flash (High Thinking Mode)';
      } else {
        rawText = await callStandardGemini(`Translate this question to SQL: "${question}"`);
        modelUsed = 'gemini-3.6-flash';
      }

      const cleaned = cleanSql(rawText);
      if (cleaned.toUpperCase().startsWith('SELECT') || cleaned.toUpperCase().startsWith('WITH')) {
        if (isSafeSql(cleaned)) {
          generatedSql = cleaned;
          isAiGenerated = true;
        }
      }
    } catch (err) {
      console.warn(`Gemini API call (${mode}) failed, using rule-based fallback:`, err);
    }
  }

  // 7. Fallback rule engine
  if (!generatedSql) {
    generatedSql = generateFallbackSql(question);
    modelUsed = 'rule_fallback';
  }

  if (!generatedSql) {
    return {
      success: false,
      error: 'No matching data or query pattern found for that question. Try asking about temperatures, salinities, depth profiles, or float IDs.',
      latency_seconds: Math.round((Date.now() - startTime) / 10) / 100,
      provenance: { data_source: 'engine' }
    };
  }

  if (!isSafeSql(generatedSql)) {
    return {
      success: false,
      error: 'Security Block: The generated query contains unsafe operations.',
      sql: generatedSql,
      latency_seconds: Math.round((Date.now() - startTime) / 10) / 100,
      provenance: { data_source: 'security_filter' }
    };
  }

  // 8. Execute SQL query against DuckDB
  try {
    let rows = await queryDb(generatedSql);
    const latency = Math.round((Date.now() - startTime) / 10) / 100;

    if (!rows || rows.length === 0) {
      return {
        success: false,
        error: 'No matching data found for that query. Try adjusting the region, date, or float ID.',
        sql: generatedSql,
        latency_seconds: latency,
        provenance: { data_source: modelUsed }
      };
    }

    cache.set(cacheKey, { sql: generatedSql, data: rows });

    // Optional deep thinking synthesis if in thinking mode
    let analysis: string | undefined = undefined;
    if (mode === 'thinking' && process.env.GEMINI_API_KEY) {
      try {
        const sampleDataStr = JSON.stringify(rows.slice(0, 10));
        analysis = await callThinkingGemini(
          `Provide a deep hydrographic breakdown and scientific interpretation for the following ocean query results:\nQuestion: "${question}"\nSQL: ${generatedSql}\nData Sample: ${sampleDataStr}`
        );
      } catch (aErr) {
        console.warn('Thinking analysis failed:', aErr);
      }
    }

    return {
      success: true,
      sql: generatedSql,
      data: rows,
      analysis,
      latency_seconds: latency,
      provenance: {
        data_source: modelUsed,
        dataset: 'Ifremer GDAC ARGO floats'
      }
    };
  } catch (dbErr: any) {
    // Retry if AI generated and failed
    if (isAiGenerated && process.env.GEMINI_API_KEY) {
      try {
        const retryPrompt = `
          The user asked: "${question}"
          Previous failed SQL: ${generatedSql}
          Error: ${dbErr.message || String(dbErr)}
          Please fix the query according to the schema. Return ONLY raw SQL.
        `;
        const retryText = await callStandardGemini(retryPrompt, SYSTEM_PROMPT);
        const retrySql = cleanSql(retryText);
        if (isSafeSql(retrySql)) {
          const rows = await queryDb(retrySql);
          const latency = Math.round((Date.now() - startTime) / 10) / 100;
          if (rows && rows.length > 0) {
            cache.set(cacheKey, { sql: retrySql, data: rows });
            return {
              success: true,
              sql: retrySql,
              data: rows,
              latency_seconds: latency,
              provenance: { data_source: `${modelUsed} (self-corrected)` }
            };
          }
        }
      } catch (retryErr) {
        console.warn('Self-correction retry failed:', retryErr);
      }
    }

    const fallbackSql = generateFallbackSql(question);
    if (fallbackSql && fallbackSql !== generatedSql) {
      try {
        const rows = await queryDb(fallbackSql);
        const latency = Math.round((Date.now() - startTime) / 10) / 100;
        if (rows && rows.length > 0) {
          return {
            success: true,
            sql: fallbackSql,
            data: rows,
            latency_seconds: latency,
            provenance: { data_source: 'rule_fallback' }
          };
        }
      } catch (fbErr) {
        console.warn('Fallback execution failed:', fbErr);
      }
    }

    return {
      success: false,
      error: `Query execution failed: ${dbErr.message || 'Unknown database error'}`,
      sql: generatedSql,
      latency_seconds: Math.round((Date.now() - startTime) / 10) / 100,
      provenance: { data_source: 'error' }
    };
  }
}
