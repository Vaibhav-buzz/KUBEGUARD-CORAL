# UI Workflow

The dashboard is organized around the deployment risk gate lifecycle.

## Overview

The overview shows operational health at a glance: PR volume, average risk, blocked merges, incidents, and deploy success. The main table highlights risky PRs and gives each PR a visual status.

## Coral Workspace

The Coral workspace lets an operator control the data layer:

1. Connect GitHub, Sentry, Datadog, and Linear.
2. Discover tables.
3. Run the risk join query.
4. Inspect source health and SQL output.
5. Continue into scoring.

## Risk Scoring

The scoring workflow shows the four weighted risk signals:

- PR size: 25 points.
- Sentry issues: 35 points.
- Datadog error rate: 25 points.
- Linear high-priority bugs: 15 points.

The selected PR can be scored visually, and the UI updates the recommendation panel.

## Gate Enforcement

The gate panel represents the GitHub Actions workflow and branch protection controls. A critical verdict blocks the merge by failing the workflow.

## Recommendations

The recommendation area turns the score into one concrete action, such as waiting for an incident to resolve, splitting the PR, or merging with monitoring.
