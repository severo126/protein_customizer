// Gemini: the natural-language front door, and the plain-English explainer.
//
// The division of labour is deliberate and load-bearing:
//   * the model parses English into a candidate lane, and puts a deterministic
//     filter verdict into plain words;
//   * it never decides a verdict, never scores anything, and never invents a
//     catalogue entry — every id it returns is checked against the fixed
//     catalogue here and dropped if it is not there.
// With no API key the app stays fully usable: parsing is unavailable and
// explanations fall back to the deterministic text the filters already produce.

import { state, setState } from './app.js';
import { escapeText } from './cartoon.js';
import { logEvent } from './telemetry.js';

const KEY_STORE = 'nano-foundry.gemini-key';

// A deployed box can hold one key for every visitor (GEMINI_API_KEY on the
// server, see docs/credentials.md). That key never reaches the browser: when
// there is no key in local storage, calls go to /api/gemini and the server adds
// its own. On a plain static server the probe 404s and nothing changes.
const SERVER_KEY = 'held by the server';
let serverHasKey = false;
(async () => {
  try {
    const res = await fetch('/api/gemini');
    if (res.ok && (await res.json()).configured) {
      serverHasKey = true;
      setState({});
    }
  } catch {
    /* static server, or offline: the browser-side key is the only kind */
  }
})();

// Model, instructions and limits come from the agent registry — see
// config/agents.json and docs/tracks.md. Changing a model is a config change.
let registry = null;

async function agentSpec(id) {
  if (!registry) registry = await (await fetch('config/agents.json')).json();
  const spec = registry.agents.find((a) => a.id === id);
  if (!spec) throw new Error(`no agent ${id} in the registry`);
  const instructions = await (await fetch(spec.instructions)).text();
  return { ...spec, instructionText: instructions };
}

function localKey() {
  try {
    return localStorage.getItem(KEY_STORE) ?? '';
  } catch {
    return '';
  }
}

// The browser's own key, or a marker when the server holds one. Every screen
// uses this as "can a model be asked at all"; only callGemini reads the value.
export function geminiKey() {
  return localKey() || (serverHasKey ? SERVER_KEY : '');
}

function setKey(k) {
  try {
    localStorage.setItem(KEY_STORE, k);
  } catch {
    /* private window: the app still works, parsing just stays off */
  }
}

// The key box exists on more than one screen now, so storing it is exported
// rather than reached for through a module-private function.
export function setGeminiKey(k) {
  setKey(k);
}

export function renderGeminiBox() {
  const hasKey = Boolean(geminiKey());
  return `<div class="panel gemini-box" id="gemini-box">
    <strong>Ask for a route in English</strong>
    <textarea id="gemini-prompt" placeholder="Put a sugar on a scaffold and then trim it back off"></textarea>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button class="btn small primary" id="gemini-go">Build me a candidate lane</button>
      ${localKey() ? `<button class="btn small ghost" id="gemini-forget">Forget API key</button>` : ''}
      ${hasKey ? '' : `<input type="password" id="gemini-key" placeholder="Gemini API key (kept in this browser only)" style="flex:1;min-width:220px" />`}
    </div>
    <div class="gemini-status" id="gemini-status">${
      hasKey
        ? 'The model only proposes a lane. Which stages actually run, and every compatibility light, stays deterministic code.'
        : 'No key set, so natural-language parsing is off. Everything else on this screen works without it.'
    }</div>
  </div>`;
}

export function wireGeminiBox(root) {
  const go = root.querySelector('#gemini-go');
  if (!go) return;
  const status = root.querySelector('#gemini-status');

  const forget = root.querySelector('#gemini-forget');
  if (forget) forget.onclick = () => {
    setKey('');
    setState({});
  };

  go.onclick = async () => {
    const keyField = root.querySelector('#gemini-key');
    if (keyField && keyField.value.trim()) setKey(keyField.value.trim());
    const prompt = root.querySelector('#gemini-prompt').value.trim();
    if (!prompt) return;
    if (!geminiKey()) {
      status.textContent = 'Paste a Gemini API key first. The rest of the app does not need one.';
      status.classList.add('error');
      return;
    }
    status.classList.remove('error');
    status.textContent = 'Asking Gemini for a candidate lane…';
    try {
      const plan = await proposeLane(prompt);
      const kept = plan.stages.filter((id) => state.byId.has(id));
      const dropped = plan.stages.filter((id) => !state.byId.has(id));
      logEvent('gemini.route', { prompt_length: prompt.length, kept: kept.length, dropped: dropped.length });
      if (!kept.length) {
        status.textContent = 'Gemini did not name anything that is in this catalogue, so nothing was added.';
        status.classList.add('error');
        return;
      }
      setState({ lane: kept, starterId: plan.starter ?? state.starterId });
      status.textContent = `Added ${kept.length} stage${kept.length === 1 ? '' : 's'}.${
        dropped.length ? ` Dropped ${dropped.length} name${dropped.length === 1 ? '' : 's'} that are not in this catalogue.` : ''
      } The lane below was then run and checked entirely by deterministic code.`;
    } catch (err) {
      status.textContent = `Gemini call failed: ${String(err.message ?? err)}. Nothing was added.`;
      status.classList.add('error');
    }
  };
}

