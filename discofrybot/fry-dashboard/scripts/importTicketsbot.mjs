import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import path from 'path'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: resolve(__dirname, '../.env') })


const TICKETS_FOLDER = './ticketsbot_json'
const METADATA_FILE = path.join(__dirname, 'tickets_metadata.json')
const BATCH_SIZE = 500

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const staffMap = process.env.STAFF_MAP
  ? Object.fromEntries(
      process.env.STAFF_MAP.split(',').map((pair) => {
        const [id, username] = pair.split(':')
        return [id.trim(), username.trim()]
      })
    )
  : {}

// Load metadata into a Map for fast lookup
const metadataMap = new Map()
if (fs.existsSync(METADATA_FILE)) {
  const metadataRaw = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'))
  const metadataJson = Object.entries(metadataRaw.close_reasons || {}).map(
    ([id, { data }]) => ({
      ticket_id: Number(id),
      data: {
        closed_by: data?.closed_by || null,
        reason: data?.reason || null
      }
    })
  )

  for (const entry of metadataJson) {
    metadataMap.set(entry.ticket_id, {
      closed_by: entry.data?.closed_by || null,
      reason: entry.data?.reason || null
    })
  }
}

function parseTicket(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(content)
    const messages = data.messages || []
    const users = data.entities?.users || {}
    if (!messages.length) {
      console.warn(`⚠️ No messages: ${filePath}`)
      return null
    }

    const KNOWN_BOT_IDS = [
      '508391840525975553', // Tickets
      '563434444321587202', // Maki
      '1294830504507342848' // Fry Networks
    ]

    const first = messages[0]
    const last = messages[messages.length - 1]
    const ticketId = Number(path.basename(filePath).replace(/\D/g, '')) || Date.now()

    // === Embed Field Extraction (newer format) ===
    const embeds = first.embeds?.flatMap((e) => e.fields || []) || []
    const getField = (key) =>
      embeds.find((f) => f.name?.toLowerCase() === key.toLowerCase())?.value || null

    const discord_username = getField('Discord username')
    const description = getField('Description of the issue')

    // === Ticket Type Classification ===
    const ticket_type_raw = first.embeds?.[0]?.title?.toLowerCase() || ''
    let ticket_type = null
    if (ticket_type_raw.includes('order')) ticket_type = 'order_tracking'
    else if (ticket_type_raw.includes('registration')) ticket_type = 'registration'
    else if (ticket_type_raw.includes('reward')) ticket_type = 'rewards'
    else if (ticket_type_raw.includes('cancellation')) ticket_type = 'cancellation'
    else if (ticket_type_raw.includes('miner') || ticket_type_raw.includes('key')) ticket_type = 'miner_keys'
    else if (ticket_type_raw.includes('support') || ticket_type_raw.includes('technical')) ticket_type = 'tech_support'

    // === Build local user cache per ticket ===
    const userIdToUsername = {}
    const userIdToRole = {}

    for (const [id, u] of Object.entries(users)) {
      const isStaff = id in staffMap
      const isBot = u?.bot || KNOWN_BOT_IDS.includes(id)
      userIdToUsername[id] = staffMap[id] || u?.username || 'Unknown'
      userIdToRole[id] = isStaff ? 'staff' : isBot ? 'bot' : 'user'
    }
    
    // === Claimed Ticket ===
    const claimMsg = messages.find((m) =>
      m.embeds?.some((e) => e.title === 'Claimed Ticket' && /<@(\d+)>/.test(e.description || ''))
    )
    const claimed_by_id = claimMsg?.embeds?.[0]?.description?.match(/<@(\d+)>/)?.[1] || null
    const claimed_by_username =
  claimed_by_id && staffMap[claimed_by_id]
    ? staffMap[claimed_by_id]
    : userIdToUsername[String(claimed_by_id)] || users[String(claimed_by_id)]?.username || 'Unknown'
  
  
    // === Load metadata
    const ticket = {
      id: ticketId,
      created_at: first.timestamp || null,
      closed_at: last.timestamp || null,
      claimed_by: claimed_by_id,
      claimed_by_username,
      description,
      status: 'closed',
      ticket_type,
      discord_username,
      closed_by: null,
      close_reason: null
    }
    const meta = metadataMap.get(ticketId)
    if (meta) {
      ticket.closed_by = meta.closed_by
      ticket.close_reason = meta.reason
    }



    // ✅ Fallback fill from message history
    for (const m of messages) {
      const authorId = typeof m.author === 'string'? m.author: String(m.author)
      if (!userIdToUsername[authorId]) {
        if (staffMap[authorId]) {
          userIdToUsername[authorId] = staffMap[authorId]
          userIdToRole[authorId] = 'staff'
        } else if (m?.embeds?.[0]?.author?.name) {
          userIdToUsername[authorId] = m.embeds[0].author.name
          userIdToRole[authorId] = 'user'
        }
      }
    }

    // === Parse messages ===
      const messageRows = messages.map((m) => {
      const authorId = typeof m.author === 'string'? m.author: String(m.author)  
      const user = users?.[authorId] || {}
      const isKnownBot = KNOWN_BOT_IDS.includes(authorId)

      // Determine username (staffMap first, fallback chain)
      const username =
        staffMap[authorId] ||
        user?.username ||
        m?.embeds?.[0]?.author?.name ||
        userIdToUsername[authorId] ||
        'Unknown'

      // Determine role
      const role = staffMap[authorId]
        ? 'staff'
        : isKnownBot || user?.bot
        ? 'bot'
        : userIdToRole[authorId] || 'user'

          
      const avatar_url =
        user?.avatar
          ? `https://cdn.discordapp.com/avatars/${authorId}/${user.avatar}.webp?size=64`
          : null

      const content =
        m.content ||
        (m.embeds?.length ? '[embed]' : m.attachments?.length ? '[attachment]' : '[empty]')
        
      return {
        ticket_id: ticketId,
        user_id: authorId,
        username,
        avatar_url,
        role,
        message: content,
        created_at: m.timestamp || null
      }
    })
    return { ticket, messages: messageRows }
    } catch (err) {
      console.log(`⚠️ Skipped file: ${filePath}`, err.message)
      return null
    }
  }

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size))
  }
  return out
}

