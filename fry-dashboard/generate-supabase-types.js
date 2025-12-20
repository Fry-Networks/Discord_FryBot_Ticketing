const { exec } = require('child_process');
const dotenv = require('dotenv');
const path = require('path');


dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectId = process.env.SUPABASE_PROJECT_ID;
const outputPath = 'src/types/supabase.ts';
if (!token) {
  console.error('❌ SUPABASE_ACCESS_TOKEN is missing from .env.local');
  process.exit(1);
}

const cmd = `SUPABASE_ACCESS_TOKEN=${token} npx supabase@latest gen types typescript --project-id ${projectId} --schema public,api > ${outputPath}`;

exec(cmd, (error, stdout, stderr) => {
  if (error) {
    console.error(`❌ Error generating types: ${error.message}`);
    return;
  }
  if (stderr) {
    console.error(`⚠️ stderr: ${stderr}`);
    return;
  }
  console.info(`✅ Supabase types generated in ${outputPath}`);
});
