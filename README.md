# KubeGuard Deployment Intelligence

KubeGuard is a high-level UI workflow for controlling and visualizing deployment risk scoring before a pull request merges to `main`.

The app presents the complete flow from the provided implementation plan:

- Connect Coral sources for GitHub, Sentry, Datadog, and Linear.
- Discover Coral tables and run the unified risk SQL join.
- Score deployment risk from PR size, Sentry issues, Datadog error rate, and Linear bugs.
- Preview the PR comment and recommended action.
- Enforce the risk gate visually with branch-protection and workflow controls.

## Run Locally

This project can run in two modes.

### File Mode

Opening `index.html` directly shows the shell only. Live data requires the local server because the browser cannot call Coral from `file://`.

### Live Coral Mode

Use this mode after running `coral source add --interactive ...` for Datadog, GitHub, Sentry, and Linear.

Edit `.env` and set your GitHub repo:

```env
REPO_OWNER=your-github-user-or-org
REPO_NAME=your-demo-repo
```

For GitHub PRs to appear, the repo must have at least one commit and at least one pull request. If the repo is private, also add a token:

```env
GITHUB_TOKEN=github_pat_your_token
```

Then start the live server:

```powershell
cd D:\test\terra
powershell -ExecutionPolicy Bypass -File .\start-live.ps1
```

Open:

```text
http://localhost:4173
```

Do not open `D:\test\terra\index.html` directly when you want live data. Direct file mode cannot call Coral, so it intentionally shows static demo data.

Inside the UI, open **Coral Workspace** and use:

- **Save** to store GitHub owner and repository in the browser.
- **Load Live Data** to refresh Coral tables, Datadog rows, and GitHub PRs.
- **Discover Tables** to run the live `coral.tables` inventory.
- **Load GitHub PRs** to populate the PR-number dropdown from real pull requests in your repo.
- **Service** is populated from `service:*` GitHub labels plus live service hints from Datadog, Sentry, and Linear.
- **Run Coral JOIN** to execute `coral/queries/risk_score.sql` for the selected PR.

The live server exposes:

- `/api/live/status` for Coral CLI status.
- `/api/live/tables` for `coral.tables`.
- `/api/live/datadog` for Datadog hosts, monitors, metrics, and services.
- `/api/live/github/pulls` for live pull requests from `REPO_OWNER` and `REPO_NAME`.
- `/api/live/risk` for the project risk SQL query.

If the live server is not running, the UI shows empty live states and asks you to connect the local server.

## Project Structure

```text
.
|-- index.html
|-- package.json
|-- src/
|   |-- app.js
|   `-- styles.css
|-- coral/
|   |-- queries/
|   |   |-- pr_details.sql
|   |   |-- risk_score.sql
|   |   `-- service_health.sql
|   `-- sources/
|       `-- linear.yaml
|-- agent/
|   |-- comment_formatter.py
|   |-- run_agent.py
|   |-- scorer.py
|   `-- system_prompt.md
|-- .github/
|   `-- workflows/
|       `-- risk_gate.yml
|-- github_action/
|   `-- risk_gate.yml
|-- scripts/
|   |-- setup.sh
|   `-- test_query.sh
|-- docs/
|   `-- ui-workflow.md
`-- .env
```

## Notes

The UI renders live data from the local server. If a source has no rows, the relevant section shows an empty state instead of seeded demo data.
