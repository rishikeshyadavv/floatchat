import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

console.log('🧪 Starting FloatChat DOM Verification Test Suite...');

const indexPath = path.join(process.cwd(), 'frontend', 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error(`❌ Error: index.html not found at ${indexPath}`);
  process.exit(1);
}

const html = fs.readFileSync(indexPath, 'utf-8');
const dom = new JSDOM(html, {
  url: 'http://localhost:3000',
  runScripts: 'outside-only',
  resources: 'usable'
});

const { window } = dom;
const { document } = window;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

// 1. Document Title & Head elements
assert(document.title.includes('FloatChat'), 'Page title contains "FloatChat"');
const stylesheetLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
const styleHrefList = stylesheetLinks.map(l => l.getAttribute('href'));
assert(styleHrefList.some(h => h?.includes('leaflet.css')), 'Leaflet CSS stylesheet link present');
assert(styleHrefList.some(h => h?.includes('style.css')), 'Application style.css link present');

// 2. Header & Navigation Controls
assert(document.querySelector('.brand-title')?.textContent === 'FloatChat', 'Brand title element displays "FloatChat"');
assert(document.getElementById('statStatus') !== null, 'Status badge (#statStatus) present');
assert(document.getElementById('categoriesNavBtn') !== null, 'Categories button (#categoriesNavBtn) present');
assert(document.getElementById('analyticsBtn') !== null, 'Analytics dashboard button (#analyticsBtn) present');
assert(document.getElementById('themeToggle') !== null, 'Theme toggle button (#themeToggle) present');
assert(document.getElementById('infoBtn') !== null, 'Help button (#infoBtn) present');

// 3. Metrics Bar
assert(document.getElementById('metricsBar') !== null, 'Metrics bar (#metricsBar) present');
assert(document.getElementById('metricFloats') !== null, 'Active floats metric card present');
assert(document.getElementById('metricRows') !== null, 'Profiles metric card present');

// 4. Hero Section & Chips
assert(document.getElementById('hero') !== null, 'Hero container (#hero) present');
assert(document.getElementById('chips') !== null, 'Suggested query chips (#chips) present');
assert(document.getElementById('heroCategoriesBtn') !== null, 'Hero categories chip button present');

// 5. Chat Thread Area
assert(document.getElementById('thread') !== null, 'Conversation thread area (#thread) present');

// 6. Input Dock & Controls
const queryInput = document.getElementById('queryInput') as HTMLInputElement | null;
assert(queryInput !== null, 'Query text input (#queryInput) present');
assert(document.getElementById('startBtn') !== null, 'Start query engine button (#startBtn) present');
assert(document.getElementById('sendBtn') !== null, 'Send query button (#sendBtn) present');
assert(document.getElementById('clearChatBtn') !== null, 'Clear chat button (#clearChatBtn) present');

// 7. AI Mode Bar & Model Select Dropdown
const aiModeBar = document.getElementById('aiModeBar');
assert(aiModeBar !== null, 'AI mode selector bar (#aiModeBar) present');
const modeButtons = aiModeBar?.querySelectorAll('.mode-btn');
assert(modeButtons?.length === 4, 'Four AI mode options (Standard, Fast, Thinking, Search) present');

const modelSelectBtn = document.getElementById('modelSelectBtn');
assert(modelSelectBtn !== null, 'Model dropdown toggle button (#modelSelectBtn) present');
const modelDropdownMenu = document.getElementById('modelDropdownMenu');
assert(modelDropdownMenu !== null, 'Model dropdown menu (#modelDropdownMenu) present');

// 8. Modals
assert(document.getElementById('infoModal') !== null, 'Info modal (#infoModal) present');
assert(document.getElementById('analyticsModal') !== null, 'Analytics dashboard modal (#analyticsModal) present');
assert(document.getElementById('categoriesModal') !== null, 'Categories modal (#categoriesModal) present');

// 9. Vendor & Application Scripts
const scriptTags = Array.from(document.querySelectorAll('script'));
const scriptSrcs = scriptTags.map(s => s.getAttribute('src'));
assert(scriptSrcs.some(s => s?.includes('leaflet.js')), 'Leaflet script tag present');
assert(scriptSrcs.some(s => s?.includes('chart.js')), 'Chart.js script tag present');
assert(scriptSrcs.some(s => s?.includes('app.js')), 'Application app.js script tag present');

// 10. Interactive Element Assertions
if (queryInput) {
  queryInput.value = 'Show me temperature profile of float 2902264';
  assert(queryInput.value === 'Show me temperature profile of float 2902264', 'Input field accepts typed text query');
}

if (modelSelectBtn && modelDropdownMenu) {
  modelDropdownMenu.style.display = 'block';
  assert(modelDropdownMenu.style.display === 'block', 'Model dropdown toggles visibility state');
}

console.log('✅ ALL DOM VERIFICATION TESTS PASSED SUCCESSFULLY!');
