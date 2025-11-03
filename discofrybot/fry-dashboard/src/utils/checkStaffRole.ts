import { type Database } from '@/types/supabase'
import { logger } from './logger'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

const GUILD_ID = process.env.GUILD_ID!
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID!
const INTERN_ROLE_ID = process.env.INTERN_ROLE_ID!


declare const global: typeof globalThis & {
  roleCache?: Record<string, boolean>
  roleCheckRateLimit?: Record<string, number>
}

export async function checkStaffRole() {
  const cookieStore = cookies()

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async get(name) {
          return (await cookieStore).get(name)?.value
        },
        set() {},
        remove() {}
      }
    }
  )
  
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    await logger.warn('User check failed (no user or error)', 'checkStaffRole')
    return false
  }

  global.roleCache ||= {}
  const cacheKey = `role_verified_${user.id}`
  const maskedUserId = `***${user.id.slice(-6)}`

  // Rate limit check
  const now = Date.now()
  global.roleCheckRateLimit ||= {}
  const lastCheck = global.roleCheckRateLimit[cacheKey] || 0
  const rateLimit = 30 * 60 * 1000 // 30 minutes
  if (now - lastCheck < rateLimit) {
    await logger.info(`Rate limit hit for ${maskedUserId}, using cached result`, 'checkStaffRole')
    return global.roleCache[cacheKey] ?? false
  }
  global.roleCheckRateLimit[cacheKey] = now
  await logger.info(`Rate limit passed for ${maskedUserId}`, 'checkStaffRole')
  
  // Check if the role is cached
  if (global.roleCache[cacheKey]) {
    await logger.info(`Used cached role verification for ${maskedUserId}`, 'checkStaffRole')
    return true
  }

  const { data: tokenRow, error: tokenError } = await supabase
    .schema('api')
    .from('user_tokens')
    .select('access_token, expires_at, refresh_token')
    .eq('user_id', user.id)
    .single()

  if (tokenError || !tokenRow?.access_token) {
    await logger.warn(`Missing access token for user ${maskedUserId}`, 'checkStaffRole')
    return false
  }

  // Token expiration check and refresh
  if (tokenRow.expires_at) {
    const now = Date.now()
    const expires = new Date(tokenRow.expires_at).getTime()
    if (expires <= now && tokenRow.refresh_token) {
      await logger.warn(`Token expired for user ${maskedUserId}, attempting refresh`, 'checkStaffRole')

      const params = new URLSearchParams()
      params.append('client_id', process.env.DISCORD_CLIENT_ID!)
      params.append('client_secret', process.env.DISCORD_CLIENT_SECRET!)
      params.append('grant_type', 'refresh_token')
      params.append('refresh_token', tokenRow.refresh_token)

      const refreshRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      })

      if (!refreshRes.ok) {
        const errorText = await refreshRes.text()
        await logger.error(`Token refresh failed for ${maskedUserId}: ${errorText}`, 'checkStaffRole')
        await logger.warn(
          `Refresh request debug (no secrets): user_id=${maskedUserId}, grant_type=refresh_token, refresh_token=***${tokenRow.refresh_token.slice(-6)}`,
          'checkStaffRole'
        )
        return false
      }

      const refreshed = await refreshRes.json()

      // Update token in Supabase
      const { error: updateError } = await supabase
        .schema('api')
        .from('user_tokens')
        .update({
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token ?? tokenRow.refresh_token,
          expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
        })
        .eq('user_id', user.id)

      if (updateError) {
        await logger.error(`Failed to update tokens for user ${maskedUserId}: ${updateError.message}`, 'checkStaffRole')
        return false
      }

      await logger.info(`Refreshed tokens for user ${maskedUserId}`, 'checkStaffRole')

      // Override local token
      tokenRow.access_token = refreshed.access_token
    } else if (expires <= now) {
      await logger.warn(`Token expired for user ${maskedUserId} and no refresh_token available`, 'checkStaffRole')
      return false
    }
  }
  // Check if user has the staff role
  const discordRes = await fetch(`https://discord.com/api/users/@me/guilds/${GUILD_ID}/member`, {
    headers: {
      Authorization: `Bearer ${tokenRow.access_token}`
    }
  })
  
  if (!discordRes.ok) {
    const errorText = await discordRes.text()
    await logger.error(`Discord API failed for user ${maskedUserId}: ${errorText}`, 'checkStaffRole')
    return false
  }
  
  const member = await discordRes.json()
  const roles: string[] = member.roles ?? []
  const username = member.user?.username ?? user.user_metadata.full_name ?? 'Unknown'
  const discriminator = member.user?.discriminator ?? ''
  const discordTag = discriminator ? `${username}#${discriminator}` : username
  
  await logger.info(
    `Login attempt by ${discordTag} (${maskedUserId}) with roles: ${roles.join(', ')}`,
    'checkStaffRole'
  )
  
  const authorized = roles.includes(STAFF_ROLE_ID) || roles.includes(INTERN_ROLE_ID)
  
  if (authorized) {
    global.roleCache[cacheKey] = true
    await logger.info(`User ${maskedUserId} authorized`, 'checkStaffRole')
  } else {
    await logger.warn(`User ${maskedUserId} is not in staff role`, 'checkStaffRole')
  }
  
  return authorized
}

