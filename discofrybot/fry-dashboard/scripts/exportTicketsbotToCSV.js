const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const STAFF_MAP = JSON.parse(process.env.STAFF_MAP || '{}')
const INPUT_FOLDER = './ticketsbot_json'
const TICKETS_CSV = 'parsed_tickets.csv'
const MESSAGES_CSV = 'parsed_messages.csv'

// === Helpers ===
const parseEmbedField = (fields, name) =>
  fields.find(f => f.name?.toLowerCase() === name.toLowerCase())?.value || null

const normalizeType = (raw = '') => {
  const type = raw.toLowerCase()
  if (type.includes('order')) return 'order_tracking'
  if (type.includes('registration')) return 'registration'
  if (type.includes('reward')) return 'rewards'
  if (type.includes('cancellation')) return 'cancellation'
  if (type.includes('miner') || type.includes('key')) return 'miner_keys'
  if (type.includes('support') || type.includes('technical')) return 'tech_support'
  return null
}

// === Main Parser ===
const tickets = []
const messages = []

const files = fs.readdirSync(INPUT_FOLDER).filter(f => f.endsWith('.json'))
console.log(`📂 Found ${files.length} JSON files to process...`)

for (const file of files) {
  try {
    const json = JSON.parse(fs.readFileSync(path.join(INPUT_FOLDER, file), 'utf8'))
    const msgList = json.messages || []
    const users = json.entities?.users || {}

    if (!msgList.length) continue

    const ticketId = Number(file.replace(/\D/g, '')) || Date.now()
    const first = msgList[0]
    const last = msgList[msgList.length - 1]

    const embedFields = first.embeds?.[1]?.fields || []
    const discord_username = parseEmbedField(embedFields, 'Discord username')
    const description = parseEmbedField(embedFields, 'Description of the issue')
    const rawType = first.embeds?.[0]?.title || ''
    const ticket_type = normalizeType(rawType)

    // Claimed By
    const claim = msgList.find(m =>
      m.embeds?.some(e => e.title === 'Claimed Ticket' && /<@(\d+)>/.test(e.description || ''))
    )
    const claimed_by = claim?.embeds?.[0]?.description?.match(/<@(\d+)>/)?.[1] || null
    const claimed_by_username = claimed_by ? users[claimed_by]?.username || '' : ''

    // === Ticket row ===
    tickets.push({
      id: ticketId,
      created_at: first.timestamp || '',
      closed_at: last.timestamp || '',
      claimed_by: claimed_by || '',
      claimed_by_username,
      description: description || '',
      status: 'closed',
      ticket_type,
      discord_username: discord_username || '',
      close_reason: '',
      closed_by: ''
    })

    // === Message rows ===
    for (const m of msgList) {
      const author = String(m.author)
      const u = users[author] || {}
      const role = STAFF_MAP[author]
        ? 'staff'
        : u.bot
        ? 'bot'
        : 'user'

      const message =
        m.content ||
        (m.embeds?.length ? '[embed]' : m.attachments?.length ? '[attachment]' : '[empty]')

      messages.push({
        ticket_id: ticketId,
        user_id: author,
        username: u.username || 'Unknown',
        role,
        message,
        created_at: m.timestamp || ''
      })
    }
  } catch (err) {
    console.warn(`⚠️ Failed to parse ${file}:`, err.message)
  }
}

// === Write CSVs ===
const writeCSV = (filename, rows) => {
  const keys = Object.keys(rows[0])
  const csv = [keys.join(',')]
  for (const row of rows) {
    const line = keys.map(k => `"${(row[k] || '').toString().replace(/"/g, '""')}"`).join(',')
    csv.push(line)
  }
  fs.writeFileSync(filename, csv.join('\n'), 'utf8')
  console.log(`✅ Saved ${filename} with ${rows.length} rows`)
}

writeCSV(TICKETS_CSV, tickets)
writeCSV(MESSAGES_CSV, messages)

console.log('🎉 All done. You can now import parsed CSVs into Supabase.')
