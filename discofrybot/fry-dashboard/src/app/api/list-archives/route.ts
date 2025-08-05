import { google } from 'googleapis'
import { NextResponse } from 'next/server'
import { logger } from '@/utils/logger'

export const dynamic = 'force-dynamic'

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
    const { data } = await drive.files.list({
      q: `'${process.env.GOOGLE_DRIVE_FOLDER_ID}' in parents and mimeType='text/csv' and trashed = false`,
      fields: 'files(id, name, createdTime)',
      orderBy: 'createdTime desc'
    })

    await logger.info(`Fetched ${data.files?.length || 0} archive file(s) from Drive`, 'list_archives')

    return NextResponse.json({ files: data.files })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await logger.error(`Failed to list archives: ${message}`, 'list_archives')
    return NextResponse.json({ error: 'Failed to list archives' }, { status: 500 })
  }
}
