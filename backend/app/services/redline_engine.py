"""Find clauses, judge them against the playbook, and draft the replacement text.

Three stages, deliberately separated:

  1. `locate_clauses`   - which blocks hold a clause we hold a position on
  2. `assess_clause`    - does it pass, and if not what should it say instead
  3. `find_missing`     - which required protections are absent entirely

Stage 3 is pure Python. A model asked "what is missing?" will confabulate, but
set arithmetic over the clause types found in stages 1-2 cannot.
"""

import json
import re

from openai import AzureOpenAI

from ..config import settings

# A clause spanning more blocks than this is almost certainly a mis-detection
# that swallowed a whole section, which would make the redline unreviewable.
MAX_CLAUSE_BLOCKS = 12

# Blocks per LLM call. Contracts run to ~300 blocks; sending them whole risks
# the model losing track of block indices in the middle of the document.
CHUNK_BLOCKS = 60
CHUNK_OVERLAP = 6


def get_openai_client() -> AzureOpenAI:
    return AzureOpenAI(
        azure_endpoint=settings.azure_openai_endpoint,
        api_key=settings.azure_openai_api_key,
        api_version=settings.azure_openai_api_version,
    )


LOCATE_SYSTEM = """You are a contract analyst working for the CUSTOMER side of a commercial agreement.

You are given a contract as numbered blocks, in the form [n] text.

Identify every clause that falls under one of the CLAUSE TYPES supplied. Ignore
recitals, signature blocks, page furniture and definitions that carry no
obligation.

Return ONLY a JSON array. Each item:
- "clause_type": one of the supplied clause types, exactly as spelled
- "block_start": the first block number of the clause
- "block_end": the last block number of the clause (same as block_start if one block)
- "clause_ref": the clause number as written in the contract (e.g. "13.1", "Section 9(a)"), or null
- "clause_title": the clause heading as written, or a short label you devise

Rules:
- block_start and block_end must be numbers that appear in the input.
- Keep clauses tight: a clause is normally 1-4 blocks. Never span more than 12.
- One clause type may legitimately appear several times; return each occurrence.
- If a clause type does not appear at all, simply omit it. Never invent a location.

No markdown, no commentary, only the JSON array."""


ASSESS_SYSTEM = """You are a contract analyst redlining an agreement on behalf of the CUSTOMER.

You are given one clause from a vendor's contract and EVERY negotiating position
the customer holds that bears on it. A single clause often engages several
positions at once — a liability clause can be both uncapped in the wrong way and
missing its carve-outs. Judge the clause against all of them and produce ONE
replacement that satisfies them together.

Classifications (report the WORST that applies across all positions):
- ACCEPTABLE:   meets the preferred or fallback position; no edit needed
- NEGOTIABLE:   falls short of the fallback but is a normal commercial ask
- UNACCEPTABLE: hits the walkaway position, or shifts material risk to the customer

Respond ONLY with a JSON object:
{
  "classification": "ACCEPTABLE|NEGOTIABLE|UNACCEPTABLE",
  "proposed_text": "The full replacement text for the clause, or null if ACCEPTABLE",
  "rationale": "What is wrong and why it matters, in the voice of a margin comment. Two to four sentences when several positions are engaged — cover each one.",
  "failed_positions": ["CLAUSE_TYPE of each position the clause fails; omit those it satisfies"]
}

Drafting rules for proposed_text:
- Return the COMPLETE replacement clause, not a fragment or a diff.
- Preserve the contract's own defined terms, numbering and capitalisation style.
  If the contract says "Box" or "Supplier", do not switch to "Vendor".
- Change only what the position requires. Gratuitous rewriting gets rejected by
  the other side and wastes negotiating capital.
- Keep the clause's original register: if the original is in block capitals, as
  liability clauses often are, keep it that way.
- Never soften a position that already meets the preferred position.

The rationale is read by the counterparty. State the business reason, not "our
playbook says so"."""


def _chat_json(system: str, user: str, max_tokens: int = 2048):
    """Call the model and parse a JSON body, tolerating markdown fences."""
    client = get_openai_client()
    response = client.chat.completions.create(
        model=settings.azure_openai_deployment,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        max_completion_tokens=max_tokens,
    )
    raw = (response.choices[0].message.content or "").strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # A truncated response usually still contains a usable prefix; salvage
        # the largest balanced fragment rather than discarding the whole call.
        return _salvage_json(raw)


