-- Cohort questions for the Snowflake side. These scan the whole event history
-- and do not need to be fresh, which is exactly why they do not live in the
-- Timescale panel. See docs/tracks.md for the division of labour.

-- 1. Which domain pairs survive the filters most often?
SELECT RAW:a::STRING   AS domain_a,
       RAW:b::STRING   AS domain_b,
       COUNT(*)                                        AS candidates,
       COUNT_IF(RAW:passed::BOOLEAN)                   AS survivors,
       ROUND(100 * COUNT_IF(RAW:passed::BOOLEAN) / NULLIF(COUNT(*), 0), 1) AS survival_pct
FROM FOUNDRY_EVENTS
WHERE RAW:kind::STRING = 'splice.verdict'
GROUP BY 1, 2
HAVING candidates >= 12
ORDER BY survival_pct DESC, candidates DESC
LIMIT 25;

-- 2. Which filter is the biggest killer, and does that change with linker length?
SELECT RAW:linker::INT       AS linker_units,
       RAW:killedBy::STRING  AS filter_id,
       COUNT(*)              AS killed
FROM FOUNDRY_EVENTS
WHERE RAW:killedBy IS NOT NULL
GROUP BY 1, 2
ORDER BY linker_units, killed DESC;

-- 3. Which cut-region combinations ever get past the cut-site filter?
SELECT RAW:region_a::STRING AS region_a,
       RAW:region_b::STRING AS region_b,
       COUNT(*)             AS candidates,
       COUNT_IF(RAW:killedBy::STRING = 'cut-site') AS killed_at_cut_site
FROM FOUNDRY_EVENTS
WHERE RAW:kind::STRING = 'splice.verdict'
GROUP BY 1, 2
ORDER BY candidates DESC;

-- 4. Which enzymes does the room actually reach for?
SELECT RAW:enzyme::STRING AS enzyme_id,
       COUNT(*)           AS uses,
       MIN(RAW:at::TIMESTAMP_NTZ) AS first_seen,
       MAX(RAW:at::TIMESTAMP_NTZ) AS last_seen
FROM FOUNDRY_EVENTS
WHERE RAW:kind::STRING = 'lane.add'
GROUP BY 1
ORDER BY uses DESC
LIMIT 20;
