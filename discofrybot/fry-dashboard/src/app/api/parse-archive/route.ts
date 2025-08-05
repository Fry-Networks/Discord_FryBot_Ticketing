import { google } from 'googleapis'
import { NextResponse } from 'next/server'
import { logger } from '@/utils/logger'
import { parse } from 'csv-parse/sync'

export const dynamic = 'force-dynamic' // ensures this API route isn't statically cached

export async function POST(req: Request) {
  const { fileId } = await req.json()

  if (!fileId) {
    await logger.error('Missing fileId in request body', 'parse_archive')
    return NextResponse.json({ error: 'Missing fileId' }, { status: 400 })
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
  })

  const drive = google.drive({ version: 'v3', auth: oauth2Client })

  try {
    const result = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    )

    const chunks: Buffer[] = []
    await new Promise<void>((resolve, reject) => {
      result.data.on('data', (chunk) => chunks.push(chunk))
      result.data.on('end', () => resolve())
      result.data.on('error', (err) => reject(err))
    })

    const csv = Buffer.concat(chunks).toString('utf-8')

    const records = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    })

    interface CsvRecord {
        id: string
        timestamp: string
        level: string
        scope: string
        message: string
      }
      
      const logs = (records as CsvRecord[])
        .map((record) => {
        const timestamp = new Date(record.timestamp)
        if (isNaN(timestamp.getTime())) return null

        return {
          id: record.id,
          timestamp: timestamp.toISOString(),
          level: record.level,
          scope: record.scope,
          message: record.message
        }
      })
      .filter(Boolean)

    await logger.info(`Parsed ${logs.length} log(s) from archive file ${fileId}`, 'parse_archive')

    return NextResponse.json({ logs })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error parsing archive'
    await logger.error(`Failed to parse archive ${fileId}: ${msg}`, 'parse_archive')
    return NextResponse.json({ error: 'Failed to parse archive' }, { status: 500 })
  }
}

// Optional but useful: prevent accidental GETs with a clear error
export async function GET() {
    return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
  }