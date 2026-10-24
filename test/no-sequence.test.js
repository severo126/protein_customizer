// The scope test that matters most (docs/scope.md §2).
//
// Nothing this app holds or emits may contain an amino-acid sequence, a
// nucleotide sequence, or an ordering file. These assertions walk the whole
// catalogue and whole exported objects recursively, so a new field cannot
// quietly reintroduce one.

import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogue, byId, allStrings, allKeys, root, walkFiles } from './helpers.js';
import { readFileSync } from 'node:fs';
import { runFilters } from '../src/model/splice.js';
import { exportConstruct, exportPipeline } from '../src/model/exportConstruct.js';
import { runPipeline } from '../src/model/pipeline.js';
import { teamReport } from '../src/model/compatibility.js';
import { starter } from '../src/model/molecules.js';

const AA = 'ACDEFGHIKLMNPQRSTVWY';
// Thresholds are set above the longest words and SHOUTING_IDENTIFIERS that
// happen to use only residue letters ("methyltransferase", "DISCLAIMER") and
// well below anything a laboratory could act on. The field-name rule below is
// the structural guard; this one catches a pasted run.
const UPPER_RUN = new RegExp(`^[${AA}]{20,}$`);
const ANY_CASE_RUN = new RegExp(`^[${AA}]{25,}$`, 'i');
const NT_RUN = /^[ACGTU]{20,}$/i;
const SEQUENCE_KEY = /sequence|fasta|genbank|codon|oligo|primer|residues?_string|aa_?seq|nt_?seq/i;

// Letter-only tokens. A pasted sequence is one long token; ordinary prose and
// identifiers are many short ones.
function tokens(text) {
  return text.match(/[A-Za-z]+/g) ?? [];
}

function assertNoSequences(value, what) {
  for (const { path, value: s } of allStrings(value)) {
    for (const tok of tokens(s)) {
      assert.ok(!UPPER_RUN.test(tok), `${what}: ${path} contains a long run of upper-case residue letters: ${tok.slice(0, 80)}`);
      assert.ok(!ANY_CASE_RUN.test(tok), `${what}: ${path} contains a long run of residue letters: ${tok.slice(0, 80)}`);
      assert.ok(!NT_RUN.test(tok), `${what}: ${path} contains a long run of nucleotide letters: ${tok.slice(0, 80)}`);
    }
  }
  for (const key of allKeys(value)) {
    assert.ok(!SEQUENCE_KEY.test(key), `${what}: has a sequence-shaped field name "${key}"`);
  }
}

test('no catalogue entry carries a sequence, in any field', () => {
  assertNoSequences(catalogue, 'catalogue');
});

test('no exported construct field is a long run of residue letters', () => {
  const a = byId('lipase');
  const b = byId('alpha-amylase');
  // Export every candidate splice point for a pair, passing and failing alike.
  for (const siteA of a.domain.sites) {
    for (const siteB of b.domain.sites) {
      for (const linkerUnits of [2, 6, 12, 20]) {
        const verdict = runFilters(a, siteA, b, siteB, linkerUnits);
        const payload = exportConstruct({ entryA: a, siteA, entryB: b, siteB, linkerUnits, verdict });
        assertNoSequences(payload, 'exported construct');
      }
    }
  }
});

test('no exported pipeline field is a long run of residue letters', () => {
  const entries = [byId('hexokinase'), byId('alkaline-phosphatase'), byId('glucose-isomerase')];
  const run = runPipeline(starter('glucose'), entries);
  const payload = exportPipeline({ run, entries, team: teamReport(entries, run) });
  assertNoSequences(payload, 'exported pipeline');
});

test('every exported construct, across every catalogue pair, stays sequence-free', () => {
  // Cheap sweep: first site of each entry against the first site of the next,
  // so all 40 entries appear in an export at least once.
  const entries = catalogue.entries;
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i];
    const b = entries[(i + 1) % entries.length];
    const verdict = runFilters(a, a.domain.sites[0], b, b.domain.sites[0], 6);
    assertNoSequences(exportConstruct({ entryA: a, siteA: a.domain.sites[0], entryB: b, siteB: b.domain.sites[0], linkerUnits: 6, verdict }), `export ${a.id}+${b.id}`);
  }
});

test('no source file embeds a sequence literal', () => {
  for (const file of walkFiles(`${root}/src`, ['.js', '.json', '.html', '.css'])) {
    const text = readFileSync(file, 'utf8');
    for (const tok of tokens(text)) {
      assert.ok(!UPPER_RUN.test(tok), `${file} has a residue-run literal: ${tok.slice(0, 80)}`);
      assert.ok(!NT_RUN.test(tok), `${file} has a nucleotide-run literal: ${tok.slice(0, 80)}`);
    }
  }
});
