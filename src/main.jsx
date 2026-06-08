import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BarChart3,
  Bot,
  Bookmark,
  BookmarkCheck,
  Brain,
  ExternalLink,
  Focus,
  Globe2,
  Newspaper,
  RefreshCw,
  Search,
  TrendingUp,
  Wifi
} from "lucide-react";
import "./styles.css";

const DEFAULT_SYMBOLS = "SPY,QQQ,NVDA,AAPL,MSFT,TSLA,BTC";

const VIEWS = {
  briefing: {
    title: "Daily Briefing",
    subtitle: "World, technology, markets, and trend signals",
    icon: Newspaper
  },
  world: {
    title: "International News",
    subtitle: "Current reporting from global sources",
    icon: Globe2
  },
  technology: {
    title: "Technology News",
    subtitle: "AI, platforms, cybersecurity, startups, products, and policy",
    icon: Brain
  },
  markets: {
    title: "Market Trends",
    subtitle: "Stocks, macro signals, companies, and investor sentiment",
    icon: TrendingUp
  }
};

function useLocalStorage(key, fallback) {
  const [value, setValue] = useState(() => localStorage.getItem(key) || fallback);
  useEffect(() => localStorage.setItem(key, value), [key, value]);
  return [value, setValue];
}

function money(value) {
  if (!Number.isFinite(value)) return "N/A";
  return value >= 1000 ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value.toFixed(2);
}

