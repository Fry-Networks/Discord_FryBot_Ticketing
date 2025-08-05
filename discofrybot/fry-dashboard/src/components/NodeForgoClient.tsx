'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/supabaseClient'
import { log } from '@/utils/loggerClient'
import NodeForgoTable from './NodeForgoTable' // Import the new table component

export default function NodeForgoClient() {
  const supabase = createClient()
  const [tickets, setTickets] = useState<any[]>([]) // Use any for now, define a specific type later
  const [refreshTrigger, setRefreshTrigger] = useState(0); // State to trigger data refresh
  const [forgoCount, setForgoCount] = useState<number>(0); // State for forgo count
  const [returnCount, setReturnCount] = useState<number>(0); // State for return count

  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };
  const [loading, setLoading] = useState(true)
  const [accessToken, setAccessToken] = useState<string | null>(null)

  useEffect(() => {
    // ✅ Log dashboard access
    const logAccess = async () => {
      await log('info', 'node_forgo_client', 'Staff accessed Node Forgo Program page')
    }
    logAccess()
  }, [])

  useEffect(() => {
    const loadTickets = async () => {
      setLoading(true)

      const {
        data: { session },
        error: sessionError
      } = await supabase.auth.getSession()

      if (sessionError || !session?.access_token) {
        await log('error', 'node_forgo_client', 'No valid session found in NodeForgoClient')
        setTickets([])
        setLoading(false)
        return
      }

      // Store the access token in state
      setAccessToken(session.access_token);

      // Call the new API route
      const res = await fetch('/api/get-node-forgo-tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ from: 0, to: 9999 }) // Adjust range as needed for pagination later
      })

      if (!res.ok) {
        const errorText = await res.text()
        await log('error', 'node_forgo_client', `❌ Failed to load node forgo tickets: ${res.status} ${errorText}`)
        setTickets([])
        setLoading(false)
        return
      }

      const { tickets, forgoCount, returnCount } = await res.json()
      setTickets(tickets || [])
      setForgoCount(forgoCount || 0); // Set forgo count
      setReturnCount(returnCount || 0); // Set return count
      await log('info', 'node_forgo_client', `✅ Loaded ${tickets.length} node forgo tickets`)
      setLoading(false)
    }

    loadTickets()
  }, [refreshTrigger]) // Add refreshTrigger to dependency array

  return (
    <>
      {loading ? (
        <p className="text-white px-4">Loading Node Forgo tickets...</p>
      ) : (
        <NodeForgoTable tickets={tickets} accessToken={accessToken} forgoCount={forgoCount} returnCount={returnCount} triggerRefresh={triggerRefresh} /> // Pass tickets, accessToken, counts, and triggerRefresh to the new table component
      )}
    </>
  )
}
