/** @jsx React.createElement */
// note: no `import` or `require` – we’re in a UMD/Babel standalone environment

const { useState } = React;

function App() {
  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState("");
  const [status,   setStatus]   = useState("Ready");

  const handleSubmit = async () => {
    const prompt = input.trim();
    if (!prompt) return;

    // Echo user message
    setMessages(ms => [...ms, { role: "user", content: prompt }]);
    setInput("");
    setStatus("Deciding…");

    // 1) Dispatch (include chat history so agent can refer back)
    let route;
    try {
      const disp = await fetch("/api/v1/agent/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          history: messages.map(m => ({ role: m.role, content: m.content.toString() }))
        })
      });
      if (!disp.ok) {
        const err = await disp.json();
        throw new Error(err.detail || disp.statusText);
      }
      route = await disp.json();
    } catch (err) {
      setMessages(ms => [
        ...ms,
        { role: "assistant", content: `⚠️ Routing error: ${err.message}` }
      ]);
      setStatus("Ready");
      return;
    }

    // 2) Intermediate “router” message
    setMessages(ms => [
      ...ms,
      {
        role: "assistant",
        content:
          route.type === "jira"
            ? `🎟️ Detected Jira ticket **${route.param}** — fetching analysis…`
            : `📄 Detected Confluence page **${route.param}** — fetching content…`
      }
    ]);
    setStatus("Working…");

    // 3) Final call
    try {
      if (route.type === "jira") {
        const res = await fetch("/api/v1/agent/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ issue_key: route.param })
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.detail || res.statusText);

        // render Jira flow
        setMessages(ms => [
          ...ms,
          {
            role: "assistant",
            content: (
              <div>
                <h3>Issue: {body.issue.key}</h3>
                <p>{body.issue.fields.summary}</p>

                <h4>Keywords</h4>
                <ul>
                  {body.keywords.map((kw,i) => <li key={i}>{kw}</li>)}
                </ul>

                <h4>Findings</h4>
                {body.findings.map((f,i) => (
                  <div key={i}>
                    <strong>{f.keyword}</strong>
                    <ul>
                      {f.content.map((c,j) => {
                        try {
                          const o = JSON.parse(c.text);
                          return (
                            <li key={j}>
                              <a href={o.url} target="_blank" rel="noopener">
                                {o.path}
                              </a> ({o.repo})
                            </li>
                          );
                        } catch {
                          return <li key={j}>{c.text}</li>;
                        }
                      })}
                    </ul>
                  </div>
                ))}

                {body.suggested_fix && (
                  <>
                    <h4>Suggested Fix</h4>
                    <p>
                      <a href={body.suggested_fix.repo_url}
                         target="_blank" rel="noopener">
                        {body.suggested_fix.repo_url}
                      </a><br/>
                      File: {body.suggested_fix.file_path}<br/>
                      Line: {body.suggested_fix.line_number}
                    </p>
                  </>
                )}

                <h4>Explanation</h4>
                <p>{body.explanation}</p>

                {body.assumptions && body.assumptions.length > 0 && (
                  <>
                    <h4>Top 3 Hypotheses</h4>
                    <ol>
                      {body.assumptions.map((a, k) => <li key={k}>{a}</li>)}
                    </ol>
                  </>
                )}
              </div>
            )
          }
        ]);
      } else {
        // Confluence flow
        const res = await fetch("/api/v1/agent/confluence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ param: route.param })
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.detail || res.statusText);

        setMessages(ms => [
          ...ms,
          {
            role: "assistant",
            content: (
              <div>
                <h3>Confluence Page: {body.page_id}</h3>
                <h4>{body.title}</h4>
                <p><em>Summary:</em> {body.summary}</p>
                <div dangerouslySetInnerHTML={{ __html: body.body }} />
              </div>
            )
          }
        ]);
      }
    } catch (err) {
      setMessages(ms => [
        ...ms,
        { role: "assistant", content: `⚠️ Fetch error: ${err.message}` }
      ]);
    } finally {
      setStatus("Ready");
    }
  };

  return (
    <div id="chat">
      <div className="status-bar"><b>Status:</b> {status}</div>
      <div className="chat-window">
        {messages.map((m,i) => (
          <div key={i} className={`message ${m.role}`}>
            {m.content}
          </div>
        ))}
      </div>
      <div className="input-area">
        <input
          type="text"
          placeholder="E.g. BTS-8 or Confluence page ID…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
        />
        <button onClick={handleSubmit}>Send</button>
      </div>
    </div>
  );
}

// use the UMD ReactDOM global
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
