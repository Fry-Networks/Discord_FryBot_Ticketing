const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
    db: { schema: 'api' },
    global: { headers: { 'apikey': process.env.SUPABASE_SERVICE_ROLE } }
});

module.exports = { supabase };
