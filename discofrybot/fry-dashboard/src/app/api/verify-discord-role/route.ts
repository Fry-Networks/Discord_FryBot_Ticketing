import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { type Database } from '@/types/supabase'
import { logger } from '@/utils/logger'

const GUILD_ID = process.env.GUILD_ID!
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID!
const INTERN_ROLE_ID = process.env.INTERN_ROLE_ID!
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID!
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET!

export async function GET() {
  const supabase = await createClient<Database>()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    await logger.warn('Unauthorized role check (no user)', 'verify_discord_role')
    return NextResponse.json({ authorized: false }, { status: 401 })
  }

  // Get token row
  const { data: tokenRow, error } = await supabase
    .schema('api')
    .from('user_tokens')
    .select('access_token, expires_at, refresh_token')
    .eq('user_id', user.id)
    .single()
    
    const maskedUserId = `***${user.id.slice(-6)}`

  if (error || !tokenRow?.access_token) {
    await logger.warn(`Missing token for role check (user ${maskedUserId})`, 'verify_discord_role')
    return NextResponse.json({ authorized: false }, { status: 403 })
  }

  let accessToken = tokenRow.access_token
  const now = new Date()
  const expiresAt = new Date(tokenRow.expires_at)

  // Refresh token if expired
  if (now >= expiresAt) {
    await logger.info(`Access token expired for ${maskedUserId}, attempting refresh`, 'verify_discord_role')

    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: tokenRow.refresh_token
    })

    const refreshRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    })

    if (!refreshRes.ok) {
      const errorText = await refreshRes.text()
      await logger.error(`Token refresh failed for ${maskedUserId}: ${errorText}`, 'verify_discord_role')
      await logger.warn(
        `Refresh request debug (no secrets): user_id=${maskedUserId}, grant_type=refresh_token, refresh_token=***${tokenRow.refresh_token.slice(-6)}`,
        'verify_discord_role'
      )
      return NextResponse.json({ authorized: false }, { status: 403 })
    }

    const refreshData = await refreshRes.json()
    accessToken = refreshData.access_token
    const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000).toISOString()

    const { error: updateError } = await supabase
      .schema('api')
      .from('user_tokens')
      .update({
        access_token: accessToken,
        refresh_token: refreshData.refresh_token,
        expires_at: newExpiresAt
      })
      .eq('user_id', user.id)

    if (updateError) {
      await logger.error(`Failed to store refreshed tokens for ${maskedUserId}`, 'verify_discord_role')
    } else {
      await logger.info(`Stored refreshed tokens for ${maskedUserId}`, 'verify_discord_role')
    }
  }

  // Verify Discord guild member roles
  const discordRes = await fetch(`https://discord.com/api/users/@me/guilds/${GUILD_ID}/member`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })

  if (!discordRes.ok) {
    const errorText = await discordRes.text()
    await logger.error(`Discord role check failed (user ${maskedUserId}): ${errorText}`, 'verify_discord_role')
    return NextResponse.json({ authorized: false }, { status: 403 })
  }

  const member = await discordRes.json()
  const roles: string[] = member.roles ?? []
  const authorized = roles.includes(STAFF_ROLE_ID) || roles.includes(INTERN_ROLE_ID)

  if (authorized) {
    await logger.info(`User ${maskedUserId} passed role check`, 'verify_discord_role')
  } else {
    await logger.warn(`User ${maskedUserId} failed role check`, 'verify_discord_role')
  }

  return NextResponse.json({ authorized })
}
