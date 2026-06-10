const app = document.querySelector("#app");

let state = {
  summary: null,
  selected: null,
  investigation: null,
  simulation: null
};

const money = (value) => `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function riskClass(label) {
  return label === "high" ? "danger" : label === "review" ? "warn" : "ok";
}

async function getJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

async function loadDashboard() {
  state.summary = await getJson("/api/summary");
  state.selected = state.summary.queue[0]?.id;
  await loadInvestigation(state.selected);
}

async function loadInvestigation(id) {
  state.selected = id;
  state.investigation = await getJson(`/api/investigations/${encodeURIComponent(id)}`);
  render();
}

async function simulate(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  state.simulation = await getJson("/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.fromEntries(form.entries()))
  });
  render();
}

function kpiCard(label, value, detail) {
  return `
    <article class="kpi-card">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${detail}</small>
    </article>
  `;
}

function renderQueue(items) {
  return items.map((item) => `
    <button class="queue-row ${state.selected === item.id ? "active" : ""}" data-id="${item.id}">
      <span>
        <strong>${item.id}</strong>
        <small>${item.customer.name} · ${item.merchant}</small>
      </span>
      <span class="risk-pill ${riskClass(item.risk.label)}">${item.risk.score}</span>
    </button>
  `).join("");
}

function renderInvestigation(report) {
  if (!report) return `<div class="empty">Select a case to generate an investigation brief.</div>`;
  const tx = report.transaction;
  return `
    <section class="investigation">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Agent investigation</p>
          <h2>${tx.id} · ${tx.merchant}</h2>
        </div>
        <span class="risk-pill ${riskClass(tx.risk.label)}">${tx.risk.score}/100</span>
      </div>

      <div class="case-grid">
        <article>
          <span>Customer</span>
          <strong>${tx.customer.name}</strong>
          <small>${tx.customer.segment} · ${tx.customer.homeRegion}</small>
        </article>
        <article>
          <span>Amount</span>
          <strong>${money(tx.amount)}</strong>
          <small>${tx.channel} · ${tx.location}</small>
        </article>
        <article>
          <span>Device</span>
          <strong>${tx.device}</strong>
          <small>${tx.ipVelocity} IP events in window</small>
        </article>
      </div>

      <div class="two-column">
        <article class="panel">
          <h3>Reasoning trace</h3>
          <ul>${report.agentNarrative.map((item) => `<li>${item}</li>`).join("")}</ul>
        </article>
        <article class="panel">
          <h3>Next best actions</h3>
          <ul>${report.nextBestActions.map((item) => `<li>${item}</li>`).join("")}</ul>
        </article>
      </div>

      <article class="panel">
        <h3>Model feature snapshot</h3>
        <div class="feature-grid">
          ${report.modelFeatures.map((feature) => `
            <div>
              <span>${feature.name}</span>
              <strong>${feature.value}</strong>
            </div>
          `).join("")}
        </div>
      </article>
    </section>
  `;
}

function renderSimulation() {
  const result = state.simulation;
  return `
    <section class="simulator panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">What-if lab</p>
          <h2>Simulate a transaction</h2>
        </div>
      </div>
      <form id="simulate-form" class="sim-form">
        <label>Customer
          <select name="customerId">
            ${state.summary.queue.map((item) => `<option value="${item.customerId}">${item.customer.name} (${item.customerId})</option>`).join("")}
          </select>
        </label>
        <label>Amount
          <input name="amount" type="number" value="2400" min="1" />
        </label>
        <label>Merchant type
          <select name="merchantType">
            <option>electronics</option>
            <option>wire</option>
            <option>p2p</option>
            <option>grocery</option>
            <option>travel</option>
          </select>
        </label>
        <label>Device
          <select name="device">
            <option>Unknown Android</option>
            <option>Unknown iPhone</option>
            <option>iPhone 14</option>
            <option>Windows laptop</option>
            <option>MacBook Pro</option>
          </select>
        </label>
        <label>IP velocity
          <input name="ipVelocity" type="number" value="8" min="0" />
        </label>
        <label>Hour
          <input name="hour" type="number" value="2" min="0" max="23" />
        </label>
        <button type="submit">Score scenario</button>
      </form>
      ${result ? `
        <div class="simulation-result">
          <span class="risk-pill ${riskClass(result.risk.label)}">${result.risk.score}/100</span>
          <div>
            <strong>${result.risk.label.toUpperCase()} risk</strong>
            <p>${result.risk.reasons.join(" ")}</p>
          </div>
        </div>
      ` : ""}
    </section>
  `;
}

function render() {
  if (!state.summary) {
    app.innerHTML = `<main class="loading">Loading fraud intelligence console...</main>`;
    return;
  }

  const { kpis, signals, queue, watchlist, generatedAt } = state.summary;
  app.innerHTML = `
    <aside class="sidebar">
      <div class="brand">
        <span>FR</span>
        <div>
          <strong>Fraud Risk AI</strong>
          <small>Portfolio demo</small>
        </div>
      </div>
      <nav>
        <a href="#command">Command center</a>
        <a href="#casework">Case investigation</a>
        <a href="#simulator">What-if lab</a>
      </nav>
      <p class="disclaimer">Synthetic demo inspired by retail banking fraud workflows. Not affiliated with, endorsed by, or connected to Truist Financial.</p>
    </aside>

    <main class="workspace">
      <header class="hero" id="command">
        <div>
          <p class="eyebrow">Agentic Fraud Investigation & Risk Intelligence Platform</p>
          <h1>Banking fraud triage with explainable agent reasoning.</h1>
          <p>Screen transactions, rank analyst queues, inspect model features, and simulate risk outcomes using synthetic customer behavior.</p>
        </div>
        <div class="hero-meta">
          <span>Updated ${new Date(generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
          <button id="refresh">Refresh</button>
        </div>
      </header>

      <section class="kpi-grid">
        ${kpiCard("Transactions screened", kpis.transactionsScreened, "synthetic events")}
        ${kpiCard("High-risk alerts", kpis.highRiskAlerts, "priority holds")}
        ${kpiCard("Analyst queue", kpis.analystQueue, "manual reviews")}
        ${kpiCard("Exposure at risk", money(kpis.exposureAtRisk), `avg score ${kpis.avgRiskScore}`)}
      </section>

      <section class="intelligence-grid">
        <article class="panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Live queue</p>
              <h2>Ranked alerts</h2>
            </div>
          </div>
          <div class="queue">${renderQueue(queue)}</div>
        </article>

        <article class="panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Risk intelligence</p>
              <h2>Current signals</h2>
            </div>
          </div>
          <ul class="signal-list">${signals.map((signal) => `<li>${signal}</li>`).join("")}</ul>
          <div class="watchlist">
            ${watchlist.map((item) => `
              <div>
                <strong>${item.entity}</strong>
                <span>${item.type} · ${item.signal}</span>
              </div>
            `).join("")}
          </div>
        </article>
      </section>

      <div id="casework">${renderInvestigation(state.investigation)}</div>
      <div id="simulator">${renderSimulation()}</div>
    </main>
  `;

  document.querySelector("#refresh").addEventListener("click", loadDashboard);
  document.querySelectorAll(".queue-row").forEach((button) => {
    button.addEventListener("click", () => loadInvestigation(button.dataset.id));
  });
  document.querySelector("#simulate-form").addEventListener("submit", simulate);
}

render();
loadDashboard().catch((error) => {
  app.innerHTML = `<main class="loading error">Could not load demo data: ${error.message}</main>`;
});