function relativeTime(value) {
  if (!value) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function QuoteCard({ quote }) {
  const up = (quote.change || 0) >= 0;
  return (
    <article className="quote-card">
      <div className="quote-topline">
        <strong>{quote.symbol}</strong>
        <span className={up ? "positive" : "negative"}>{up ? "Up" : "Down"}</span>
      </div>
      <p>{quote.name}</p>
      <div className="quote-price">${money(quote.price)}</div>
      <div className={up ? "quote-change positive" : "quote-change negative"}>
        {Number.isFinite(quote.change) ? `${up ? "+" : ""}${quote.change.toFixed(2)}` : "N/A"} ·{" "}
        {Number.isFinite(quote.changePercent) ? `${quote.changePercent.toFixed(2)}%` : "N/A"}
      </div>
    </article>
  );
}

function ArticleCard({ item, saved, onToggleSaved }) {
  return (
    <article className="article-card">
      <div className="article-meta">
        <span>{item.source}</span>
        <time>{relativeTime(item.publishedAt)}</time>
      </div>
      <a className="article-title" href={item.url} target="_blank" rel="noreferrer">
        {item.title}
      </a>
      <p>{item.summary || "Open the source for the full story."}</p>
      <div className="article-actions">
        <button className={saved ? "saved" : ""} onClick={() => onToggleSaved(item.id)}>
          {saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          {saved ? "Saved" : "Save"}
        </button>
        <a href={item.url} target="_blank" rel="noreferrer">
          <ExternalLink size={15} />
          Open
        </a>
      </div>
    </article>
  );
}

function SummaryPanel({ summary, loading, error, onRefresh, reflection, setReflection }) {
  return (
    <aside className="learning-panel">
      <div className="panel-heading">
        <div>
          <h2>AI Briefing</h2>
          <p>Concise summary of today's signal</p>
        </div>
        <Bot size={20} />
      </div>

      <section className="ai-summary">
        {loading && <div className="empty">Generating briefing...</div>}
        {error && <div className="empty">Summary unavailable: {error}</div>}
        {!loading && !error && summary && (
          <>
            <div className="summary-header">
              <span className={summary.mode === "ai" ? "mode-pill ai" : "mode-pill"}>{summary.mode === "ai" ? "AI summary" : "Pattern summary"}</span>
              <button onClick={onRefresh}>
                <RefreshCw size={15} />
                Refresh
              </button>
            </div>
            <h3>{summary.title}</h3>
            <p>{summary.summary}</p>
            <div className="summary-block">
              <strong>Why it matters</strong>
              <p>{summary.whyItMatters}</p>
            </div>
            <div className="summary-block">
              <strong>Key trends</strong>
              <ul>
                {(summary.keyTrends || []).map((trend) => <li key={trend}>{trend}</li>)}
              </ul>
            </div>
            <div className="summary-block">
              <strong>Market pulse</strong>
              <p>{summary.marketPulse}</p>
            </div>
            <div className="summary-block">
              <strong>Learning question</strong>
              <p>{summary.learningQuestion}</p>
            </div>
            {summary.notice && <p className="summary-notice">{summary.notice}</p>}
          </>
        )}
      </section>

      <label className="reflection">
        <span>Your takeaway</span>
        <textarea value={reflection} onChange={(event) => setReflection(event.target.value)} placeholder="What changed in your understanding today?" />
      </label>
    </aside>
  );
}

function App() {
  const [view, setView] = useState("briefing");
  const [query, setQuery] = useState("");
  const [symbols, setSymbols] = useLocalStorage("news-agent-symbols", DEFAULT_SYMBOLS);
  const [draftSymbols, setDraftSymbols] = useState(symbols);
  const [reflection, setReflection] = useLocalStorage("news-agent-reflection", "");
  const [savedJson, setSavedJson] = useLocalStorage("news-agent-saved", "[]");
  const [briefing, setBriefing] = useState(null);
  const [aiSummary, setAiSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [articles, setArticles] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [focus, setFocus] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [error, setError] = useState("");

  const saved = useMemo(() => {
    try {
      return JSON.parse(savedJson);
    } catch {
      return [];
    }
  }, [savedJson]);

  const today = useMemo(() => new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  }), []);

  const visibleArticles = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return articles;
    return articles.filter((item) => `${item.title} ${item.summary} ${item.source}`.toLowerCase().includes(needle));
  }, [articles, query]);

  async function loadQuotes(nextSymbols = symbols) {
    const response = await getJson(`/api/quotes?symbols=${encodeURIComponent(nextSymbols)}`);
    setQuotes(response.quotes || []);
  }

  async function loadSummary() {
    setSummaryLoading(true);
    setSummaryError("");
    try {
      const response = await getJson("/api/summary");
      setAiSummary(response);
    } catch (summaryLoadError) {
      setSummaryError(summaryLoadError.message);
    } finally {
      setSummaryLoading(false);
    }
  }

  async function loadView(nextView = view) {
    setLoading(true);
    setError("");
    try {
      if (nextView === "briefing") {
        const data = await getJson("/api/briefing");
        setBriefing(data);
        setQuotes(data.quotes || []);
        setArticles([
          ...data.sections.world.slice(0, 4),
          ...data.sections.technology.slice(0, 4),
          ...data.sections.markets.slice(0, 4)
        ]);
        setUpdatedAt(data.updatedAt);
        loadSummary();
      } else {
        const data = await getJson(`/api/news?category=${nextView}`);
        setArticles(data.items || []);
        setUpdatedAt(data.updatedAt);
        await loadQuotes();
      }
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleSaved(id) {
    const next = saved.includes(id) ? saved.filter((item) => item !== id) : [id, ...saved].slice(0, 80);
    setSavedJson(JSON.stringify(next));
  }

  function applySymbols(event) {
    event.preventDefault();
    const next = draftSymbols || DEFAULT_SYMBOLS;
    setSymbols(next);
    loadQuotes(next);
  }

  useEffect(() => {
    loadView(view);
  }, [view]);

  useEffect(() => {
    const timer = setInterval(() => loadQuotes(), 60000);
    return () => clearInterval(timer);
  }, [symbols]);

  const currentView = VIEWS[view];

  return (
    <div className={focus ? "shell focus" : "shell"}>
      <aside className="sidebar">
        <div className="brand">
          <span>NA</span>
          <div>
            <strong>News Agent</strong>
            <small>Daily intelligence desk</small>
          </div>
        </div>

        <nav>
          {Object.entries(VIEWS).map(([key, item]) => {
            const Icon = item.icon;
            return (
              <button className={view === key ? "active" : ""} key={key} onClick={() => setView(key)}>
                <Icon size={18} />
                {item.title.replace(" News", "")}
              </button>
            );
          })}
        </nav>

        <form className="watchlist" onSubmit={applySymbols}>
          <label htmlFor="symbols">Watchlist</label>
          <div>
            <input id="symbols" value={draftSymbols} onChange={(event) => setDraftSymbols(event.target.value.toUpperCase())} spellCheck="false" />
            <button title="Refresh watchlist">
              <RefreshCw size={17} />
            </button>
          </div>
        </form>
      </aside>

      <main className="app">
        <header className="topbar">
          <div>
            <p className="eyebrow">{today}</p>
            <h1>Daily News Market Agent</h1>
          </div>
          <div className="toolbar">
            <label className="search">
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search headlines" />
            </label>
            <button onClick={() => loadView(view)} title="Refresh feeds">
              <RefreshCw size={18} />
            </button>
            <button className="focus-button" onClick={() => setFocus((value) => !value)}>
              <Focus size={18} />
              {focus ? "Exit Focus" : "Focus"}
            </button>
          </div>
        </header>

        <section className={error ? "status error" : "status"}>
          <div>
            <Wifi size={17} />
            <span>{error ? `Could not load feeds: ${error}` : loading ? "Loading latest feeds..." : "Latest feeds loaded"}</span>
          </div>
          <span>{updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Waiting for data"}</span>
        </section>

        <section className="market-strip">
          <div className="panel-heading">
            <div>
              <h2>Market Watch</h2>
              <p>Quotes refresh every minute while the dashboard is open</p>
            </div>
            <BarChart3 size={21} />
          </div>
          <div className="quote-grid">
            {quotes.length ? quotes.map((quote) => <QuoteCard quote={quote} key={quote.symbol} />) : <div className="empty">No quotes available yet.</div>}
          </div>
        </section>

        <section className="content-grid">
          <section className="news-panel">
            <div className="panel-heading">
              <div>
                <h2>{currentView.title}</h2>
                <p>{currentView.subtitle}</p>
              </div>
              <span className="count-pill">{visibleArticles.length} stories</span>
            </div>

            <div className="article-grid">
              {visibleArticles.map((item) => (
                <ArticleCard item={item} key={item.id} saved={saved.includes(item.id)} onToggleSaved={toggleSaved} />
              ))}
              {!visibleArticles.length && <div className="empty">No matching stories. Try a different search.</div>}
            </div>
          </section>

          <SummaryPanel
            summary={aiSummary}
            loading={summaryLoading}
            error={summaryError}
            onRefresh={loadSummary}
            reflection={reflection}
            setReflection={setReflection}
          />
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
