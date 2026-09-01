"""Work out what the counterparty did to the redline we sent them.

This is the whole of a second round. When a vendor returns the file, three
questions have to be answered for every position we put to them: where does
that clause live now, did they take our language, and if not what did they put
there instead.

All three are answered by diffing text, not by asking a model. "Did they accept
our wording?" has a determinate answer that string comparison gets right every
time, and the same question put to an LLM gets a plausible-sounding answer that
is wrong often enough to poison the ledger a reviewer is relying on. The model
is used for exactly one thing here: judging whether a *counter-proposal* we have
already identified still fails the playbook. That is a judgment call, which is
what it is good at.

Block indices are useless across versions - the moment they insert a paragraph,
every index below it shifts - so a clause is re-found by matching its text.
"""

import difflib
import re

# How close the current text has to sit to our proposal before we call it taken.
# Not 1.0: Word normalises spacing, vendors fix our typos and renumber clauses,
# and none of that is a rejection.
ACCEPTED_THRESHOLD = 0.93
# Above this the paragraph is materially unchanged from what they first wrote,
# which means they declined the edit rather than negotiated it.
UNCHANGED_THRESHOLD = 0.97
# Below this nothing in the document resembles the clause any more, so it was
# struck out rather than revised.
PRESENT_THRESHOLD = 0.45
# A required protection counts as added if our language turns up anywhere at
# all; vendors routinely re-draft inserted clauses into their own house style.
INSERTED_THRESHOLD = 0.72

# How far either side of the original span to look for the clause. Vendors add
# and delete paragraphs, so the anchor drifts - but it drifts locally.
SEARCH_RADIUS = 40
# Span lengths to try around the previous one, since a rewrite can merge two
# paragraphs into one or split one into three.
SPAN_DELTAS = (0, 1, -1, 2)

_WORD_RE = re.compile(r"[a-z0-9]+")


def normalise(text: str) -> str:
    """Lower-case, collapse whitespace, drop punctuation that carries no meaning
    for the comparison. Word mangles spacing and quote characters on round-trip
    and none of that is a negotiating move."""
    return " ".join((text or "").lower().replace("’", "'").split())


def tokens(text: str) -> set[str]:
    return set(_WORD_RE.findall((text or "").lower()))


def similarity(a: str, b: str) -> float:
    """Word-level ratio between two clauses, 0.0 - 1.0."""
    a, b = normalise(a), normalise(b)
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a.split(), b.split(), autojunk=False).ratio()


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _span_text(blocks: list[dict], start: int, length: int) -> str:
    return "\n".join(b["text"] for b in blocks[start : start + length])


def find_clause(
    needle: str,
    blocks: list[dict],
    around: int | None = None,
    span_len: int = 1,
) -> dict | None:
    """Locate `needle` in a new version's blocks. Returns the best span, or None.

    Two passes on purpose. A token-overlap score over every candidate span is
    cheap and narrows a 300-block contract to a handful of plausible positions;
    the real sequence ratio, which is quadratic and would be slow run 40 times
    over every span in the document, is then computed only on those.
    """
    if not needle.strip() or not blocks:
        return None

    needle_tokens = tokens(needle)
    if not needle_tokens:
        return None

    lo, hi = 0, len(blocks)
    if around is not None:
        lo = max(0, around - SEARCH_RADIUS)
        hi = min(len(blocks), around + SEARCH_RADIUS + span_len)

    lengths = sorted({max(1, span_len + d) for d in SPAN_DELTAS})
    candidates: list[tuple[float, int, int]] = []

    for length in lengths:
        for start in range(lo, max(lo, hi - length + 1)):
            span = blocks[start : start + length]
            if not span:
                continue
            span_tokens = set()
            for block in span:
                span_tokens |= tokens(block["text"])
            score = _jaccard(needle_tokens, span_tokens)
            if score > 0.2:
                candidates.append((score, start, length))

    if not candidates and around is not None:
        # Nothing nearby - the clause may have been moved to another part of the
        # document, which happens when exhibits get reordered. Widen to the whole
        # file before concluding it was deleted.
        return find_clause(needle, blocks, around=None, span_len=span_len)

    if not candidates:
        return None

    candidates.sort(reverse=True)
    best: dict | None = None
    for _, start, length in candidates[:8]:
        text = _span_text(blocks, start, length)
        score = similarity(needle, text)
        if best is None or score > best["score"]:
            best = {
                "block_start": blocks[start]["index"],
                "block_end": blocks[start + length - 1]["index"],
                "text": text,
                "score": score,
                "section": blocks[start].get("section"),
                "page": blocks[start].get("page"),
            }
    return best


