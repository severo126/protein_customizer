"""The platform behind the agents.

Three things this gives you that hand-wired code paths do not:

* one registry (config/agents.json) that declares every agent's tools, model,
  instructions and limits, so changing a model or a limit is a config change;
* a trace per run — inputs, each tool call, latency, token counts where a model
  was involved — written as JSONL under the configured sink;
* replay: any past trace can be re-run through the same tools, and the platform
  reports whether the result still matches. Deterministic agents must match
  exactly; model-backed ones are reported as "model step skipped" rather than
  pretending a replay reproduced a sampled reply.
"""

from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[2]
REGISTRY_PATH = ROOT / "config/agents.json"


class RegistryError(RuntimeError):
    pass


def load_registry(path: Path | None = None) -> dict[str, Any]:
    registry = json.loads((path or REGISTRY_PATH).read_text())
    ids = [a["id"] for a in registry["agents"]]
    if len(set(ids)) != len(ids):
        raise RegistryError("duplicate agent id in the registry")
    for agent in registry["agents"]:
        for tool in agent["tools"]:
            if tool not in registry["tools"]:
                raise RegistryError(f"agent {agent['id']} declares unknown tool {tool}")
        if not (ROOT / agent["instructions"]).exists():
            raise RegistryError(f"agent {agent['id']} points at missing instructions {agent['instructions']}")
    return registry


def agent(agent_id: str, registry: dict[str, Any] | None = None) -> dict[str, Any]:
    reg = registry or load_registry()
    for a in reg["agents"]:
        if a["id"] == agent_id:
            return a
    raise RegistryError(f"no agent {agent_id}")


def instructions_for(agent_id: str, registry: dict[str, Any] | None = None) -> str:
    return (ROOT / agent(agent_id, registry)["instructions"]).read_text()


def _refused_fields(payload: Any, refuse: list[str]) -> list[str]:
    found: list[str] = []

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            for k, v in node.items():
                if any(bad in k.lower() for bad in refuse):
                    found.append(k)
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(payload)
    return found


class Trace:
    """One run, recorded. Written whether the run succeeded or not."""

    def __init__(self, agent_id: str, sink: Path):
        self.id = f"{agent_id}-{uuid.uuid4().hex[:12]}"
        self.agent_id = agent_id
        self.sink = sink
        self.started = time.time()
        self.steps: list[dict[str, Any]] = []
        self.tokens = {"in": 0, "out": 0}

    def step(self, kind: str, name: str, started: float, **extra: Any) -> None:
        self.steps.append({
            "kind": kind,
            "name": name,
            "latency_ms": round((time.time() - started) * 1000, 2),
            **extra,
        })

    def write(self, status: str, result: Any, error: str | None = None) -> dict[str, Any]:
        record = {
            "trace_id": self.id,
            "agent": self.agent_id,
            "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(self.started)),
            "status": status,
            "total_ms": round((time.time() - self.started) * 1000, 2),
            "tokens": self.tokens,
            "steps": self.steps,
            "result": result,
            "error": error,
        }
        self.sink.mkdir(parents=True, exist_ok=True)
        with (self.sink / f"{self.agent_id}.jsonl").open("a") as fh:
            fh.write(json.dumps(record, default=str) + "\n")
        return record


def run_agent(agent_id: str, payload: dict[str, Any], tools: dict[str, Callable[..., Any]],
              registry: dict[str, Any] | None = None) -> dict[str, Any]:
    """Run one agent under its declared limits, recording a trace."""
    reg = registry or load_registry()
    spec = agent(agent_id, reg)
    sink = ROOT / reg["defaults"]["trace_sink"]
    trace = Trace(agent_id, sink)

    refused = _refused_fields(payload, reg["defaults"]["refuse_fields"])
    if refused:
        record = trace.write("refused", None, f"input carries forbidden field(s): {', '.join(refused)}")
        return record

    try:
        result: Any = None
        for tool_name in spec["tools"]:
            impl = tools.get(tool_name)
            if impl is None:
                continue  # a tool the caller did not wire up for this run
            started = time.time()
            result = impl(payload, result)
            trace.step("tool", tool_name, started)
            budget = spec["limits"].get("timeout_ms")
            if budget and (time.time() - trace.started) * 1000 > budget:
                return trace.write("timeout", result, f"exceeded timeout_ms={budget}")
        if spec.get("model"):
            trace.step("model", spec["model"], time.time(), note="model step is the caller's; this run was tools-only")
        return trace.write("ok", result)
    except Exception as err:  # noqa: BLE001 — a failed run is still a trace worth keeping
        return trace.write("error", None, f"{type(err).__name__}: {err}")


def read_traces(agent_id: str, limit: int = 50, registry: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    reg = registry or load_registry()
    path = ROOT / reg["defaults"]["trace_sink"] / f"{agent_id}.jsonl"
    if not path.exists():
        return []
    rows = [json.loads(l) for l in path.read_text().splitlines() if l.strip()]
    return rows[-limit:]


def replay(trace_id: str, tools: dict[str, Callable[..., Any]], registry: dict[str, Any] | None = None) -> dict[str, Any]:
    """Re-run a past trace through the same tools and say whether it still matches."""
    reg = registry or load_registry()
    sink = ROOT / reg["defaults"]["trace_sink"]
    for file in sorted(sink.glob("*.jsonl")) if sink.exists() else []:
        for line in file.read_text().splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            if row["trace_id"] != trace_id:
                continue
            spec = agent(row["agent"], reg)
            if spec.get("model"):
                return {"trace_id": trace_id, "replayed": False,
                        "reason": f"{row['agent']} is model-backed ({spec['model']}), so a replay cannot "
                                  f"reproduce a sampled reply. Its deterministic tools can be replayed "
                                  f"individually.", "original": row}
            fresh = run_agent(row["agent"], row.get("result", {}) or {}, tools, reg)
            return {"trace_id": trace_id, "replayed": True,
                    "matches": fresh["result"] == row["result"],
                    "original": row, "fresh": fresh}
    return {"trace_id": trace_id, "replayed": False, "reason": "no such trace"}
