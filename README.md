# KubeGuard Deployment Intelligence

KubeGuard is a live deployment-risk dashboard for pull requests. It combines GitHub, Datadog, Sentry, and Linear signals through Coral so a team can see whether a PR is safe to merge, needs more review, or should wait before reaching `main`.

## What This Project Is About

Deployment risk usually lives across multiple tools. GitHub knows what code changed, Datadog knows whether the service is healthy, Sentry knows whether users are hitting errors, and Linear knows whether known high-priority bugs are still open. KubeGuard brings those signals into one workflow.

The dashboard helps you:

- View live pull requests from a GitHub repository.
- Detect the affected service from GitHub labels such as `service:payments`.
- Fetch live Datadog monitors, services, incidents, hosts, and metric reports.
- Fetch live Sentry issues.
- Fetch live Linear issues and match them to a service or PR.
- Compute a 0-100 risk score.
- Show PR status as pending, successful, closed, or blocked.
- Visualize the service topology and gate outcome.

## What We Are Going To Do

The complete workflow is:

1. Connect Coral sources for GitHub, Datadog, Sentry, and Linear.
2. Start the local KubeGuard server.
3. Open the dashboard at `http://localhost:4173`.
4. Configure the GitHub owner and repository.
5. Sync live sources.
6. Select a PR and service from the dropdowns.
7. Run the joined Coral risk query.
8. Review the PR queue, service health, incident signals, policies, trends, integrations, and service map.

For a demo, the story is:

- GitHub provides PR details and labels.
- Datadog provides service health and operational alerts.
- Sentry provides unresolved error issues.
- Linear provides high-priority product or engineering bugs.
- Coral exposes those tools as SQL tables.
- KubeGuard turns the joined data into a visual risk workflow.

## What It Helps With

KubeGuard helps engineering and SRE teams make deployment decisions with context instead of checking every tool manually.

It is useful for:

- Pre-merge deployment risk review.
- Hackathon demos around live release gates.
- Showing how Coral can join engineering-tool data through SQL.
- Explaining why a PR should proceed, wait, or be blocked.
- Seeing service health beside code changes.
- Reducing manual checks across GitHub, Datadog, Sentry, and Linear.

## Architecture

```text
Browser UI
  |
  | HTTP
  v
Local Node server
  |
  | runs Coral CLI + GitHub REST fallback
  v
Coral SQL layer
  |
  | source tables
  v
+---------+----------+----------+---------+
| GitHub  | Datadog  | Sentry   | Linear  |
+---------+----------+----------+---------+
  |
  v
Risk score + visual deployment workflow
```

### Runtime Flow

```text
index.html
  loads the dashboard shell

src/app.js
  calls /api/live/* endpoints
  renders the live dashboard sections
  computes UI-level risk summaries

server/live-server.mjs
  serves static assets
  loads .env
  runs Coral SQL queries
  uses GitHub REST fallback when needed

coral/queries/risk_score.sql
  joins github.pulls, sentry.issues, datadog.monitors, and linear.issues

agent/
  contains scoring, comment formatting, and automation helpers
```

## Project Structure

```text
D:\test\terra
|-- index.html
|   Main dashboard HTML shell.
|
|-- package.json
|   Project metadata and local start scripts.
|
|-- start-live.ps1
|   Windows helper script to start the live server.
|
|-- assets/
|   `-- coral-background.png
|       Background image used by the UI.
|
|-- server/
|   `-- live-server.mjs
|       Local HTTP server and live API layer.
|
|-- src/
|   |-- app.js
|   |   Dashboard state, live loading, scoring display, and rendering.
|   `-- styles.css
|       Dashboard layout, visual styling, tables, cards, and service map.
|
|-- coral/
|   |-- queries/
|   |   |-- risk_score.sql
|   |   |   Main joined risk query.
|   |   |-- pr_details.sql
|   |   |   Pull request details query.
|   |   `-- service_health.sql
|   |       Service health query.
|   `-- sources/
|       `-- linear.yaml
|           Custom Coral source definition for Linear.
|
|-- agent/
|   |-- scorer.py
|   |   Weighted 0-100 risk scoring logic.
|   |-- comment_formatter.py
|   |   Markdown PR comment formatter.
|   |-- run_agent.py
|   |   Automation entry point for CI usage.
|   `-- system_prompt.md
|       Agent workflow instructions.
|
|-- .github/
|   `-- workflows/
|       `-- risk_gate.yml
|           GitHub Actions risk gate workflow.
|
|-- github_action/
|   `-- risk_gate.yml
|       Reference copy of the risk gate workflow.
|
|-- scripts/
|   |-- setup.sh
|   |   Helper script for Coral source setup.
|   `-- test_query.sh
|       Helper script for query testing.
|
|-- docs/
|   `-- ui-workflow.md
|       UI workflow notes.
|
`-- .env
    Local secrets and configuration. This file is ignored by Git.
