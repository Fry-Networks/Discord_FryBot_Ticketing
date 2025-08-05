'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/supabaseClient'
import TicketList, { Ticket, TicketSource } from './TicketList'
import { log } from '@/utils/loggerClient'

export default function TicketListClient() {
  const supabase = createClient()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [source, setSource] = useState<TicketSource>('live')
  const [loading, setLoading] = useState(true)
  const [accessToken, setAccessToken] = useState<string | null>(null) // Added state for access token

  useEffect(() => {
    // ✅ Log dashboard access
    const logAccess = async () => {
      await log('info', 'ticket_client', 'Staff accessed tickets page')
    }
    logAccess()
  }, [])

  useEffect(() => {
    const loadTickets = async () => {
      setLoading(true)

      // First verify user authentication
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (userError || !user) {
        await log('error', 'ticket_client', 'No authenticated user found in TicketListClient')
        setTickets([])
        setLoading(false)
        return
      }

      // Get session for access token only after user verification
      const {
        data: { session },
        error: sessionError
      } = await supabase.auth.getSession()

      if (sessionError || !session?.access_token) {
        await log('error', 'ticket_client', 'No valid session found in TicketListClient')
        setTickets([])
        setLoading(false)
        return
      }
      
      // Store the access token in state
      setAccessToken(session.access_token);
    
      const res = await fetch('/api/get-tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ source, from: 0, to: 9999 })
      })

      if (!res.ok) {
        const errorText = await res.text()
        await log('error', 'ticket_client', `❌ Failed to load ${source} tickets: ${res.status} ${errorText}`)
        setTickets([])
        setLoading(false)
        return
      }

      const { tickets } = await res.json()
      setTickets(tickets || [])
      await log('info', 'ticket_client', `✅ Loaded ${tickets.length} ${source} tickets`)
      setLoading(false)
    }

    loadTickets()
  }, [source])

  return (
    <>
      {loading ? (
        <p className="text-white px-4">Loading {source} tickets...</p>
      ) : (
        <TicketList tickets={tickets} source={source} onSourceChange={setSource} accessToken={accessToken} />
      )}
    </>
  )
}
