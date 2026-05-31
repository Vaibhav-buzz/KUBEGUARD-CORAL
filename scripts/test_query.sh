#!/usr/bin/env bash
set -euo pipefail

: "${REPO_OWNER:?REPO_OWNER is required}"
: "${REPO_NAME:?REPO_NAME is required}"
: "${PR_NUMBER:?PR_NUMBER is required}"
: "${SERVICE_NAME:?SERVICE_NAME is required}"

SQL=$(sed \
  -e "s/{{owner}}/${REPO_OWNER}/g" \
  -e "s/{{repo}}/${REPO_NAME}/g" \
  -e "s/{{pr_number}}/${PR_NUMBER}/g" \
  -e "s/{{service}}/${SERVICE_NAME}/g" \
  coral/queries/risk_score.sql)

SQL=$(printf '%s\n' "$SQL" | awk 'BEGIN { seen = 0 } !seen && ($0 ~ /^[[:space:]]*$/ || $0 ~ /^[[:space:]]*--/) { next } { seen = 1; print }')

coral sql --format json -- "$SQL"
