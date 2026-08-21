import json
import re
from openai import AzureOpenAI
from ..config import settings


def get_openai_client() -> AzureOpenAI:
    return AzureOpenAI(
        azure_endpoint=settings.azure_openai_endpoint,
        api_key=settings.azure_openai_api_key,
        api_version=settings.azure_openai_api_version,
    )


EXTRACT_REQUIREMENTS_SYSTEM = """You are a technical document analyst. Extract individual requirements from a User Requirement Specification (URS) document.

The document text may contain page markers of the form [PAGE n] indicating the start of page n in the original document.

Each requirement should be a distinct, standalone statement of what the system/product must do or comply with.
Return a JSON array where each item has:
- "req_number": the requirement identifier (e.g., "1.1", "REQ-001", "3.2.1") or null if not numbered
- "req_text": the full requirement text
- "urs_page": the page number the requirement appears on, taken from the nearest preceding [PAGE n] marker, or null if there are no page markers

Return ONLY the JSON array, no markdown, no explanation."""


ANALYZE_DEVIATION_SYSTEM = """You are a technical specification deviation analyst for industrial/pharmaceutical equipment.

Your task is to compare a customer requirement from a URS (User Requirement Specification) against a Technical Specification document and determine compliance status.

Classifications:
- COMPLIANT: The specification fully satisfies this requirement
- ACCEPTABLE_DEVIATION: The specification partially addresses it; minor differences exist that can typically be accepted
- CRITICAL_DEVIATION: The specification does not meet this requirement or has a significant conflict
- NOT_APPLICABLE: This requirement falls outside the scope of this specification

Respond ONLY with a JSON object:
{
  "classification": "COMPLIANT|ACCEPTABLE_DEVIATION|CRITICAL_DEVIATION|NOT_APPLICABLE",
  "spec_reference": "Relevant section or clause from the specification, or null",
  "deviation_detail": "Description of the deviation or gap, or null if COMPLIANT",
  "remarks": "Additional notes, suggestions, or clarifications"
}"""


def extract_requirements(urs_text: str) -> list[dict]:
    """Parse URS text and return a list of individual requirements.

    Synchronous by design (blocking OpenAI client) — run from a worker
    thread, never directly on the event loop.
    """
    client = get_openai_client()

    # Chunk large documents — send max ~12k chars of URS text to avoid token overflow
    urs_chunk = urs_text[:12000] if len(urs_text) > 12000 else urs_text

    response = client.chat.completions.create(
        model=settings.azure_openai_deployment,
        messages=[
            {"role": "system", "content": EXTRACT_REQUIREMENTS_SYSTEM},
            {
                "role": "user",
                "content": f"Extract all requirements from this URS document:\n\n{urs_chunk}",
            },
        ],
        max_completion_tokens=4096,
    )

    raw = response.choices[0].message.content or "[]"
    # Strip markdown fences if present
    raw = re.sub(r"^```(?:json)?\n?", "", raw.strip())
    raw = re.sub(r"\n?```$", "", raw.strip())

    try:
        requirements = json.loads(raw)
        if isinstance(requirements, list):
            return requirements
        return []
    except json.JSONDecodeError:
        return []


def analyze_requirement(
    requirement_text: str, spec_text: str
) -> dict:
    """Compare a single requirement against the specification and return deviation analysis."""
    client = get_openai_client()

    # Truncate spec text to fit context — 24k chars (~6k tokens)
    spec_chunk = spec_text[:24000] if len(spec_text) > 24000 else spec_text

    response = client.chat.completions.create(
        model=settings.azure_openai_deployment,
        messages=[
            {"role": "system", "content": ANALYZE_DEVIATION_SYSTEM},
            {
                "role": "user",
                "content": (
                    f"TECHNICAL SPECIFICATION:\n{spec_chunk}\n\n"
                    f"---\n\nCUSTOMER REQUIREMENT:\n{requirement_text}"
                ),
            },
        ],
        temperature=0.1,
        max_completion_tokens=512,
    )

    raw = response.choices[0].message.content or "{}"
    raw = re.sub(r"^```(?:json)?\n?", "", raw.strip())
    raw = re.sub(r"\n?```$", "", raw.strip())

    try:
        result = json.loads(raw)
        return {
            "classification": result.get("classification", "NOT_APPLICABLE"),
            "spec_reference": result.get("spec_reference"),
            "deviation_detail": result.get("deviation_detail"),
            "remarks": result.get("remarks"),
        }
    except json.JSONDecodeError:
        return {
            "classification": "NOT_APPLICABLE",
            "spec_reference": None,
            "deviation_detail": "Analysis failed — could not parse AI response.",
            "remarks": raw[:500],
        }
