const winston = require('winston');
const Transport = require('winston-transport');
const { supabase } = require('./ticketing-system/supabase');

// Reason: redact sensitive keys in log metadata to avoid leaking resolved secrets.
const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /password/i,
  /api[_-]?key/i,
  /authorization/i,
  /cookie/i,
  /set-cookie/i,
  /refresh[_-]?token/i,
  /client[_-]?secret/i,
  /service[_-]?role/i,
  /supabase/i,
  /mongo/i
];
const REDACTED_VALUE = '[REDACTED]';
const MAX_REDACT_DEPTH = 4;

// Reason: sanitize structured payloads and guard against circular references.
function redactSensitiveFields(value, depth = 0, seen = new WeakSet()) {
  if (depth > MAX_REDACT_DEPTH) return '[TRUNCATED]';
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }

  if (Array.isArray(value)) {
    return value.map(item => redactSensitiveFields(item, depth + 1, seen));
  }

  const sanitized = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(key))) {
      sanitized[key] = REDACTED_VALUE;
      continue;
    }
    sanitized[key] = redactSensitiveFields(fieldValue, depth + 1, seen);
  }
  return sanitized;
}

// Reason: sanitize in-place to preserve winston symbol metadata used by transports.
const redactFormat = winston.format(info => {
  const redacted = redactSensitiveFields(info);
  Object.assign(info, redacted);
  return info;
});

class SupabaseTransport extends Transport {
  async log(info, callback) {
    setImmediate(() => this.emit('logged', info));

    try {
      await supabase
        .from('bot_logs')
        .insert({
          timestamp: new Date().toISOString(),
          level: info.level,
          scope: info.label || null,
          message: info.message
        });
    } catch (err) {
      console.error('❌ Failed to log to Supabase:', err);
    }

    callback();
  }
}

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.label({ label: 'DiscoFryBot' }),
    winston.format.timestamp(),
    // Reason: redact sensitive keys after label/timestamp to keep metadata safe.
    redactFormat(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new SupabaseTransport()
  ]
});

module.exports = logger;
