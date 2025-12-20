// ticketing-system/supabaseClient.js
const { createClient } = require('@supabase/supabase-js');
const config = require('./utils/config');

if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    console.error('❌ Supabase URL or Service Role Key is missing in config. Halting Supabase client initialization.');
    // Optionally, throw an error or exit if Supabase is critical for startup
    // throw new Error('Supabase URL or Service Role Key is missing.');
    // process.exit(1); 
    // For now, we'll allow the app to continue starting but log the error.
    // The main logger might not be initialized yet, so using console.error.
}

const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    db: { schema: 'api' }, // Specify the 'api' schema
    auth: {
        persistSession: false, // Typically false for server-side/bot usage
        autoRefreshToken: false, // Typically false for server-side/bot usage
        detectSessionInUrl: false // Typically false for server-side/bot usage
    }
});

module.exports = supabase;
