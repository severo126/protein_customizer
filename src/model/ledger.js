// The cofactor balance sheet for a lane.
//
// compatibility.js already catches one cofactor failure: an early stage that
// destroys something a later stage still needs. This file asks the broader
// question a designer asks first — does the lane balance its own books? — and it
// makes a distinction the traffic light does not.
//
// Not every cofactor is consumed. A metal ion or a prosthetic group has to be
// PRESENT, and it is still there afterwards; it is a condition of the pot, not a
// quantity you spend. A group donor is consumed stoichiometrically every
// turnover, and something has to put it back or the lane stops when the pool
// runs out. Lumping the two together, as a single "cofactor" string does, is the
// most common way a student misreads a route.
//
// No new catalogue fields: everything here is read off the `cofactor` and
// `destroys` strings already in the file.

import { cofactorTokens, cofactorFamily } from './compatibility.js';

export const LEDGER_DISCLAIMER =
  'Counts are per stage, not per molecule: this toy has no stoichiometry. A lane that balances here has only balanced a cartoon.';

// Consumed every turnover, carrying a group onto the substrate. Something has to
// regenerate these.
export const DONORS = ['ATP', 'SAM', 'acyl-CoA', 'acetyl-CoA', 'malonyl-CoA', 'UDP-glucose', 'UDP-sugar', 'PAPS'];

// Required present and not consumed. A pot either has them or it does not.
export const METALS = ['Mg2+', 'Ca2+', 'Zn2+', 'Ni2+', 'Fe3+'];

// Part of the enzyme itself. Carried, reused, never spent.
export const PROSTHETIC = ['heme', 'PLP', 'TPP', 'biotin'];

// A spent donor an enzyme takes BACK in, handing the loaded form out again. This
// is what makes a regeneration partner possible at all.
export const ACCEPTOR_RETURNS = { ADP: 'ATP' };

// Donors that come from the same pool, so spending one depletes the other. The
// pooling table lives in compatibility.js; this is a named alias so the call
// sites below read as being about donors rather than about cofactors generally.
export function donorFamily(token) {
  return cofactorFamily(token);
}

export function classifyCofactor(token) {
  if (DONORS.includes(token)) return 'donor';
  if (METALS.includes(token)) return 'metal';
  if (PROSTHETIC.includes(token)) return 'prosthetic';
  if (Object.prototype.hasOwnProperty.call(ACCEPTOR_RETURNS, token)) return 'acceptor';
  return 'unknown';
}

// Walk the lane and total it up.
export function ledger(entries) {
  const spends = new Map(); // donor family -> [{stage, enzyme, token}]
  const returns = new Map(); // donor family -> [{stage, enzyme, token, from}]
  const present = new Map(); // metal or prosthetic -> [{stage, enzyme}]
  const exhausts = []; // stages the catalogue says wipe a pool outright
  const unknown = new Set();

  entries.forEach((entry, i) => {
    const stage = i + 1;
    for (const token of cofactorTokens(entry.cofactor)) {
      const kind = classifyCofactor(token);
      if (kind === 'donor') {
        push(spends, donorFamily(token), { stage, enzyme: entry, token });
      } else if (kind === 'acceptor') {
        const given = ACCEPTOR_RETURNS[token];
        push(returns, donorFamily(given), { stage, enzyme: entry, token, gives: given });
      } else if (kind === 'metal' || kind === 'prosthetic') {
        push(present, token, { stage, enzyme: entry, kind });
      } else {
        unknown.add(token);
      }
    }
    for (const token of entry.destroys ?? []) {
      exhausts.push({ stage, enzyme: entry, token, family: donorFamily(token) });
    }
  });

  const families = [...new Set([...spends.keys(), ...returns.keys()])].sort();
  const donors = families.map((family) => {
    const spent = spends.get(family) ?? [];
    const back = returns.get(family) ?? [];
    return {
      family,
      spent: spent.length,
      returned: back.length,
      net: spent.length - back.length,
      spentBy: spent.map((s) => ({ stage: s.stage, id: s.enzyme.id, name: s.enzyme.name, token: s.token })),
      returnedBy: back.map((s) => ({ stage: s.stage, id: s.enzyme.id, name: s.enzyme.name, token: s.token })),
    };
  });

  const needsPresent = [...present.entries()]
    .map(([token, uses]) => ({
      token,
      kind: uses[0].kind,
      stages: uses.map((u) => u.stage),
      names: uses.map((u) => u.enzyme.name),
    }))
    .sort((a, b) => (a.token < b.token ? -1 : a.token > b.token ? 1 : 0));

  const short = donors.filter((d) => d.net > 0);

  return {
    donors,
    needsPresent,
    exhausts,
    short,
    balanced: short.length === 0,
    unknown: [...unknown].sort(),
    disclaimer: LEDGER_DISCLAIMER,
  };
}

