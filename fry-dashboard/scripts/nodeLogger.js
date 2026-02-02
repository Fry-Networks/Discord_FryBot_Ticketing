const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const logFilePath = path.join(__dirname, 'cron.log');
const MAX_LENGTH = 800;
const SENSITIVE_MESSAGE_PATTERNS = [
  // Reason: mask common secret patterns in script logs before writing to disk/Supabase.
  /(token|secret|password|api[_-]?key|authorization|refresh[_-]?token|client[_-]?secret)\s*[:=]\s*[^,\s]+/gi
];

function timestamp() {
  return new Date().toISOString();
}

// Reason: redact obvious secret-like substrings in log messages.
function redactSensitiveMessage(message) {
  return SENSITIVE_MESSAGE_PATTERNS.reduce(
    (result, pattern) => result.replace(pattern, '$1=[REDACTED]'),
    message
  );
}

async function logToSupabase(level, scope, message) {
  const trimmed = message.length > MAX_LENGTH
    ? message.slice(0, MAX_LENGTH) + '... [TRIMMED]'
    : message

  try {
    await supabase
      .schema('api')
      .from('bot_logs')
      .insert([{ level, scope, message: trimmed, timestamp: timestamp() }])
  } catch (err) {
    const fallback = `[ERROR] ${timestamp()} ❌ Failed to log to Supabase: ${err.message}\n`;
    fs.appendFileSync(logFilePath, fallback);
  }
}

const logger = {
  info: async (message, scope = 'script') => {
    // Reason: sanitize message before it hits stdout or log files.
    const safeMessage = redactSensitiveMessage(message);
    const full = `[INFO] ${timestamp()} ${safeMessage}\n`;
    process.stdout.write(full);
    fs.appendFileSync(logFilePath, full);
    await logToSupabase('info', scope, safeMessage);
  },

  error: async (message, scope = 'script') => {
    // Reason: sanitize message before it hits stderr or log files.
    const safeMessage = redactSensitiveMessage(message);
    const full = `[ERROR] ${timestamp()} ${safeMessage}\n`;
    process.stderr.write(full);
    fs.appendFileSync(logFilePath, full);
    await logToSupabase('error', scope, safeMessage);
  }
};

module.exports = logger;
