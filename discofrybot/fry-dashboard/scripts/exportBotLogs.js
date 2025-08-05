const { createClient } = require('@supabase/supabase-js');
const { Parser } = require('json2csv');
const fs = require('fs');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const logger = require('./nodeLogger');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function exportBotLogs() {
  const { data: logs, error } = await supabase
    .schema('api')
    .from('bot_logs')
    .select('*')
    .lt('timestamp', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

  if (error) {
    await logger.error(`❌ Error fetching bot logs: ${JSON.stringify(error)}`, 'export_bot_logs');
    return null;
  }

  if (!logs || logs.length === 0) {
    await logger.info('No bot logs to export.', 'export_bot_logs');
    return { filePath: null, count: 0 };
  }

  await logger.info(`📦 Exporting ${logs.length} bot logs...`, 'export_bot_logs');

  const parser = new Parser();
  const csv = parser.parse(logs); 

  const date = new Date().toISOString().slice(0, 10);
  const time = new Date().toISOString().slice(11, 19).replace(/:/g, '-');
  const filePath = `/tmp/bot_logs_${date}_${time}.csv`;

  try {
    fs.writeFileSync(filePath, csv);
    await logger.info(`✅ Bot logs exported to ${filePath}`, 'export_bot_logs');
    return { filePath, count: logs.length };
  } catch (err) {
    await logger.error(`❌ Failed to write CSV file: ${err.message}`, 'export_bot_logs');
    return { filePath: null, count: 0 };
  }
}

async function clearBotLogs() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .schema('api')
    .from('bot_logs')
    .delete()
    .lt('timestamp', thirtyDaysAgo)
    .not('id', 'eq', '00000000-0000-0000-0000-000000000000');

  if (error) {
    await logger.error(`❌ Error fetching bot logs: ${JSON.stringify(error)}`, 'export_bot_logs');
    return { filePath: null, count: 0 };
  }

  await logger.info('✅ Supabase bot_logs table cleared (older than 30 days).', 'clear_bot_logs');
  return true;
}

module.exports = {
  exportBotLogs,
  clearBotLogs,
};
