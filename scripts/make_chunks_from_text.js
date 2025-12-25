// scripts/make_chunks_from_text.js
// usage examples:
// node scripts/make_chunks_from_text.js --input data/raw/constitution.txt --source constitution_of_india --type constitution
// node scripts/make_chunks_from_text.js --input data/raw/bns_2023.txt --source bharatiya_nyaya_sanhita_2023 --type bns
// node scripts/make_chunks_from_text.js --input data/raw/notes.txt --source my_notes --type generic

import fs from 'fs';
import path from 'path';

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
}

const INPUT = arg('input');
const SOURCE = arg('source');
const TYPE = (arg('type','generic') || 'generic').toLowerCase();
const SIZE = parseInt(arg('size','900'), 10);
const OVERLAP = parseInt(arg('overlap','150'), 10);

if (!INPUT || !SOURCE) {
  console.error('please pass --input <file> and --source <name>');
  process.exit(1);
}

const raw = fs.readFileSync(INPUT, 'utf8');

function splitArticles(text) {
  const parts = text.split(/(?=^\s*Article\s+[0-9A-Za-z-]+(?:[A-Za-z])?\b)/gmi);
  return parts.map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/^\s*Article\s+([0-9A-Za-z-]+)/i);
    const article = m ? String(m[1]).toUpperCase() : null;
    return { article, section_number: null, section_title: null, text: s };
  });
}

function splitSections(text) {
  const parts = text.split(/(?=^\s*Section\s+[0-9A-Za-z().-]+\b)/gmi);
  return parts.map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/^\s*Section\s+([0-9A-Za-z().-]+)/i);
    const section_number = m ? String(m[1]) : null;
    const firstLine = s.split(/\r?\n/)[0] || '';
    const t = firstLine.replace(/^\s*Section\s+[0-9A-Za-z().-]+\s*[-:]\s*/i, '').trim();
    const section_title = (t && t.length < 140) ? t : null;
    return { article: null, section_number, section_title, text: s };
  });
}

function chunkWithOverlap(text, size = 900, overlap = 150) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + size, text.length);
    out.push(text.slice(i, end));
    if (end === text.length) break;
    i = Math.max(0, end - overlap);
  }
  return out;
}

let units = [];
if (TYPE === 'constitution') {
  units = splitArticles(raw);
} else if (TYPE === 'bns') {
  units = splitSections(raw);
} else {
  const paras = raw.split(/\n\s*\n/g).map(p => p.trim()).filter(Boolean);
  units = paras.map(p => ({ article: null, section_number: null, section_title: null, text: p }));
}

const records = [];
let uid = 0;
for (const u of units) {
  const chunks = chunkWithOverlap(u.text, SIZE, OVERLAP);
  for (let idx = 0; idx < chunks.length; idx++) {
    records.push({
      id: `c_${uid++}`,
      text: chunks[idx],
      source: SOURCE,
      article: u.article,
      section_number: u.section_number,
      section_title: u.section_title,
      heading: null,
      page: null,
      meta: { source: SOURCE, type: TYPE }
    });
  }
}

const outDir = 'data';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const base = `${SOURCE}_chunks.jsonl`;
const outPath = path.join(outDir, base);
fs.writeFileSync(outPath, records.map(r => JSON.stringify(r)).join('\n'), 'utf8');

console.log(`wrote ${records.length} chunks -> ${outPath}`);
