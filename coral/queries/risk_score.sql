-- Returns one row per pull request with all risk signals joined.
-- Replace owner, repo, pr_number, and service before execution.

SELECT
  p.number AS pr_number,
  p.title AS pr_title,
  p.user__login AS author,
  p.additions + p.deletions AS lines_changed,
  p.changed_files AS files_changed,
  COUNT(DISTINCT s.id) AS open_sentry_issues,
  MAX(s.count) AS highest_sentry_event_count,
  AVG(d.value) AS avg_error_rate_pct,
  COUNT(DISTINCT l.id) AS open_linear_bugs
FROM github.pulls p
LEFT JOIN sentry.issues s
  ON s.project = '{{service}}'
  AND s.is_unhandled = true
  AND s.status = 'unresolved'
LEFT JOIN datadog.metrics d
  ON d.metric = 'trace.web.request.errors'
  AND d.tag_service = '{{service}}'
LEFT JOIN linear.issues l
  ON l.state__name != 'Done'
  AND l.priority <= 2
  AND l.label__names LIKE '%{{service}}%'
WHERE
  p.owner = '{{owner}}'
  AND p.repo = '{{repo}}'
  AND p.number = {{pr_number}}
  AND p.state = 'open'
GROUP BY 1, 2, 3, 4, 5;
