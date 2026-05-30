from scorer import RiskScore, RiskSignals


VERDICT_MARKER = {
    "LOW": "[LOW]",
    "MEDIUM": "[MEDIUM]",
    "HIGH": "[HIGH]",
    "CRITICAL": "[CRITICAL]",
}


def format_comment(signals: RiskSignals, score: RiskScore, service: str, pr_url: str = "") -> str:
    marker = VERDICT_MARKER.get(score.verdict, "[RISK]")
    action = _recommended_action(score.verdict, service)

    return f"""## {marker} Deployment Risk Score: **{score.total}/100** - {score.verdict}

> {score.explanation}

### Score breakdown

| Signal | Value | Sub-score |
|--------|-------|-----------|
| PR size | {signals.lines_changed} lines, {signals.files_changed} files | {score.size_score}/25 |
| Sentry open issues in `{service}` | {signals.open_sentry_issues} issues | {score.sentry_score}/35 |
| Datadog error rate for `{service}` | {signals.avg_error_rate_pct:.2f}% | {score.datadog_score}/25 |
| Linear high-priority bugs for `{service}` | {signals.open_linear_bugs} bugs | {score.linear_score}/15 |

### Recommended action

{action}

<details>
<summary>Powered by Coral - view data path</summary>

Data is collected through one Coral SQL join across GitHub, Sentry, Datadog, and Linear.

</details>

---
Risk scorer v1.0{f" - {pr_url}" if pr_url else ""}
"""


def _recommended_action(verdict: str, service: str) -> str:
    if verdict == "CRITICAL":
        return f"Block the merge until `{service}` incidents are stable and error rate is below 1%."
    if verdict == "HIGH":
        return "Hold for a low-traffic window, split the PR, or get explicit service-owner approval."
    if verdict == "MEDIUM":
        return "Proceed only with a rollback owner and post-deploy monitoring."
    return "Merge normally and monitor the deployment for 10 minutes."
