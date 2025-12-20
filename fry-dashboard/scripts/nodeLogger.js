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

function timestamp() {
  return new Date().toISOString();
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
    const full = `[INFO] ${timestamp()} ${message}\n`;
    process.stdout.write(full);
    fs.appendFileSync(logFilePath, full);
    await logToSupabase('info', scope, message);
  },

  error: async (message, scope = 'script') => {
    const full = `[ERROR] ${timestamp()} ${message}\n`;
    process.stderr.write(full);
    fs.appendFileSync(logFilePath, full);
    await logToSupabase('error', scope, message);
  }
};

module.exports = logger;
