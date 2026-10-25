// What may come back out of a literature search.
//
// /api/sources reaches the open literature, and the open literature contains a
// great deal that docs/scope.md §1 deliberately keeps out of this app: toxins,
// virulence factors, select agents, human pathogens. The catalogue excludes all
// of it by hand. A search box that pipes results straight to the page would walk
// round that exclusion, so results are screened here before they are returned,
// and the count of what was dropped is reported rather than hidden.
//
// This is a coarse keyword screen, not a classifier, and it is meant to be
// coarse: dropping a harmless paper because its title mentions a pathogen costs
// nothing, and the panel says plainly when something was dropped.

// §1's own exclusions, plus the obvious names for each.
const EXCLUDED_TOPIC =
  /\b(toxin|toxins|toxoid|neurotoxin|enterotoxin|cytotoxin|exotoxin|endotoxin|mycotoxin|virulence|pathogen|pathogens|pathogenic|pathogenesis|select agent|select agents|bioweapon|bioweapons|biowarfare|bioterror\w*|weaponi[sz]\w*|anthrax|botulinum|botulism|ricin|abrin|tetanus|diphtheria|cholera|plague|tularemia|brucell\w*|smallpox|variola|ebola|marburg|nipah|hendra|influenza|sars|mers|coronavirus|hemolysin|haemolysin|invasin|adhesin|nerve agent|chemical weapon)\b/i;

// A snippet that has pasted a run of residue or nucleotide letters into its
// text. §2 says none of that reaches the page, retrieved or not.
const RESIDUE_RUN = /\b[ACDEFGHIKLMNPQRSTVWY]{20,}\b/;
const NUCLEOTIDE_RUN = /\b[ACGTU]{20,}\b/i;

export function referenceIsAllowed(ref) {
  const text = [ref?.title, ref?.snippet, ref?.link].filter((s) => typeof s === 'string').join(' ');
  if (!text.trim()) return false;
  if (EXCLUDED_TOPIC.test(text)) return false;
  if (RESIDUE_RUN.test(text)) return false;
  if (NUCLEOTIDE_RUN.test(text)) return false;
  return true;
}

// Returns the references that may be shown and how many were held back, so the
// caller can say "two results were dropped" instead of quietly shortening a list.
export function screenReferences(results) {
  const all = Array.isArray(results) ? results : [];
  const kept = all.filter(referenceIsAllowed);
  return { kept, dropped: all.length - kept.length };
}
