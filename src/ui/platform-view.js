// The platform screen: the agent registry a judge can read, and the traces and
// dashboards that come out of it. Everything here is read from
// config/agents.json and the Python service, never hand-written in this file.

import { escapeText } from './cartoon.js';

let registry = null;
let metrics = null;
let traces = [];

export function renderPlatform(root) {
  root.innerHTML = `
    <div class="section-head">
      <h2>Platform</h2>
      <p>Three agents declared in <code>config/agents.json</code> — tools, model, instructions and
      limits — with a trace per run and replay of any past one. The registry is the source of truth;
      this screen only displays it.</p>
    </div>
    <div id="platform-body"><div class="empty">Reading the registry…</div></div>`;
  paint(root);
}

async function paint(root) {
  const body = root.querySelector('#platform-body');
  if (!registry) {
    try {
      registry = await (await fetch('config/agents.json')).json();
    } catch (err) {
      body.innerHTML = `<div class="panel" style="padding:14px"><strong>Registry unavailable</strong>
        <div class="score-note">${escapeText(String(err))}</div></div>`;
      return;
    }
  }

  const service = await serviceData();
  metrics = service?.metrics ?? null;
  traces = service?.traces ?? [];

  body.innerHTML = `
    <div class="splice-grid">
      <div style="display:grid;gap:16px;min-width:0">
        ${registry.agents.map((a) => agentCard(a)).join('')}
        <div class="panel" style="padding:13px;display:grid;gap:8px">
          <strong>Shared tool registry</strong>
          ${Object.entries(registry.tools)
            .map(
              ([id, t]) => `<div class="filter-item pass"><span class="filter-mark">⚙</span>
                <div><strong>${escapeText(id)}</strong> <span class="chip">${escapeText(t.kind)}</span>
                <p>${escapeText(t.description)}</p></div></div>`,
            )
            .join('')}
          <div class="score-note">Defaults: traces ${registry.defaults.trace ? 'on' : 'off'} → <code>${escapeText(registry.defaults.trace_sink)}</code>.
          Any request carrying a field named ${registry.defaults.refuse_fields.map((f) => `<code>${escapeText(f)}</code>`).join(', ')}
          is refused rather than processed, on both sides of the wire.</div>
        </div>
      </div>

      <div style="display:grid;gap:16px">
        <div class="panel" style="padding:13px;display:grid;gap:9px">
          <strong>Run dashboard</strong>
          ${
            metrics
              ? metrics.agents
                  .map(
                    (m) => `<div class="light-row">
                      <span class="light-dot ${m.errors ? 'red' : m.runs ? 'green' : 'grey'}"></span>
                      <span class="light-label">${escapeText(m.agent)}</span>
                      <span class="light-message">${m.runs} run${m.runs === 1 ? '' : 's'}${
                        m.p50_ms != null ? ` · p50 ${m.p50_ms} ms` : ''
                      }${m.p95_ms != null ? ` · p95 ${m.p95_ms} ms` : ''} · ${m.tokens_in + m.tokens_out} tokens
                      ${m.refused ? ` · ${m.refused} refused` : ''}${m.errors ? ` · ${m.errors} errors` : ''}</span>
                    </div>`,
                  )
                  .join('')
              : `<div class="score-note">The filter service is not answering, so there are no live
                 numbers. Start it with <code>npm run filters</code> (it serves <code>/metrics</code>
                 and <code>/agents/&lt;id&gt;/traces</code> on port 8000).</div>`
          }
        </div>

        <div class="panel" style="padding:13px;display:grid;gap:8px">
          <strong>Recent traces</strong>
          ${
            traces.length
              ? `<div class="survivors">${traces
                  .slice(-10)
                  .reverse()
                  .map(
                    (t) => `<div class="survivor"><span>${escapeText(t.agent)} · ${escapeText(t.status)} ·
                      ${t.total_ms} ms · ${t.steps.length} steps</span>
                      <button class="btn small" data-replay="${escapeText(t.trace_id)}">Replay</button></div>`,
                  )
                  .join('')}</div>
                 <div class="score-note" id="replay-out"></div>`
              : `<div class="score-note">No traces yet. Every agent run writes one, successful or not.</div>`
          }
        </div>
      </div>
    </div>`;

  body.onclick = async (e) => {
    const btn = e.target.closest('[data-replay]');
    if (!btn) return;
    const out = body.querySelector('#replay-out');
    out.textContent = 'Replaying…';
    try {
      const res = await fetch(`http://localhost:8000/traces/${btn.dataset.replay}/replay`, { method: 'POST' });
      const data = await res.json();
      out.textContent = data.replayed
        ? `Replayed: the result ${data.matches ? 'still matches' : 'has drifted from'} the original.`
        : `Not replayed — ${data.reason}`;
    } catch (err) {
      out.textContent = `Replay failed: ${String(err.message ?? err)}`;
    }
  };
}

function agentCard(a) {
  return `<div class="panel" style="padding:13px;display:grid;gap:9px">
    <div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap">
      <strong style="font-size:16px">${escapeText(a.title)}</strong>
      <span class="chip">${escapeText(a.id)}</span>
      <span class="chip">model <strong>${escapeText(a.model ?? 'none — deterministic')}</strong></span>
    </div>
    <div class="score-note">${escapeText(a.job)}</div>
    <div class="meta">
      ${a.tools.map((t) => `<span class="chip">${escapeText(t)}</span>`).join('')}
      ${Object.entries(a.limits)
        .map(([k, v]) => `<span class="chip">${escapeText(k)} <strong>${escapeText(v)}</strong></span>`)
        .join('')}
    </div>
    <div class="score-note">instructions: <code>${escapeText(a.instructions)}</code></div>
    <ul style="margin:0;padding-left:18px;display:grid;gap:4px">
      ${a.guarantees.map((g) => `<li class="score-note">${escapeText(g)}</li>`).join('')}
    </ul>
  </div>`;
}

async function serviceData() {
  try {
    const metricsRes = await fetch('http://localhost:8000/metrics');
    if (!metricsRes.ok) throw new Error(String(metricsRes.status));
    const m = await metricsRes.json();
    const all = [];
    for (const agent of m.agents) {
      const res = await fetch(`http://localhost:8000/agents/${agent.agent}/traces`);
      if (res.ok) all.push(...(await res.json()).traces);
    }
    return { metrics: m, traces: all };
  } catch {
    return null;
  }
}
