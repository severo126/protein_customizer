"""Nano Foundry filter service — the Python API.

    python3 py/service.py            # port 8000

Endpoints
    GET  /health
    POST /filters          {a, site_a, b, site_b, linker, team[]}  → six filter verdicts
    POST /lane             {starter, stages[]}                     → lane + traffic lights
    GET  /funnel?a=&b=     candidate funnel for a pair
    GET  /agents           the registry as declared in config/agents.json
    POST /agents/<id>/run  run an agent's deterministic tools, recording a trace
    GET  /agents/<id>/traces
    POST /traces/<id>/replay
    GET  /metrics          per-agent run counts, latency and token totals

Nothing here can emit a sequence: there is no such field in the model, and any
request carrying a sequence-shaped field name is refused rather than processed.
"""

from __future__ import annotations

import json
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))

from nano_foundry.agents import load_registry, read_traces, replay, run_agent  # noqa: E402
from nano_foundry.compatibility import team_report  # noqa: E402
from nano_foundry.molecules import starter  # noqa: E402
from nano_foundry.pipeline import run_pipeline  # noqa: E402
from nano_foundry.splice import run_filters, splice_funnel  # noqa: E402
from nano_foundry.tools import BY_ID, TOOLS  # noqa: E402

PORT = 8000
SEQUENCE_KEY = re.compile(r"sequence|fasta|genbank|codon|oligo|primer|residues?_string|aa_?seq|nt_?seq", re.I)


def _site(entry: dict, site_id: str | None) -> dict:
    return next((s for s in entry["domain"]["sites"] if s["id"] == site_id), entry["domain"]["sites"][0])


