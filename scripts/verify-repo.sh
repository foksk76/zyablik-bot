#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "ERROR: $1" >&2
  exit 1
}

warn() {
  echo "WARN: $1" >&2
}

echo "== Zabbix MAX Alert Bot repository check =="

required_files=(
  "README.md"
  "AGENTS.md"
  ".agents/project-context.md"
  "DEVELOPMENT.md"
  "docs/zabbix-media-type.md"
  "src/zabbix-media-type/max-webhook.js"
)

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    fail "required file is missing: $file"
  fi
done

echo "Required files: OK"

if grep -RInE "Отдел|SOC|NOC" README.md docs .agents 2>/dev/null; then
  fail "found organization-specific wording in docs or agent context"
fi

echo "Audience wording: OK"

if grep -RInE "(password|passwd|secret|private_key|BEGIN RSA|BEGIN OPENSSH)" . \
  --exclude-dir=.git \
  --exclude-dir=node_modules \
  --exclude=scripts/verify-repo.sh 2>/dev/null; then
  warn "potential sensitive wording found; review manually"
fi

echo "Sensitive data scan: completed"

echo "Repository check completed"
