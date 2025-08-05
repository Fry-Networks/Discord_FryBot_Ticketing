require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { google } = require('googleapis')

const {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REFRESH_TOKEN
  } = process.env
  
  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET
  )
  
  oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN })
  
  const drive = google.drive({ version: 'v3', auth: oauth2Client })
  
const SOURCE_FOLDER_ID = '1idmnE_jnIng8o-ycW7aTfvuOwfcS4VF0'
const DEST_FOLDER_ID = '1YexxiqfX5oTWJpn5Qh1QFMI5yB__eYaN'

async function moveAllSigFiles() {
    let pageToken = null
    let moved = 0
    let total = 0
    const allSigFiles = []
  
    // First pass: collect all .json.sig files to get a total count
    do {
      const res = await drive.files.list({
        q: `'${SOURCE_FOLDER_ID}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, parents)',
        spaces: 'drive',
        pageSize: 1000,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        corpora: 'drive',
        driveId: process.env.GOOGLE_SHARED_DRIVE_ID      
      })
  
      const sigFiles = res.data.files.filter(f => f.name.endsWith('.json.sig'))
      allSigFiles.push(...sigFiles)
      pageToken = res.data.nextPageToken
    } while (pageToken)
  
    total = allSigFiles.length
    console.log(`🔢 Found ${total} .json.sig files to move.\n`)
  
    // Second pass: move them with percentage display
    for (const [i, file] of allSigFiles.entries()) {
      try {
        await drive.files.update({
          fileId: file.id,
          addParents: DEST_FOLDER_ID,
          removeParents: SOURCE_FOLDER_ID,
          supportsAllDrives: true
        })
        moved++
        const percent = ((moved / total) * 100).toFixed(2)
        console.log(`✅ Moved: ${file.name} (${moved}/${total}) — ${percent}%`)
      } catch (err) {
        console.error(`❌ Failed to move ${file.name}: ${err.message}`)
      }
  
      await new Promise((r) => setTimeout(r, 200)) // Delay to avoid quota hits
    }
  
    console.log(`🎉 Done. Moved ${moved}/${total} .json.sig files.`)
  }
moveAllSigFiles().catch(console.error)