// Ask for a lane, then keep only what exists in the fixed catalogue.
async function proposeLane(prompt) {
  const spec = await agentSpec('pipeline-builder');
  const menu = state.catalogue.entries.map((e) => `${e.id} — ${e.name}: ${e.family}, ${describeAction(e)}`).join('\n');
  const starters = 'glucose, glycerol, catechol, glycine, pyruvate, triose, starch, cellulose, tributyrin, fumarate, aspartate, urea, peroxide, nitrile, protein-stain, acetoacetate, glycerate-2-p, glucose-1-p';
  const text = await callGemini(
    [spec.instructionText, 'Catalogue:', menu, `Starting molecules available: ${starters}.`, `Request: ${prompt}`].join('\n\n'),
    spec,
  );
  const json = text.match(/\{[\s\S]*\}/);
  if (!json) throw new Error('no JSON in the reply');
  const parsed = JSON.parse(json[0]);
  return { starter: typeof parsed.starter === 'string' ? parsed.starter : null, stages: Array.isArray(parsed.stages) ? parsed.stages : [] };
}

export async function explainRejection({ a, b, siteA, siteB, linker, verdict }) {
  const killer = verdict.results.find((r) => !r.pass);
  const deterministic = killer
    ? `${killer.label} rejected this: ${killer.reason} Remember this is a cartoon — the filter is geometry on two spheres and a rubber band, not a structure calculation.`
    : 'Nothing was rejected, so there is nothing to explain.';

  if (!geminiKey() || !killer) return deterministic;

  try {
    const spec = await agentSpec('rejection-explainer');
    const text = await callGemini(
      [
        spec.instructionText,
        '',
        'Explain, in two or three plain sentences for a first-year biochemistry student, why a toy',
        'geometric filter rejected a hypothetical two-domain cartoon construct. Do not add any',
        'biology the input does not contain, do not speculate about whether the construct would',
        'work, and do not suggest how to fix it. Make clear this is a cartoon with wrong physics.',
        '',
        `Domain A: ${a.name}, ${a.domain.label}, cut at ${siteA.label} (${siteA.region}).`,
        `Domain B: ${b.name}, ${b.domain.label}, cut at ${siteB.label} (${siteB.region}).`,
        `Linker: ${linker} units.`,
        `Filter that rejected it: ${killer.label}.`,
        `Reason the deterministic filter gave: ${killer.reason}`,
      ].join('\n'),
      spec,
    );
    logEvent('gemini.explain', { filter: killer.id });
    return text.trim() || deterministic;
  } catch {
    return `${deterministic} (Gemini was unavailable, so this is the filter's own wording.)`;
  }
}

// Read the references src/ui/literature.js has already retrieved, and say what
// they report about the failure mode the filter named. The model is handed the
// verdict and the screened reference list and nothing else, so there is nothing
// here for it to decide or to score: both are settled before it is called.
export async function summariseReferences({ killer, mode, references }) {
  if (!geminiKey()) throw new Error('no key set');
  if (!references.length) throw new Error('nothing retrieved to read');

  const spec = await agentSpec('literature-explainer');
  const list = references
    .slice(0, 8)
    .map((r, i) => `[${i + 1}] ${r.title}${r.snippet ? ` — ${r.snippet}` : ''}`)
    .join('\n');

  const text = await callGemini(
    [
      spec.instructionText,
      '',
      'A deterministic cartoon filter has rejected a hypothetical two-domain construct.',
      'Say what the retrieved references below report about this kind of failure. Cite them by',
      'number. Do not reconsider the verdict, do not score anything, and do not suggest a fix.',
      '',
      `Filter that rejected it: ${killer.label}.`,
      `Reason the deterministic filter gave: ${killer.reason}`,
      `The real failure mode this cartoon filter is gesturing at: ${mode.realName}. ${mode.gist}`,
      '',
      'Retrieved references (titles and search snippets only — you have not read the full text):',
      list,
    ].join('\n'),
    spec,
  );
  logEvent('literature.summarise', { filter: killer.id, references: references.length });
  return text.trim();
}

