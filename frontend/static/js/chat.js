/* chat.js — Meteorological AI Intelligence Assistant */

async function renderChat() {
  const main = layout("chat");
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Meteorological AI Intelligence Assistant</h1>
        <p class="page-description">
          Domain-grounded conversational agent powered by Google Gemini and calibrated against 44 years of Karnataka climate observations, 32 ML feature formulations, SHAP explainers, and municipal adaptation directives.
        </p>
      </div>
      <div style="display:flex; gap:10px; align-items:center">
        <span class="badge badge-cyan" id="chatEngineBadge">Verifying AI Engine...</span>
      </div>
    </div>

    <!-- Meteorological Query Prompt Chips -->
    <div style="margin-bottom:16px">
      <div style="font-size:11px; text-transform:uppercase; font-family:'JetBrains Mono',monospace; color:var(--text-muted); margin-bottom:8px">
        RECOMMENDED OPERATIONAL QUERIES:
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:8px">
        <button class="chip-btn" data-msg="How does El Niño modulate the Southwest Monsoon across Karnataka?">
          🌊 El Niño & Monsoon Teleconnection
        </button>
        <button class="chip-btn" data-msg="Why is the rainfall model R² (0.23) lower than the temperature model R² (0.94)?">
          📊 Model Accuracy & Skill Breakdown
        </button>
        <button class="chip-btn" data-msg="Explain the 32 automated features engineered for next-day forecasting.">
          ⚡ 32 Engineered Features Pipeline
        </button>
        <button class="chip-btn" data-msg="How does SHAP explainability ensure transparency in heat risk predictions?">
          🔍 SHAP Interpretability & Ethics
        </button>
        <button class="chip-btn" data-msg="What are the emergency municipal actions for Very High Heat (P90) risk?">
          🛡️ P90 Extreme Heat Response Actions
        </button>
        <button class="chip-btn" data-msg="Which Karnataka districts face the highest historical drought vulnerability?">
          🏜️ District Drought Vulnerability
        </button>
      </div>
    </div>

    <!-- Chat Console Card -->
    <div class="card" style="padding:0; overflow:hidden">
      <div style="padding:14px 18px; background:rgba(8, 17, 29, 0.9); border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center">
        <div style="display:flex; align-items:center; gap:8px">
          <div style="width:10px; height:10px; border-radius:50%; background:var(--risk-normal); box-shadow:0 0 8px var(--risk-normal)"></div>
          <span style="font-size:13px; font-weight:600; color:#fff; font-family:'JetBrains Mono',monospace">INTELLIGENCE TERMINAL — GROUNDED CLIMATE AGENT</span>
        </div>
        <span style="font-size:11px; color:var(--text-muted); font-family:'JetBrains Mono',monospace">STRICT SCIENTIFIC GROUNDING</span>
      </div>

      <div style="padding:20px" class="chat-console-wrapper">
        <div class="chat-log-box" id="log">
          <!-- Chat bubbles rendered here -->
        </div>

        <form id="chat-form" class="chat-input-container">
          <textarea
            id="message"
            class="chat-textarea"
            rows="2"
            placeholder="Ask any technical question about Karnataka meteorology, El Niño teleconnections, model metrics, or municipal protocols..."
            required
          ></textarea>
          <button type="submit" id="sendBtn" class="btn btn-primary" style="height:52px; padding:0 24px; font-size:13px">
            Send Inquiry ⚡
          </button>
        </form>
      </div>
    </div>

    <div class="scientific-disclaimer-box" style="margin-top:20px">
      <strong>Grounding & Hallucination Guardrail:</strong> The Karnataka Climate Assistant answers strictly within the scientific boundaries of 44-year historical reanalyses, NOAA ONI indices, and scikit-learn model parameters. It is mathematically barred from asserting ungrounded weather causation.
    </div>
  `;

  const log = document.getElementById("log");
  const badge = document.getElementById("chatEngineBadge");
  const sendBtn = document.getElementById("sendBtn");
  const messageInput = document.getElementById("message");

  // Query backend health to show accurate engine badge
  fetch("/api/health")
    .then((r) => r.json())
    .then((h) => {
      if (h.gemini?.includes("configured")) {
        badge.textContent = "Google Gemini 2.0 Live";
        badge.className = "badge badge-normal";
      } else {
        badge.textContent = "Domain Knowledge Engine";
        badge.className = "badge badge-cyan";
      }
    })
    .catch(() => {
      badge.textContent = "Offline Domain Engine";
      badge.className = "badge badge-advisory";
    });

  function addBubble(role, text, source) {
    const div = document.createElement("div");
    div.className = `bubble ${role}`;
    let label = role === "user" ? "OPERATOR INQUIRY" : (source === "gemini" ? "GEMINI CLIMATE INTELLIGENCE" : "GROUNDED CLIMATE AGENT");

    // Format newlines and bullet points cleanly
    const formattedText = escapeHtml(text);

    div.innerHTML = `
      <div class="bubble-meta">
        <span>${role === "user" ? "👤" : "🤖"}</span>
        <span>${escapeHtml(label)}</span>
        <span style="opacity:0.6; margin-left:auto">${new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div class="bubble-text">${formattedText}</div>
    `;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  // Initial welcome message
  addBubble(
    "bot",
    "Welcome to the Karnataka Meteorological Intelligence Terminal.\n\nI am grounded in 44 years of Karnataka daily weather observations (1981–2024), NOAA Oceanic Niño Index records, dual scikit-learn forecasting pipelines, and SHAP explainability engines.\n\nHow can I support your climate risk analysis or municipal adaptation planning today?",
    "offline"
  );

  // Form submit handler
  document.getElementById("chat-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const msg = messageInput.value.trim();
    if (!msg) return;

    addBubble("user", msg);
    messageInput.value = "";
    messageInput.disabled = true;
    sendBtn.disabled = true;
    sendBtn.textContent = "Analyzing...";

    // Typing placeholder
    const typingDiv = document.createElement("div");
    typingDiv.className = "bubble bot";
    typingDiv.id = "typingIndicator";
    typingDiv.innerHTML = `
      <div class="bubble-meta"><span>🤖</span><span>ANALYZING CLIMATE RECORD...</span></div>
      <div style="font-family:'JetBrains Mono',monospace; font-size:12px; color:var(--cyan)">Querying meteorological knowledge base and computing response...</div>
    `;
    log.appendChild(typingDiv);
    log.scrollTop = log.scrollHeight;

    try {
      const data = await api("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: msg }),
      });
      document.getElementById("typingIndicator")?.remove();
      addBubble("bot", data.reply, data.source);
    } catch (err) {
      document.getElementById("typingIndicator")?.remove();
      addBubble("bot", `Communication Error: ${err.message}`, "offline");
    } finally {
      messageInput.disabled = false;
      sendBtn.disabled = false;
      sendBtn.textContent = "Send Inquiry ⚡";
      messageInput.focus();
    }
  });

  // Enable Enter key submission (Shift+Enter for newline)
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      document.getElementById("chat-form").dispatchEvent(new Event("submit"));
    }
  });

  // Suggestion chip handlers
  document.querySelectorAll(".chip-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      messageInput.value = btn.dataset.msg;
      document.getElementById("chat-form").dispatchEvent(new Event("submit"));
    });
  });
}

renderChat();
