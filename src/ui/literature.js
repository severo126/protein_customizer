// "The toy rejected this — what does the literature say about rejections like it?"
//
// The order of operations here is the project's whole technical claim, so it is
// worth stating plainly:
//
//   1. a deterministic filter in src/model/splice.js rejects a candidate, and
//      names which filter and why. That is the verdict, and it is reached before
//      anything in this file runs;
//   2. src/model/failureModes.js maps that filter to the real failure mode it is
//      a crude stand-in for, as committed text, plus the queries to look it up;
//   3. /api/sources runs those queries — the same endpoint, key and screen the
//      catalogue cards already use, not a second retrieval path;
//   4. only then, and only if a Gemini key is set, is a model shown the verdict
//      and the retrieved titles so it can say what they report.
//
// Everything up to step 3 works with no key and no model at all. The model reads
// and explains; it never decides and never scores. There is no viability number
// here, by design — see docs/scope.md §3 and the panel's own closing line.

import { escapeText } from './cartoon.js';
import { failureModeFor } from '../model/failureModes.js';
import { summariseReferences, geminiKey } from './gemini.js';
import { logEvent } from './telemetry.js';

// Retrieve, render, then summarise into the same node. Each step paints as it
// lands so the references are readable before the model has answered.
export async function showLiterature(host, { killer }) {
  const mode = failureModeFor(killer.id);
  if (!mode) {
    host.innerHTML = `<p class="lit-note">No reading list is mapped to the ${escapeText(killer.label)} filter yet.</p>`;
    return;
  }

  host.innerHTML = frame(killer, mode, `<p class="lit-note">Looking for published work on this failure mode…</p>`);

  let found;
  try {
    found = await retrieve(mode);
  } catch {
    // No server at all — the published build, or the folder opened over file://.
    // A reader who clicked this asked where to go and read; telling them to start
    // a development server answers a question nobody asked. The searches the API
    // would have run can be written here without it.
    host.innerHTML = frame(killer, mode, searchLinkList(mode));
    return;
  }

  logEvent('literature.retrieve', { filter: killer.id, configured: found.configured, references: found.references.length });

  if (!found.configured) {
    host.innerHTML = frame(killer, mode, searchLinkList(mode));
    return;
  }

  if (!found.references.length) {
    host.innerHTML = frame(
      killer,
      mode,
      `<p class="lit-note">The search came back with nothing to show${found.screenedOut ? `, after ${found.screenedOut} result${found.screenedOut === 1 ? '' : 's'} were held back by the topic screen` : ''}.
      That is a search result, not a statement about this failure mode.</p>`,
    );
    return;
  }

  const refs = referenceList(found);
  host.innerHTML = frame(killer, mode, `${refs}<p class="lit-note" id="lit-reading">Reading those references…</p>`);

  const readingNote = host.querySelector('#lit-reading');
  if (!geminiKey()) {
    readingNote.innerHTML = `No Gemini key is set, so nothing has summarised these for you. The references are above
      and the filter's own reason is beside the verdict — both work without a model.`;
    return;
  }

  try {
    const summary = await summariseReferences({ killer, mode, references: found.references });
    readingNote.outerHTML = `<div class="lit-summary">
      <strong>Gemini, reading the references above</strong>
      <p>${escapeText(summary)}</p>
      <p class="lit-caveat">The model was shown the verdict and those titles and snippets, and nothing else. It did not
      decide this rejection and it has not scored the construct: the filter above decided, and there is no viability
      number in this app because there is no benchmark of fusion-construct outcomes to calibrate one against. Treat the
      summary as a pointer to the papers, not as a finding.</p>
    </div>`;
  } catch (err) {
    readingNote.innerHTML = `Gemini did not answer (${escapeText(String(err.message ?? err))}), so the references above are
      unsummarised. They are the useful part either way.`;
  }
}

// Step 3: the existing endpoint, with the topic framed as a failure mode. Both
// of this entry's queries go through it and the results are merged by link.
async function retrieve(mode) {
  const pages = await Promise.all(
    mode.queries.map(async (q) => {
      const res = await fetch(`/api/sources?topic=failure-mode&q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }),
  );

  if (pages.some((p) => !p.configured)) {
    return { configured: false, provider: null, references: [], screenedOut: 0 };
  }

  const byLink = new Map();
  for (const page of pages) {
    for (const r of page.results ?? []) {
      if (r.link && !byLink.has(r.link)) byLink.set(r.link, r);
    }
  }
  return {
    configured: true,
    provider: pages.find((p) => p.provider)?.provider ?? 'a public reference search',
    references: [...byLink.values()].slice(0, 8),
    screenedOut: pages.reduce((n, p) => n + (p.screened_out ?? 0), 0),
  };
}

// The same searches the API would run for this failure mode, written in the
// browser so the panel is never a dead end. Each one is a public catalogue's own
// search page: nothing is fetched, read or vouched for here. #13 did this for the
// catalogue cards; the splice panel had the same dead end.
function searchLinkList(mode) {
  const links = mode.queries.flatMap((q) => [
    { label: `Europe PMC — ${q}`, url: `https://europepmc.org/search?query=${encodeURIComponent(q)}` },
    { label: `Crossref — ${q}`, url: `https://search.crossref.org/?q=${encodeURIComponent(q)}` },
  ]);
  return `<p class="lit-note">No reference search answered here, so these are the searches to run for this
    failure mode. They open at the real literature, which is the point of this panel either way.</p>
    <ul class="lit-links">${links.map((l) => linkItem(l.url, l.label)).join('')}</ul>`;
}

function frame(killer, mode, inner) {
  return `<div class="lit-panel">
    <h4>What the literature says about this kind of rejection</h4>
    <p class="lit-bridge"><strong>${escapeText(killer.label)}</strong> rejected this, and it decided that on cartoon
    geometry. What the filter is gesturing at is real, though, and it has a name:
    <strong>${escapeText(mode.realName)}</strong>. ${escapeText(mode.gist)}</p>
    ${inner}
  </div>`;
}

function referenceList(found) {
  return `<ol class="lit-refs">${found.references.map((r) => `<li>${linkBody(r)}</li>`).join('')}</ol>
    <p class="lit-caveat">Public search results for the queries above, fetched through ${escapeText(found.provider)} and screened
    against the topics docs/scope.md §1 keeps out of this app${found.screenedOut ? `, which held back ${found.screenedOut} result${found.screenedOut === 1 ? '' : 's'} here` : ''}.
    Not read or vouched for here.</p>`;
}

function linkBody(r) {
  return `<a href="${escapeText(r.link)}" target="_blank" rel="noopener noreferrer">${escapeText(r.title)}</a>
    ${r.snippet ? `<div class="lit-snippet">${escapeText(r.snippet)}</div>` : ''}`;
}

function linkItem(url, label) {
  return `<li><a href="${escapeText(url)}" target="_blank" rel="noopener noreferrer">${escapeText(label)}</a></li>`;
}
