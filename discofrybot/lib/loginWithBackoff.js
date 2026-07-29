'use strict';

// Retries a Discord login with capped exponential backoff instead of letting the rejection
// escape. A bare `client.login()` rejection is an unhandled rejection, which Node 22 turns into
// process exit 1; the container's `restart: unless-stopped` policy then re-runs the `op run`
// entrypoint, so every failed login costs a fresh round of 1Password service-account calls.
// 44,941 restarts exhausted that account-wide quota and blocked unrelated services from starting.

const BASE_DELAY_MS = 15000;
const MAX_DELAY_MS = 300000;

function backoffDelay(attempt, baseMs = BASE_DELAY_MS, maxMs = MAX_DELAY_MS) {
    return Math.min(baseMs * Math.pow(2, attempt - 1), maxMs);
}

async function loginWithBackoff(client, token, options = {}) {
    const log = options.logger || console;
    const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const maxAttempts = options.maxAttempts || Infinity;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await client.login(token);
            if (attempt > 1) {
                log.info(`[login] connected to Discord after ${attempt} attempts`);
            }
            return true;
        } catch (err) {
            const delay = backoffDelay(attempt, options.baseMs, options.maxMs);
            const reason = (err && (err.code || err.message)) || 'unknown error';
            log.error(`[login] attempt ${attempt} failed (${reason}); retrying in ${delay}ms`);
            await sleep(delay);
        }
    }

    log.error('[login] retry budget exhausted; staying alive so restarts do not re-resolve secrets');
    return false;
}

module.exports = { loginWithBackoff, backoffDelay };
