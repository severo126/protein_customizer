// What to actually ask a reference search, and what to ask next if that
// returns nothing.
//
// A catalogue card is a single word — "Lipase" — which on its own is ambiguous
// enough to pull in dictionary pages, so the enzyme topic appends a nudge. The
// nudge is usually an improvement and occasionally a disaster: Google Scholar
// returns eight results for "lipase" and zero for "Lipase enzyme", because the
// decorated phrase has to match and the bare word only has to appear. A card
// with no citations at all is worse than a card with loosely-matched ones, so
// when the decorated query comes back empty the bare name is tried next.
//
// A failure-mode query is already a full phrase written for this purpose, so
// there is nothing to strip back to and only one attempt is made.

export function searchQueries(q, topic) {
  const bare = String(q ?? '').trim();
  if (!bare) return [];
  if (topic === 'failure-mode') return [bare];
  // A name that already ends in the nudge needs no nudge: decorating
  // "Restriction enzyme" into "Restriction enzyme enzyme" is the same mistake
  // in miniature, and asking it twice wastes a round trip against a rate limit.
  if (/\benzymes?$/i.test(bare)) return [bare];
  return [`${bare} enzyme`, bare];
}

// Walk the queries until one of them finds something, and report which one did.
//
// `search` is the backend — whichever of the two the server picked. Keeping the
// loop here rather than inline in the handler is what lets the fallback be
// tested without a SerpApi key and without the network, which matters because
// the backend that has the bug is the one that needs a key.
export async function searchWithFallback(queries, search) {
  let provider = null;
  let results = [];
  let asked = queries[0] ?? null;

  for (const query of queries) {
    asked = query;
    ({ provider, results } = await search(query));
    if (results.length) break;
  }

  return { provider, results, asked };
}
