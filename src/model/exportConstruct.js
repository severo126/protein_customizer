// Exporting a construct.
//
// The export carries domain names, cartoon geometry and filter verdicts, and
// nothing else. There is no sequence field, no coordinate set, no ordering
// information, and no construct "design" — by design. See docs/scope.md §2.
// test/no-sequence.test.js walks everything this module produces.

import { PASS_VERDICT, NOT_CHECKED, CARTOON_PHYSICS_NOTE } from './disclaimers.js';

export const EXPORT_KIND = 'nano-foundry/cartoon-construct';

export function exportConstruct({ entryA, siteA, entryB, siteB, linkerUnits, verdict }) {
  return {
    kind: EXPORT_KIND,
    disclaimer: CARTOON_PHYSICS_NOTE,
    not_a_design: 'This is a cartoon of two labelled blobs and a linker. It is not a protein design and contains nothing a laboratory could act on.',
    construct: {
      label: `${entryA.name} ⟶ ${entryB.name} cartoon fusion`,
      domains: [
        { parent: entryA.name, parent_id: entryA.id, domain: entryA.domain.label, cut_site: siteA.label, cut_region: siteA.region },
        { parent: entryB.name, parent_id: entryB.id, domain: entryB.domain.label, cut_site: siteB.label, cut_region: siteB.region },
      ],
      linker: { units: linkerUnits, reach_nm: Number((verdict.geometry.span).toFixed(3)), note: 'Cartoon rubber band, not a residue run.' },
      cartoon_geometry: {
        centre_distance_nm: round(verdict.geometry.centreDistance),
        join_distance_nm: round(verdict.geometry.joinDistance),
        radius_a_nm: round(verdict.geometry.radiusA),
        radius_b_nm: round(verdict.geometry.radiusB),
        radius_of_gyration_nm: round(verdict.rg),
        expected_rg_band_nm: [round(verdict.rgBand.low), round(verdict.rgBand.high)],
      },
    },
    filters: verdict.results.map((r) => ({ filter: r.id, label: r.label, pass: r.pass, reason: r.reason })),
    verdict: verdict.passed ? PASS_VERDICT : 'Ruled out by this toy',
    verdict_meaning: verdict.passed
      ? 'A pass is the absence of a red flag from a cartoon. Nothing here says this construct would fold, function, or be safe.'
      : 'One of the cartoon filters flagged this candidate. That is not a statement about real behaviour either.',
    not_checked: NOT_CHECKED,
  };
}

export function exportPipeline({ run, entries, team }) {
  return {
    kind: 'nano-foundry/cartoon-pipeline',
    disclaimer: CARTOON_PHYSICS_NOTE,
    start: { core: run.start.core, groups: run.start.groups },
    stages: run.stages.map((s) => ({
      index: s.index,
      enzyme: s.enzyme.name,
      enzyme_id: s.enzyme.id,
      family: s.enzyme.family,
      state: s.state,
      did: s.what ?? null,
      stall_reason: s.stallReason ?? null,
      product: s.product ? { core: s.product.core, groups: s.product.groups } : null,
    })),
    product: run.product ? { core: run.product.core, groups: run.product.groups } : null,
    foundry_score: { value: run.score.value, basis: run.score.basis, disclaimer: run.scoreDisclaimer },
    team_lights: team ? team.lights.map((l) => ({ check: l.id, colour: l.colour, message: l.message })) : [],
    not_checked: NOT_CHECKED,
  };
}

// A workstation build: the behaviours that were asked for, the catalogue
// domains that cover them, and the cartoon compatibility verdict. Like every
// other export here it carries domain names and nothing a laboratory could act
// on — no sequence, no coordinates, no ordering information. See docs/scope.md
// §2; test/behaviours.test.js walks everything this function produces.
export function exportBuild({ wants, build, impossible = [] }) {
  return {
    kind: 'nano-foundry/cartoon-build',
    disclaimer: CARTOON_PHYSICS_NOTE,
    not_a_design: 'This is a named set of cartoon domains assembled from a fixed catalogue. It is not a protein design and contains nothing a laboratory could act on.',
    asked_for: wants.map((w) => ({ behaviour: w.id, reads_as: w.label, judged: w.scope })),
    not_in_this_catalogue: impossible.map((w) => w.id),
    build: {
      label: build.label,
      domains: build.domains.map((d) => ({ parent: d.parent, parent_id: d.parentId, domain: d.domain })),
      covered: build.covered,
      of: build.total,
      uncovered: build.missing,
      coverage: build.coverage.map((r) => ({ behaviour: r.id, covered: r.met, by: r.by, because: r.detail })),
    },
    compatibility: build.lights.map((l) => ({ check: l.id, colour: l.colour, message: l.message })),
    verdict: build.verdict.headline,
    verdict_meaning: build.verdict.detail,
    not_checked: NOT_CHECKED,
  };
}

function round(n) {
  return Number(n.toFixed(3));
}