def classify_response(prior, blocks: list[dict]) -> dict:
    """What the counterparty did to one position we put to them.

    Returns `{action, text, block_start, block_end, section, page, score}` where
    action is one of VENDOR_ACTIONS.
    """
    proposed = prior.proposed_text or ""
    original = prior.original_text or ""

    # A MISSING finding has no vendor text to anchor to. The only question is
    # whether the language we asked for turns up anywhere in the returned file.
    if not original.strip():
        if not proposed.strip():
            return {"action": "ignored", "text": "", "score": 0.0}
        match = find_clause(proposed, blocks, span_len=_span_len(prior))
        if match and match["score"] >= INSERTED_THRESHOLD:
            return {"action": "accepted", **_located(match)}
        return {"action": "ignored", "text": "", "score": match["score"] if match else 0.0}

    span_len = _span_len(prior)
    anchor = prior.block_start

    # Search on both our wording and theirs, and keep whichever lands better:
    # if they took our text the paragraph no longer resembles what they wrote,
    # and if they refused it no longer resembles what we asked for.
    candidates = [find_clause(original, blocks, around=anchor, span_len=span_len)]
    if proposed.strip():
        candidates.append(find_clause(proposed, blocks, around=anchor, span_len=span_len))
    matches = [m for m in candidates if m]
    if not matches:
        return {"action": "removed", "text": "", "score": 0.0}

    match = max(matches, key=lambda m: m["score"])
    current = match["text"]

    to_proposed = similarity(current, proposed) if proposed.strip() else 0.0
    to_original = similarity(current, original)

    if max(to_proposed, to_original) < PRESENT_THRESHOLD:
        return {"action": "removed", "text": "", "score": match["score"]}

    # Order matters, and getting it wrong is the worst bug this module could
    # have. Where our ask was a small addition to a long clause, text they never
    # touched still scores ~0.97 against our proposal - so testing "did they take
    # our wording?" first reports a lost point as won, and a reviewer stops
    # pushing something they never actually got. Whichever wording the paragraph
    # now sits closer to is the one they chose; ties break towards rejected,
    # because over-reporting a loss only costs a second look.
    if to_original >= UNCHANGED_THRESHOLD and to_original >= to_proposed:
        action = "rejected"
    elif to_proposed >= ACCEPTED_THRESHOLD:
        action = "accepted"
    elif to_original >= UNCHANGED_THRESHOLD:
        action = "rejected"
    else:
        action = "countered"

    return {"action": action, **_located({**match, "text": current})}


def _located(match: dict) -> dict:
    return {
        "text": match["text"],
        "block_start": match["block_start"],
        "block_end": match["block_end"],
        "section": match.get("section"),
        "page": match.get("page"),
        "score": match["score"],
    }


def _span_len(prior) -> int:
    if prior.block_start is None or prior.block_end is None:
        return 1
    return max(1, prior.block_end - prior.block_start + 1)


def changed_blocks(new_blocks: list[dict], old_blocks: list[dict]) -> list[dict]:
    """Blocks in the new version that were not in the old one.

    Where fresh risk enters. A vendor returning a contract does not only respond
    to our points - they add their own limitation of liability, widen an IP
    grant, slip in an auto-renewal. Those paragraphs get the full playbook
    treatment; everything they left alone does not need re-analysing, which is
    what keeps a fifth round from costing the same as the first.

    Exact-match on normalised text rather than fuzzy: a paragraph they retyped
    is a paragraph worth re-reading, and false positives here only cost analysis
    time while a false negative loses a clause nobody ever looks at again.
    """
    seen = {normalise(b["text"]) for b in old_blocks}
    fresh = []
    for block in new_blocks:
        text = normalise(block["text"])
        # Short fragments - headings, "Signature:", numbering - churn between
        # versions without carrying meaning, and flooding the analyser with them
        # buys nothing.
        if len(text) < 40:
            continue
        if text not in seen:
            fresh.append(block)
    return fresh


def revision_authors(annotations: dict) -> list[str]:
    """Distinct authors of the tracked changes in a returned file."""
    seen: list[str] = []
    for revision in (annotations or {}).get("revisions", []):
        author = revision.get("author")
        if author and author not in seen:
            seen.append(author)
    return seen
