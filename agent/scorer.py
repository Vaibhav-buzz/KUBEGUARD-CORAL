from dataclasses import dataclass


@dataclass
class RiskSignals:
    lines_changed: int
    files_changed: int
    open_sentry_issues: int
    highest_sentry_event_count: int
    avg_error_rate_pct: float
    open_linear_bugs: int


@dataclass
class RiskScore:
    total: int
    size_score: int
    sentry_score: int
    datadog_score: int
    linear_score: int
    verdict: str
    explanation: str


def _as_int(value, default=0):
    if value in (None, ""):
        return default
    return int(float(value))


def _as_float(value, default=0.0):
    if value in (None, ""):
        return default
    return float(value)


def signals_from_row(row: dict) -> RiskSignals:
    return RiskSignals(
        lines_changed=_as_int(row.get("lines_changed")),
        files_changed=_as_int(row.get("files_changed")),
        open_sentry_issues=_as_int(row.get("open_sentry_issues")),
        highest_sentry_event_count=_as_int(row.get("highest_sentry_event_count")),
        avg_error_rate_pct=_as_float(row.get("avg_error_rate_pct")),
        open_linear_bugs=_as_int(row.get("open_linear_bugs")),
    )


def score(signals: RiskSignals) -> RiskScore:
    size = 0
    if signals.lines_changed > 500 or signals.files_changed > 20:
        size = 25
    elif signals.lines_changed > 200 or signals.files_changed > 10:
        size = 15
    elif signals.lines_changed > 50 or signals.files_changed > 5:
        size = 8

    sentry = min(signals.open_sentry_issues * 7, 30)
    if signals.highest_sentry_event_count > 1000:
        sentry = min(sentry + 5, 35)

    rate = signals.avg_error_rate_pct or 0
    if rate >= 5:
        datadog = 25
    elif rate >= 2:
        datadog = 18
    elif rate >= 1:
        datadog = 10
    else:
        datadog = 0

    linear = min(signals.open_linear_bugs * 5, 15)
    total = size + sentry + datadog + linear

    if total >= 70:
        verdict = "CRITICAL"
        explanation = "Merge blocked. Service is already under stress; ship when the baseline is healthy."
    elif total >= 45:
        verdict = "HIGH"
        explanation = "High risk. Hold for a low-traffic window or split the PR."
    elif total >= 20:
        verdict = "MEDIUM"
        explanation = "Moderate risk. Proceed with caution and keep a rollback plan ready."
    else:
        verdict = "LOW"
        explanation = "Low risk. Safe to merge with normal monitoring."

    return RiskScore(
        total=total,
        size_score=size,
        sentry_score=sentry,
        datadog_score=datadog,
        linear_score=linear,
        verdict=verdict,
        explanation=explanation,
    )
