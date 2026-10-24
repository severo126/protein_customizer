-- Nano Foundry event store — Tiger Data (Timescale Postgres).
--
-- Every lane edit, filter verdict and parameter sweep is one row. The table is
-- a hypertable so the live panel can ask for the last few minutes cheaply while
-- the history keeps growing through a 36-hour hackathon.

CREATE TABLE IF NOT EXISTS foundry_events (
  at            TIMESTAMPTZ      NOT NULL DEFAULT now(),
  kind          TEXT             NOT NULL,   -- lane.add | splice.verdict | splice.export | sweep.run | gemini.route
  session_id    TEXT,
  enzyme_id     TEXT,
  pair_a        TEXT,
  pair_b        TEXT,
  filter_id     TEXT,                        -- which filter killed a candidate, when one did
  passed        BOOLEAN,
  linker_units  INTEGER,
  temp_low      DOUBLE PRECISION,
  temp_high     DOUBLE PRECISION,
  payload       JSONB            NOT NULL DEFAULT '{}'::jsonb
);

-- Nothing in this table is a sequence: there is no column that could hold one,
-- and the API refuses any field whose name looks like one. See docs/scope.md.

SELECT create_hypertable('foundry_events', 'at', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS foundry_events_kind_at ON foundry_events (kind, at DESC);
CREATE INDEX IF NOT EXISTS foundry_events_filter_at ON foundry_events (filter_id, at DESC);

-- Continuous aggregates power the "what the room has been building" panel
-- without re-scanning the raw rows on every poll.

CREATE MATERIALIZED VIEW IF NOT EXISTS foundry_rejects_5m
WITH (timescaledb.continuous) AS
SELECT time_bucket('5 minutes', at) AS bucket,
       filter_id,
       count(*) AS n
FROM foundry_events
WHERE filter_id IS NOT NULL
GROUP BY bucket, filter_id
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS foundry_enzyme_use_5m
WITH (timescaledb.continuous) AS
SELECT time_bucket('5 minutes', at) AS bucket,
       enzyme_id,
       count(*) AS n
FROM foundry_events
WHERE enzyme_id IS NOT NULL
GROUP BY bucket, enzyme_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('foundry_rejects_5m',
  start_offset => INTERVAL '2 days', end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute', if_not_exists => TRUE);

SELECT add_continuous_aggregate_policy('foundry_enzyme_use_5m',
  start_offset => INTERVAL '2 days', end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute', if_not_exists => TRUE);
