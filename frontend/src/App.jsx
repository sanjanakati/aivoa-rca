import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import axios from "axios";
import { setHistory, setLoading, setError } from "./store";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const categories = ["People", "Methods", "Machines", "Materials", "Measurement", "Environment"];

const asLines = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === "string"
          ? item
          : item?.description || item?.cause || item?.text || JSON.stringify(item)
      )
      .join("\n");
  }
  return typeof value === "string" ? value : "";
};

const toLines = (value) =>
  String(value || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

const initialMessage = {
  role: "assistant",
  text: "Hi! I'm AIVOA Copilot. Describe a pharmaceutical manufacturing deviation, paste an incident email, or upload a PDF. I'll extract the details, assess preliminary risk, and prepare an RCA draft. You can also ask me to update any field in natural language.",
};

export default function App() {
  const dispatch = useDispatch();
  const { history = [], loading = false, error = null } = useSelector(
    (state) => state.incidents || {}
  );

  const [method, setMethod] = useState("5_whys");
  const [draft, setDraft] = useState(null);
  const [messages, setMessages] = useState([initialMessage]);
  const [prompt, setPrompt] = useState("");
  const [file, setFile] = useState(null);
  const [reviewed, setReviewed] = useState(false);
  const [activeTab, setActiveTab] = useState("new");
  const chatEnd = useRef(null);

  useEffect(() => {
    loadHistory();
    // Initial history load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function loadHistory() {
    try {
      const response = await axios.get(`${API}/api/incidents/`);
      dispatch(setHistory(Array.isArray(response.data) ? response.data : response.data?.items || []));
    } catch {
      dispatch(setError("Could not load the investigation register. Check that the backend is running."));
    }
  }

  function update(key, value) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setReviewed(false);
  }

  function startNewInvestigation() {
    setDraft(null);
    setReviewed(false);
    setFile(null);
    setPrompt("");
    setMessages([initialMessage]);
    setMethod("5_whys");
    dispatch(setError(null));
    setActiveTab("new");
  }

  async function sendMessage(event) {
    event?.preventDefault();
    if ((!prompt.trim() && !file) || loading) return;

    const userText = prompt.trim() || `Please extract and analyze ${file.name}.`;
    setMessages((previous) => [...previous, { role: "user", text: userText }]);
    setPrompt("");
    dispatch(setLoading(true));
    dispatch(setError(null));
    setReviewed(false);

    try {
      let response;
      if (file) {
        const form = new FormData();
        form.append("file", file);
        form.append("current_data", JSON.stringify(draft || {}));
        form.append("analysis_method", method);
        response = await axios.post(`${API}/api/copilot-file`, form);
        setFile(null);
      } else {
        response = await axios.post(`${API}/api/copilot`, {
          message: userText,
          current_data: draft || {},
          analysis_method: method,
        });
      }

      const analysis = response.data?.analysis || response.data?.draft || response.data;
      setDraft(analysis);
      setActiveTab("new");
      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          text:
            response.data?.assistant_message ||
            "I've updated the investigation draft. Please review the extracted details, risk assessment and recommendations.",
        },
      ]);
    } catch (err) {
      const message =
        err.response?.data?.detail ||
        "Copilot request failed. Check that the backend endpoints and Groq are running.";
      dispatch(setError(message));
      setMessages((previous) => [
        ...previous,
        { role: "assistant", text: `I couldn't complete that request: ${message}` },
      ]);
    } finally {
      dispatch(setLoading(false));
    }
  }

  async function save() {
    if (!draft || !reviewed) return;

    try {
      await axios.post(`${API}/api/incidents/`, {
        title: draft.title || "Quality investigation",
        description: draft.summary || draft.description || "",
        source_type: draft.source_type || "text",
        rca_analysis: draft,
      });

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          text: "The reviewed investigation draft has been saved. It remains pending qualified QA approval.",
        },
      ]);
      setDraft(null);
      setReviewed(false);
      await loadHistory();
      setActiveTab("register");
    } catch (err) {
      dispatch(setError(err.response?.data?.detail || "Could not save investigation."));
    }
  }

  const risk = draft?.risk_assessment || {};
  const capa = draft?.capa || {};

  const field = (label, value) => (
    <label className="field" key={label}>
      <span>{label}</span>
      <input readOnly value={value || "Awaiting AI extraction…"} />
    </label>
  );

  const editableList = (label, key, value) => (
    <label className="field" key={key}>
      <span>
        {label} <small>· editable after AI generation</small>
      </span>
      <textarea
        rows={3}
        value={asLines(value)}
        onChange={(event) => update(key, toLines(event.target.value))}
      />
    </label>
  );

  const navButton = (tab, label, icon, count) => (
    <button
      type="button"
      className={`nav ${activeTab === tab ? "active" : ""}`}
      onClick={() => setActiveTab(tab)}
    >
      <span>{icon}　{label}</span>
      {typeof count === "number" && <i>{count}</i>}
    </button>
  );

  const pageHeading =
    activeTab === "overview"
      ? "Dashboard"
      : activeTab === "register"
        ? "Investigation register"
        : "Root Cause Analysis";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebrand">
          <b>A</b>
          <div>
            <strong>AIVOA<span>.AI</span></strong>
            <small>QUALITY INTELLIGENCE</small>
          </div>
        </div>

        <p className="side-label">WORKSPACE</p>
        {navButton("overview", "Dashboard", "▦")}
        {navButton("new", "New investigation", "+")}
        {navButton("register", "Investigation register", "▤", history.length)}

        <div className="oversight">
          <b>♧　Human oversight</b>
          <p>AI outputs are investigation support only. Qualified personnel must verify findings and approve actions.</p>
        </div>
        <div className="team">QA　 Quality team</div>
      </aside>

      <main className="main">
        <header className="topbar">
          <span>Quality management　›　<strong>{pageHeading}</strong></span>
          <span className="online">● API workspace</span>
        </header>

        {activeTab === "overview" && (
          <>
            <div className="pagehead">
              <div>
                <p className="eyebrow">OVERVIEW / QUALITY OPERATIONS</p>
                <h1>Investigation dashboard</h1>
                <p>Monitor deviations, investigate potential causes and track quality actions.</p>
              </div>
              <button className="save dashboard-action" onClick={startNewInvestigation}>＋ New investigation</button>
            </div>

            {(() => {
              const statusOf = (item) => String(item.status || item.review_status || item.state || "under review").toLowerCase();
              const closedCount = history.filter((item) => ["closed", "approved", "completed"].includes(statusOf(item))).length;
              const reviewCount = history.filter((item) => ["under review", "pending", "pending qa approval", "in review"].includes(statusOf(item))).length;
              const openCount = Math.max(0, history.length - closedCount);
              const metrics = [
                { label: "Total investigations", value: history.length, note: "All recorded deviations", icon: "▤", tone: "blue" },
                { label: "Open investigations", value: openCount, note: "Awaiting review or action", icon: "◷", tone: "amber" },
                { label: "Under review", value: reviewCount, note: "Require QA assessment", icon: "◎", tone: "teal" },
                { label: "Closed investigations", value: closedCount, note: "Completed records", icon: "✓", tone: "violet" }
              ];
              return (
                <section className="dashboard-grid">
                  {metrics.map((metric) => (
                    <article className="dashboard-card" key={metric.label}>
                      <span className={`metric-symbol ${metric.tone}`}>{metric.icon}</span>
                      <div className="metric-copy">
                        <small>{metric.label}</small>
                        <strong>{metric.value}</strong>
                        <span>{metric.note}</span>
                      </div>
                    </article>
                  ))}
                </section>
              );
            })()}

            <section className="register dashboard-recent">
              <div className="registerhead">
                <div><h2>Recent investigations</h2><p>Latest saved quality records</p></div>
                <button onClick={() => setActiveTab("register")}>View register →</button>
              </div>
              {history.length ? history.slice(0, 5).map((item) => (
                <div className="record" key={item.id}>
                  <div><b>{item.title || "Untitled investigation"}</b><small>INV-{String(item.id).padStart(4, "0")} · {item.source_type || "text"}</small></div>
                  <span>Under Review</span>
                </div>
              )) : <p className="muted">No saved investigations yet. Start by creating a new investigation.</p>}
            </section>

            <section className="register">
              <h2>Investigation workflow</h2>
              <p className="muted">01 Capture deviation　 →　 02 Investigate causes　 →　 03 Plan CAPA　 →　 04 Qualified QA review</p>
              <button className="save" onClick={startNewInvestigation}>＋ Create investigation</button>
            </section>
          </>
        )}

        {activeTab === "new" && (
          <>
            <div className="pagehead">
              <div>
                <p className="eyebrow">PHARMACEUTICAL QUALITY / INVESTIGATIONS</p>
                <h1>Root Cause Analysis</h1>
                <p>Capture deviations, investigate potential causes and prepare evidence-led CAPA.</p>
              </div>
              <span className="pill">AI-assisted workflow</span>
            </div>

            <div className="split">
              <section className="formpane">
                <div className="pane-title">
                  <div><h2>Log investigation</h2><p>AI Copilot populates this record from your instructions or source documents.</p></div>
                  <span className={draft ? "pill green" : "pill"}>{draft ? "Draft populated" : "Awaiting AI"}</span>
                </div>

                <div className="formscroll">
                  <h3>01　DEVIATION IDENTIFICATION</h3>
                  <div className="fields two">
                    {field("Incident title", draft?.title)}
                    {field("Batch / Lot number", draft?.batch_number)}
                    {field("Product / API", draft?.product_name)}
                    {field("Source type", draft?.source_type)}
                  </div>

                  <label className="field">
                    <span>Incident description</span>
                    <textarea readOnly rows={4} value={draft?.summary || "AI will summarize the incident after you describe it in the Copilot…"} />
                  </label>

                  <label className="field">
                    <span>Investigation approach</span>
                    <select value={method} onChange={(event) => { setMethod(event.target.value); setReviewed(false); }}>
                      <option value="5_whys">5 Whys</option>
                      <option value="fishbone">Fishbone / Ishikawa</option>
                    </select>
                  </label>

                  <h3>02　AI RISK ASSESSMENT</h3>
                  {draft ? (
                    <div className="riskbox">
                      <div className="riskhead">
                        <span>Preliminary severity</span>
                        <strong className={`severity ${(risk.severity || "medium").toLowerCase()}`}>{risk.severity || "Not assessed"}</strong>
                      </div>
                      <p>{risk.rationale || "Risk rationale pending."}</p>
                      <div className="riskmeta">
                        <span>Confidence: {risk.confidence || "Low"}</span>
                        <span>Impact: {risk.product_impact || "Not established"}</span>
                      </div>
                      <b>Recommended immediate follow-up</b>
                      <ul>{(risk.immediate_actions || []).map((item, index) => <li key={index}>{item}</li>)}</ul>
                      <small>AI triage only — not a batch disposition or QA decision.</small>
                    </div>
                  ) : (
                    <div className="placeholder">Risk severity, rationale and immediate actions will appear after Copilot analysis.</div>
                  )}

                  <h3>03　ROOT CAUSE INVESTIGATION</h3>
                  {draft && method === "5_whys" && (draft.five_whys || []).map((why, index) => (
                    <div className="why" key={index}>
                      <b>WHY {index + 1}</b>
                      <p>{why.why || `Why ${index + 1}`}</p>
                      <textarea
                        rows={2}
                        value={why.answer || ""}
                        onChange={(event) => update("five_whys", (draft.five_whys || []).map((item, itemIndex) => itemIndex === index ? { ...item, answer: event.target.value } : item))}
                      />
                    </div>
                  ))}

                  {draft && method === "fishbone" && (
                    <div className="fishgrid">
                      {categories.map((category) => (
                        <label className="field" key={category}>
                          <span>{category}</span>
                          <textarea
                            rows={3}
                            value={asLines(draft.fishbone?.[category])}
                            onChange={(event) => update("fishbone", { ...(draft.fishbone || {}), [category]: toLines(event.target.value) })}
                          />
                        </label>
                      ))}
                    </div>
                  )}

                  {draft && (
                    <>
                      {editableList("Potential root causes / hypotheses", "root_causes", draft.root_causes)}
                      {editableList("Contributing factors", "contributing_factors", draft.contributing_factors)}
                      {editableList("Missing evidence", "missing_evidence", draft.missing_evidence)}
                      <h3>04　CAPA RECOMMENDATIONS</h3>
                      <label className="field">
                        <span>Corrective actions · editable</span>
                        <textarea rows={3} value={asLines(capa.corrective)} onChange={(event) => update("capa", { ...capa, corrective: toLines(event.target.value) })} />
                      </label>
                      <label className="field">
                        <span>Preventive actions · editable</span>
                        <textarea rows={3} value={asLines(capa.preventive)} onChange={(event) => update("capa", { ...capa, preventive: toLines(event.target.value) })} />
                      </label>
                      <label className="review">
                        <input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />
                        I reviewed the AI-generated draft. Qualified QA approval is still required.
                      </label>
                      <button className="save" disabled={!reviewed} onClick={save}>Save reviewed investigation →</button>
                    </>
                  )}

                  {!draft && <div className="placeholder">Start by describing the deviation in the AIVOA Copilot panel. The form is intentionally AI-populated rather than manually entered.</div>}
                </div>
              </section>

              <section className="copilot">
                <div className="copilothead">
                  <div className="boticon">✧</div>
                  <div><strong>AIVOA Copilot</strong><small>LangGraph · Groq AI assistant</small></div>
                  <span className="dot" />
                </div>
                <div className="chatbody">
                  {messages.map((message, index) => (
                    <div className={`message ${message.role}`} key={index}>
                      <span className="avatar">{message.role === "user" ? "You" : "✧"}</span>
                      <div>{message.text}</div>
                    </div>
                  ))}
                  {loading && <div className="message assistant"><span className="avatar">✧</span><div className="typing">Reviewing incident details and preparing your investigation…</div></div>}
                  <div ref={chatEnd} />
                </div>
                <div className="chatbottom">
                  <div className="methodhint">CURRENT RCA METHOD <b>{method === "5_whys" ? "5 Whys" : "Fishbone"}</b></div>
                  {file && <div className="filechip">📎 {file.name} <button type="button" onClick={() => setFile(null)}>×</button></div>}
                  <form className="composer" onSubmit={sendMessage}>
                    <label className="attach" title="Upload PDF">📎<input type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
                    <textarea rows={2} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe a deviation or ask me to update the draft…" />
                    <button disabled={loading || (!prompt.trim() && !file)} aria-label="Send">➤</button>
                  </form>
                  <small className="powered">AI-GENERATED DRAFTS · HUMAN QA REVIEW REQUIRED</small>
                </div>
              </section>
            </div>
          </>
        )}

        {activeTab === "register" && (
          <>
            <div className="pagehead">
              <div>
                <p className="eyebrow">QUALITY RECORDS / REGISTER</p>
                <h1>Investigation register</h1>
                <p>Search and review previously saved deviation investigations.</p>
              </div>
              <button className="save dashboard-action" onClick={startNewInvestigation}>＋ New investigation</button>
            </div>
            <section className="register">
              <div className="registerhead">
                <div><h2>Saved investigations</h2><p>{history.length} record(s)</p></div>
                <button onClick={loadHistory}>↻ Refresh</button>
              </div>
              {history.length ? history.map((item) => (
                <div className="record" key={item.id}>
                  <div>
                    <b>{item.title || "Untitled investigation"}</b>
                    <small>INV-{String(item.id).padStart(4, "0")} · {item.source_type || "text"}</small>
                    {item.description && <small>{item.description}</small>}
                  </div>
                  <span>Under Review</span>
                </div>
              )) : <p className="muted">No saved investigations yet.</p>}
            </section>
          </>
        )}

        {error && <div className="errorbar">{String(error)}</div>}
        <footer>AIVOA.AI · AI-assisted pharmaceutical quality investigation · Human verification required</footer>
      </main>
    </div>
  );
}
