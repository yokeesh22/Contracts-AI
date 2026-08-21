"""Turn an uploaded contract into a list of addressable blocks.

Everything downstream renders from this one structure:

  * the on-screen document pane (Original / Redlined / Final)
  * clause-level scroll anchoring from the findings list
  * the tracked-changes .docx export

A block is one paragraph or one table row, carrying a stable `index`. Redlines
anchor to a `[block_start, block_end]` range rather than to character offsets,
because paragraph indices survive re-extraction while offsets do not.

Why not mammoth in the browser (as the old DocViewer did)? Because the export
has to write revision marks back into the *same* paragraphs the user saw, so
both sides must agree on paragraph identity. Numbering them once, server-side,
is what makes that agreement possible.
"""

import json
import logging
import os
import re
import zipfile
from xml.etree import ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

logger = logging.getLogger(__name__)

# A heading that starts a new logical document inside one uploaded file.
# The Vimeo sample carries an SLA, a DPA and an AI Addendum as exhibits; each
# needs its own tab, and a redline in Exhibit C must not claim to be in the
# main agreement.
_SECTION_RE = re.compile(
    r"^\s*(exhibit\s+[a-z0-9]+|schedule\s+[a-z0-9]+|appendix\s+[a-z0-9]+|annex\s+[a-z0-9]+"
    r"|attachment\s+[a-z0-9]+)\b[\s:.-]*(.*)$",
    re.IGNORECASE,
)
_ADDENDUM_RE = re.compile(
    r"^\s*[A-Z][A-Za-z ]{0,60}\b(addendum|agreement|terms)\b\s*$"
)

# Clause numbers we can recognise, e.g. "Section 13.", "13.1", "9(a)", "7. Indemnification"
_CLAUSE_RE = re.compile(
    r"^\s*(?:section\s+)?(\d+(?:\.\d+)*)\s*[.)]?\s+(.{0,120})",
    re.IGNORECASE,
)


def _clean(text: str) -> str:
    # Word smart quotes survive extraction as U+2018/2019/201C/201D; normalise so
    # clause matching and diffing do not treat them as different characters.
    return (
        text.replace("‘", "'")
        .replace("’", "'")
        .replace("“", '"')
        .replace("”", '"')
        .replace("\xa0", " ")
        .strip()
    )


def _para_text(para) -> str:
    parts = []
    for node in para.iter():
        tag = node.tag.split("}")[-1]
        if tag == "t":
            parts.append(node.text or "")
        elif tag == "tab":
            parts.append("\t")
        elif tag == "br":
            parts.append("\n")
    return "".join(parts)


def _style_of(para) -> str:
    st = para.find(f"{W}pPr/{W}pStyle")
    if st is None:
        return "body"
    val = (st.get(f"{W}val") or "").lower()
    if "head" in val or "title" in val:
        return "heading"
    return "body"


def extract_blocks_from_docx(file_path: str) -> list[dict]:
    """Walk the document body in order, numbering every paragraph and table row.

    `w_index` is the position within the body element's children, which is what
    the exporter needs to find the same paragraph again. It is tracked
    separately from `index` because tables expand into several blocks but
    occupy a single position in the body.
    """
    with zipfile.ZipFile(file_path) as z:
        root = ET.fromstring(z.read("word/document.xml"))

    body = root.find(f"{W}body")
    blocks: list[dict] = []

    if body is None:
        return blocks

    for w_index, child in enumerate(body):
        tag = child.tag.split("}")[-1]

        if tag == "p":
            text = _clean(_para_text(child))
            if not text:
                continue
            style = _style_of(child)
            blocks.append(
                {
                    "index": len(blocks),
                    "w_index": w_index,
                    "kind": "heading" if style == "heading" else "para",
                    "section": None,
                    "text": text,
                    "page": None,
                }
            )

        elif tag == "tbl":
            for row in child.findall(f"{W}tr"):
                cells = []
                for tc in row.findall(f"{W}tc"):
                    cells.append(
                        _clean(" ".join(_para_text(p) for p in tc.findall(f"{W}p")))
                    )
                if not any(cells):
                    continue
                blocks.append(
                    {
                        "index": len(blocks),
                        "w_index": w_index,
                        "kind": "row",
                        "section": None,
                        "text": " | ".join(cells),
                        "cells": cells,
                        "page": None,
                    }
                )

    return _assign_sections(blocks)