// What the lane could add to put a donor back. Scans the fixed catalogue for an
// entry that takes the spent form in and hands the loaded form out, which in
// this catalogue means a stage running on ADP to give ATP back.
export function regenerators(entries, catalogueEntries) {
  const book = ledger(entries);
  const inLane = new Set(entries.map((e) => e.id));
  const out = [];

  for (const deficit of book.short) {
    const partners = catalogueEntries.filter((candidate) => {
      if (inLane.has(candidate.id)) return false;
      return cofactorTokens(candidate.cofactor).some(
        (token) => classifyCofactor(token) === 'acceptor' && donorFamily(ACCEPTOR_RETURNS[token]) === deficit.family,
      );
    });
    out.push({
      family: deficit.family,
      net: deficit.net,
      partners: partners.map((p) => ({ id: p.id, name: p.name, takes: cofactorTokens(p.cofactor).find((t) => classifyCofactor(t) === 'acceptor') })),
    });
  }
  return out;
}

// The light. Amber rather than red for an unbalanced lane, because running down
// a donor pool is how most real cascades start out — it is a thing to fix, not a
// contradiction.
export function checkLedger(entries, catalogueEntries = []) {
  if (!entries.length) {
    return { id: 'ledger', colour: 'grey', message: 'Add stages to total up what this lane spends.', ledger: null };
  }

  const book = ledger(entries);
  const spentTotal = book.donors.reduce((n, d) => n + d.spent, 0);

  if (!spentTotal) {
    const presence = book.needsPresent.length
      ? ` It still needs ${listTokens(book.needsPresent.map((p) => p.token))} present throughout, which a pot either has or does not.`
      : '';
    return {
      id: 'ledger',
      colour: 'green',
      message: `Nothing in this lane spends a group donor, so there is no pool to run down.${presence}`,
      ledger: book,
    };
  }

  if (book.balanced) {
    return {
      id: 'ledger',
      colour: 'green',
      message: `This lane puts back every donor it spends: ${book.donors.map((d) => `${d.spent}× ${d.family} out, ${d.returned} back`).join('; ')}.`,
      ledger: book,
    };
  }

  const suggestions = regenerators(entries, catalogueEntries);
  const named = suggestions.flatMap((s) => s.partners.map((p) => p.name));
  const fix = named.length
    ? ` ${named[0]} runs on ${suggestions[0].partners[0].takes} and would hand ${suggestions[0].family} back.`
    : ` Nothing in this catalogue regenerates ${book.short[0].family}, so a real route would bolt on a regeneration system this toy does not carry.`;

  return {
    id: 'ledger',
    colour: 'amber',
    message: `${describeShort(book.short)}${fix}`,
    ledger: book,
    suggestions,
  };
}

function describeShort(short) {
  const parts = short.map((d) => `${d.net}× ${d.family}`);
  return `This lane is a net consumer: ${parts.join(' and ')} spent with nothing putting it back.`;
}

function listTokens(tokens) {
  if (tokens.length === 1) return tokens[0];
  return `${tokens.slice(0, -1).join(', ')} and ${tokens[tokens.length - 1]}`;
}

function push(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}
