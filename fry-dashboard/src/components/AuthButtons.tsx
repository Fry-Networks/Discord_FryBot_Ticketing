'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../utils/supabaseClient'
import { useRouter } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'

const AUTH_LOCK_MS = 12000

export default function AuthButtons() {
  const [session, setSession] = useState<Session | null>(null)
  const [isAuthInFlight, setIsAuthInFlight] = useState(false)
  const router = useRouter()
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
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

    return () => {
      subscription.unsubscribe()
      if (lockTimerRef.current) {
        clearTimeout(lockTimerRef.current)
      }
    }
  }, [router])

  const handleLogin = async () => {
    if (isAuthInFlight) {
      await log('warn', 'Login blocked: auth already in flight')
      return
    }
    setIsAuthInFlight(true)
    await log('info', 'Login button clicked')

    lockTimerRef.current = setTimeout(() => {
      setIsAuthInFlight(false)
      lockTimerRef.current = null
    }, AUTH_LOCK_MS)

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
        <button
          onClick={handleLogin}
          disabled={isAuthInFlight}
          aria-disabled={isAuthInFlight}
          className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isAuthInFlight ? 'Redirecting to Discord...' : 'Login with Discord'}
        </button>
      )}
    </div>
  )
}

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
