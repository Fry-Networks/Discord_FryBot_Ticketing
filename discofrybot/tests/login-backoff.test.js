'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loginWithBackoff, backoffDelay } = require('../lib/loginWithBackoff');

const silentLogger = { info() {}, error() {} };

test('a failing login never rejects, so it cannot exit the process', async () => {
    const client = { login: async () => { throw new Error('ConnectTimeoutError'); } };
    const result = await loginWithBackoff(client, 'token', {
        logger: silentLogger,
        sleep: async () => {},
        maxAttempts: 3,
    });
    assert.strictEqual(result, false);
});

test('retries until a transient failure clears', async () => {
    let calls = 0;
    const client = {
        login: async () => {
            calls += 1;
            if (calls < 3) throw new Error('ConnectTimeoutError');
            return 'ok';
        },
    };
    const result = await loginWithBackoff(client, 'token', {
        logger: silentLogger,
        sleep: async () => {},
        maxAttempts: 10,
    });
    assert.strictEqual(result, true);
    assert.strictEqual(calls, 3);
});

test('a first-try login does not sleep at all', async () => {
    let slept = 0;
    const client = { login: async () => 'ok' };
    const result = await loginWithBackoff(client, 'token', {
        logger: silentLogger,
        sleep: async () => { slept += 1; },
    });
    assert.strictEqual(result, true);
    assert.strictEqual(slept, 0);
});

test('backoff grows exponentially and is capped', () => {
    assert.strictEqual(backoffDelay(1), 15000);
    assert.strictEqual(backoffDelay(2), 30000);
    assert.strictEqual(backoffDelay(3), 60000);
    assert.strictEqual(backoffDelay(20), 300000);
});