def extract_blocks_from_pdf(file_path: str) -> list[dict]:
    """Same block model from a PDF, with page numbers instead of body indices.

    PDFs have no paragraph structure to write revision marks into, so blocks
    from this path carry `w_index: None`. That is what the export layer keys
    off to fall back to a reconstructed document.
    """
    import pdfplumber

    blocks: list[dict] = []

    with pdfplumber.open(file_path) as pdf:
        for page_no, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            for raw in text.split("\n"):
                line = _clean(raw)
                if not line:
                    continue
                # Page furniture repeats on every page and would otherwise be
                # matched as clause text.
                if _is_page_furniture(line):
                    continue
                style = "heading" if _looks_like_heading(line) else "body"
                blocks.append(
                    {
                        "index": len(blocks),
                        "w_index": None,
                        "kind": "heading" if style == "heading" else "para",
                        "section": None,
                        "text": line,
                        "page": page_no,
                    }
                )

    return _assign_sections(_merge_wrapped_lines(blocks))


_FURNITURE_RE = re.compile(
    r"^(docusign envelope id:|page \d+ of \d+\b|\d+/\d+$)|^\s*\d+\s*$", re.IGNORECASE
)


def _is_page_furniture(line: str) -> bool:
    if _FURNITURE_RE.search(line):
        return True
    # Vendor footers: "canto.com | (415) 495 - 6545 | 3343 Peachtree Rd NE..."
    if line.count("|") >= 2 and len(line) < 120:
        return True
    return False


# A wrapped line of body text in block capitals ends mid-clause. Real headings
# do not, which is the only reliable signal available without layout metadata.
_CONTINUES = (",", ";", "-", "and", "or", "of", "the", "to", "with", "without")


def _looks_like_heading(line: str) -> bool:
    if len(line) > 90:
        return False
    if _SECTION_RE.match(line):
        return True
    m = _CLAUSE_RE.match(line)
    if m and len(m.group(2).strip()) < 70:
        return True

    # Block capitals alone are NOT enough. Liability, warranty and disclaimer
    # clauses are conventionally written in full caps, so treating every capital
    # line as a heading shatters exactly the clauses that matter most into
    # one-line fragments - a heading is never merged into the paragraph around
    # it. A genuine all-caps heading is short and does not trail off mid-clause.
    if not line.isupper() or len(line) <= 6:
        return False
    if len(line) > 50:
        return False
    stripped = line.rstrip()
    if stripped.endswith((",", ";", "-", ":")):
        return False
    last_word = stripped.split()[-1].lower() if stripped.split() else ""
    return last_word not in _CONTINUES


def _merge_wrapped_lines(blocks: list[dict]) -> list[dict]:
    """Rejoin lines that a PDF broke mid-sentence.

    pdfplumber yields one block per rendered line, which would scatter a single
    clause across a dozen anchors and make the findings list unusable. Lines are
    merged into a paragraph until one ends a sentence or a new heading starts.
    """
    merged: list[dict] = []
    buf: dict | None = None

    for b in blocks:
        if b["kind"] == "heading":
            if buf:
                merged.append(buf)
                buf = None
            merged.append(b)
            continue

        if buf is None:
            buf = dict(b)
            continue

        prev = buf["text"].rstrip()
        # A line ending in sentence punctuation closes the paragraph; so does a
        # following line that starts its own numbered clause.
        if prev.endswith((".", ":", ";", "!", "?")) or _CLAUSE_RE.match(b["text"]):
            merged.append(buf)
            buf = dict(b)
        else:
            buf["text"] = f"{prev} {b['text'].lstrip()}"

    if buf:
        merged.append(buf)

    for i, b in enumerate(merged):
        b["index"] = i
    return merged


def _normalise_label(raw: str) -> str:
    """"exhibit a" -> "Exhibit A"; "annex iii" -> "Annex III".

    str.title() would render roman numerals as "Ii"/"Iii", so the identifier is
    uppercased separately from the word before it.
    """
    parts = raw.split()
    if not parts:
        return raw
    head = parts[0].capitalize()
    tail = [p.upper() for p in parts[1:]]
    return " ".join([head, *tail])


def _detect_section(text: str, style: str, next_text: str | None = None) -> str | None:
    """Return a section label if this block starts a new logical document.

    `next_text` supplies the lookahead needed for the common layout where the
    label and its title are separate paragraphs ("Exhibit C" / "Enterprise
    Artificial Intelligence Addendum"), which would otherwise produce a tab
    named just "Exhibit C".
    """
    m = _SECTION_RE.match(text)
    if m and len(text) < 120:
        label = _normalise_label(m.group(1).strip())
        rest = (m.group(2) or "").strip(" -:.")
        if not rest and next_text and len(next_text) < 120:
            # Only borrow the next line when it reads like a title, not like
            # the first sentence of the exhibit's body.
            candidate = next_text.strip(" -:.")
            if not candidate.endswith(".") and len(candidate.split()) <= 12:
                rest = candidate
        return f"{label} - {rest}" if rest else label
    if style == "heading" and _ADDENDUM_RE.match(text):
        return text.strip()
    return None


