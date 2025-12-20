const { google } = require('googleapis');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
)

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
})

oauth2Client.getAccessToken().then(({ token }) => {
  if (!token) throw new Error('Failed to get access token')
  console.log('✅ Token works. OAuth client is valid.')
}).catch(console.error)
