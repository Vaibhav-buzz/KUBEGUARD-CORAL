-- Quick health check for the target service before running the full score.

SELECT
  s.id,
  s.title AS sentry_issue,
  s.count AS event_count,
  s.first_seen,
  s.last_seen
FROM sentry.issues s
WHERE
  s.project = '{{service}}'
  AND s.status = 'unresolved'
ORDER BY s.count DESC
LIMIT 20;