def _assign_sections(blocks: list[dict]) -> list[dict]:
    """Second pass, so section detection can look at the following block."""
    section = "Main Agreement"
    for i, b in enumerate(blocks):
        next_text = blocks[i + 1]["text"] if i + 1 < len(blocks) else None
        style = "heading" if b["kind"] == "heading" else "body"
        found = _detect_section(b["text"], style, next_text)
        if found:
            section = found
        b["section"] = section
    return blocks


# Roles Azure tags on furniture and apparatus rather than operative text.
_SKIP_ROLES = {"pageHeader", "pageFooter", "pageNumber", "footnote"}
_HEADING_ROLES = {"title", "sectionHeading"}


def _spans_of(element) -> list[tuple[int, int]]:
    """(start, end) character ranges an element covers in the flat content."""
    ranges = []
    for span in getattr(element, "spans", None) or []:
        offset = span.get("offset") if isinstance(span, dict) else span.offset
        length = span.get("length") if isinstance(span, dict) else span.length
        if offset is not None:
            ranges.append((offset, offset + (length or 0)))
    return ranges


def _start_of(element) -> int:
    ranges = _spans_of(element)
    return ranges[0][0] if ranges else 0


def _within(offset: int, ranges: list[tuple[int, int]]) -> bool:
    return any(start <= offset < end for start, end in ranges)


# Azure emits these markers for checkboxes it finds while OCR'ing screenshots.
_SELECTION_MARK_RE = re.compile(r":(?:un)?selected:")


def _is_ocr_noise(text: str, role: str | None) -> bool:
    """Fragments OCR lifts out of screenshots and logos, not contract text.

    The Canto proposal opens with product screenshots; OCR reads their UI
    chrome ("Smart Tags", "Type the tag", "43 Elemente") as paragraphs. Real
    operative text is prose: it either runs to a reasonable length or carries a
    clause number. Headings are exempt because Azure identifies those by role.
    """
    if role in _HEADING_ROLES:
        return False
    if _CLAUSE_RE.match(text):
        return False
    return len(text) < 25


def extract_blocks_from_pdf_azure(file_path: str) -> list[dict]:
    """Blocks from Azure Document Intelligence's layout model.

    Preferred over pdfplumber for PDFs because it returns real paragraphs
    rather than rendered lines. pdfplumber gives one block per visual line,
    which has to be stitched back into paragraphs by guesswork; Azure returns
    the paragraph directly, tags headers, footers and page numbers by role so
    furniture drops out reliably, and recovers table structure that a line-based
    reader flattens into unreadable runs of text.

    It also OCRs scanned documents, which the pdfplumber path cannot read at all.
    """
    from azure.ai.documentintelligence import DocumentIntelligenceClient
    from azure.core.credentials import AzureKeyCredential

    from ..config import settings

    client = DocumentIntelligenceClient(
        endpoint=settings.fr_endpoint,
        credential=AzureKeyCredential(settings.fr_key),
    )
    with open(file_path, "rb") as f:
        poller = client.begin_analyze_document(
            settings.fr_model_id, body=f.read(), content_type="application/pdf"
        )
    result = poller.result()

    tables = list(result.tables or [])
    # Cells are also reported as paragraphs. Without this the same text lands in
    # the document twice: once as a table row and once as loose prose.
    table_ranges = [r for t in tables for r in _spans_of(t)]
    figure_ranges = [r for f in (result.figures or []) for r in _spans_of(f)]

    # Paragraphs and tables interleave in reading order, which only the span
    # offsets record - so both are collected and sorted by where they start.
    elements: list[tuple[int, str, object]] = []

    for para in result.paragraphs or []:
        start = _start_of(para)
        if _within(start, table_ranges) or _within(start, figure_ranges):
            continue
        elements.append((start, "para", para))

    for table in tables:
        elements.append((_start_of(table), "table", table))

    elements.sort(key=lambda item: item[0])

    blocks: list[dict] = []
    for _, kind, element in elements:
        if kind == "para":
            _append_azure_paragraph(blocks, element)
        else:
            _append_azure_table(blocks, element)

    return _assign_sections(blocks)


