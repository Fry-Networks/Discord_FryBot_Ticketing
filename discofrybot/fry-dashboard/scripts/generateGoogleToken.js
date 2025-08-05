// generateToken.js
const { google } = require('googleapis');
const readline = require('readline');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// ✅ Full scopes: Drive + email
const SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/userinfo.email'
  ]
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  })

  console.log('\n🔗 Visit this URL in your browser:\n')
  console.log(authUrl)
  

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('\nPaste the authorization code here: ', async (code) => {
    rl.close()
    try {
      const { tokens } = await oauth2Client.getToken(code)
      console.log('\n✅ Your new refresh token:\n')
      console.log(tokens.refresh_token)
  
      // Optional: test email access
      oauth2Client.setCredentials({ refresh_token: tokens.refresh_token })
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
      const { data } = await oauth2.userinfo.get()
      console.log(`\n🔐 Authenticated as: ${data.email}\n`)
    } catch (err) {
      console.error('\n❌ Error retrieving tokens:', err.message)
    }
  })