async function run() {
  const files = fs.readdirSync(TICKETS_FOLDER).filter(f => f.endsWith('.json'))
  const parsed = files
    .map(f => parseTicket(path.join(TICKETS_FOLDER, f)))
    .filter(Boolean)
    const ticketRows = parsed.map(p => p.ticket)
    const messageRows = parsed.flatMap(p => p.messages)
    
  console.log(`✅ Parsed ${parsed.length} tickets.`)

  const ticketBatches = chunk(ticketRows, BATCH_SIZE)
  for (let i = 0; i < ticketBatches.length; i++) {
    const { error } = await supabase
      .schema('api')
      .from('tickets_ticketsbot')
      .upsert(ticketBatches[i], { onConflict: ['id'] })
  
    if (error) {
      console.error(`❌ Ticket batch ${i + 1} error: ${error.message}`)
    } else {
      const percent = ((i + 1) / ticketBatches.length * 100).toFixed(2)
      console.log(`✅ Ticket batch ${i + 1}/${ticketBatches.length} — ${percent}%`)
    }
  }

  const messageBatches = chunk(messageRows, BATCH_SIZE)
  for (let i = 0; i < messageBatches.length; i++) {
    const { error } = await supabase
      .schema('api')
      .from('ticketsbot_messages')
      .upsert(messageBatches[i], {
        onConflict: ['ticket_id', 'created_at'] 
      })
    
    if (error) {
      console.error(`❌ Message batch ${i + 1} error: ${error.message}`)
    } else {
      const percent = ((i + 1) / messageBatches.length * 100).toFixed(2)
      console.log(`✅ Message batch ${i + 1}/${messageBatches.length} — ${percent}%`)
    }
  }

  console.log('🎉 All tickets imported into Supabase.')
}

run().catch(err => {
  console.error('❌ Fatal error:', err.message)
})
