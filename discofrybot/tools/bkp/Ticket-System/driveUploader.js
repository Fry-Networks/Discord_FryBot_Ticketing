// driveUploader.js
const fs = require('fs');
const { google } = require('googleapis');
require('dotenv').config();
const logger = require('../logger');
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const drive = google.drive({ version: 'v3', auth: oauth2Client });

async function uploadTranscriptToDrive(filePath) {
    const fileName = filePath.split('/').pop();

    const fileMetadata = {
        name: fileName,
        parents: [process.env.GOOGLE_BOTLOGS_FOLDER_ID]
    };

    const media = {
        mimeType: 'text/html',
        body: fs.createReadStream(filePath)
    };

    try {
        const response = await drive.files.create({
            resource: fileMetadata,
            media,
            fields: 'id, webViewLink',
            supportsAllDrives: true
        });

        return response.data.webViewLink;
    } catch (err) {
        logger.error('❌ Failed to upload transcript to Google Drive:', err);
        return null;
    }
}

module.exports = { uploadTranscriptToDrive };
