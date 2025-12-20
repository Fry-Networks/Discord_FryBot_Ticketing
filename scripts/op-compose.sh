#!/usr/bin/env bash
set -euo pipefail

# Wrapper to run docker compose with 1Password env injection and the shared low-sensitivity env file.
# Usage: ./scripts/op-compose.sh build discofrybot

ENV_FILE="${ENV_FILE:-/etc/discofrybot/.1p.env}"
VAULT_TOKEN="${OP_SERVICE_ACCOUNT_TOKEN:-}"

if [[ -z "$VAULT_TOKEN" ]]; then
  # Reason: ensure the op CLI has a token; falls back to reading from the standard vault item.
  VAULT_TOKEN="$(op read 'op://Discord Bot/OP_SERVICE_ACCOUNT_TOKEN/credential')"
  export OP_SERVICE_ACCOUNT_TOKEN="$VAULT_TOKEN"
fi

if [[ ! -r "$ENV_FILE" ]]; then
  echo "Error: env file '$ENV_FILE' is not readable. Set ENV_FILE or fix permissions." >&2
  exit 1
fi

exec op run --env-file "$ENV_FILE" -- docker compose "$@"
