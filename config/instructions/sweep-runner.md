# Filter sweep runner — instructions

Deterministic worker, no model.

- Walk catalogue pairs up to the `max_pairs` limit, enumerate every candidate splice point
  (each site of A against each site of B, at each linker length), and run the six filters.
- Write one event row per candidate: which pair, which sites, which linker, whether it
  passed, and which filter killed it first.
- Write nothing else. In particular, write no field whose name looks like a sequence; the
  registry's `refuse_fields` list is enforced by the event sink.

This exists so the funnel history has something in it before a crowd turns up, and so the
live panel and the warehouse have the same rows to read.
