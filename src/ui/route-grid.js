// Step two of the flow: the chains that could make it.
//
// Everything on this screen is the output of src/model/routes.js. The ordering
// is done in code by the criterion the person picked, and the grid is complete
// and ordered whether or not a model ever answers. Gemini's part is one
// paragraph naming the trade-off between the routes the search returned, and it
// is shown as advice beside the grid rather than as a result inside it — if it
// is unavailable, nothing on this screen is missing.
//
// The honest part is the dead end. When the search reaches nothing, this screen
// says what the search can support, which is "no chain of up to N stages", and
// shows how far it got. It does not offer a nearly-route or soften it.

import { state, setState } from './app.js';
import { escapeText } from './cartoon.js';
import {
  searchRoutes,
  rankRoutes,
  searchHeadline,
  describeTarget,
  routeMetrics,
  coreLabel,
  CRITERIA,
  criterion as criterionById,
  ROUTE_NOTE,
} from '../model/routes.js';
import { groupMeta, describe, STARTERS } from '../model/molecules.js';
import { geminiKey, adviseRoute } from './gemini.js';
import { screenAdviceText } from '../model/picker.js';
import { NOT_CHECKED } from '../model/disclaimers.js';

// Recomputing the search on every render would be wasteful and would also let
// two renders disagree. One result per target, cached on the state.
function resultFor(target) {
  const key = `${target.core}|${target.groups.join(',')}|${target.match}`;
  if (state.routeResultKey === key && state.routeResult) return state.routeResult;
  const result = searchRoutes(state.catalogue.entries, target);
  state.routeResultKey = key;
  state.routeResult = result;
  return result;
}

/* --------------------------------- a card -------------------------------- */

function windowCell(label, win, empty, blame) {
  if (empty) {
    const who = blame ? `${name(blame.floor)} and ${name(blame.ceiling)}` : 'two of its stages';
    return `<div class="rg-stat bad">
      <span class="rg-stat-key">${escapeText(label)}</span>
      <strong>none shared</strong>
      <span class="rg-stat-why">${escapeText(who)} do not overlap at all</span>
    </div>`;
  }
  const width = win.high - win.low;
  const thin = label === 'Temperature' ? width < 5 : width < 0.5;
  return `<div class="rg-stat ${thin ? 'thin' : 'good'}">
    <span class="rg-stat-key">${escapeText(label)}</span>
    <strong>${win.low}–${win.high}${label === 'Temperature' ? ' °C' : ''}</strong>
    <span class="rg-stat-why">${thin ? 'a strip that thin is hard to hold in a pot' : 'shared by every stage'}</span>
  </div>`;
}

function name(id) {
  return state.byId.get(id)?.name ?? id;
}

function chain(route) {
  const bits = route.stages.map((id, i) => {
    const e = state.byId.get(id);
    const mol = route.molecules[i + 1];
    return `<li>
      <span class="rg-enz">${escapeText(e?.name ?? id)}</span>
      <span class="rg-arrow" aria-hidden="true">→</span>
      <span class="rg-mol" title="${escapeText(describe(mol))}">${escapeText(coreLabel(mol.core))} ${mol.groups
        .map((g) => `<i class="rg-dot" style="--hue:${groupMeta(g).hue}" title="${escapeText(groupMeta(g).label)}"></i>`)
        .join('')}</span>
    </li>`;
  });
  return `<ol class="rg-chain">
    <li class="start"><span class="rg-mol">${escapeText(coreLabel(route.molecules[0].core))} ${route.molecules[0].groups
      .map((g) => `<i class="rg-dot" style="--hue:${groupMeta(g).hue}"></i>`)
      .join('')}</span></li>
    ${bits.join('')}
  </ol>`;
}

function card({ route, metrics }, advisedId) {
  const advised = route.id === advisedId;
  const chosen = route.id === state.chosenRoute;
  return `<article class="rg-card ${chosen ? 'chosen' : ''} ${advised ? 'advised' : ''}" data-route="${escapeText(route.id)}">
    <header>
      <span class="rg-stages">${metrics.stages} stage${metrics.stages === 1 ? '' : 's'}</span>
      <span class="rg-from">from ${escapeText(coreLabel(route.molecules[0].core))}</span>
      ${advised ? '<span class="rg-tag">Gemini’s pick</span>' : ''}
    </header>
    ${chain(route)}
    <div class="rg-stats">
      ${windowCell('Temperature', metrics.tempWindow, metrics.tempEmpty, metrics.tempBlame)}
      ${windowCell('pH', metrics.phWindow, metrics.phEmpty, metrics.phBlame)}
      <div class="rg-stat">
        <span class="rg-stat-key">Supply load</span>
        <strong>${metrics.supplyLoad}</strong>
        <span class="rg-stat-why">${escapeText(
          [metrics.cofactors.length ? metrics.cofactors.join(', ') : 'no cofactor', metrics.needs.length ? `needs ${metrics.needs.join(', ')}` : '']
            .filter(Boolean)
            .join('; '),
        )}</span>
      </div>
    </div>
    <button class="btn small primary" data-play-route="${escapeText(route.id)}">Watch this one run</button>
  </article>`;
}

