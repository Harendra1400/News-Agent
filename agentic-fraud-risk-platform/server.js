const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 4180);
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const customers = [
  {
    id: "C-10482",
    name: "Maya R.",
    segment: "Premier Checking",
    tenureMonths: 44,
    homeRegion: "Charlotte, NC",
    normalMerchantTypes: ["grocery", "fuel", "utilities", "dining"],
    usualDevice: "iPhone 14",
    avgTicket: 84,
    riskProfile: "low"
  },
  {
    id: "C-22071",
    name: "Jordan K.",
    segment: "Small Business",
    tenureMonths: 21,
    homeRegion: "Atlanta, GA",
    normalMerchantTypes: ["shipping", "office supplies", "software"],
    usualDevice: "Windows laptop",
    avgTicket: 430,
    riskProfile: "medium"
  },
  {
    id: "C-39120",
    name: "Avery S.",
    segment: "Student Banking",
    tenureMonths: 8,
    homeRegion: "Raleigh, NC",
    normalMerchantTypes: ["food delivery", "books", "ride share"],
    usualDevice: "Android Pixel",
    avgTicket: 36,
    riskProfile: "medium"
  },
  {
    id: "C-50819",
    name: "Priya M.",
    segment: "Wealth",
    tenureMonths: 76,
    homeRegion: "Richmond, VA",
    normalMerchantTypes: ["travel", "dining", "brokerage", "charity"],
    usualDevice: "MacBook Pro",
    avgTicket: 920,
    riskProfile: "low"
  }
];

const transactions = [
  {
    id: "TX-905144",
    customerId: "C-10482",
    amount: 2840,
    merchant: "Northbridge Electronics",
    merchantType: "electronics",
    channel: "card-not-present",
    location: "Miami, FL",
    device: "Unknown Android",
    ipVelocity: 7,
    hour: 2,
    status: "held",
    timestamp: "2026-06-10T06:14:00.000Z"
  },
  {
    id: "TX-905188",
    customerId: "C-22071",
    amount: 11850,
    merchant: "Wire Outbound ACH",
    merchantType: "wire",
    channel: "online-banking",
    location: "Chicago, IL",
    device: "Windows laptop",
    ipVelocity: 3,
    hour: 9,
    status: "review",
    timestamp: "2026-06-10T13:05:00.000Z"
  },
  {
    id: "TX-905211",
    customerId: "C-39120",
    amount: 719,
    merchant: "GameVault Digital",
    merchantType: "digital goods",
    channel: "card-not-present",
    location: "Seattle, WA",
    device: "Unknown iPhone",
    ipVelocity: 11,
    hour: 1,
    status: "held",
    timestamp: "2026-06-10T05:42:00.000Z"
  },
  {
    id: "TX-905260",
    customerId: "C-50819",
    amount: 6250,
    merchant: "Royal Meridian Travel",
    merchantType: "travel",
    channel: "card-present",
    location: "New York, NY",
    device: "MacBook Pro",
    ipVelocity: 1,
    hour: 16,
    status: "approved",
    timestamp: "2026-06-10T20:08:00.000Z"
  },
  {
    id: "TX-905301",
    customerId: "C-10482",
    amount: 96,
    merchant: "Queen City Grocery",
    merchantType: "grocery",
    channel: "card-present",
    location: "Charlotte, NC",
    device: "iPhone 14",
    ipVelocity: 1,
    hour: 18,
    status: "approved",
    timestamp: "2026-06-10T22:31:00.000Z"
  },
  {
    id: "TX-905355",
    customerId: "C-22071",
    amount: 5300,
    merchant: "New Payee Zelle",
    merchantType: "p2p",
    channel: "mobile",
    location: "Atlanta, GA",
    device: "Unknown Android",
    ipVelocity: 6,
    hour: 23,
    status: "review",
    timestamp: "2026-06-11T03:02:00.000Z"
  }
];

const watchlist = [
  { entity: "Northbridge Electronics", type: "merchant", signal: "Chargeback spike", severity: "high" },
  { entity: "Unknown Android / ASN-4482", type: "device-network", signal: "Credential stuffing cluster", severity: "high" },
  { entity: "GameVault Digital", type: "merchant", signal: "Synthetic identity testing", severity: "medium" },
  { entity: "New Payee Zelle", type: "payment rail", signal: "First-party scam pattern", severity: "medium" }
];

function customerFor(transaction) {
  return customers.find((customer) => customer.id === transaction.customerId);
}

function scoreTransaction(transaction) {
  const customer = customerFor(transaction);
  const reasons = [];
  let score = 8;

  if (!customer) {
    return { score: 60, label: "review", reasons: ["Customer profile unavailable"] };
  }

  const amountRatio = transaction.amount / customer.avgTicket;
  if (amountRatio >= 20) {
    score += 26;
    reasons.push(`Amount is ${amountRatio.toFixed(1)}x the customer baseline`);
  } else if (amountRatio >= 8) {
    score += 16;
    reasons.push(`Amount is ${amountRatio.toFixed(1)}x the customer baseline`);
  }

  if (!customer.normalMerchantTypes.includes(transaction.merchantType)) {
    score += 14;
    reasons.push("Merchant category is unusual for this customer");
  }

  if (!transaction.location.includes(customer.homeRegion.split(",")[1].trim()) && transaction.channel !== "online-banking") {
    score += 10;
    reasons.push("Transaction location differs from home behavior");
  }

  if (transaction.device !== customer.usualDevice) {
    score += 15;
    reasons.push("Device fingerprint is new or untrusted");
  }

  if (transaction.ipVelocity >= 6) {
    score += 13;
    reasons.push("High IP/device velocity in short window");
  }

  if (transaction.hour < 5 || transaction.hour > 22) {
    score += 8;
    reasons.push("Activity occurred outside normal banking hours");
  }

  const matchedWatchlist = watchlist.find((item) => item.entity === transaction.merchant || transaction.device.includes(item.entity.split(" / ")[0]));
  if (matchedWatchlist) {
    score += matchedWatchlist.severity === "high" ? 16 : 9;
    reasons.push(`Matched risk watchlist: ${matchedWatchlist.signal}`);
  }

  score = Math.min(99, score);
  const label = score >= 75 ? "high" : score >= 45 ? "review" : "low";
  return { score, label, reasons: reasons.length ? reasons : ["Behavior is consistent with customer baseline"] };
}

