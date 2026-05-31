-- Returns one row per pull request with all risk signals joined.
-- Replace owner, repo, pr_number, and service before execution.

SELECT
  p.number AS pr_number,
  p.title AS pr_title,
  p.user__login AS author,
  COALESCE(p.additions, 0) + COALESCE(p.deletions, 0) AS lines_changed,
  COALESCE(p.changed_files, 0) AS files_changed,
  COUNT(DISTINCT s.id) AS open_sentry_issues,
  COUNT(DISTINCT s.id) AS highest_sentry_event_count,
  AVG(
    CASE
      WHEN d.status = 'Alert' THEN 5
      WHEN d.status = 'Warn' THEN 2
      WHEN d.status = 'No Data' THEN 1
      ELSE 0
    END
  ) AS avg_error_rate_pct,
  COUNT(DISTINCT l.id) AS open_linear_bugs
FROM github.pulls p
LEFT JOIN sentry.issues s
  ON s.status = 'unresolved'
LEFT JOIN datadog.monitors d
  ON (
    LOWER(d.name) LIKE '%{{service}}%'
    OR LOWER(d.tags) LIKE '%{{service}}%'
  )
LEFT JOIN linear.issues l
  ON l.state_name != 'Done'
  AND l.priority <= 2
  AND l.label_names LIKE '%{{service}}%'
WHERE
  p.owner = '{{owner}}'
  AND p.repo = '{{repo}}'
  AND p.number = {{pr_number}}
  AND p.state = 'open'
GROUP BY 1, 2, 3, 4, 5;