def _salvage_json(raw: str):
    start = raw.find("[")
    if start == -1:
        start = raw.find("{")
    if start == -1:
        return None
    for end in range(len(raw), start, -1):
        try:
            return json.loads(raw[start:end])
        except json.JSONDecodeError:
            continue
    return None


def _chunk(blocks: list[dict]) -> list[list[dict]]:
    if len(blocks) <= CHUNK_BLOCKS:
        return [blocks]
    chunks = []
    step = CHUNK_BLOCKS - CHUNK_OVERLAP
    for start in range(0, len(blocks), step):
        window = blocks[start : start + CHUNK_BLOCKS]
        if window:
            chunks.append(window)
        if start + CHUNK_BLOCKS >= len(blocks):
            break
    return chunks


def locate_clauses(blocks: list[dict], clause_types: list[str]) -> list[dict]:
    """Map blocks to clause types. Returns validated, de-duplicated hits."""
    types_list = "\n".join(f"- {t}" for t in clause_types)
    by_index = {b["index"]: b for b in blocks}
    found: list[dict] = []

    for window in _chunk(blocks):
        body = "\n".join(f"[{b['index']}] {b['text']}" for b in window)
        payload = (
            f"CLAUSE TYPES:\n{types_list}\n\n"
            f"CONTRACT BLOCKS:\n{body}"
        )
        result = _chat_json(LOCATE_SYSTEM, payload, max_tokens=3000)
        if not isinstance(result, list):
            continue

        for item in result:
            hit = _validate_hit(item, by_index, clause_types)
            if hit:
                found.append(hit)

    return _dedupe(found)


def _validate_hit(item, by_index: dict, clause_types: list[str]) -> dict | None:
    """Reject anything the model invented. Hallucinated block numbers would
    anchor a redline to the wrong paragraph, which is worse than missing it."""
    if not isinstance(item, dict):
        return None
    ctype = item.get("clause_type")
    if ctype not in clause_types:
        return None
    try:
        start = int(item["block_start"])
        end = int(item.get("block_end", start))
    except (KeyError, TypeError, ValueError):
        return None
    if start not in by_index or end not in by_index:
        return None
    if end < start:
        start, end = end, start
    if end - start + 1 > MAX_CLAUSE_BLOCKS:
        end = start + MAX_CLAUSE_BLOCKS - 1

    text = "\n".join(
        by_index[i]["text"] for i in range(start, end + 1) if i in by_index
    )
    if not text.strip():
        return None

    return {
        "clause_type": ctype,
        "block_start": start,
        "block_end": end,
        "clause_ref": _clean_str(item.get("clause_ref"), 100),
        "clause_title": _clean_str(item.get("clause_title"), 255),
        "section": by_index[start].get("section"),
        "page": by_index[start].get("page"),
        "text": text,
    }


def _clean_str(value, limit: int) -> str | None:
    if not value or not isinstance(value, str):
        return None
    value = value.strip()
    return value[:limit] if value else None


def _dedupe(hits: list[dict]) -> list[dict]:
    """Chunk overlap means the same clause can be reported twice; keep the
    longest span per (clause_type, overlapping range)."""
    hits = sorted(hits, key=lambda h: (h["block_start"], -h["block_end"]))
    kept: list[dict] = []
    for hit in hits:
        clash = next(
            (
                k
                for k in kept
                if k["clause_type"] == hit["clause_type"]
                and hit["block_start"] <= k["block_end"]
                and hit["block_end"] >= k["block_start"]
            ),
            None,
        )
        if clash is None:
            kept.append(hit)
        elif (hit["block_end"] - hit["block_start"]) > (
            clash["block_end"] - clash["block_start"]
        ):
            kept[kept.index(clash)] = hit
    return sorted(kept, key=lambda h: h["block_start"])


