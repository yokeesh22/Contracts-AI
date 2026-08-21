import os
from docx import Document as DocxDocument
from azure.ai.documentintelligence import DocumentIntelligenceClient
from azure.core.credentials import AzureKeyCredential
from ..config import settings


def get_doc_client() -> DocumentIntelligenceClient:
    return DocumentIntelligenceClient(
        endpoint=settings.fr_endpoint,
        credential=AzureKeyCredential(settings.fr_key),
    )


def _extract_docx(file_path: str) -> str:
    """Extract text from a .docx file using python-docx (paragraphs + tables)."""
    doc = DocxDocument(file_path)
    blocks = []

    for block in doc.element.body:
        tag = block.tag.split("}")[-1]

        if tag == "p":
            # Paragraph or heading
            from docx.oxml.ns import qn
            text = "".join(node.text or "" for node in block.iter() if node.tag.endswith("}t"))
            if text.strip():
                blocks.append(text.strip())

        elif tag == "tbl":
            # Table — extract row by row
            rows = block.findall(".//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tr")
            for row in rows:
                cells = row.findall(".//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tc")
                cell_texts = []
                for cell in cells:
                    t_nodes = cell.findall(".//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t")
                    cell_texts.append(" ".join(t.text or "" for t in t_nodes).strip())
                row_text = " | ".join(cell_texts)
                if row_text.strip():
                    blocks.append(row_text)

    return "\n\n".join(blocks)


def _extract_pdf(file_path: str) -> str:
    """Extract text from a PDF via Azure Document Intelligence."""
    client = get_doc_client()

    with open(file_path, "rb") as f:
        file_bytes = f.read()

    poller = client.begin_analyze_document(
        model_id=settings.fr_model_id,
        body=file_bytes,
        content_type="application/pdf",
    )
    result = poller.result()

    pages_text = []
    for i, page in enumerate(result.pages or [], start=1):
        lines = [line.content for line in (page.lines or [])]
        # Page markers let downstream consumers (requirement extraction)
        # attribute text to a source page for deep-linking in the viewer.
        pages_text.append(f"[PAGE {i}]\n" + "\n".join(lines))
    return "\n\n".join(pages_text)


def extract_text_from_file(file_path: str) -> str:
    """Route to the correct extractor based on file extension.

    Deliberately synchronous: the Azure clients used here are blocking,
    so callers run this in a worker thread (sync BackgroundTasks) to keep
    the event loop responsive while an extraction is in flight.
    """
    ext = os.path.splitext(file_path)[1].lower()
    if ext in (".docx", ".doc"):
        return _extract_docx(file_path)
    elif ext == ".pdf":
        return _extract_pdf(file_path)
    else:
        raise ValueError(f"Unsupported file type: {ext}")
