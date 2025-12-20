'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../utils/supabaseClient'
import { useRouter } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'

export default function AuthButtons() {
  const [session, setSession] = useState<Session | null>(null)
  const router = useRouter()

  useEffect(() => {
    // Use onAuthStateChange for initial session and updates - this is the recommended approach
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      setSession(newSession)
      
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        router.refresh()
      }

      if (newSession?.provider_token && newSession?.provider_refresh_token) {
        await log('info', `Auth state changed for user ${newSession.user.id.slice(-6)}`)
        await storeDiscordTokens(newSession)
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  const handleLogin = async () => {
    await log('info', 'Login button clicked')
    await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        scopes: 'identify guilds.members.read'
      }
    })
  }

  const handleLogout = async () => {
    await log('info', 'Logout button clicked')
    await supabase.auth.signOut()
    router.refresh()
  }

  return (
    <div className="flex gap-4">
      {session ? (
        <button onClick={handleLogout} className="bg-red-600 text-white px-4 py-2 rounded">
          Logout
        </button>
      ) : (
        <button onClick={handleLogin} className="bg-green-600 text-white px-4 py-2 rounded">
          Login with Discord
        </button>
      )}
    </div>
  )
}

// moved outside component
const storeDiscordTokens = async (session: Session) => {
  const { provider_token, provider_refresh_token, expires_in } = session

  const res = await fetch('/api/store-discord-tokens', {
    method: 'POST',
    body: JSON.stringify({
      access_token: provider_token,
      refresh_token: provider_refresh_token,
      expires_in
    }),
    headers: {
      'Content-Type': 'application/json'
    }
  })

  if (!res.ok) {
    await log('error', `Failed to store Discord tokens for user ${session.user.id.slice(-6)}`)
  } else {
    await log('info', `Stored Discord tokens for user ${session.user.id.slice(-6)}`)
  }
}

const log = async (level: 'info' | 'warn' | 'error', message: string) => {
  await fetch('/api/log-client-event', {
    method: 'POST',
    body: JSON.stringify({ level, message, scope: 'auth_buttons' }),
    headers: {
      'Content-Type': 'application/json'
    }
  })
}
