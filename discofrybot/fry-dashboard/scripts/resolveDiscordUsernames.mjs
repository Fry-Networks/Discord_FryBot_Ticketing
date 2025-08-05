import { createClient } from '@supabase/supabase-js'
import fetch from 'node-fetch'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: resolve(__dirname, '../.env') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN
const GUILD_ID = process.env.GUILD_ID
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const BATCH_SIZE = 100
const FETCH_LIMIT = 5000

const delay = (ms) => new Promise((res) => setTimeout(res, ms))

async function fetchDiscordUser(id) {
  const res = await fetch(`https://discord.com/api/v10/users/${id}`, {
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` }
  })
  if (!res.ok) return null
  return await res.json()
}

async function fetchGuildMember(id) {
  const res = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${id}`, {
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` }
  })
  if (!res.ok) return null
  return await res.json()
}

async function resolveUsersAndUpdate() {
  console.log('🔍 Fetching unique user_ids from ticketsbot_messages...')

  let offset = 0
  const allUserIds = new Set()

  while (true) {
    const { data, error } = await supabase
      .schema('api')
      .from('ticketsbot_messages')
      .select('user_id')
      .neq('user_id', null)
      .range(offset, offset + FETCH_LIMIT - 1)

    if (error) {
      console.error('❌ Failed to fetch user_ids:', error.message)
      break
    }

    if (!data || data.length === 0) break

    data.forEach(row => allUserIds.add(row.user_id))
    offset += FETCH_LIMIT
  }

  const { data: claimedUsers, error: claimErr } = await supabase
    .schema('api')
    .from('tickets_ticketsbot')
    .select('claimed_by')
    .neq('claimed_by', null)

  if (claimErr) {
    console.error('❌ Failed to fetch claimed_by:', claimErr.message)
    return
  }

  claimedUsers.forEach(row => allUserIds.add(row.claimed_by))

  console.log(`👥 Found ${allUserIds.size} unique user IDs.`)

  const updatesMessages = []
  const updatesClaims = []
  let count = 0

  for (const userId of allUserIds) {
    await delay(200)

    const user = await fetchDiscordUser(userId)
    const member = await fetchGuildMember(userId)

    if (!user) {
      console.warn(`⚠️ Skipping user ${userId}, no data returned.`)
      continue
    }

    const username = user.global_name || user.username || 'Unknown'
    const roles = member?.roles || []
    const role = roles.includes(STAFF_ROLE_ID)
      ? 'staff'
      : member?.user?.bot
      ? 'bot'
      : 'user'

    updatesMessages.push({ user_id: userId, username, role })
    updatesClaims.push({ claimed_by: userId, claimed_by_username: username })

    count++
    if (count % BATCH_SIZE === 0) {
      console.log(`💾 Writing batch at ${count} users...`)
      await supabase.schema('api').from('ticketsbot_messages').upsert(updatesMessages, { onConflict: ['user_id', 'ticket_id'] })
      await supabase.schema('api').from('tickets_ticketsbot').upsert(updatesClaims, { onConflict: ['id'] })
      updatesMessages.length = 0
      updatesClaims.length = 0
    }
  }

  if (updatesMessages.length) {
    await supabase.schema('api').from('ticketsbot_messages').upsert(updatesMessages, { onConflict: ['user_id', 'ticket_id'] })
    await supabase.schema('api').from('tickets_ticketsbot').upsert(updatesClaims, { onConflict: ['id'] })
  }

  console.log('✅ All usernames and roles resolved and updated in Supabase.')
}

resolveUsersAndUpdate().catch(err => {
  console.error('❌ Script failed:', err.message)
  process.exit(1)
})
