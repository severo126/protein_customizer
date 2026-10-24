"""Number formatting that matches JavaScript.

The parity cases compare strings as well as verdicts, so Python has to round the
way JavaScript does: Math.round is half-up, Python's round() is half-to-even,
and toFixed works from the exact binary value of the float.
"""

from __future__ import annotations

import math
from decimal import Decimal, ROUND_HALF_UP


def js_round(x: float) -> int:
    """Math.round: half-up, including on negatives (Math.round(-0.5) === -0)."""
    return int(math.floor(x + 0.5))


def to_fixed(x: float, digits: int = 2) -> str:
    """Number.prototype.toFixed, to the precision the cartoon prints."""
    quantum = Decimal(1).scaleb(-digits)
    return str(Decimal(x).quantize(quantum, rounding=ROUND_HALF_UP))
