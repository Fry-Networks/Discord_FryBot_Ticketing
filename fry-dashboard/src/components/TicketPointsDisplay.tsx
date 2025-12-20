'use client'

import React, { useEffect, useState } from 'react'
import { Database } from '@/types/supabase'

type TicketStaffPoints = Database['api']['Tables']['ticket_staff_points']['Row']

interface TicketPointsDisplayProps {
  ticketId: number | string;
  accessToken: string;
}

export default function TicketPointsDisplay({ ticketId, accessToken }: TicketPointsDisplayProps) {
  const [ticketStaffPoints, setTicketStaffPoints] = useState<TicketStaffPoints[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    console.log('TicketPointsDisplay: useEffect triggered');
    console.log('TicketPointsDisplay: Props - ticketId:', ticketId, 'accessToken present:', !!accessToken);

    async function fetchTicketStaffPoints() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/get-ticket-staff-points?ticketId=${ticketId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
        })

        console.log('TicketPointsDisplay: Fetch response status:', response.status, 'ok:', response.ok);

        if (!response.ok) {
          const errorData = await response.json()
          console.error('TicketPointsDisplay: Fetch error data:', errorData);
          throw new Error(errorData.error || 'Failed to fetch ticket staff points')
        }

        const data = await response.json()
        console.log('TicketPointsDisplay: Fetched data:', data);
        setTicketStaffPoints(data.ticketStaffPoints)
      } catch (err: any) {
        console.error('TicketPointsDisplay: Catch error:', err);
        setError(err.message)
      } finally {
        setLoading(false)
        console.log('TicketPointsDisplay: Loading set to false');
      }
    }

    if (ticketId && accessToken) { // Only fetch if both are available
      fetchTicketStaffPoints()
    } else {
      console.log('TicketPointsDisplay: Skipping fetch, missing ticketId or accessToken');
      setLoading(false);
      setError('Missing ticket ID or access token.');
    }
  }, [ticketId, accessToken])

  console.log('TicketPointsDisplay: Render - loading:', loading, 'error:', error, 'staffPoints count:', ticketStaffPoints.length);

  if (loading) {
    return <div className="text-white text-sm">Loading ticket points...</div>
  }

  if (error) {
    return <div className="text-red-500 text-sm">Error loading ticket points: {error}</div>
  }

  if (ticketStaffPoints.length === 0) {
    console.log('TicketPointsDisplay: No staff points data available for this ticket.');
    return <div className="text-gray-400 text-sm">No staff points found for this ticket.</div>
  }

  console.log('TicketPointsDisplay: Rendering with staff points data:', ticketStaffPoints);
    // Render the ticket staff points
  return (
    <div className="mt-4 p-3 rounded bg-black/20 border border-white/10 text-sm">
      <h4 className="font-semibold text-white mb-2">Staff Points for this Ticket:</h4>
      {ticketStaffPoints.map((entry, index) => (
        <div key={index} className="mb-3 p-2 rounded bg-gray-800 border border-gray-700">
          <p className="text-gray-300 font-semibold">{entry.staff_username} (Total: {entry.points_awarded_for_ticket} points)</p>
          <ul className="list-disc list-inside ml-4 text-gray-400 text-xs">
            {entry.first_reply_points !== null && entry.first_reply_points > 0 && (
              <li>First Reply: {entry.first_reply_points} points</li>
            )}
            {entry.response_time_points !== null && entry.response_time_points > 0 && (
              <li>Response Time Bonus: {entry.response_time_points} points</li>
            )}
            {entry.closer_points !== null && entry.closer_points > 0 && (
              <li>Ticket Closer: {entry.closer_points} points</li>
            )}
            {entry.message_contribution_points !== null && entry.message_contribution_points > 0 && (
              <li>Message Contribution: {entry.message_contribution_points} points</li>
            )}
          </ul>
        </div>
      ))}
    </div>
  )
}
