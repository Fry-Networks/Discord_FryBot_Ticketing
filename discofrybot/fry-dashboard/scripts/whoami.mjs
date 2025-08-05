import { google } from 'googleapis'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env') })

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
)

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
})

const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })

oauth2.userinfo.get((err, res) => {
  if (err) {
    console.error('❌ Failed to get user info:', err.message)
  } else {
    console.log(`✅ Authenticated as: ${res.data.email}`)
  }
})