/* ------------------------------- the dead end ----------------------------- */

function starterLabel(id) {
  return STARTERS.find((s) => s.id === id)?.label ?? id;
}

function deadEnd(result) {
  // Only the closest the search came. A molecule that is further off is not
  // "how close it got", and listing several of them reads as a shortlist of
  // near-routes when none of them is one.
  const best = result.nearMisses.length ? result.nearMisses[0].distance.total : null;
  const near = result.nearMisses.filter((n) => n.distance.total === best).slice(0, 3);
  return `<div class="rg-dead">
    <h2>Nothing in this catalogue makes that</h2>
    <p class="rg-dead-line">${escapeText(searchHeadline(result))}</p>
    ${
      near.length
        ? `<h3>How close it got</h3>
          <ul class="rg-near">
            ${near
              .map((n) => {
                const d = n.distance;
                const gaps = [
                  d.coreOff ? `wrong skeleton` : null,
                  d.missing.length ? `short of ${d.missing.map((g) => groupMeta(g).label).join(', ')}` : null,
                  d.extra.length ? `still carrying ${d.extra.map((g) => groupMeta(g).label).join(', ')}` : null,
                ].filter(Boolean);
                return `<li>
                  <strong>${escapeText(coreLabel(n.molecule.core))}</strong>
                  ${n.molecule.groups.map((g) => `<i class="rg-dot" style="--hue:${groupMeta(g).hue}" title="${escapeText(groupMeta(g).label)}"></i>`).join('')}
                  <span class="rg-near-why">${escapeText(gaps.join(', '))}${n.depth != null ? ` · ${n.depth} stage${n.depth === 1 ? '' : 's'} from ${escapeText(starterLabel(n.starterId))}` : ''}</span>
                </li>`;
              })
              .join('')}
          </ul>`
        : ''
    }
    <p class="rg-dead-note">This is the search's own answer, not a guess at one. It walked every
    molecule the forty entries can reach inside the stage limit, so there is nothing here it
    declined to look at. Nothing will offer you a chain that does not exist.</p>
    <button class="btn" data-back>Ask for something else</button>
  </div>`;
}

/* -------------------------------- the screen ------------------------------ */

export function renderRoutes(root) {
  const target = state.target;
  if (!target) {
    setState({ homeStep: 'ask' });
    return;
  }
  const result = resultFor(target);
  const crit = criterionById(state.criterion ?? 'stages');

  if (!result.reachable) {
    root.innerHTML = `<div class="rg">${head(target, result, crit, false)}${deadEnd(result)}</div>`;
    wire(root);
    return;
  }

  const ranked = rankRoutes(state.catalogue.entries, result.routes, crit.id);
  const advisedId = state.routeAdvice?.routeId ?? null;

  root.innerHTML = `<div class="rg">
    ${head(target, result, crit, true)}
    <div class="rg-body">
      <div class="rg-grid">${ranked.map((r) => card(r, advisedId)).join('')}</div>
      <aside class="rg-aside">
        <h2>Which one should I pick?</h2>
        <p class="rg-aside-sub">The grid above is already ordered by <strong>${escapeText(crit.label.toLowerCase())}</strong>,
        in code. Ask Gemini and it reads the same numbers back and names the trade-off.</p>
        ${
          state.routeAdvice
            ? `<div class="rg-advice">
                <p>${escapeText(state.routeAdvice.why)}</p>
                ${state.routeAdvice.routeId ? `<p class="rg-advice-which">It points at <strong>${escapeText(chainWords(state.routeAdvice.routeId))}</strong>.</p>` : ''}
                <p class="rg-advice-note">Gemini chose from the routes the search found and quoted the
                numbers the search measured. It cannot add a stage or name an enzyme the search did
                not find.</p>
              </div>`
            : `<button class="btn primary" data-advise ${geminiKey() ? '' : 'disabled'}>
                ${geminiKey() ? 'Ask Gemini to weigh them up' : 'Needs a Gemini key'}
              </button>
              <p class="rg-advice-note">${
                geminiKey()
                  ? 'The ordering above does not depend on this, and neither does anything else on the screen.'
                  : 'No key set, so this is off. The grid, the ordering and the run all work without it.'
              }</p>`
        }
        <details class="rg-notchecked">
          <summary>Not checked by any of this</summary>
          <ul>${NOT_CHECKED.map((l) => `<li>${escapeText(l)}</li>`).join('')}</ul>
        </details>
      </aside>
    </div>
  </div>`;
  wire(root);
}

