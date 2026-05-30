-- Pull request metadata used by the risk gate.

SELECT
  p.number,
  p.title,
  p.user__login AS author,
  p.base__ref AS target_branch,
  p.head__ref AS source_branch,
  p.additions,
  p.deletions,
  p.changed_files,
  p.state,
  p.html_url
FROM github.pulls p
WHERE
  p.owner = '{{owner}}'
  AND p.repo = '{{repo}}'
  AND p.number = {{pr_number}}
LIMIT 1;
