const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.join(__dirname, "public");
const DIST_DIR = path.join(__dirname, "dist");

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
