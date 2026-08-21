"""Word-level diff between the vendor's text and our proposed text.

Computed on demand rather than stored, so a user's edit to `proposed_text` is
reflected immediately and identically in the browser and in the exported .docx.
Storing a rendered diff is what lets the two drift apart.
"""

import difflib
import re

# Split into words while keeping whitespace, so rebuilding a run preserves the
# original spacing instead of collapsing it.
_TOKEN_RE = re.compile(r"\S+\s*")


def tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text or "")


def diff_ops(original: str, proposed: str) -> list[dict]:
    """Return [{op: equal|delete|insert, text: str}] at word granularity.

    Word granularity rather than character: a character diff of a contract
    clause produces unreadable confetti, and Word's own revision marks are
    word-based too.
    """
    a = tokenize(original)
    b = tokenize(proposed)

    ops: list[dict] = []
    matcher = difflib.SequenceMatcher(a=a, b=b, autojunk=False)

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            ops.append({"op": "equal", "text": "".join(a[i1:i2])})
        elif tag == "delete":
            ops.append({"op": "delete", "text": "".join(a[i1:i2])})
        elif tag == "insert":
            ops.append({"op": "insert", "text": "".join(b[j1:j2])})
        elif tag == "replace":
            ops.append({"op": "delete", "text": "".join(a[i1:i2])})
            ops.append({"op": "insert", "text": "".join(b[j1:j2])})

    return _merge_adjacent(ops)


def _merge_adjacent(ops: list[dict]) -> list[dict]:
    """Collapse runs of the same op so the rendered markup has fewer spans."""
    merged: list[dict] = []
    for op in ops:
        if not op["text"]:
            continue
        if merged and merged[-1]["op"] == op["op"]:
            merged[-1]["text"] += op["text"]
        else:
            merged.append(dict(op))
    return merged


def change_summary(original: str, proposed: str) -> dict:
    """Counts for the findings list, so a reviewer can see the size of an edit
    before opening it."""
    added = removed = 0
    for op in diff_ops(original, proposed):
        n = len(tokenize(op["text"]))
        if op["op"] == "insert":
            added += n
        elif op["op"] == "delete":
            removed += n
    return {"words_added": added, "words_removed": removed}