def _append_azure_paragraph(blocks: list[dict], para) -> None:
    role = str(para.role) if para.role else None
    if role in _SKIP_ROLES:
        return

    text = _clean(_SELECTION_MARK_RE.sub("", para.content or ""))
    if not text or _is_page_furniture(text) or _is_ocr_noise(text, role):
        return

    blocks.append(
        {
            "index": len(blocks),
            # No OOXML position exists for a PDF, so the exporter rebuilds the
            # document rather than annotating the original.
            "w_index": None,
            "kind": "heading" if role in _HEADING_ROLES else "para",
            "section": None,
            "text": text,
            "page": (
                para.bounding_regions[0].page_number
                if para.bounding_regions
                else None
            ),
        }
    )


def _append_azure_table(blocks: list[dict], table) -> None:
    """One block per table row, matching how the DOCX path emits tables.

    Order forms, fee schedules and SLA credit tables carry negotiable terms, so
    they have to reach the reviewer as rows rather than as a flattened blur.
    """
    page = None
    if table.bounding_regions:
        page = table.bounding_regions[0].page_number

    rows: dict[int, dict[int, str]] = {}
    header_rows: set[int] = set()
    for cell in table.cells or []:
        content = _clean(_SELECTION_MARK_RE.sub("", cell.content or ""))
        rows.setdefault(cell.row_index, {})[cell.column_index] = content
        # cell.kind is a str-Enum, so str() yields "DocumentTableCellKind.
        # COLUMN_HEADER" rather than the wire value - compare on .value.
        kind = getattr(cell.kind, "value", cell.kind) or ""
        if kind == "columnHeader":
            header_rows.add(cell.row_index)

    for row_index in sorted(rows):
        columns = rows[row_index]
        cells = [columns.get(i, "") for i in range(max(columns) + 1)]
        if not any(cell.strip() for cell in cells):
            continue
        blocks.append(
            {
                "index": len(blocks),
                "w_index": None,
                "kind": "row",
                "section": None,
                "text": " | ".join(cells),
                "cells": cells,
                "is_header": row_index in header_rows,
                "page": page,
            }
        )


def extract_blocks(file_path: str) -> tuple[list[dict], str]:
    """Return (blocks, doc_kind) for any supported upload.

    DOCX is always parsed directly from the OOXML: only that path yields the
    body positions the tracked-changes exporter writes revisions into, so no
    document service can stand in for it.
    """
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".docx":
        return extract_blocks_from_docx(file_path), "docx"
    if ext == ".pdf":
        return _extract_pdf_blocks(file_path), "pdf"
    raise ValueError(
        f"Unsupported file type '{ext}'. Upload a .docx or .pdf contract."
    )


def _extract_pdf_blocks(file_path: str) -> list[dict]:
    """Azure Document Intelligence when configured, pdfplumber otherwise.

    pdfplumber stays as the fallback rather than being retired: it needs no
    credentials, no network and no per-page spend, so a misconfigured key or an
    Azure outage degrades extraction quality instead of failing the review.
    """
    from ..config import settings

    if settings.fr_endpoint and settings.fr_key:
        try:
            blocks = extract_blocks_from_pdf_azure(file_path)
            if blocks:
                return blocks
            logger.warning(
                "Document Intelligence returned no paragraphs for %s; "
                "falling back to local extraction.",
                os.path.basename(file_path),
            )
        except Exception:
            logger.warning(
                "Document Intelligence failed for %s; falling back to local "
                "extraction. Scanned pages will not be readable.",
                os.path.basename(file_path),
                exc_info=True,
            )

    return extract_blocks_from_pdf(file_path)


def blocks_to_text(blocks: list[dict]) -> str:
    """Flatten blocks for the LLM, tagging each with its index.

    The index tags are what let the model point a finding back at an exact
    block, which is in turn what makes click-to-scroll and the export work.
    """
    lines = []
    current_section = None
    for b in blocks:
        if b["section"] != current_section:
            current_section = b["section"]
            lines.append(f"\n### SECTION: {current_section}\n")
        lines.append(f"[{b['index']}] {b['text']}")
    return "\n".join(lines)


def sections_of(blocks: list[dict]) -> list[str]:
    """Distinct document sections, in first-appearance order (the tab strip)."""
    seen: list[str] = []
    for b in blocks:
        if b["section"] not in seen:
            seen.append(b["section"])
    return seen


def dump_blocks(blocks: list[dict]) -> str:
    return json.dumps(blocks, ensure_ascii=False)


def load_blocks(raw: str | None) -> list[dict]:
    if not raw:
        return []
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return []