```

## Risk Scoring Model

The score is a weighted 0-100 value:

```text
GitHub PR size + Sentry issues + Datadog signal + Linear bugs = risk score
```

| Signal | Max points | Meaning |
| --- | ---: | --- |
| GitHub PR size | 25 | Larger line/file changes add more risk. |
| Sentry issues | 35 | Unresolved issues add risk up to the cap. |
| Datadog signal | 25 | Alert, warning, or error-rate signals increase risk. |
| Linear bugs | 15 | High-priority active Linear issues add risk. |

Risk levels:

| Score | Level |
| ---: | --- |
| 70-100 | Critical |
| 45-69 | High |
| 20-44 | Medium |
| 0-19 | Low |

Policy behavior:

- Pending PR with score `70+`: blocked.
- Open PR below the blocking threshold: pending.
- Merged PR: successful.
- Closed but unmerged PR: closed.

## Prerequisites

Before first run, prepare:

- Windows PowerShell.
- Node.js, or the runtime already available in this workspace.
- Coral CLI installed and available as `coral`.
- GitHub repository access.
- Datadog API key and application key.
- Sentry organization slug and internal integration token.
- Linear API key.

Check Coral:

```powershell
coral --version
```

If Coral is installed in a custom location, set:

```powershell
$env:CORAL_BIN="C:\path\to\coral.exe"
```

## First-Time Setup

### 1. Open The Project

```powershell
cd D:\test\terra
```

### 2. Create `.env`

Create `D:\test\terra\.env`. Do not commit this file.

Minimum values:

```env
REPO_OWNER=your-github-owner
REPO_NAME=your-repository-name
```

Recommended values:

```env
REPO_OWNER=your-github-owner
REPO_NAME=your-repository-name
GITHUB_TOKEN=github_pat_or_fine_grained_token
PORT=4173
```

Optional defaults:

```env
PR_NUMBER=1
SERVICE_NAME=payments
CORAL_BIN=C:\Users\YOUR_USER\.local\bin\coral.exe
```

The server also accepts these GitHub aliases:

```env
GITHUB_OWNER=your-github-owner
GITHUB_REPO=your-repository-name
```

### 3. Connect Coral Sources

Run these from `D:\test\terra`:

```powershell
coral source add --interactive github
coral source add --interactive datadog
coral source add --interactive sentry
coral source add --file .\coral\sources\linear.yaml
```

Test each source:

```powershell
coral source test github
coral source test datadog
coral source test sentry
coral source test linear
```

Check discovered tables:

```powershell
coral sql --format json -- "SELECT * FROM coral.tables LIMIT 20"
```

### 4. Start The Live Server

Use the helper script:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-live.ps1
```

Or start with Node:

```powershell
npm start
```

Open:

```text
http://localhost:4173
```

Do not open `index.html` directly when you need live data. Direct file mode cannot call the local live APIs.

### 5. Configure The Dashboard

In the dashboard:

1. Open `Coral Workspace`.
2. Enter GitHub owner and repository.
3. Click `Save`.
4. Click `Load Live Data`.
5. Select a PR from the PR dropdown.
6. Select a service from the service dropdown.
7. Click `Run Coral JOIN` or `Score Selected PR`.

