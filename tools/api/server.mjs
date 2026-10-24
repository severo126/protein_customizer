// Nano Foundry API: static files plus the event store.
//
//   node tools/api/server.mjs            → events buffered to data/events.jsonl
//   DATABASE_URL=postgres://… node …     → events written to a Timescale hypertable
//
// The JSONL fallback exists so the app, the live panel and the Snowflake export
// all work on a laptop with no database, and so the panel never has to invent a
// number. Which store is in use is reported in /api/room, and the UI prints it.

import { createServer } from 'node:http';
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const port = Number(process.env.PORT ?? 5173);
const JSONL = join(root, 'data', 'events.jsonl');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

// A field whose name looks like a sequence is rejected outright rather than
// stored, so the store cannot become a back door around docs/scope.md §2.
const SEQUENCE_KEY = /sequence|fasta|genbank|codon|oligo|primer|residues?_string|aa_?seq|nt_?seq/i;

let pool = null;
let store = 'jsonl';

async function connect() {
  if (!process.env.DATABASE_URL) return;
  try {
    const { default: pg } = await import('pg');
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query('SELECT 1');
    store = 'timescale';
    console.log('Event store: Timescale hypertable');
  } catch (err) {
    console.warn(`Event store: falling back to ${JSONL} (${err.message})`);
    pool = null;
  }
}

async function record(row) {
  for (const key of Object.keys(row)) {
    if (SEQUENCE_KEY.test(key)) throw new Error(`refusing a field named "${key}"`);
  }
  if (pool) {
    await pool.query(
      `INSERT INTO foundry_events (at, kind, session_id, enzyme_id, pair_a, pair_b, filter_id, passed, linker_units, payload)
       VALUES (COALESCE($1::timestamptz, now()), $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [row.at ?? null, row.kind ?? 'unknown', row.session ?? null, row.enzyme ?? null, row.a ?? null, row.b ?? null, row.killedBy ?? row.filter ?? null, row.passed ?? null, row.linker ?? null, row],
    );
    return;
  }
  await mkdir(join(root, 'data'), { recursive: true });
  await appendFile(JSONL, `${JSON.stringify(row)}\n`);
}

async function roomSummary() {
  if (pool) {
    const [rejects, enzymes, counts] = await Promise.all([
      pool.query(`SELECT filter_id AS reason, sum(n)::int AS n FROM foundry_rejects_5m
                  WHERE bucket > now() - interval '6 hours' GROUP BY 1 ORDER BY 2 DESC LIMIT 5`),
      pool.query(`SELECT enzyme_id AS enzyme, sum(n)::int AS n FROM foundry_enzyme_use_5m
                  WHERE bucket > now() - interval '6 hours' GROUP BY 1 ORDER BY 2 DESC LIMIT 5`),
      pool.query(`SELECT count(*) FILTER (WHERE kind LIKE 'lane%')::int AS runs,
                         count(*) FILTER (WHERE filter_id IS NOT NULL)::int AS verdicts FROM foundry_events`),
    ]);
    return {
      store,
      runs: counts.rows[0].runs,
      verdicts: counts.rows[0].verdicts,
      top_reject_reasons: rejects.rows,
      most_used_enzymes: enzymes.rows,
      note: 'Live from a Timescale hypertable, via five-minute continuous aggregates.',
    };
  }

  const rows = await readJsonl();
  const tally = (pick) => {
    const m = new Map();
    for (const r of rows) {
      const k = pick(r);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  };
  return {
    store,
    runs: rows.filter((r) => String(r.kind).startsWith('lane')).length,
    verdicts: rows.filter((r) => r.killedBy || r.filter).length,
    top_reject_reasons: tally((r) => r.killedBy ?? r.filter).map(([reason, n]) => ({ reason, n })),
    most_used_enzymes: tally((r) => r.enzyme).map(([enzyme, n]) => ({ enzyme, n })),
    note: 'No DATABASE_URL set, so these counts come from the local JSONL buffer rather than Timescale.',
  };
}

export async function readJsonl() {
  if (!existsSync(JSONL)) return [];
  const rows = [];
  const rl = createInterface({ input: createReadStream(JSONL), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      /* skip a half-written line */
    }
  }
  return rows;
}

async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function json(res, code, payload) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

await connect();

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/events' && req.method === 'POST') {
    try {
      await record(await body(req));
      return json(res, 202, { ok: true, store });
    } catch (err) {
      return json(res, 400, { ok: false, error: err.message });
    }
  }

  if (url.pathname === '/api/sources') {
    const q = url.searchParams.get('q') ?? '';
    if (!q) return json(res, 400, { error: 'q is required' });
    if (!process.env.SERPAPI_KEY) {
      return json(res, 200, {
        configured: false,
        fallback_links: [
          { label: `Search the literature for "${q}"`, url: `https://scholar.google.com/scholar?q=${encodeURIComponent(q)}` },
          { label: `Look "${q}" up in a general reference`, url: `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}` },
        ],
        note: 'Set SERPAPI_KEY to turn the citation trail on.',
      });
    }
    try {
      const serp = new URL('https://serpapi.com/search.json');
      serp.searchParams.set('engine', 'google_scholar');
      serp.searchParams.set('q', `${q} enzyme`);
      serp.searchParams.set('num', '8');
      serp.searchParams.set('api_key', process.env.SERPAPI_KEY);
      const out = await fetch(serp);
      if (!out.ok) throw new Error(`SerpApi HTTP ${out.status}`);
      const data = await out.json();
      const results = (data.organic_results ?? []).map((r) => ({
        title: r.title,
        link: r.link,
        snippet: r.publication_info?.summary ?? r.snippet ?? '',
      }));
      return json(res, 200, { configured: true, query: q, results });
    } catch (err) {
      return json(res, 502, { configured: true, error: err.message });
    }
  }

  if (url.pathname === '/api/room') {
    try {
      return json(res, 200, await roomSummary());
    } catch (err) {
      return json(res, 500, { error: err.message });
    }
  }

  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const path = join(root, rel === '/' ? 'index.html' : rel);
  try {
    const file = await readFile(path);
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(file);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
}).listen(port, () => console.log(`Nano Foundry on http://localhost:${port} (event store: ${store})`));
