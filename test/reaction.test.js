// The reaction cartoon may only ever show what the deterministic rule did.
// These tests pin that, and pin what the scene is allowed to claim.

import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogue, byId } from './helpers.js';
import { reactionScene, reactionPanel, REACTION_NOTE } from '../src/ui/reaction.js';
import { STARTERS, starter, describe as describeMol } from '../src/model/molecules.js';
import { runStage } from '../src/model/pipeline.js';
import { FORBIDDEN_VERDICT_WORDS } from '../src/model/disclaimers.js';

test('a stage that refuses its input gets a refusal, not a product', () => {
  // Glucose isomerase only rearranges a glucose skeleton.
  const scene = reactionScene(byId('glucose-isomerase'), starter('glycerol'));
  assert.match(scene, /no product · the stage stalls/);
  assert.match(scene, /only rearranges a Glucose skeleton/);
  assert.ok(!/out · /.test(scene), 'a refused stage must not draw a product');
});

test('a stage that runs shows the product the rule actually produced', () => {
  const entry = byId('hexokinase');
  const mol = starter('glucose');
  const result = runStage(mol, entry);
  assert.ok(result.ok);
  const scene = reactionScene(entry, mol);
  assert.ok(scene.includes(describeMol(result.product)), 'the scene must name the rule\'s own product');
  assert.ok(scene.includes(describeMol(mol)));
});

test('every catalogue entry can be played against every starting molecule', () => {
  for (const entry of catalogue.entries) {
    for (const s of STARTERS) {
      const scene = reactionScene(entry, starter(s.id));
      assert.ok(scene.length > 0);
      assert.match(scene, /Cartoon, not a trajectory/);
    }
  }
});

test('no scene claims more than a cartoon can', () => {
  const words = [...FORBIDDEN_VERDICT_WORDS, 'mechanism', 'rate constant', 'predicts'];
  for (const entry of catalogue.entries) {
    const scene = reactionPanel(entry, starter('glucose'));
    for (const word of words) {
      assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(scene), `${entry.id} scene says "${word}"`);
    }
  }
});

test('the standing note on the animation says the motion is invented', () => {
  assert.match(REACTION_NOTE, /invented/);
  assert.match(REACTION_NOTE, /made-up speed/);
  assert.match(reactionPanel(byId('lipase'), starter('tributyrin')), /stylised animation/i);
});

test('a scene can be frozen on a named frame, so a screenshot is reproducible', () => {
  const a = reactionScene(byId('hexokinase'), starter('glucose'), { freeze: 'transfer' });
  const b = reactionScene(byId('hexokinase'), starter('glucose'), { freeze: 'transfer' });
  assert.match(a, /animation-play-state:paused/);
  // Only the generated element ids differ between two renders of the same pair.
  assert.equal(a.replace(/\br\d+\b/g, 'rN').replace(/\b[em]\d+-/g, 'x-'), b.replace(/\br\d+\b/g, 'rN').replace(/\b[em]\d+-/g, 'x-'));
});
