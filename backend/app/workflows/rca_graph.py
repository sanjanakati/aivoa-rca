import json
import os
import re
from typing import TypedDict, Any

from langchain_groq import ChatGroq
from langgraph.graph import StateGraph, START, END


class RCAState(TypedDict, total=False):
    incident_text: str
    method: str
    result: dict[str, Any]


def _extract_json(content: str) -> dict:
    text = content.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.I)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start:end + 1])
        raise ValueError("The AI response was not valid JSON. Please try again.")


def analyze_incident(state: RCAState) -> RCAState:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is missing from backend/.env")

    model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
    llm = ChatGroq(model=model, api_key=api_key, temperature=0)
    method = state.get("method", "5_whys")
    method_instruction = (
        "Create a clear 5 Whys chain with exactly five sequential why/question and answer pairs."
        if method == "5_whys" else
        "Create a Fishbone (Ishikawa) analysis grouped into People, Methods, Machines, Materials, Measurement, and Environment."
    )
    prompt = f'''You are an AI assistant supporting a pharmaceutical API manufacturer's quality investigation.
Analyze the source text below. Return ONLY valid JSON, no markdown or prose outside JSON.
Do not invent facts, batch details, test results, records, or evidence. Separate observed facts from hypotheses.
{method_instruction}

JSON schema:
{{
 "title": "concise incident title inferred from source",
 "summary": "brief factual incident summary",
 "extracted_facts": ["facts explicitly stated in source"],
 "investigation_method": "{method}",
 "five_whys": [{{"why": "question", "answer": "evidence-based answer or unknown"}}],
 "fishbone": {{"People": [], "Methods": [], "Machines": [], "Materials": [], "Measurement": [], "Environment": []}},
 "root_causes": ["potential cause, clearly marked as hypothesis"],
 "contributing_factors": ["potential contributing factor"],
 "missing_evidence": ["specific record, test, or information needed to verify hypotheses"],
 "capa": {{"corrective": ["immediate containment/corrective recommendation"], "preventive": ["systemic prevention recommendation"]}}
}}
Use the selected method in detail and populate its matching structure. The other structure may be an empty array/object.
CAPA must be recommendations, not actions already performed. Mention qualified QA review before final approval.

SOURCE TEXT:
{state['incident_text'][:18000]}
'''
    response = llm.invoke(prompt)
    result = _extract_json(str(response.content))

    # Normalize keys/types so the UI always receives predictable structures.
    result.setdefault("title", "Quality investigation")
    result.setdefault("summary", "")
    result.setdefault("extracted_facts", [])
    result.setdefault("investigation_method", method)
    result.setdefault("five_whys", [])
    result.setdefault("fishbone", {k: [] for k in ["People", "Methods", "Machines", "Materials", "Measurement", "Environment"]})
    result.setdefault("root_causes", [])
    result.setdefault("contributing_factors", [])
    result.setdefault("missing_evidence", [])
    result.setdefault("capa", {"corrective": [], "preventive": []})
    return {"result": result}


def apply_human_review_gate(state: RCAState) -> RCAState:
    # The graph deliberately never marks AI hypotheses as confirmed findings.
    result = dict(state.get("result", {}))
    result["review_status"] = "Pending qualified QA review"
    result["human_review_required"] = True
    result["hypotheses_are_unconfirmed"] = True
    return {"result": result}


def build_rca_graph():
    graph = StateGraph(RCAState)
    graph.add_node("analyze_incident", analyze_incident)
    graph.add_node("human_review_gate", apply_human_review_gate)
    graph.add_edge(START, "analyze_incident")
    graph.add_edge("analyze_incident", "human_review_gate")
    graph.add_edge("human_review_gate", END)
    return graph.compile()


rca_graph = build_rca_graph()


def run_rca(incident_text: str, method: str = "5_whys") -> dict:
    output = rca_graph.invoke({"incident_text": incident_text, "method": method})
    return output["result"]


def run_copilot(message: str, current_data: dict | None = None, method: str = "5_whys") -> dict:
    """Interpret a natural-language intake/edit instruction and return a merged, reviewable RCA draft."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is missing from backend/.env")
    model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
    llm = ChatGroq(model=model, api_key=api_key, temperature=0)
    current_json = json.dumps(current_data or {}, ensure_ascii=False)
    prompt = f'''You are AIVOA Copilot for a pharmaceutical API manufacturer's deviation investigation.
The user message may describe a NEW incident or ask to EDIT an existing draft in natural language.
Return ONLY valid JSON. Preserve every existing field not explicitly changed. Never erase unrelated details.
Never invent batch numbers, dates, evidence, test results, or completed actions. Use null/empty values when unknown.
For a new incident, infer a concise title and factual summary from the message.
Create a risk assessment with severity (Low/Medium/High/Critical), rationale, immediate_actions, product_impact, and confidence (Low/Medium/High). This is a preliminary AI triage, not a batch disposition or QA decision.
Provide 5 sequential why-answer pairs if method is 5_whys; otherwise fill Fishbone categories People, Methods, Machines, Materials, Measurement, Environment.
Potential root causes must be labelled hypotheses. Include missing_evidence and corrective/preventive CAPA recommendations.
Schema:
{{"title":"", "summary":"", "batch_number":"", "product_name":"", "source_type":"text", "extracted_facts":[], "five_whys":[{{"why":"","answer":""}}], "fishbone":{{"People":[],"Methods":[],"Machines":[],"Materials":[],"Measurement":[],"Environment":[]}}, "root_causes":[], "contributing_factors":[], "missing_evidence":[], "capa":{{"corrective":[],"preventive":[]}}, "risk_assessment":{{"severity":"Medium","rationale":"","immediate_actions":[],"product_impact":"Not established","confidence":"Low"}}, "assistant_message":"Briefly explain what was extracted or updated."}}
Method: {method}
EXISTING DRAFT (preserve unchanged values): {current_json}
USER MESSAGE: {message[:18000]}
'''
    response = llm.invoke(prompt)
    result = _extract_json(str(response.content))
    result.setdefault("title", (current_data or {}).get("title", "Quality investigation"))
    result.setdefault("summary", (current_data or {}).get("summary", ""))
    result.setdefault("extracted_facts", [])
    result.setdefault("five_whys", [])
    result.setdefault("fishbone", {k: [] for k in ["People", "Methods", "Machines", "Materials", "Measurement", "Environment"]})
    result.setdefault("root_causes", [])
    result.setdefault("contributing_factors", [])
    result.setdefault("missing_evidence", [])
    result.setdefault("capa", {"corrective": [], "preventive": []})
    result.setdefault("risk_assessment", {"severity": "Medium", "rationale": "Insufficient information for reliable triage.", "immediate_actions": [], "product_impact": "Not established", "confidence": "Low"})
    result["review_status"] = "Pending qualified QA review"
    result["human_review_required"] = True
    result["hypotheses_are_unconfirmed"] = True
    return result
