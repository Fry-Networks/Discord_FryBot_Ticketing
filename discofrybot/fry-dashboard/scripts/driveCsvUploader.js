const fs = require('fs');
const { google } = require('googleapis');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const logger = require('./nodeLogger');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const drive = google.drive({ version: 'v3', auth: oauth2Client });

async function uploadCsvToDrive(filePath, folderId = process.env.GOOGLE_BOTLOGS_FOLDER_ID) {
  const fileName = filePath.split('/').pop();

  const fileMetadata = {
    name: fileName,
    parents: [folderId]
  };

  const media = {
    mimeType: 'text/csv',
    body: fs.createReadStream(filePath)
  };

  try {
    const response = await drive.files.create({
      resource: fileMetadata,
      media,
      fields: 'id, webViewLink',
      supportsAllDrives: true
    });

    await logger.info(`✅ CSV uploaded successfully: ${response.data.webViewLink}`, 'upload_drive');
    return response.data.webViewLink;
  } catch (err) {
    await logger.error(`❌ Failed to upload CSV to Google Drive: ${err.message}`, 'upload_drive');
    return null;
  }
}

module.exports = uploadCsvToDrive;