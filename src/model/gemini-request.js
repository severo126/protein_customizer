// The shape of a Gemini request, agreed between the browser and the API server.
//
// It lives beside the model, rather than in src/ui or tools/api, for the same
// reason the filters do: both halves have to build the identical request, and
// a difference between them would show up as one half of the app answering and
// the other half not.
//
// Why thinking is turned off. gemini-flash-latest is a thinking model, and its
// thinking tokens are spent out of max_output_tokens. The registry caps these
// agents at 400-600 tokens, which the thinking alone can consume, so the answer
// arrives cut off mid-word: the route adviser returned
//
//   {"routeId":"r1","why":"Both r1 and r3 tie on your criterion with
//
// and the JSON never parses. Raising the cap does not fix it, because the
// thinking budget scales with the cap: at 500 tokens the answer was 45
// characters, at 1024 it was 129. Every one of these agents reads numbers back
// or puts a verdict into plain words, with the instructions spelling out the
// shape of the reply; none of them needs to reason its way there.

export const RETRY_STATUS = 400;

export function geminiBody(prompt, limits = {}, { thinking = false } = {}) {
  const generationConfig = { maxOutputTokens: limits.max_output_tokens ?? 1024 };
  // Asking for no thinking is the whole point, so it goes in by default. The
  // flag exists for the one case below: a model that rejects the field.
  if (!thinking) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  return { contents: [{ parts: [{ text: prompt }] }], generationConfig };
}

// Send a prompt through the caller's transport, once with thinking off and, if
// that is rejected outright, once without the field at all.
//
// The fallback is not politeness. `gemini-flash-latest` is an alias, so the
// model behind it changes without this repository changing, and a model that
// refuses thinkingConfig would turn every Gemini call in the app into a 400 —
// worse than the truncation this is here to fix. One retry costs a second
// request on a request that already failed, and keeps the floor at today's
// behaviour.
export async function sendGemini(prompt, limits, post) {
  const first = await post(geminiBody(prompt, limits));
  if (first.status !== RETRY_STATUS) return first;
  return post(geminiBody(prompt, limits, { thinking: true }));
}
