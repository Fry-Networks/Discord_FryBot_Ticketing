//NOT USED ANYMORE, KEPT FOR REFERENCE
// This route is used to list the log archives in a Google Drive folder
// It uses the Google Drive API to fetch the list of files in the specified folder
// The folder ID and OAuth2 credentials are stored in environment variables
// The route returns a JSON response with the list of files or an error message
import { google } from 'googleapis'
import { NextResponse } from 'next/server'

export async function GET() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
  })

  const drive = google.drive({ version: 'v3', auth: oauth2Client })

  try {
    const res = await drive.files.list({
      q: `'${process.env.GOOGLE_DRIVE_FOLDER_ID}' in parents and mimeType='text/csv' and trashed=false`,
      fields: 'files(id, name, webViewLink, createdTime)',
      supportsAllDrives: true
    })

    return NextResponse.json({ archives: res.data.files || [] })
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Unknown error listing Drive archives'
    console.error('❌ Failed to list Drive archives:', message)
    return NextResponse.json({ error: 'Drive list failed' }, { status: 500 })
  }
}