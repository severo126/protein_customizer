"""Symbolic molecule model — the Python half of the pair.

Mirrors src/model/molecules.js exactly. A molecule is a core label plus a
multiset of named groups; there are no atoms, no valences and no energies here
either. Any change on this side must be made on the JavaScript side too, and
the parity cases in src/data/parity-cases.json are what hold the two together.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Iterable

GROUPS = {
    "hydroxyl": {"label": "hydroxyl", "symbol": "OH"},
    "phosphate": {"label": "phosphate", "symbol": "P"},
    "methyl": {"label": "methyl", "symbol": "Me"},
    "sugar": {"label": "sugar", "symbol": "Su"},
    "acyl": {"label": "acyl", "symbol": "Ac"},
    "carboxyl": {"label": "carboxyl", "symbol": "CO2H"},
    "amine": {"label": "amine", "symbol": "NH2"},
    "carbonyl": {"label": "carbonyl", "symbol": "C=O"},
    "sulfate": {"label": "sulfate", "symbol": "S"},
    "peptide": {"label": "peptide link", "symbol": "~"},
    "peroxide": {"label": "peroxide", "symbol": "OO"},
    "amide": {"label": "amide", "symbol": "CON"},
    "bond": {"label": "new bond", "symbol": "—"},
    "ring": {"label": "new ring", "symbol": "◇"},
}


def article(word: str) -> str:
    """"a hydroxyl" but "an acyl". Mirrors article() in src/model/molecules.js."""
    return f"an {word}" if word[:1].lower() in "aeiou" else f"a {word}"


def group_meta(name: str) -> dict:
    return GROUPS.get(name, {"label": name, "symbol": "?"})


@dataclass(frozen=True)
class Molecule:
    core: str
    groups: tuple[str, ...]
    label: str = ""

    def with_groups(self, groups: Iterable[str]) -> "Molecule":
        return replace(self, groups=tuple(groups))

    def with_core(self, core: str) -> "Molecule":
        return replace(self, core=core)


STARTERS: dict[str, Molecule] = {
    "glucose": Molecule("glucose", ("hydroxyl", "hydroxyl", "hydroxyl"), "Glucose"),
    "glycerol": Molecule("glycerol", ("hydroxyl", "hydroxyl", "hydroxyl"), "Glycerol"),
    "catechol": Molecule("catechol", ("hydroxyl", "hydroxyl"), "Catechol"),
    "glycine": Molecule("glycine", ("amine", "carboxyl"), "Glycine"),
    "pyruvate": Molecule("pyruvate", ("carboxyl", "carbonyl"), "Pyruvate"),
    "triose": Molecule("triose", ("phosphate", "hydroxyl", "carbonyl"), "Triose phosphate"),
    "starch": Molecule("starch", ("sugar", "sugar", "hydroxyl"), "Starch fragment"),
    "cellulose": Molecule("cellulose", ("sugar", "sugar", "sugar"), "Cellulose fragment"),
    "tributyrin": Molecule("tributyrin", ("acyl", "acyl", "acyl"), "Small fat"),
    "fumarate": Molecule("fumarate", ("carboxyl", "carboxyl"), "Fumarate"),
    "aspartate": Molecule("aspartate", ("amine", "carboxyl", "carboxyl"), "Aspartate"),
    "urea": Molecule("urea", ("amide", "amine"), "Urea"),
    "peroxide": Molecule("peroxide", ("peroxide",), "Hydrogen peroxide"),
    "nitrile": Molecule("nitrile", ("bond",), "Small nitrile"),
    "protein-stain": Molecule("protein-stain", ("peptide", "peptide", "amine"), "Protein stain fragment"),
    "acetoacetate": Molecule("acetoacetate", ("acyl", "carbonyl", "carboxyl"), "Acetoacetate"),
    "glycerate-2-p": Molecule("glycerate-2-p", ("phosphate", "carboxyl", "hydroxyl"), "2-Phosphoglycerate"),
    "glucose-1-p": Molecule("glucose-1-p", ("phosphate", "hydroxyl", "hydroxyl"), "Glucose-1-phosphate"),
}


def starter(name: str) -> Molecule:
    if name not in STARTERS:
        raise KeyError(f"unknown starter: {name}")
    return STARTERS[name]


def has_groups(mol: Molecule, required: Iterable[str]) -> bool:
    pool = list(mol.groups)
    for g in required:
        if g not in pool:
            return False
        pool.remove(g)
    return True


def remove_groups(groups: Iterable[str], to_remove: Iterable[str]) -> list[str]:
    pool = list(groups)
    for g in to_remove:
        if g in pool:
            pool.remove(g)
    return pool


def pretty_core(core: str) -> str:
    return " ".join(w if len(w) <= 2 else w[0].upper() + w[1:] for w in core.split("-"))


def describe(mol: Molecule) -> str:
    counts: dict[str, int] = {}
    for g in mol.groups:
        counts[g] = counts.get(g, 0) + 1
    parts = [
        f"{n}× {group_meta(g)['label']}" if n > 1 else group_meta(g)["label"]
        for g, n in counts.items()
    ]
    return f"{pretty_core(mol.core)} with {', '.join(parts)}" if parts else pretty_core(mol.core)
