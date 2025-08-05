// NewTicketLogic/utils/logger.js
const winston = require('winston');
const Transport = require('winston-transport');
const supabase = require('../supabaseClient'); // Adjusted path to the new Supabase client

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
          scope: info.label || 'NewTicketLogic', // Default scope for new system
          message: info.message,
          // Optionally add more context if available in info object
          // metadata: info.metadata || null 
        });
      if (error) {
        console.error('❌ Failed to log to Supabase (from NewTicketLogic):', error.message, error.details);
      }
    } catch (err) {
      console.error('❌ Exception during Supabase logging (from NewTicketLogic):', err);
    }

    callback();
  }
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug', // Allow configuring log level via .env
  format: winston.format.combine(
    winston.format.label({ label: 'DiscoFryBot-NewTicketLogic' }), // Specific label for new system
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }), // Log stack traces
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'new-ticket-system' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new SupabaseTransport({}) // Pass empty opts or specific opts if needed
  ]
});

// Test log to ensure it's working
// logger.info('NewTicketLogic logger initialized.');
// logger.error('Test error log for NewTicketLogic.');

module.exports = logger;
