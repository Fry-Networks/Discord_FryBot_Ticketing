import { createClient } from '@/utils/supabase/server'
import { type Database } from '@/types/supabase'
import { logger } from '@/utils/logger'
import Image from 'next/image'
import AuthButtons from './AuthButtons'
import NavBar from './NavBar'

declare const global: typeof globalThis & {
  roleCache?: Record<string, boolean>
}

export default async function Header() {
  const supabase = await createClient<Database>()
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError) {
    await logger.error(`Failed to fetch user: ${userError.message}`, 'header')
  }

  if (!user) {
    await logger.warn('User not found in Header.tsx', 'header')
    return (
      <header className="fixed top-0 left-0 right-0 bg-black p-6 flex justify-between items-center border-b shadow-sm z-50">
        <h1 className="text-xl font-bold text-white">Fry Tickets Dashboard</h1>
        <AuthButtons />
      </header>
    )
  }
  const maskedUserId = `***${user.id.slice(-6)}`

  await logger.info(`Fetched user ${maskedUserId}`, 'header')

  const { data: tokenRow, error: tokenError } = await supabase
    .schema('api')
    .from('user_tokens')
    .select('access_token')
    .eq('user_id', user.id)
    .single()

  if (tokenError) {
    await logger.error(`Token fetch error for user ${maskedUserId}: ${tokenError.message}`, 'header')
  }

  let authorized = false
  let resStatus: number | null = null
  global.roleCache ||= {}
  const cacheKey = `role_verified_${user.id}`
  const cached = global.roleCache[cacheKey]

  if (cached) {
    authorized = true
    await logger.info(`Used cached role verification for ${maskedUserId}`, 'header')
  } else if (tokenRow?.access_token) {
    const GUILD_ID = process.env.GUILD_ID!
    const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID!
    const INTERN_ROLE_ID = process.env.INTERN_ROLE_ID!

    const discordRes = await fetch(`https://discord.com/api/users/@me/guilds/${GUILD_ID}/member`, {
      headers: {
        Authorization: `Bearer ${tokenRow.access_token}`
      }
    })

    resStatus = discordRes.status

    if (discordRes.ok) {
      const member = await discordRes.json()
      authorized = member.roles?.includes(STAFF_ROLE_ID) || member.roles?.includes(INTERN_ROLE_ID)

      if (authorized) {
        global.roleCache[cacheKey] = true
        await logger.info(`Role check passed for ${maskedUserId}`, 'header')
      } else {
        await logger.warn(`User ${maskedUserId} does not have the staff role`, 'header')
      }
    } else {
      const errorText = await discordRes.text()
      await logger.error(`Discord API error (${resStatus}) for user ${maskedUserId}: ${errorText}`, 'header')
    }
  } else {
    await logger.warn(`No token found for user ${maskedUserId}`, 'header')
  }

  if (!authorized) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen p-4">
        <h1 className="text-xl font-semibold mb-4">Access Denied</h1>
        <p className="text-gray-600">You must be a staff member to access the dashboard.</p>
        <AuthButtons />
      </main>
    )
  }

  await logger.info(`Authorized user ${maskedUserId} loaded header`, 'header')

  return (
    <>
      {/* Clean Discord OAuth2 redirect URL */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            if (window?.location?.search.includes('code=')) {
              const url = new URL(window.location.href);
              url.search = '';
              window.history.replaceState({}, '', url.toString());
            }
          `
        }}
      />
      <header className="fixed top-0 left-0 right-[16px] z-50 px-6 py-2 bg-gradient-to-b from-black/70 to-black/10 
      backdrop-blur-md border-b border-white/10 shadow-sm">
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold text-white">Fry Tickets Dashboard</h1>
            <div className="flex items-center gap-3 sm:gap-4">
              <span className="text-white text-base sm:text-lg font-semibold drop-shadow-sm">
                {user.user_metadata?.full_name ?? 'User'}
              </span>
              <Image
                src={user.user_metadata?.avatar_url ?? '/default-avatar.png'}
                alt="Avatar"
                className="rounded-full shadow-md object-cover"
                width={52}
                height={52}
              />
              <AuthButtons />
            </div>
          </div>
          <NavBar />
        </div>
      </header>
    </>
  )
}