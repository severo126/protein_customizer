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
import { screenReferences } from './sourceFilter.mjs';

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

// Google Scholar, when a key is configured. Better ranking, costs money.
async function viaSerpApi(query) {
  const serp = new URL('https://serpapi.com/search.json');
  serp.searchParams.set('engine', 'google_scholar');
  serp.searchParams.set('q', query);
  serp.searchParams.set('num', '8');
  serp.searchParams.set('api_key', process.env.SERPAPI_KEY);
  const out = await fetch(serp, { signal: AbortSignal.timeout(12000) });
  if (!out.ok) throw new Error(`SerpApi HTTP ${out.status}`);
  const data = await out.json();
  return {
    provider: 'Google Scholar, via SerpApi',
    results: (data.organic_results ?? []).map((r) => ({
      title: r.title,
      link: r.link,
      snippet: r.publication_info?.summary ?? r.snippet ?? '',
    })),
  };
}

// Crossref publishes a rate limit of one request per second, and a failure mode
// panel fires both of its queries at once. Without a gate the second one comes
// back empty and the panel silently shows half a reading list, which is exactly
// the kind of quiet wrongness this app is not allowed to have. So outbound
// Crossref calls queue here and are spaced, and a caller waits rather than
// getting nothing.
let crossrefTurn = Promise.resolve();
const CROSSREF_SPACING_MS = 1100;

function nextCrossrefSlot() {
  const mine = crossrefTurn.then(() => new Promise((r) => setTimeout(r, CROSSREF_SPACING_MS)));
  crossrefTurn = mine.catch(() => {});
  return mine;
}

// Crossref, when there is no key. Open, no account needed, and every hit is a
// DOI, so the links go to the paper itself rather than to a search page.
async function viaCrossref(query) {
  await nextCrossrefSlot();
  const api = new URL('https://api.crossref.org/works');
  api.searchParams.set('query.bibliographic', query);
  api.searchParams.set('rows', '12');
  api.searchParams.set('select', 'title,URL,container-title,published');
  // Crossref indexes far more than papers. Without this the reading list fills
  // up with figure supplements, structure depositions and the referee reports
  // and decision letters attached to one article, all of which look like hits
  // and none of which is something to go and read.
  api.searchParams.set('filter', 'type:journal-article');
  const out = await fetch(api, {
    signal: AbortSignal.timeout(12000),
    // Crossref asks callers to identify themselves; it gets better service.
    headers: { 'user-agent': 'NanoFoundry/0.1 (educational classroom toy; https://github.com/severo126/protein_customizer)' },
  });
  if (!out.ok) throw new Error(`Crossref HTTP ${out.status}`);
  const data = await out.json();
  // The same article is often indexed several times under different DOIs, so a
  // list of eight can be the same paper eight times. Dedupe on the title.
  const seen = new Set();
  const results = [];
  for (const r of data.message?.items ?? []) {
    const title = (r.title ?? [])[0] ?? '';
    const fingerprint = title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!fingerprint || seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    results.push({
      title,
      link: r.URL ?? '',
      snippet: [(r['container-title'] ?? [])[0], (r.published?.['date-parts'] ?? [])[0]?.[0]].filter(Boolean).join(', '),
    });
    if (results.length >= 8) break;
  }
  return { provider: 'Crossref', results };
}

// Gemini, held server-side. The browser-side key keeps working exactly as it
// did; this leg exists so one deployed box can carry a key for every visitor
// (GEMINI_API_KEY in its environment, see docs/credentials.md). The browser
// names an agent and sends a prompt; the model, token cap and timeout come
// from config/agents.json here, so a visitor cannot pick a model or spend
// more than the registry allows, and the key itself is never sent back.
const PROMPT_CAP = 40_000;
let agentRegistry = null;

async function registeredAgent(id) {
  if (!agentRegistry) agentRegistry = JSON.parse(await readFile(join(root, 'config', 'agents.json'), 'utf8'));
  const spec = agentRegistry.agents.find((a) => a.id === id && a.model);
  if (!spec) throw new Error(`no agent ${id} in the registry`);
  return spec;
}

