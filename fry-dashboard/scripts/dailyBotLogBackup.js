require('fs').appendFileSync('/tmp/cron_test.log', `[CRON START] ${new Date().toISOString()}\n`);

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const logger = require('./nodeLogger');
const { exportBotLogs, clearBotLogs } = require('./exportBotLogs');
const uploadCsvToDrive = require('./driveCsvUploader');

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);


async function runDailyBackup() {
  await logger.info('📦 Starting daily bot log backup task...', 'daily_backup');

  const { filePath, count } = await exportBotLogs();
  if (!filePath) {
    await logger.info('🟡 No logs to process or export failed.', 'daily_backup');
    return;
  }
  await logger.info(`✅ Exported ${count} bot logs.`, 'daily_backup');

  const uploadLink = await uploadCsvToDrive(filePath);
  if (!uploadLink) {
    await logger.error('❌ Upload to Google Drive failed. Aborting cleanup.', 'daily_backup');
    return;
  }

  const cleared = await clearBotLogs();
  if (!cleared) {
    await logger.error('❌ Failed to clear bot_logs. Skipping file deletion.', 'daily_backup');
    return;
  }

  try {
    fs.unlinkSync(filePath);
    await logger.info(`🧹 Temp file deleted: ${filePath}`, 'daily_backup');
  } catch (err) {
    await logger.error(`❌ Failed to delete temp CSV file: ${err.message}`, 'daily_backup');
  }

  await logger.info('✅ Daily bot log backup task completed.', 'daily_backup');

}

runDailyBackup();