function chainWords(routeId) {
  const route = (state.routeResult?.routes ?? []).find((r) => r.id === routeId);
  if (!route) return routeId;
  return `${coreLabel(route.molecules[0].core)} → ${route.stages.map((id) => name(id)).join(' → ')}`;
}

function head(target, result, crit, reachable) {
  return `<div class="rg-head">
    <button class="btn small ghost" data-back>‹ Change the molecule</button>
    <h1>${escapeText(describeTarget(target))}</h1>
    <p class="rg-headline">${escapeText(searchHeadline(result))}</p>
    ${
      reachable
        ? `<div class="rg-criteria" role="group" aria-label="What to optimise for">
            <span class="rg-label">Order by</span>
            ${CRITERIA.map(
              (c) =>
                `<button class="pick-chip mode ${c.id === crit.id ? 'on' : ''}" data-criterion="${c.id}" title="${escapeText(c.blurb)}">${escapeText(c.label)}</button>`,
            ).join('')}
          </div>
          <p class="rg-crit-blurb">${escapeText(crit.blurb)}</p>`
        : ''
    }
    <p class="rg-note">${escapeText(ROUTE_NOTE)}</p>
  </div>`;
}

function wire(root) {
  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-back]')) {
      setState({ homeStep: 'ask' });
      return;
    }
    const crit = e.target.closest('[data-criterion]');
    if (crit) {
      // Changing the criterion reorders in code. Any advice on screen was given
      // about the old criterion, so it goes rather than sitting there stale.
      setState({ criterion: crit.dataset.criterion, routeAdvice: null });
      return;
    }
    const play = e.target.closest('[data-play-route]');
    if (play) {
      const route = (state.routeResult?.routes ?? []).find((r) => r.id === play.dataset.playRoute);
      if (route) {
        setState({
          chosenRoute: route.id,
          homeStep: 'run',
          starterId: route.starterId,
          lane: [...route.stages],
          temp: null,
          tempLane: null,
        });
      }
      return;
    }
    if (e.target.closest('[data-advise]')) {
      await ask(root);
    }
  });
}

async function ask(root) {
  const btn = root.querySelector('[data-advise]');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Reading the numbers…';
  }
  const crit = criterionById(state.criterion ?? 'stages');
  const ranked = rankRoutes(state.catalogue.entries, state.routeResult.routes, crit.id);

  // What the model is shown: route ids, the enzymes, and the numbers the search
  // already measured. No catalogue, no rules, nothing to build a route out of.
  const rows = ranked.map(({ route, metrics }) => ({
    routeId: route.id,
    starter: coreLabel(route.molecules[0].core),
    stages: route.stages.map((id) => name(id)),
    stageCount: metrics.stages,
    supplyLoad: metrics.supplyLoad,
    cofactors: metrics.cofactors,
    needs: metrics.needs,
    temp: metrics.tempEmpty ? 'no shared temperature window at all' : `shared ${metrics.tempWindow.low}–${metrics.tempWindow.high} °C`,
    ph: metrics.phEmpty ? 'no shared pH window at all' : `shared pH ${metrics.phWindow.low}–${metrics.phWindow.high}`,
  }));

  try {
    const advice = await adviseRoute({ target: describeTarget(state.target), criterion: crit.label, rows });
    const known = rows.some((r) => r.routeId === advice.routeId);
    const screen = screenAdviceText(advice.why);

    if (!screen.ok) {
      setState({
        routeAdvice: {
          routeId: known ? advice.routeId : null,
          why: `Gemini's answer was held back because it ${screen.reason}. The grid above is ordered by ${crit.label.toLowerCase()} in code, which is what the ordering has always been.`,
        },
      });
      return;
    }
    setState({
      routeAdvice: {
        routeId: known ? advice.routeId : null,
        why: known
          ? advice.why
          : `${advice.why}\n\nIt named a route the search did not return, so nothing is highlighted below.`,
      },
    });
  } catch (err) {
    setState({
      routeAdvice: {
        routeId: null,
        why: `Gemini did not answer (${String(err.message ?? err)}). The grid is still ordered by ${crit.label.toLowerCase()}, in code, which is where the ordering comes from either way.`,
      },
    });
  }
}
