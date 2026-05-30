import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

from comment_formatter import format_comment
from scorer import score, signals_from_row


OWNER = os.environ.get("REPO_OWNER", "")
REPO = os.environ.get("REPO_NAME", "")
PR_NUMBER = os.environ.get("PR_NUMBER", "")
SERVICE = os.environ.get("SERVICE_NAME", "unknown")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")


def load_query() -> str:
    with open("coral/queries/risk_score.sql", encoding="utf-8") as handle:
        return (
            handle.read()
            .replace("{{owner}}", OWNER)
            .replace("{{repo}}", REPO)
            .replace("{{pr_number}}", PR_NUMBER)
            .replace("{{service}}", SERVICE)
        )


def run_coral_query(sql: str) -> list[dict]:
    result = subprocess.run(
        ["coral", "sql", "--format", "json", sql],
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    if result.returncode != 0:
        print(result.stderr, file=sys.stderr)
        return []
    try:
        parsed = json.loads(result.stdout or "[]")
    except json.JSONDecodeError:
        print("Coral returned non-JSON output.", file=sys.stderr)
        return []
    if isinstance(parsed, dict):
        return parsed.get("rows", [])
    return parsed


def post_comment(body: str) -> None:
    if not all([OWNER, REPO, PR_NUMBER, GITHUB_TOKEN]):
        print(body)
        return

    url = f"https://api.github.com/repos/{OWNER}/{REPO}/issues/{PR_NUMBER}/comments"
    payload = json.dumps({"body": body}).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {GITHUB_TOKEN}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            print(f"Posted PR comment: {response.status}")
    except urllib.error.HTTPError as exc:
        print(exc.read().decode("utf-8", errors="replace"), file=sys.stderr)
        raise


def write_github_env(verdict: str, total: int) -> None:
    env_path = os.environ.get("GITHUB_ENV")
    if not env_path:
        return
    with open(env_path, "a", encoding="utf-8") as handle:
        handle.write(f"RISK_VERDICT={verdict}\n")
        handle.write(f"RISK_SCORE={total}\n")


def main() -> int:
    if not PR_NUMBER:
        print("PR_NUMBER is required.", file=sys.stderr)
        return 2

    rows = run_coral_query(load_query())
    if not rows:
        rows = [
            {
                "lines_changed": 0,
                "files_changed": 0,
                "open_sentry_issues": 0,
                "highest_sentry_event_count": 0,
                "avg_error_rate_pct": 0,
                "open_linear_bugs": 0,
            }
        ]

    signals = signals_from_row(rows[0])
    risk = score(signals)
    comment = format_comment(signals, risk, SERVICE)

    write_github_env(risk.verdict, risk.total)
    post_comment(comment)

    print(f"VERDICT={risk.verdict}")
    print(f"SCORE={risk.total}")

    return 1 if risk.verdict == "CRITICAL" else 0


if __name__ == "__main__":
    raise SystemExit(main())
