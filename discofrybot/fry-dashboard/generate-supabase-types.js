const { exec } = require('child_process');
const dotenv = require('dotenv');
const path = require('path');


dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectId = 'ethzfzfovudndfpsqadb';
const outputPath = 'src/types/supabase.ts';
const logger = require('./logger');

if (!token) {
  logger.error('❌ SUPABASE_ACCESS_TOKEN is missing from .env.local');
  process.exit(1);
}

const cmd = `SUPABASE_ACCESS_TOKEN=${token} npx supabase@latest gen types typescript --project-id ${projectId} --schema public,api > ${outputPath}`;

exec(cmd, (error, stdout, stderr) => {
  if (error) {
    logger.error(`❌ Error generating types: ${error.message}`);
    return;
  }
  if (stderr) {
    logger.error(`⚠️ stderr: ${stderr}`);
    return;
  }
  logger.info(`✅ Supabase types generated in ${outputPath}`);
});
