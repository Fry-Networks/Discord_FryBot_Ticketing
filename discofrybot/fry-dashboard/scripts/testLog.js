const logger = require('./nodeLogger');
const msg = '🔥'.repeat(1000) + ' Test log message exceeding limit.';
logger.info(msg, 'test_limit');
