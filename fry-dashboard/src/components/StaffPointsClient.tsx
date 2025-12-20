'use client'

import React, { useEffect, useState } from 'react'
import { Database } from '@/types/supabase'
import { supabase } from '@/utils/supabaseClient' // Import the client-side Supabase instance

type StaffPoints = Database['api']['Tables']['staff_points']['Row']

export default function StaffPointsClient() {
  const [staffPoints, setStaffPoints] = useState<StaffPoints[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchStaffPoints() {
      try {
        // Check if user is authenticated
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        
        if (userError || !user) {
          setError('User not authenticated.')
          setLoading(false)
          return
        }

        // Make request without explicit token - let the server handle auth via cookies/middleware
        const response = await fetch('/api/get-staff-points', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include', // Include cookies for server-side auth
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to fetch staff points')
        }

        const data = await response.json()
        setStaffPoints(data.staffPoints)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchStaffPoints()
  }, [])

  if (loading) {
    return <div className="text-white">Loading staff points...</div>
  }

  if (error) {
    return <div className="text-red-500">Error: {error}</div>
  }

  return (
    <div className="bg-gray-900 p-4 rounded-lg shadow-lg text-white border border-gray-700">
      <h2 className="text-xl font-bold mb-3 text-blue-300">Staff Points Leaderboard</h2>
      <p className="text-xs text-gray-400 mb-4 leading-relaxed">
        Points are awarded based on: 2 points for the first staff reply, response time bonus (2 pts for &lt;2 hours, 1 pt for &lt;1 day, 0 pts for &gt;1 day) for the first replier, 2 points for the ticket closer (or last replier if user closed), and proportional message contribution points (up to 10 max per ticket).
      </p>
      {staffPoints.length === 0 ? (
        <p className="text-gray-400">No staff points data available.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-800">
              <tr>
                <th scope="col" className="py-2 px-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Rank</th>
                <th scope="col" className="py-2 px-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Staff Username</th>
                <th scope="col" className="py-2 px-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Total Points</th>
              </tr>
            </thead>
            <tbody className="bg-gray-900 divide-y divide-gray-800">
              {staffPoints.map((staff, index) => (
                <tr key={staff.staff_id} className={index % 2 === 0 ? 'bg-gray-800' : 'bg-gray-850'}>
                  <td className="py-2 px-3 whitespace-nowrap text-sm font-medium text-white">{index + 1}</td>
                  <td className="py-2 px-3 whitespace-nowrap text-sm text-gray-300">{staff.staff_username}</td>
                  <td className="py-2 px-3 whitespace-nowrap text-sm text-gray-300">{staff.total_points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