def _public_results(v: dict) -> dict:
    return {
        "killed_by": v["killedBy"],
        "passed": v["passed"],
        "verdict": "Nothing here ruled this out" if v["passed"] else "Ruled out by this toy",
        "results": [{"id": r["id"], "label": r["label"], "pass": r["pass"], "reason": r["reason"]} for r in v["results"]],
        "geometry": {
            "join_distance_nm": round(v["geometry"]["joinDistance"], 3),
            "centre_distance_nm": round(v["geometry"]["centreDistance"], 3),
            "radius_of_gyration_nm": round(v["rg"], 3),
            "expected_band_nm": [round(v["rgBand"]["low"], 3), round(v["rgBand"]["high"], 3)],
        },
        "disclaimer": "Classroom cartoon with order-of-magnitude-wrong physics. Passing means only that "
                      "this toy did not rule it out. Nothing here says a construct would fold, function, or be safe.",
    }


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:  # quieter console
        sys.stderr.write(f"{self.address_string()} {fmt % args}\n")

    def _json(self, code: int, payload) -> None:
        body = json.dumps(payload, default=str).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-headers", "content-type")
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict:
        length = int(self.headers.get("content-length", 0))
        payload = json.loads(self.rfile.read(length) or b"{}")
        bad = [k for k in _all_keys(payload) if SEQUENCE_KEY.search(k)]
        if bad:
            raise ValueError(f"refusing a request carrying field(s): {', '.join(bad)}")
        return payload

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._json(204, {})

    def do_GET(self) -> None:  # noqa: N802
        url = urlparse(self.path)
        q = parse_qs(url.query)

        if url.path == "/health":
            return self._json(200, {"ok": True, "service": "nano-foundry-filters"})

        if url.path == "/agents":
            return self._json(200, load_registry())

        if url.path == "/funnel":
            a = BY_ID.get((q.get("a") or [""])[0])
            b = BY_ID.get((q.get("b") or [""])[0])
            if not a or not b:
                return self._json(400, {"error": "a and b must be catalogue ids"})
            team = [BY_ID[i] for i in q.get("team", []) if i in BY_ID]
            f = splice_funnel(a, b, team)
            return self._json(200, {
                "pair": f["pairLabel"],
                "went_in": f["went_in"],
                "funnel": [{"id": s["id"], "label": s["label"], "killed": s["killed"],
                            "entering": s["entering"], "leaving": s["leaving"]} for s in f["funnel"]],
                "survivors": [{"site_a": c["siteA"]["id"], "site_b": c["siteB"]["id"],
                               "linker": c["linkerUnits"]} for c in f["survivors"]],
            })

        m = re.fullmatch(r"/agents/([\w-]+)/traces", url.path)
        if m:
            return self._json(200, {"agent": m.group(1), "traces": read_traces(m.group(1))})

        if url.path == "/metrics":
            registry = load_registry()
            out = []
            for agent in registry["agents"]:
                traces = read_traces(agent["id"], limit=500, registry=registry)
                latencies = sorted(t["total_ms"] for t in traces) if traces else []
                out.append({
                    "agent": agent["id"],
                    "model": agent["model"],
                    "runs": len(traces),
                    "ok": sum(1 for t in traces if t["status"] == "ok"),
                    "refused": sum(1 for t in traces if t["status"] == "refused"),
                    "errors": sum(1 for t in traces if t["status"] == "error"),
                    "p50_ms": latencies[len(latencies) // 2] if latencies else None,
                    "p95_ms": latencies[int(len(latencies) * 0.95) - 1] if len(latencies) >= 2 else None,
                    "tokens_in": sum(t["tokens"]["in"] for t in traces),
                    "tokens_out": sum(t["tokens"]["out"] for t in traces),
                    "limits": agent["limits"],
                })
            return self._json(200, {"agents": out})

        return self._json(404, {"error": "no such endpoint"})

    def do_POST(self) -> None:  # noqa: N802
        url = urlparse(self.path)
        try:
            payload = self._body()
        except ValueError as err:
            return self._json(400, {"error": str(err)})
        except json.JSONDecodeError:
            return self._json(400, {"error": "body must be JSON"})

        if url.path == "/filters":
            a = BY_ID.get(payload.get("a", ""))
            b = BY_ID.get(payload.get("b", ""))
            if not a or not b:
                return self._json(400, {"error": "a and b must be catalogue ids"})
            team = [BY_ID[i] for i in payload.get("team", []) if i in BY_ID]
            v = run_filters(a, _site(a, payload.get("site_a")), b, _site(b, payload.get("site_b")),
                            int(payload.get("linker", 6)), team)
            return self._json(200, _public_results(v))

        if url.path == "/lane":
            stages = [BY_ID[s] for s in payload.get("stages", []) if s in BY_ID]
            try:
                mol = starter(payload.get("starter", "glucose"))
            except KeyError as err:
                return self._json(400, {"error": str(err)})
            run = run_pipeline(mol, stages)
            team = team_report(stages)
            return self._json(200, {
                "stalled": run["stalled"],
                "stalled_at": run["stalled_at"],
                "stages": [{"index": s["index"], "enzyme": s["enzyme"]["id"], "state": s["state"],
                            "did": s.get("what"), "stall_reason": s.get("stall_reason")} for s in run["stages"]],
                "product": ({"core": run["product"].core, "groups": list(run["product"].groups)}
                            if run["product"] else None),
                "score": run["score"],
                "score_disclaimer": run["score_disclaimer"],
                "lights": [{"id": l["id"], "colour": l["colour"], "message": l["message"]} for l in team["lights"]],
                "worst": team["worst"],
            })

        m = re.fullmatch(r"/agents/([\w-]+)/run", url.path)
        if m:
            return self._json(200, run_agent(m.group(1), payload, TOOLS))

        m = re.fullmatch(r"/traces/([\w-]+)/replay", url.path)
        if m:
            return self._json(200, replay(m.group(1), TOOLS))

        return self._json(404, {"error": "no such endpoint"})


def _all_keys(node, out=None):
    out = [] if out is None else out
    if isinstance(node, dict):
        for k, v in node.items():
            out.append(k)
            _all_keys(v, out)
    elif isinstance(node, list):
        for v in node:
            _all_keys(v, out)
    return out


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    print(f"Nano Foundry filter service on http://localhost:{port}")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
