// ticketing-system/utils/logger.js
const winston = require('winston');
const Transport = require('winston-transport');
const supabase = require('../supabaseClient'); // Adjusted path to the new Supabase client
const { sanitizeSecretsInText } = require('./logSanitizer');
const DailyFileTransport = require('./dailyFileTransport');

// Reason: redact sensitive keys in structured log payloads before they hit stdout/Supabase.
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
  /mongo/i,
  /email/i,
  /full[_-]?name/i,
  /username/i,
  /algorand/i,
  /solana/i,
  /wallet/i,
  /address/i,
  /minerkeys?/i,
  /aem[_-]?key/i,
  /byod/i
];
const REDACTED_VALUE = '[REDACTED]';
const MAX_REDACT_DEPTH = 4;

// Reason: prevent accidental leakage of resolved secrets in log metadata objects.
function redactSensitiveFields(value, depth = 0, seen = new WeakSet()) {
  if (depth > MAX_REDACT_DEPTH) return '[TRUNCATED]';
  if (value === null || value === undefined) return value;
  // Reason: sanitize plain-text log strings because sensitive data is often interpolated into message text.
  if (typeof value === 'string') return sanitizeSecretsInText(value);
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
  constructor(opts) {
    super(opts);
    // It's good practice to handle cases where supabase might not be initialized
    if (!supabase) {
      console.error("Supabase client not available for SupabaseTransport. Logs to Supabase will fail.");
    }
  }

  async log(info, callback) {
    setImmediate(() => this.emit('logged', info));

    if (!supabase) { // Prevent errors if supabase client failed to init
      console.error('Supabase client not initialized, cannot log to Supabase:', info.message);
      return callback();
    }

    try {
      const { error } = await supabase
        .from('bot_logs') // Ensure this table exists in your Supabase project
        .insert({
          timestamp: new Date().toISOString(),
          level: info.level,
          scope: info.label || 'ticketing-system', // Default scope for new system
          message: info.message,
          // Optionally add more context if available in info object
          // metadata: info.metadata || null 
        });
      if (error) {
        console.error('❌ Failed to log to Supabase (from ticketing-system):', error.message, error.details);
      }
    } catch (err) {
      console.error('❌ Exception during Supabase logging (from ticketing-system):', err);
    }

    callback();
  }
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug', // Allow configuring log level via .env
  format: winston.format.combine(
    winston.format.label({ label: 'DiscoFryBot-ticketing-system' }), // Specific label for new system
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }), // Log stack traces
    winston.format.splat(),
    // Reason: redact sensitive keys after splat/errors so enriched metadata is sanitized.
    redactFormat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'new-ticket-system' },
  transports: [
    // Reason: keep container stdout focused on actionable issues only.
    new winston.transports.Console({
      level: process.env.CONSOLE_LOG_LEVEL || 'warn',
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    // Reason: capture full ticket-system telemetry in persistent daily files.
    new DailyFileTransport({
      level: process.env.FILE_LOG_LEVEL || process.env.LOG_LEVEL || 'debug',
      logDir: process.env.LOG_DIR || '/app/logs',
      filePrefix: 'discofrybot',
      maxFiles: 30
    }),
    new SupabaseTransport({}) // Pass empty opts or specific opts if needed
  ]
});

// Test log to ensure it's working
// logger.info('ticketing-system logger initialized.');
// logger.error('Test error log for ticketing-system.');

module.exports = logger;
