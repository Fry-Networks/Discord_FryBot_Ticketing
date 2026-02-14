const fs = require('fs');
const path = require('path');
const Transport = require('winston-transport');

// Reason: write full log volume to date-partitioned files while keeping console noise low.
class DailyFileTransport extends Transport {
  constructor(options = {}) {
    super(options);
    this.logDir = options.logDir || '/app/logs';
    this.filePrefix = options.filePrefix || 'discofrybot';
    this.maxFiles = Number.isInteger(options.maxFiles) ? options.maxFiles : 30;
    this.currentDate = null;
    this.stream = null;
  }

  getDateStamp(now = new Date()) {
    return now.toISOString().slice(0, 10);
  }

  getLogFilePath(dateStamp) {
    return path.join(this.logDir, `${this.filePrefix}-${dateStamp}.log`);
  }

  ensureDirectoryExists() {
    fs.mkdirSync(this.logDir, { recursive: true });
  }

  rotateStreamIfNeeded() {
    const dateStamp = this.getDateStamp();
    if (this.stream && this.currentDate === dateStamp) {
      return;
    }

    this.ensureDirectoryExists();
    if (this.stream) {
      this.stream.end();
    }

    const filePath = this.getLogFilePath(dateStamp);
    this.stream = fs.createWriteStream(filePath, { flags: 'a', mode: 0o640 });
    this.currentDate = dateStamp;
    this.cleanupOldFiles();
  }

  cleanupOldFiles() {
    try {
      const prefix = `${this.filePrefix}-`;
      const suffix = '.log';
      const files = fs
        .readdirSync(this.logDir)
        .filter(fileName => fileName.startsWith(prefix) && fileName.endsWith(suffix))
        .sort();

      if (files.length <= this.maxFiles) {
        return;
      }

      const filesToDelete = files.slice(0, files.length - this.maxFiles);
      for (const fileName of filesToDelete) {
        fs.unlinkSync(path.join(this.logDir, fileName));
      }
    } catch (error) {
      // Reason: transport failures should not crash runtime logging paths.
      console.error('Failed to clean up old daily log files:', error.message);
    }
  }

  log(info, callback) {
    setImmediate(() => this.emit('logged', info));

    try {
      this.rotateStreamIfNeeded();
      const rendered = info[Symbol.for('message')] || JSON.stringify(info);
      this.stream.write(`${rendered}\n`);
    } catch (error) {
      // Reason: avoid throwing inside logger transport pipeline.
      console.error('Failed writing log entry to daily file:', error.message);
    }

    callback();
  }

  close() {
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }
  }
}

module.exports = DailyFileTransport;