function enrichedTransactions() {
  return transactions.map((transaction) => ({
    ...transaction,
    customer: customerFor(transaction),
    risk: scoreTransaction(transaction)
  })).sort((a, b) => b.risk.score - a.risk.score);
}

function buildInvestigation(txId) {
  const transaction = enrichedTransactions().find((item) => item.id === txId) || enrichedTransactions()[0];
  const related = enrichedTransactions()
    .filter((item) => item.id !== transaction.id && (item.customerId === transaction.customerId || item.device === transaction.device || item.merchantType === transaction.merchantType))
    .slice(0, 3);

  const action = transaction.risk.score >= 75
    ? "Hold transaction, step-up verify customer, and open network investigation."
    : transaction.risk.score >= 45
      ? "Route to analyst queue and request contextual verification."
      : "Approve with passive monitoring.";

  return {
    transaction,
    related,
    agentNarrative: [
      `Risk score ${transaction.risk.score}/100 driven by ${transaction.risk.reasons[0].toLowerCase()}.`,
      `Customer profile: ${transaction.customer.segment}, ${transaction.customer.tenureMonths} months tenure, baseline ticket around $${transaction.customer.avgTicket}.`,
      `Recommended action: ${action}`
    ],
    nextBestActions: [
      action,
      "Check recent login geolocation and MFA challenge outcomes.",
      "Compare merchant and device against confirmed fraud cases from the last 24 hours.",
      "Document final disposition for model feedback loop."
    ],
    modelFeatures: [
      { name: "amount_to_baseline_ratio", value: Number((transaction.amount / transaction.customer.avgTicket).toFixed(2)) },
      { name: "new_device", value: transaction.device === transaction.customer.usualDevice ? 0 : 1 },
      { name: "ip_velocity", value: transaction.ipVelocity },
      { name: "merchant_category_drift", value: transaction.customer.normalMerchantTypes.includes(transaction.merchantType) ? 0 : 1 },
      { name: "watchlist_match", value: transaction.risk.reasons.some((reason) => reason.includes("watchlist")) ? 1 : 0 }
    ]
  };
}

function summary() {
  const items = enrichedTransactions();
  const high = items.filter((item) => item.risk.label === "high").length;
  const review = items.filter((item) => item.risk.label === "review").length;
  const exposure = items.filter((item) => item.risk.score >= 45).reduce((sum, item) => sum + item.amount, 0);
  return {
    generatedAt: new Date().toISOString(),
    kpis: {
      transactionsScreened: items.length,
      highRiskAlerts: high,
      analystQueue: review,
      exposureAtRisk: exposure,
      avgRiskScore: Math.round(items.reduce((sum, item) => sum + item.risk.score, 0) / items.length)
    },
    signals: [
      "Card-not-present activity is clustering around new devices and high velocity sessions.",
      "Two payment events include new payees or merchants with elevated network intelligence.",
      "Synthetic rules are explainable and deterministic for demo transparency."
    ],
    queue: items,
    watchlist
  };
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(text);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function api(req, res, pathname) {
  if (pathname === "/api/summary") {
    sendJson(res, 200, summary());
    return;
  }

  if (pathname.startsWith("/api/investigations/")) {
    sendJson(res, 200, buildInvestigation(decodeURIComponent(pathname.split("/").pop())));
    return;
  }

  if (pathname === "/api/simulate" && req.method === "POST") {
    const body = await readJsonBody(req);
    const transaction = {
      id: `SIM-${Date.now().toString().slice(-6)}`,
      customerId: body.customerId || "C-10482",
      amount: Number(body.amount || 1000),
      merchant: body.merchant || "Simulated Merchant",
      merchantType: body.merchantType || "electronics",
      channel: body.channel || "card-not-present",
      location: body.location || "Miami, FL",
      device: body.device || "Unknown Android",
      ipVelocity: Number(body.ipVelocity || 5),
      hour: Number(body.hour || 2),
      status: "simulated",
      timestamp: new Date().toISOString()
    };
    sendJson(res, 200, { transaction, customer: customerFor(transaction), risk: scoreTransaction(transaction) });
    return;
  }

  sendJson(res, 404, { error: "Unknown API route" });
}

function serveStatic(res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackError, fallbackData) => {
        if (fallbackError) {
          sendText(res, 404, "Not found");
          return;
        }
        res.writeHead(200, { "Content-Type": MIME_TYPES[".html"] });
        res.end(fallbackData);
      });
      return;
    }
    res.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const parsed = new URL(req.url, `http://${req.headers.host}`);
    if (parsed.pathname.startsWith("/api/")) {
      await api(req, res, parsed.pathname);
      return;
    }
    serveStatic(res, parsed.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Agentic Fraud Risk Platform running at http://localhost:${PORT}`);
});
