// Parameter sweep: run the funnel over many catalogue pairs and record every
// filter verdict as a time-series row. This is what gives the live panel and
// the Snowflake export something to chew on before a crowd turns up.
//
//   node tools/sweep.mjs                 → post to a running API on :5173
//   node tools/sweep.mjs --pairs 200     → more pairs
//   node tools/sweep.mjs --out file.jsonl → write straight to a file instead

import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { spliceFunnel } from '../src/model/splice.js';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const catalogue = JSON.parse(readFileSync(new URL('../src/data/catalogue.json', import.meta.url), 'utf8'));
const pairs = Number(flag('pairs', 120));
const out = flag('out', null);
const api = flag('api', 'http://localhost:5173/api/events');

const rows = [];
let made = 0;
outer: for (let i = 0; i < catalogue.entries.length; i++) {
  for (let j = i + 1; j < catalogue.entries.length; j++) {
    const a = catalogue.entries[i];
    const b = catalogue.entries[j];
    const funnel = spliceFunnel(a, b);
    for (const c of funnel.candidates) {
      rows.push({
        kind: 'splice.verdict',
        at: new Date().toISOString(),
        a: a.id,
        b: b.id,
        enzyme: a.id,
        linker: c.linkerUnits,
        passed: c.passed,
        killedBy: c.killedBy,
        region_a: c.siteA.region,
        region_b: c.siteB.region,
      });
    }
    if (++made >= pairs) break outer;
  }
}

console.log(`Swept ${made} pairs → ${rows.length} filter verdicts.`);

if (out) {
  mkdirSync(dirname(out), { recursive: true });
  for (const r of rows) appendFileSync(out, `${JSON.stringify(r)}\n`);
  console.log(`Written to ${out}`);
} else {
  let sent = 0;
  for (const r of rows) {
    try {
      const res = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r) });
      if (res.ok) sent++;
    } catch {
      console.error(`No API answering at ${api}. Start tools/api/server.mjs, or pass --out <file>.`);
      process.exit(1);
    }
  }
  console.log(`Posted ${sent} rows to ${api}.`);
}

const killers = new Map();
for (const r of rows) if (r.killedBy) killers.set(r.killedBy, (killers.get(r.killedBy) ?? 0) + 1);
console.log('Biggest killers:', [...killers.entries()].sort((x, y) => y[1] - x[1]));