## Creating Demo Data

### GitHub PRs

Create a branch and open a pull request against `main`.

Add a GitHub label for the service:

```text
service:payments
```

If no service label is present, the UI shows the service as `unknown`.

### Linear Issues

To make Linear count against a PR:

1. Create a Linear issue.
2. Keep the issue active. Do not mark it Done, Closed, Completed, Canceled, or Cancelled.
3. Set priority to Urgent or High.
4. Add a label matching the service, for example:

```text
service:payments
```

For PR-specific matching, also add one of these:

```text
pr:6
#6 in the title or description
the PR branch name in the title or description
```

Then click `Sync sources` or `Load Live Data`.

### Sentry Issues

To increase the Sentry signal:

1. Go to your Sentry project.
2. Trigger different errors.
3. Keep the issues unresolved.
4. Click `Sync sources` or `Load Live Data`.
5. Score the selected PR again.

### Datadog Signals

To make Datadog visible:

1. Install or connect the Datadog Agent.
2. Create monitors or metric signals.
3. Tag monitors with the service when possible:

```text
service:payments
```

4. Click `Sync sources` or `Load Live Data`.

The Service Health and Service Map sections use these live Datadog rows.

## Live API Endpoints

The local server exposes:

| Endpoint | Purpose |
| --- | --- |
| `/api/live/config` | Reads owner, repo, PR, and service defaults from `.env`. |
| `/api/live/status` | Checks Coral version and source list. |
| `/api/live/sources` | Lists configured Coral sources. |
| `/api/live/tables` | Loads `coral.tables`. |
| `/api/live/datadog` | Loads Datadog hosts, monitors, metrics, services, incidents, and reports. |
| `/api/live/sentry` | Loads Sentry issues. |
| `/api/live/linear` | Loads Linear issues. |
| `/api/live/github/pulls` | Loads GitHub PRs from the configured repository. |
| `/api/live/risk` | Runs the joined risk query for the selected PR and service. |

## Dashboard Sections

| Section | What it shows |
| --- | --- |
| Overview | Top-level risk, PR, incident, and deployment health summary. |
| Pull Requests | Live PR queue with score, service, status, and signals. |
| Service Health | Datadog service health and metric views. |
| Incident Signals | Datadog incidents and Sentry issues. |
| Policies & Gates | Merge gate status based on risk thresholds. |
| Trends & Analytics | Risk distribution and service risk trends. |
| Service Map | Live topology of sources, SQL aggregation, services, and gate outcomes. |
| Coral Workspace | Source discovery, PR/service selection, and joined query execution. |
| Integrations | Live status for GitHub, Datadog, Sentry, and Linear. |

## Troubleshooting

### No PRs are shown

- Check `REPO_OWNER` and `REPO_NAME` in `.env`.
- Make sure the repository has pull requests.
- For private repositories, set `GITHUB_TOKEN`.
- Click `Load Live Data` again.

### Datadog is connected but returns no useful data

- Confirm the Datadog application key has read permissions.
- Confirm the Datadog site is correct in the Datadog source setup.
- Add at least one monitor or host signal.
- Tag monitors with `service:<name>` for better service matching.

### Sentry or Linear does not show live

- Run `coral source test sentry`.
- Run `coral source test linear`.
- Confirm the token has read access.
- Confirm there are unresolved Sentry issues or active Linear issues.

### Coral query returns no rows

The app may use GitHub REST PR detail fallback when the Coral GitHub table does not return the selected PR. This keeps the UI usable while still showing live GitHub data.

Check:

```powershell
coral sql --format json -- "SELECT * FROM github.pulls LIMIT 5"
```

## Important Notes

- `.env` contains secrets and should stay uncommitted.
- Live mode requires the local server.
- Refresh the UI after changing `.env` or Coral sources.
- Service names should come from GitHub labels like `service:payments`.
- This project is designed for demo and workflow validation. Treat production merge blocking as a separate hardening step.
