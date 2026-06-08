const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.join(__dirname, "public");
const DIST_DIR = path.join(__dirname, "dist");
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const FEEDS = {
  world: {
    title: "International",
    urls: [
      "https://feeds.bbci.co.uk/news/world/rss.xml",
      "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
      "https://www.aljazeera.com/xml/rss/all.xml"
    ]
  },
  technology: {
    title: "Technology",
    urls: [
      "https://feeds.bbci.co.uk/news/technology/rss.xml",
      "https://www.theverge.com/rss/index.xml",
      "https://techcrunch.com/feed/"
    ]
  },
  markets: {
    title: "Markets",
    urls: [
      "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
      "https://finance.yahoo.com/news/rssindex",
      "https://www.marketwatch.com/rss/topstories"
    ]
  }
};

const SYMBOLS = {
  SPY: "SPDR S&P 500 ETF",
  QQQ: "Invesco QQQ Trust",
  DIA: "SPDR Dow Jones Industrial Average ETF",
  IWM: "iShares Russell 2000 ETF",
  AAPL: "Apple",
  MSFT: "Microsoft",
  NVDA: "NVIDIA",
  TSLA: "Tesla",
  AMZN: "Amazon",
  GOOGL: "Alphabet",
  META: "Meta",
  BTC: "Bitcoin USD",
  ETH: "Ethereum USD"
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

const cache = new Map();

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

loadLocalEnv();

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function sendText(res, status, text, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(text);
}

function decodeEntities(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(value = "") {
  return decodeEntities(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function field(block, name) {
  const pattern = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i");
  const match = block.match(pattern);
  return match ? decodeEntities(match[1]).trim() : "";
}

function firstUrl(block) {
  const link = field(block, "link");
  if (link && /^https?:\/\//i.test(link)) return link.trim();
  const guid = field(block, "guid");
  if (guid && /^https?:\/\//i.test(guid)) return guid.trim();
  const atomLink = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
  return atomLink ? decodeEntities(atomLink[1]).trim() : "";
}

function sourceName(feedUrl) {
  try {
    const host = new URL(feedUrl).hostname.replace(/^www\./, "");
    return host.split(".").slice(0, -1).join(".") || host;
  } catch {
    return "News source";
  }
}

function parseFeed(xml, feedUrl, category) {
  const blocks = xml.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) || [];
  return blocks.map((block) => {
    const title = stripTags(field(block, "title"));
    const summary = stripTags(field(block, "description") || field(block, "summary") || field(block, "content:encoded"));
    const publishedRaw = field(block, "pubDate") || field(block, "published") || field(block, "updated");
    const publishedAt = publishedRaw ? new Date(stripTags(publishedRaw)).toISOString() : null;
    return {
      id: `${category}:${title}:${publishedAt || firstUrl(block)}`,
      title,
      summary,
      url: firstUrl(block),
      source: sourceName(feedUrl),
      category,
      publishedAt
    };
  }).filter((item) => item.title && item.url);
}

async function cached(key, ttlMs, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.createdAt < ttlMs) return hit.value;
  const value = await loader();
  cache.set(key, { createdAt: Date.now(), value });
  return value;
}

async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "DailyNewsMarketAgent/1.0 (+local dashboard)",
        "Accept": "application/rss+xml, application/xml, text/xml, */*"
      }
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 240)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

async function loadNews(category) {
  const feed = FEEDS[category] || FEEDS.world;
  return cached(`news:${category}`, 10 * 60 * 1000, async () => {
    const results = await Promise.allSettled(feed.urls.map(async (url) => parseFeed(await fetchWithTimeout(url), url, category)));
    const items = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    const byUrl = new Map();
    for (const item of items) byUrl.set(item.url, item);
    return Array.from(byUrl.values())
      .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
      .slice(0, 36);
  });
}

async function quote(symbol) {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9.^-]/g, "");
  if (!normalized) return null;
  const yahooSymbol = normalized === "BTC" ? "BTC-USD" : normalized === "ETH" ? "ETH-USD" : normalized;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=5m`;
  const data = JSON.parse(await fetchWithTimeout(url, 6000));
  const result = data.chart && data.chart.result && data.chart.result[0];
  if (!result || !result.meta) return null;
  const meta = result.meta;
  const quoteData = result.indicators && result.indicators.quote && result.indicators.quote[0];
  const closes = (quoteData && quoteData.close || []).filter(Number.isFinite);
  const price = Number(meta.regularMarketPrice || closes[closes.length - 1]);
  const previousClose = Number(meta.previousClose || meta.chartPreviousClose);
  if (!Number.isFinite(price)) return null;
  const change = Number.isFinite(previousClose) ? price - previousClose : null;
  const changePercent = change === null || !previousClose ? null : (change / previousClose) * 100;
  return {
    symbol: normalized,
    lookupSymbol: yahooSymbol,
    name: meta.longName || meta.shortName || SYMBOLS[normalized] || normalized,
    price,
    previousClose,
    high: Number(meta.regularMarketDayHigh),
    low: Number(meta.regularMarketDayLow),
    volume: Number(meta.regularMarketVolume),
    change,
    changePercent,
    asOf: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : new Date().toISOString()
  };
}

async function loadQuotes(symbols) {
  const selected = symbols.length ? symbols : ["SPY", "QQQ", "DIA", "NVDA", "AAPL", "MSFT", "TSLA", "BTC"];
  return cached(`quotes:${selected.join(",")}`, 60 * 1000, async () => {
    const results = await Promise.allSettled(selected.slice(0, 16).map(quote));
    return results
      .filter((result) => result.status === "fulfilled" && result.value)
      .map((result) => result.value);
  });
}

function compactStories(sections) {
  return Object.entries(sections).flatMap(([category, items]) =>
    items.slice(0, 6).map((item) => ({
      category,
      source: item.source,
      title: item.title,
      summary: item.summary
    }))
  );
}

function fallbackSummary(sections, quotes) {
  const stories = compactStories(sections);
  const topTopics = stories
    .flatMap((item) => `${item.title} ${item.summary}`.toLowerCase().match(/\b(ai|market|trade|security|policy|energy|earnings|rates|crypto|technology|war|startup)\b/g) || [])
    .reduce((map, word) => map.set(word, (map.get(word) || 0) + 1), new Map());
  const themes = Array.from(topTopics.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([word]) => word);
  const positive = quotes.filter((quote) => (quote.changePercent || 0) >= 0).length;
  const marketMood = positive >= Math.ceil(quotes.length / 2) ? "Watchlist sentiment is mostly positive today." : "Watchlist sentiment is mixed or defensive today.";

  return {
    mode: "fallback",
    title: "Daily Briefing Summary",
    summary: stories.slice(0, 4).map((item) => item.title).join(" ") || "Latest stories are loading.",
    whyItMatters: "This briefing groups the most recent international, technology, and market headlines so you can quickly scan the day before reading deeper.",
    keyTrends: themes.length ? themes.map((theme) => `Recurring signal: ${theme}`) : ["Track repeated regions, companies, policies, and sectors."],
    marketPulse: marketMood,
    learningQuestion: "Which headline could change market or public sentiment the most today?",
    generatedAt: new Date().toISOString()
  };
}

function parseModelJson(text) {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}

async function generateAiSummary(sections, quotes) {
  const fallback = fallbackSummary(sections, quotes);
  if (!process.env.OPENAI_API_KEY) {
    return {
      ...fallback,
      notice: "Set OPENAI_API_KEY to enable AI-generated summaries."
    };
  }

  const input = {
    stories: compactStories(sections),
    quotes: quotes.map((quote) => ({
      symbol: quote.symbol,
      name: quote.name,
      price: quote.price,
      changePercent: quote.changePercent
    }))
  };

  try {
    const response = await fetchJsonWithTimeout("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        instructions: "You are a concise news analyst. Summarize only the supplied headlines and quote data. Do not invent facts. Do not give financial advice. Return valid JSON only.",
        input: `Create a daily news briefing from this data:\n${JSON.stringify(input)}\n\nReturn JSON with keys: title, summary, whyItMatters, keyTrends, marketPulse, learningQuestion. keyTrends must be an array of 3 short strings.`
      })
    }, 30000);
    const parsed = parseModelJson(response.output_text || "");
    return {
      mode: "ai",
      title: String(parsed.title || fallback.title),
      summary: String(parsed.summary || fallback.summary),
      whyItMatters: String(parsed.whyItMatters || fallback.whyItMatters),
      keyTrends: Array.isArray(parsed.keyTrends) ? parsed.keyTrends.slice(0, 3).map(String) : fallback.keyTrends,
      marketPulse: String(parsed.marketPulse || fallback.marketPulse),
      learningQuestion: String(parsed.learningQuestion || fallback.learningQuestion),
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      ...fallback,
      notice: "AI summary unavailable. Check OPENAI_API_KEY in your hosting environment."
    };
  }
}

async function api(req, res, pathname, searchParams) {
  if (pathname === "/api/news") {
    const category = searchParams.get("category") || "world";
    sendJson(res, 200, {
      category,
      updatedAt: new Date().toISOString(),
      items: await loadNews(category)
    });
    return;
  }

  if (pathname === "/api/quotes") {
    const symbols = (searchParams.get("symbols") || "")
      .split(",")
      .map((symbol) => symbol.trim())
      .filter(Boolean);
    sendJson(res, 200, {
      updatedAt: new Date().toISOString(),
      quotes: await loadQuotes(symbols)
    });
    return;
  }

  if (pathname === "/api/briefing") {
    const [world, technology, markets, quotes] = await Promise.all([
      loadNews("world"),
      loadNews("technology"),
      loadNews("markets"),
      loadQuotes(["SPY", "QQQ", "DIA", "NVDA", "AAPL", "MSFT", "TSLA", "BTC"])
    ]);
    sendJson(res, 200, {
      updatedAt: new Date().toISOString(),
      sections: { world: world.slice(0, 8), technology: technology.slice(0, 8), markets: markets.slice(0, 8) },
      quotes
    });
    return;
  }

  if (pathname === "/api/summary") {
    const [world, technology, markets, quotes] = await Promise.all([
      loadNews("world"),
      loadNews("technology"),
      loadNews("markets"),
      loadQuotes(["SPY", "QQQ", "DIA", "NVDA", "AAPL", "MSFT", "TSLA", "BTC"])
    ]);
    const sections = { world: world.slice(0, 8), technology: technology.slice(0, 8), markets: markets.slice(0, 8) };
    sendJson(res, 200, await cached("summary:briefing", 5 * 60 * 1000, () => generateAiSummary(sections, quotes)));
    return;
  }

  if (pathname === "/api/ai-status") {
    const key = process.env.OPENAI_API_KEY || "";
    sendJson(res, 200, {
      configured: key.startsWith("sk-"),
      keyPrefix: key ? key.slice(0, 7) : "",
      model: OPENAI_MODEL
    });
    return;
  }

  sendJson(res, 404, { error: "Unknown API route" });
}

function serveStatic(res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const staticRoot = fs.existsSync(path.join(DIST_DIR, "index.html")) ? DIST_DIR : PUBLIC_DIR;
  let filePath = path.normalize(path.join(staticRoot, requested));
  if (!filePath.startsWith(staticRoot)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      filePath = path.join(staticRoot, "index.html");
      fs.readFile(filePath, (fallbackError, fallbackData) => {
        if (fallbackError) {
          sendText(res, 404, "Not found");
          return;
        }
        res.writeHead(200, { "Content-Type": MIME_TYPES[".html"] });
        res.end(fallbackData);
      });
      return;
    }
    const type = MIME_TYPES[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const parsed = new URL(req.url, `http://${req.headers.host}`);
    if (parsed.pathname.startsWith("/api/")) {
      await api(req, res, parsed.pathname, parsed.searchParams);
      return;
    }
    serveStatic(res, parsed.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Daily News Market Agent running at http://localhost:${PORT}`);
});
