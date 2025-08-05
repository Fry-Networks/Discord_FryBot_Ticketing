const winston = require('winston');
const Transport = require('winston-transport');
const { supabase } = require('./NewTicketLogic/supabase');

class SupabaseTransport extends Transport {
  async log(info, callback) {
    setImmediate(() => this.emit('logged', info));

    try {
      await supabase
        .from('bot_logs')
        .insert({
          timestamp: new Date().toISOString(),
          level: info.level,
          scope: info.label || null,
          message: info.message
        });
    } catch (err) {
      console.error('❌ Failed to log to Supabase:', err);
    }

    callback();
  }
}

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.label({ label: 'DiscoFryBot' }),
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new SupabaseTransport()
  ]
});

module.exports = logger;
