# News Agent

News Agent is an interactive daily intelligence dashboard for following international news, technology updates, market trends, and a personal stock or crypto watchlist.

Live site: [https://news-agent-o54w.onrender.com/](https://news-agent-o54w.onrender.com/)

## What It Does

- Shows a daily briefing with world, technology, and market headlines.
- Pulls recent stories from RSS feeds such as BBC, The Verge, TechCrunch, Yahoo Finance, MarketWatch, and others.
- Displays live market quote cards for symbols like `SPY`, `QQQ`, `NVDA`, `AAPL`, `MSFT`, `TSLA`, and `BTC`.
- Lets you search headlines, switch sections, save articles, and use focus mode.
- Includes a "Learn Today" panel that turns the news into daily reflection prompts.
- Supports a custom watchlist so you can follow the stocks or crypto assets you care about.

## Is This An Agent?

This project is an agent-style news dashboard. It gathers information from multiple sources, organizes it into useful sections, refreshes market data, and helps you learn from daily news.

It is not a fully autonomous AI agent yet. It does not make decisions for you, trade stocks, send alerts, or summarize articles using an LLM. A future version could add those capabilities, such as:

- AI-generated daily summaries.
- Personalized topic tracking.
- Email or desktop alerts.
- Trend detection across multiple days.
- A question-answer chat assistant for the latest headlines.

## Tech Stack

- React
- Vite
- Node.js HTTP server
- Yahoo Finance chart data for quotes
- RSS feeds for news
- Render for hosting

## Run Locally

Install dependencies:

```bash
npm install
```

Build the React app:

```bash
npm run build
```

Start the server:

```bash
npm start
```

Open:

```text
http://localhost:4173
```

## Deploy

This app can be hosted on Render as a Web Service.

Recommended Render settings:

```text
Build command: npm install && npm run build
Start command: npm start
```

## Notes

Market data and news availability depend on third-party public endpoints and RSS feeds. This app is for learning and personal tracking only, not financial advice.