def group_hits(hits: list[dict]) -> list[dict]:
    """Merge hits that land on overlapping blocks into one clause to redline.

    A single paragraph routinely engages several positions at once — Box's
    section 13.1 is both a one-sided cap and a cap missing its carve-outs. Left
    ungrouped they become two findings proposing two different rewrites of the
    same paragraph, and the exporter can only write one of them into the
    document: the second overwrites the first and that edit is silently lost
    from the file the counterparty receives.

    Grouping also matches how the clause actually gets negotiated — as one
    conversation about section 13.1, not as two.
    """
    groups: list[dict] = []

    for hit in sorted(hits, key=lambda h: (h["block_start"], h["block_end"])):
        target = next(
            (
                g
                for g in groups
                if hit["block_start"] <= g["block_end"]
                and hit["block_end"] >= g["block_start"]
            ),
            None,
        )
        if target is None:
            groups.append(
                {
                    "block_start": hit["block_start"],
                    "block_end": hit["block_end"],
                    "clause_ref": hit.get("clause_ref"),
                    "clause_title": hit.get("clause_title"),
                    "section": hit.get("section"),
                    "page": hit.get("page"),
                    "text": hit["text"],
                    "clause_types": [hit["clause_type"]],
                }
            )
            continue

        # Widen the group to the union of the two spans, keeping whichever
        # text covers the most so no part of the clause is lost.
        if len(hit["text"]) > len(target["text"]):
            target["text"] = hit["text"]
            target["clause_title"] = hit.get("clause_title") or target["clause_title"]
        target["block_start"] = min(target["block_start"], hit["block_start"])
        target["block_end"] = max(target["block_end"], hit["block_end"])
        target["clause_ref"] = target["clause_ref"] or hit.get("clause_ref")
        if hit["clause_type"] not in target["clause_types"]:
            target["clause_types"].append(hit["clause_type"])

    return groups


def _format_position(rule) -> str:
    return (
        f"### POSITION: {rule.clause_type}\n"
        f"Title: {rule.title}\n"
        f"Preferred: {rule.preferred_position}\n"
        f"Fallback: {rule.fallback_position or 'None specified.'}\n"
        f"Walk away if: {rule.walkaway_position or 'None specified.'}\n"
        f"Standard language: {rule.standard_language or 'None specified.'}\n"
        f"Guidance: {rule.guidance or 'None.'}"
    )


def assess_clause(clause_text: str, rules: list) -> dict:
    """Judge one clause against every position bearing on it, as one edit."""
    positions = "\n\n".join(_format_position(rule) for rule in rules)
    payload = (
        f"CUSTOMER'S POSITIONS BEARING ON THIS CLAUSE:\n\n{positions}\n\n"
        f"---\n\nCLAUSE AS WRITTEN IN THE VENDOR'S CONTRACT:\n{clause_text}"
    )

    result = _chat_json(ASSESS_SYSTEM, payload, max_tokens=2500)
    known_types = [r.clause_type for r in rules]

    if not isinstance(result, dict):
        return {
            "classification": "NEGOTIABLE",
            "proposed_text": None,
            "rationale": "Automated assessment failed for this clause - review manually.",
            "failed_positions": known_types,
        }

    classification = result.get("classification")
    if classification not in ("ACCEPTABLE", "NEGOTIABLE", "UNACCEPTABLE"):
        classification = "NEGOTIABLE"

    proposed = result.get("proposed_text")
    if not isinstance(proposed, str) or not proposed.strip():
        proposed = None
    # An edit with nothing to change is noise in the findings list.
    if classification == "ACCEPTABLE":
        proposed = None

    failed = result.get("failed_positions")
    if not isinstance(failed, list):
        failed = []
    failed = [t for t in failed if t in known_types]
    if not failed and classification != "ACCEPTABLE":
        # The clause failed something, so attribute it to every position that
        # was in scope rather than dropping the linkage entirely.
        failed = known_types

    return {
        "classification": classification,
        "proposed_text": proposed,
        "rationale": _clean_str(result.get("rationale"), 2000),
        "failed_positions": failed,
    }


def find_missing(found_types: set[str], rules: list) -> list[dict]:
    """Required protections with no matching clause anywhere in the contract.

    Computed by set difference rather than by asking the model, because absence
    is exactly the thing an LLM is worst at reporting reliably.
    """
    missing = []
    for rule in rules:
        if not rule.is_required or rule.clause_type in found_types:
            continue
        missing.append(
            {
                "clause_type": rule.clause_type,
                "rule": rule,
                "classification": "MISSING",
                "proposed_text": rule.standard_language,
                "rationale": (
                    f"The contract contains no {rule.title.lower()} clause. "
                    f"{(rule.guidance or '').strip()}"
                ).strip(),
            }
        )
    return missing