/* ---------------- the molecule-first flow: parse, then advise -------------- */
//
// Both calls below keep the same split as everything above them. The parser is
// handed the catalogue's own derived vocabulary and returns a structure, which
// src/model/picker.js checks before anything is done with it. The adviser is
// handed routes a deterministic search already found and numbers that same code
// already measured, so there is nothing left for it to decide — it reads out an
// ordering, and the grid is ordered in code whether it answers or not.

// Ask which molecule the sentence means. Returns the raw object; the caller
// runs it through normalisePickerReply, which is where the checking lives.
export async function parseTarget(sentence, vocabulary, history = []) {
  const spec = await agentSpec('target-parser');
  const cores = vocabulary.cores.map((c) => `${c.id} — ${c.label}${c.isStarter ? '' : ' (has to be made from something else)'}`).join('\n');
  const groups = vocabulary.groups.map((g) => `${g.id} — ${g.label}`).join('\n');
  const said = history
    .filter((h) => h.role === 'user' || h.role === 'app')
    .slice(-6)
    .map((h) => `${h.role === 'user' ? 'Person' : 'App'}: ${h.text}`)
    .join('\n');

  const text = await callGemini(
    [
      spec.instructionText,
      '',
      'Skeletons available:',
      cores,
      '',
      'Groups available:',
      groups,
      '',
      said ? `The conversation so far:\n${said}` : '',
      `The person has just said: ${sentence}`,
    ]
      .filter(Boolean)
      .join('\n'),
    spec,
  );
  const json = text.match(/\{[\s\S]*\}/);
  if (!json) throw new Error('no JSON in the reply');
  const parsed = JSON.parse(json[0]);
  logEvent('gemini.target', { sentence_length: sentence.length, kind: String(parsed?.kind ?? 'none') });
  return parsed;
}

// Ask which of the routes the search found suits the chosen criterion. `rows`
// is already-measured data; the model is shown no catalogue and no rule, so it
// has nothing to build a new route out of.
export async function adviseRoute({ target, criterion, rows }) {
  const spec = await agentSpec('route-adviser');
  const list = rows
    .map(
      (r) =>
        `${r.routeId} | start ${r.starter} | ${r.stages.join(' then ')} | ${r.stageCount} stages | supply load ${r.supplyLoad} (${r.cofactors.join(', ') || 'no cofactor'}${r.needs.length ? `; needs ${r.needs.join(', ')}` : ''}) | ${r.temp} | ${r.ph}`,
    )
    .join('\n');

  const text = await callGemini(
    [
      spec.instructionText,
      '',
      `The person wants to make: ${target}`,
      `What they said they care about: ${criterion}`,
      '',
      'The routes the search found, with the measurements already taken:',
      list,
    ].join('\n'),
    spec,
  );
  const json = text.match(/\{[\s\S]*\}/);
  if (!json) throw new Error('no JSON in the reply');
  const parsed = JSON.parse(json[0]);
  logEvent('gemini.advise', { criterion, routes: rows.length });
  return { routeId: typeof parsed.routeId === 'string' ? parsed.routeId : null, why: typeof parsed.why === 'string' ? parsed.why : '' };
}

async function callGemini(prompt, spec) {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), spec.limits.timeout_ms ?? 20000);
  const key = localKey();
  let res;
  try {
    res = key
      ? await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${spec.model}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: spec.limits.max_output_tokens ?? 1024 },
          }),
          signal: controller.signal,
        })
      : // No key here: the server runs the same agent with its own key. It
        // looks the model and limits up in the same registry, by this id.
        await fetch('/api/gemini', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ agent: spec.id, prompt }),
          signal: controller.signal,
        });
  } finally {
    clearTimeout(timer);
  }
  // One trace row per model call, the same shape the Python platform writes.
  logEvent('agent.trace', { agent: spec.id, model: spec.model, latency_ms: Math.round(performance.now() - started), status: res.ok ? 'ok' : `http_${res.status}` });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const text = key ? (data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '') : (data?.text ?? '');
  if (!text) throw new Error('empty reply');
  return text;
}

function describeAction(e) {
  const a = e.action;
  if (a.op === 'add') return `adds a ${a.group}, needs ${a.requires.join(' + ')}`;
  if (a.op === 'remove') return `removes a ${a.group}${a.yields ? `, leaves a ${a.yields}` : ''}`;
  if (a.op === 'rearrange') return `rearranges ${a.from} into ${a.to}`;
  return `joins ${a.requires.join(' + ')} into a ${a.group}`;
}

export { escapeText };
