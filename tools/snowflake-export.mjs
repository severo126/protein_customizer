// Snowflake batch export: take the run history out of the hot store and hand it
// to the analytics warehouse for the heavier cross-run questions.
//
//   node tools/snowflake-export.mjs                 → write exports/runs-<ts>.ndjson
//   SNOWFLAKE_ACCOUNT=… node tools/snowflake-export.mjs --load
//                                                   → also PUT + COPY INTO
//
// Division of labour (see docs/tracks.md): Timescale answers "what is the room
// doing right now" on a one-minute horizon; Snowflake answers "across every run
// of the whole event, which domain pairs survive most often" — queries that scan
// the lot and do not need to be fresh.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const load = args.includes('--load');
const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = join(root, 'exports');
const outFile = join(outDir, `runs-${stamp}.ndjson`);

async function rowsFromPostgres() {
  if (!process.env.DATABASE_URL) return null;
  try {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const { rows } = await pool.query(
      `SELECT at, kind, enzyme_id, pair_a, pair_b, filter_id, passed, linker_units, payload
       FROM foundry_events ORDER BY at`,
    );
    await pool.end();
    return rows;
  } catch (err) {
    console.warn(`Postgres unavailable (${err.message}); falling back to the JSONL buffer.`);
    return null;
  }
}

function rowsFromJsonl() {
  const path = join(root, 'data', 'events.jsonl');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

const rows = (await rowsFromPostgres()) ?? rowsFromJsonl();
mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, rows.map((r) => JSON.stringify(r)).join('\n'));
console.log(`Exported ${rows.length} rows → ${outFile}`);

if (!rows.length) {
  console.log('Nothing to load. Run tools/sweep.mjs first, or use the app with the API running.');
}

if (load) {
  const required = ['SNOWFLAKE_ACCOUNT', 'SNOWFLAKE_USERNAME', 'SNOWFLAKE_PASSWORD', 'SNOWFLAKE_DATABASE', 'SNOWFLAKE_SCHEMA'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`--load needs ${missing.join(', ')}. The export file above is still written.`);
    process.exit(1);
  }
  let snowflake;
  try {
    ({ default: snowflake } = await import('snowflake-sdk'));
  } catch {
    console.error('--load needs the snowflake-sdk package: npm install snowflake-sdk');
    process.exit(1);
  }
  const conn = snowflake.createConnection({
    account: process.env.SNOWFLAKE_ACCOUNT,
    username: process.env.SNOWFLAKE_USERNAME,
    password: process.env.SNOWFLAKE_PASSWORD,
    database: process.env.SNOWFLAKE_DATABASE,
    schema: process.env.SNOWFLAKE_SCHEMA,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
  });
  await new Promise((res, rej) => conn.connect((err) => (err ? rej(err) : res())));
  const run = (sqlText) => new Promise((res, rej) => conn.execute({ sqlText, complete: (err, _s, rowsOut) => (err ? rej(err) : res(rowsOut)) }));

  await run(`CREATE TABLE IF NOT EXISTS FOUNDRY_EVENTS (RAW VARIANT)`);
  await run(`CREATE STAGE IF NOT EXISTS FOUNDRY_STAGE FILE_FORMAT = (TYPE = JSON)`);
  await run(`PUT file://${outFile} @FOUNDRY_STAGE AUTO_COMPRESS = TRUE OVERWRITE = TRUE`);
  await run(`COPY INTO FOUNDRY_EVENTS FROM @FOUNDRY_STAGE FILE_FORMAT = (TYPE = JSON) ON_ERROR = CONTINUE`);
  console.log('Loaded into Snowflake. Cohort queries live in tools/snowflake-queries.sql.');
  conn.destroy(() => {});
}
