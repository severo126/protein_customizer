import test from 'node:test';
import assert from 'node:assert/strict';
import { geminiBody, sendGemini, RETRY_STATUS } from '../src/model/gemini-request.js';

test('a request asks for no thinking, so the output budget pays for the answer', () => {
  const body = geminiBody('say something', { max_output_tokens: 500 });
  assert.deepEqual(body.contents, [{ parts: [{ text: 'say something' }] }]);
  assert.equal(body.generationConfig.maxOutputTokens, 500);
  assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingBudget: 0 });
});

test('an agent with no stated cap still gets one', () => {
  assert.equal(geminiBody('x', {}).generationConfig.maxOutputTokens, 1024);
  assert.equal(geminiBody('x').generationConfig.maxOutputTokens, 1024);
});

test('the fallback request carries no thinkingConfig at all', () => {
  const body = geminiBody('x', { max_output_tokens: 500 }, { thinking: true });
  assert.equal('thinkingConfig' in body.generationConfig, false);
  assert.equal(body.generationConfig.maxOutputTokens, 500);
});

test('a reply that is not a 400 is returned as it came, with one request sent', async () => {
  const sent = [];
  const res = await sendGemini('x', { max_output_tokens: 500 }, (body) => {
    sent.push(body);
    return Promise.resolve({ status: 200, marker: 'first' });
  });
  assert.equal(sent.length, 1);
  assert.equal(res.marker, 'first');
  assert.deepEqual(sent[0].generationConfig.thinkingConfig, { thinkingBudget: 0 });
});

test('a model that rejects thinkingConfig is retried once without it, rather than failing every call', async () => {
  // gemini-flash-latest is an alias, so the model behind it can change without
  // this repository changing. If a later one refuses the field, the app must
  // fall back to today's behaviour, not 400 on every Gemini feature at once.
  const sent = [];
  const res = await sendGemini('x', { max_output_tokens: 500 }, (body) => {
    sent.push(body);
    return Promise.resolve({ status: sent.length === 1 ? RETRY_STATUS : 200, marker: `try${sent.length}` });
  });
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0].generationConfig.thinkingConfig, { thinkingBudget: 0 });
  assert.equal('thinkingConfig' in sent[1].generationConfig, false);
  assert.equal(res.marker, 'try2');
});

test('the retry happens at most once, so a genuine 400 is reported rather than looped', async () => {
  let calls = 0;
  const res = await sendGemini('x', {}, () => {
    calls += 1;
    return Promise.resolve({ status: RETRY_STATUS });
  });
  assert.equal(calls, 2);
  assert.equal(res.status, RETRY_STATUS);
});

test('a rate limit or a server error is not retried, because dropping the field would not help', async () => {
  for (const status of [429, 500, 503]) {
    let calls = 0;
    const res = await sendGemini('x', {}, () => {
      calls += 1;
      return Promise.resolve({ status });
    });
    assert.equal(calls, 1, `status ${status} should not be retried`);
    assert.equal(res.status, status);
  }
});

test('every model-backed agent is given room for an answer on top of whatever it thinks', async () => {
  const registry = JSON.parse(await (await import('node:fs/promises')).readFile('config/agents.json', 'utf8'));
  for (const agent of registry.agents) {
    if (!agent.model) continue; // sweep-runner has no model and no output budget
    assert.ok(
      agent.limits.max_output_tokens >= 1500,
      `${agent.id} caps output at ${agent.limits.max_output_tokens}; thinking tokens are spent out of that budget, so a cap this low returns the answer cut off mid-word`,
    );
  }
});
