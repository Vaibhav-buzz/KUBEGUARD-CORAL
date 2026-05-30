#!/usr/bin/env bash
set -euo pipefail

if ! command -v coral >/dev/null 2>&1; then
  echo "Install Coral first:"
  echo "  curl -fsSL https://withcoral.com/install.sh | sh"
  exit 1
fi

coral source add github
coral source add sentry
coral source add datadog
coral source add --file ./coral/sources/linear.yaml

coral sql "SELECT schema_name, table_name FROM coral.tables ORDER BY 1, 2"
