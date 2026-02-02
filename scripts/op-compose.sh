#!/usr/bin/env bash
set -euo pipefail

# Wrapper to run docker compose with 1Password env injection and the shared low-sensitivity env file.
# Usage: ./scripts/op-compose.sh build discofrybot
# Optional: set OP_ENV_FILE to load OP_SERVICE_ACCOUNT_TOKEN from a local env file.
# Default: /root/.op-discobot.env (root-owned, chmod 600).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-/etc/discofrybot/.1p.env}"
OP_ENV_FILE="${OP_ENV_FILE:-/root/.op-discobot.env}"
VAULT_TOKEN="${OP_SERVICE_ACCOUNT_TOKEN:-}"

if [[ -z "$VAULT_TOKEN" && -r "$OP_ENV_FILE" ]]; then
  # Reason: load the service account token from a local env file to avoid interactive sign-in.
  set -a
  # shellcheck source=/dev/null
  source "$OP_ENV_FILE"
  set +a
  VAULT_TOKEN="${OP_SERVICE_ACCOUNT_TOKEN:-}"
fi

if [[ -z "$VAULT_TOKEN" ]]; then
  # Reason: ensure the op CLI has a token; falls back to reading from the standard vault item.
  VAULT_TOKEN="$(op read 'op://Discord Bot/OP_SERVICE_ACCOUNT_TOKEN/credential')"
fi

if [[ -n "$VAULT_TOKEN" ]]; then
  # Reason: standardize token export for downstream op run usage.
  export OP_SERVICE_ACCOUNT_TOKEN="$VAULT_TOKEN"
fi

if [[ ! -r "$ENV_FILE" ]]; then
  echo "Error: env file '$ENV_FILE' is not readable. Set ENV_FILE or fix permissions." >&2
  exit 1
fi

exec op run --env-file "$ENV_FILE" -- docker compose "$@"