export async function checkStaffRoleServerSide(userId: string): Promise<boolean> {
  // console.log('checkStaffRoleServerSide called for userId:', userId);
  global.roleCache ||= {}
  global.roleCheckRateLimit ||= {}

  const cacheKey = `role_verified_${userId}`
  const maskedUserId = `***${userId.slice(-6)}`

  // ⏱ Rate limit
  const now = Date.now()
  const lastCheck = global.roleCheckRateLimit[cacheKey] || 0
  const rateLimit = 30 * 60 * 1000 // 30 minutes
  if (now - lastCheck < rateLimit) {
    await logger.info(`Rate limit hit for ${maskedUserId}, using cached result`, 'checkStaffRole')
    return global.roleCache[cacheKey] ?? false
  }
  global.roleCheckRateLimit[cacheKey] = now

  // 💾 Fetch stored Discord token
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: tokenRow, error: tokenError } = await supabase
    .schema('api')
    .from('user_tokens')
    .select('access_token, expires_at, refresh_token')
    .eq('user_id', userId)
    .single()

  // console.log('checkStaffRoleServerSide tokenRow:', tokenRow);
  // console.log('checkStaffRoleServerSide tokenError:', tokenError);

  if (tokenError || !tokenRow?.access_token) {
    await logger.warn(`Missing access token for user ${maskedUserId}`, 'checkStaffRole')
    return false
  }

  let accessToken = tokenRow.access_token

  // 🔁 Refresh token if expired
  if (tokenRow.expires_at && new Date(tokenRow.expires_at) <= new Date()) {
    await logger.warn(`Token expired for ${maskedUserId}, refreshing`, 'checkStaffRole')

    const params = new URLSearchParams()
    params.append('client_id', process.env.DISCORD_CLIENT_ID!)
    params.append('client_secret', process.env.DISCORD_CLIENT_SECRET!)
    params.append('grant_type', 'refresh_token')
    params.append('refresh_token', tokenRow.refresh_token)

    const refreshRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    })

    if (!refreshRes.ok) {
      const errorText = await refreshRes.text()
      await logger.error(`Refresh failed for ${maskedUserId}: ${errorText}`, 'checkStaffRole')
      return false
    }

    const refreshed = await refreshRes.json()
    accessToken = refreshed.access_token

    await supabase
      .schema('api')
      .from('user_tokens')
      .update({
        access_token: accessToken,
        refresh_token: refreshed.refresh_token ?? tokenRow.refresh_token,
        expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
      })
      .eq('user_id', userId)

    await logger.info(`Refreshed token for ${maskedUserId}`, 'checkStaffRole')
  }

  // 👮 Check staff role
  const discordRes = await fetch(`https://discord.com/api/users/@me/guilds/${GUILD_ID}/member`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })

  // console.log('checkStaffRoleServerSide Discord API response status:', discordRes.status);

  if (!discordRes.ok) {
    const errorText = await discordRes.text()
    await logger.error(`Discord API failed for ${maskedUserId}: ${errorText}`, 'checkStaffRole')
    return false
  }

  const member = await discordRes.json()
  // console.log('checkStaffRoleServerSide Discord member roles:', member.roles);
   const roles: string[] = member.roles ?? []
  const username = member.user?.username ?? 'Unknown'
  const discriminator = member.user?.discriminator ?? ''
  const discordTag = discriminator ? `${username}#${discriminator}` : username

  await logger.info(
    `Login attempt by ${discordTag} (${maskedUserId}) with roles: ${roles.join(', ')}`,
    'checkStaffRole'
  )

  const authorized = roles.includes(STAFF_ROLE_ID) || roles.includes(INTERN_ROLE_ID)

  if (authorized) {
    global.roleCache[cacheKey] = true
    await logger.info(`User ${maskedUserId} authorized`, 'checkStaffRole')
  } else {
    await logger.warn(`User ${maskedUserId} lacks staff role`, 'checkStaffRole')
  }
  // console.log('checkStaffRoleServerSide final authorized:', authorized);

  return authorized
}
