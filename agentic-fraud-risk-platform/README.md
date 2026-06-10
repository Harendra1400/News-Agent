# Agentic Fraud Investigation & Risk Intelligence Platform

A portfolio-ready demo of an AI/ML-style banking fraud investigation console. The project is inspired by fraud operations and retail banking risk workflows, with synthetic data only.

> Disclaimer: This is an independent demo project. It is not affiliated with, endorsed by, sponsored by, or connected to Truist Financial or any other financial institution.

## Why This Project

This project is designed to show practical AI/ML engineering skills for fraud, risk, and financial services roles:

- Explainable transaction risk scoring
- Agent-style investigation summaries
- Analyst queue prioritization
- Feature-level model reasoning
- Scenario simulation for fraud strategy testing
- Clean full-stack implementation that runs locally without paid services

## Features

- Synthetic customer profiles, transaction events, device signals, and merchant intelligence
- Deterministic fraud scoring engine with transparent reason codes
- Case investigation view with next-best actions
- Watchlist intelligence for merchants, devices, and payment rails
- What-if transaction simulator
- Responsive dashboard UI for recruiter demos and walkthrough videos

## Tech Stack

- Node.js HTTP server
- Vanilla JavaScript frontend
- HTML/CSS
- Synthetic feature engineering and rules-based risk scoring
- No database or external API required

## Run Locally

```bash
npm start
```

Then open:

```text
http://localhost:4180
```

## API Endpoints

```text
GET  /api/summary
GET  /api/investigations/:transactionId
POST /api/simulate
```

## Portfolio Talking Points

- Built a financial-crime analyst workflow from transaction event data through queue triage and investigation.
- Implemented explainable risk scoring with reason codes that map to model features.
- Designed the system so it can later be upgraded from deterministic scoring to ML inference, graph intelligence, or LLM-generated investigation narratives.
- Used synthetic data to avoid privacy, compliance, and client confidentiality risk.

## Suggested Future Enhancements

- Add an XGBoost or logistic regression scoring service
- Store cases in SQLite or Postgres
- Add entity graph visualization for device, account, merchant, and IP relationships
- Add model drift and false-positive monitoring
- Add authentication and role-based analyst workflows