async function viaGemini({ agent, prompt }) {
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('prompt is required');
  if (prompt.length > PROMPT_CAP) throw new Error(`prompt is over ${PROMPT_CAP} characters`);
  const spec = await registeredAgent(String(agent));
  const out = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${spec.model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: spec.limits?.max_output_tokens ?? 1024 },
    }),
    signal: AbortSignal.timeout(spec.limits?.timeout_ms ?? 20000),
  });
  if (!out.ok) throw new Error(`Gemini HTTP ${out.status}`);
  const data = await out.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
  if (!text) throw new Error('empty reply');
  return { model: spec.model, text };
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

  // The one retrieval path in the app. Two things vary, and nothing else:
  //
  //   * `topic` frames the query. `enzyme` (the default) looks up a catalogue
  //     card; `failure-mode` looks up what the literature says about a kind of
  //     rejection a filter has already made.
  //   * which backend answers. With SERPAPI_KEY set it is Google Scholar through
  //     SerpApi; without one it is Crossref, which needs no key and returns DOIs.
  //     The Crossref leg is why the citation trail works on a fresh clone at all,
  //     which matters more here than the slightly better ranking a key buys.
  //
  // Both legs hold their credentials server-side, both go through the same screen
  // in sourceFilter.mjs, and both fall back to the same hand-written links. The
  // response says which backend answered so the panel can attribute it honestly.
  if (url.pathname === '/api/sources') {
    const q = url.searchParams.get('q') ?? '';
    const topic = url.searchParams.get('topic') === 'failure-mode' ? 'failure-mode' : 'enzyme';
    if (!q) return json(res, 400, { error: 'q is required' });

    // A catalogue card is one enzyme, so the name alone is ambiguous and gets a
    // nudge. A failure-mode query is already a full phrase; appending to it only
    // narrows it to nothing.
    const query = topic === 'failure-mode' ? q : `${q} enzyme`;

    try {
      const { provider, results } = process.env.SERPAPI_KEY ? await viaSerpApi(query) : await viaCrossref(query);
      const { kept, dropped } = screenReferences(results);
      return json(res, 200, { configured: true, provider, topic, query: q, results: kept, screened_out: dropped });
    } catch (err) {
      // Nothing answered, so hand over somewhere to look rather than pretending
      // to have found sources.
      return json(res, 200, {
        configured: false,
        topic,
        fallback_links: [
          { label: `Search the literature for "${q}"`, url: `https://scholar.google.com/scholar?q=${encodeURIComponent(q)}` },
          { label: `Look "${q}" up in a general reference`, url: `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}` },
        ],
        note: `No reference search answered (${err.message}). Set SERPAPI_KEY for the Scholar backend, or check this box can reach api.crossref.org.`,
      });
    }
  }

  // GET says whether this box holds a key, so the UI can hide its key box.
  // POST runs one registered agent with the box's key. No key → 404, and the
  // browser falls back to asking for one, as on a plain static server.
  if (url.pathname === '/api/gemini') {
    const configured = Boolean(process.env.GEMINI_API_KEY);
    if (req.method === 'GET') return json(res, 200, { configured });
    if (req.method !== 'POST') return json(res, 405, { error: 'POST a prompt, or GET the status' });
    if (!configured) return json(res, 404, { configured, error: 'no server-side Gemini key' });
    try {
      return json(res, 200, { configured, ...(await viaGemini(await body(req))) });
    } catch (err) {
      return json(res, 502, { configured, error: err.message });
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
    let file = await readFile(path);
    // The page only talks to the API when its head says one exists, so this
    // server's copy of index.html says so; the static copy stays silent.
    if (path.endsWith('index.html')) {
      file = file.toString().replace('<head>', '<head>\n    <meta name="telemetry-api" content="/api" />');
    }
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(file);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
}).listen(port, () => console.log(`Nano Foundry on http://localhost:${port} (event store: ${store})`));
