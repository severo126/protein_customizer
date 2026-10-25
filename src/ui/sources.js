// The citation trail.
//
// The cartoon abstracts real biochemistry badly and on purpose, so every
// catalogue card has a way out to the real thing. Queries go through our own
// API (/api/sources), which holds the SerpApi key server-side and returns
// public references. With no key configured the panel says so and still hands
// over somewhere to look — it never pretends to have found sources.

import { escapeText } from './cartoon.js';

const dialog = document.getElementById('limits-dialog');

export async function showSources(entry) {
  dialog.innerHTML = panel(entry, { state: 'loading' });
  dialog.showModal();
  wireClose();

  try {
    const res = await fetch(`/api/sources?q=${encodeURIComponent(entry.name)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    dialog.innerHTML = panel(
      entry,
      data.configured
        ? { state: 'results', results: data.results ?? [], provider: data.provider ?? 'a public reference search' }
        : { state: 'unconfigured', links: data.fallback_links ?? [] },
    );
  } catch (err) {
    dialog.innerHTML = panel(entry, { state: 'offline', error: String(err.message ?? err) });
  }
  wireClose();
}

function panel(entry, view) {
  return `<div class="body">
    <h2 id="limits-title">Go and check: ${escapeText(entry.name)}</h2>
    <p style="font-size:13px;color:var(--ink-dim)">Nano Foundry's card for this enzyme is a cartoon.
    The sources below are the real thing. Where the two disagree, the sources are right.</p>
    <p style="font-size:12px;color:var(--ink-faint)">${escapeText(entry.source.note)}</p>
    ${bodyFor(view)}
    <div class="close-row"><button class="btn primary" id="limits-close">Back to the workshop</button></div>
  </div>`;
}

function bodyFor(view) {
  if (view.state === 'loading') return `<p class="empty">Looking for public references…</p>`;

  if (view.state === 'results') {
    if (!view.results.length) return `<p class="empty">The search came back empty. That is a search result, not a statement about the enzyme.</p>`;
    return `<ul style="padding-left:18px;display:grid;gap:9px">
      ${view.results
        .slice(0, 8)
        .map(
          (r) => `<li><a href="${escapeText(r.link)}" target="_blank" rel="noopener noreferrer"
            style="color:var(--accent-2)">${escapeText(r.title)}</a>
            ${r.snippet ? `<div style="font-size:12px;color:var(--ink-faint)">${escapeText(r.snippet)}</div>` : ''}</li>`,
        )
        .join('')}
    </ul>
    <p style="font-size:11.5px;color:var(--ink-faint)">Public search results, fetched through ${escapeText(view.provider)}.
    Nano Foundry has not read them and does not vouch for them.</p>`;
  }

  if (view.state === 'unconfigured') {
    return `<p class="empty">No reference search answered, so this panel cannot pull references
      automatically. The searches it would have run:</p>
      <ul style="padding-left:18px;display:grid;gap:6px">
        ${view.links.map((l) => `<li><a href="${escapeText(l.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent-2)">${escapeText(l.label)}</a></li>`).join('')}
      </ul>`;
  }

  return `<p class="empty">The sources API is not answering (${escapeText(view.error ?? 'offline')}).
    Start <code>tools/api/server.mjs</code> to turn this panel on.</p>`;
}

function wireClose() {
  const close = dialog.querySelector('#limits-close');
  if (close) close.onclick = () => dialog.close();
}
