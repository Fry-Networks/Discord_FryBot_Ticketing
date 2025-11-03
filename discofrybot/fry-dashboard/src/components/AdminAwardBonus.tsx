'use client'

import { useState, useEffect } from 'react'
import ComboBox from './ComboBox'

type Staff = {
  id: string
  username: string
}

type Adjustment = {
  id: number
  staff_id: string
  staff_username: string
  points_delta: number
  reason: string
  awarded_by_username: string
  created_at: string
}

export default function AdminAwardBonus() {
  const [selectedStaff, setSelectedStaff] = useState<{ id: string; username: string } | null>(null)
  const [points, setPoints] = useState<number | ''>('')
  const [reason, setReason] = useState('')
  const [ticketId, setTicketId] = useState<number | ''>('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [adjustments, setAdjustments] = useState<Adjustment[]>([])

  useEffect(() => {
    async function fetchStaff() {
      try {
        const res = await fetch('/api/admin/get-staff', { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          setStaffList(data)
        }
      } catch (error) {
        console.error('Failed to fetch staff list', error)
      }
    }

    async function fetchAdjustments() {
      try {
        const res = await fetch('/api/admin/get-bonus-adjustments', { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          setAdjustments(data)
        }
      } catch (error) {
        console.error('Failed to fetch adjustments', error)
      }
    }

    fetchStaff()
    fetchAdjustments()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)

    if (!selectedStaff) {
      setMessage('Staff selection is required.')
      return
    }
    if (!points || Number(points) === 0) {
      setMessage('Points must be a non-zero number.')
      return
    }
    if (!reason.trim()) {
      setMessage('Reason is required.')
      return
    }

    // Optional confirmation for large values
    if (Math.abs(Number(points)) > 100) {
      const ok = confirm(
        `You are awarding ${points} points. Are you sure you want to continue? This action is permanent and audited.`
      )
      if (!ok) return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/award-bonus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          staff_id: selectedStaff.id,
          points_delta: Number(points),
          reason: reason.trim(),
          ticket_id: ticketId === '' ? null : Number(ticketId)
        })
      })

      const data = await res.json()
      if (!res.ok) {
        setMessage(data?.error || `Server error: ${res.status}`)
      } else {
        setMessage(`Success. New total points: ${data.new_total_points}`)
        // Clear inputs (but keep staff id for convenience)
        setPoints('')
        setReason('')
        setTicketId('')
        
        // Refresh adjustments list
        const res = await fetch('/api/admin/get-bonus-adjustments', { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          setAdjustments(data)
        }
      }
    } catch (err: any) {
      setMessage(err?.message || 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-6 p-4 border rounded-lg bg-white/5">
      <h3 className="text-lg font-semibold text-white mb-3">Award Bonus Points (Admins only)</h3>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3">
        <div>
          <label className="text-sm text-gray-300">Select Staff</label>
          <ComboBox
            items={staffList}
            value={selectedStaff}
            onChange={setSelectedStaff}
          />
        </div>
        <div>
          <label className="text-sm text-gray-300">Points (positive or negative)</label>
          <input
            type="number"
            className="mt-1 block w-full rounded bg-slate-700 text-white px-3 py-2 border border-slate-600"
            value={points === '' ? '' : String(points)}
            onChange={(e) => setPoints(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="e.g., 10"
          />
        </div>
        <div>
          <label className="text-sm text-gray-300">Reason</label>
          <input
            className="mt-1 block w-full rounded bg-slate-700 text-white px-3 py-2 border border-slate-600"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Short reason for audit (required)"
          />
        </div>
        <div>
          <label className="text-sm text-gray-300">Optional Ticket ID</label>
          <input
            type="number"
            className="mt-1 block w-full rounded bg-slate-700 text-white px-3 py-2 border border-slate-600"
            value={ticketId === '' ? '' : String(ticketId)}
            onChange={(e) => setTicketId(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="Ticket id (optional)"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Applying...' : 'Apply Adjustment'}
          </button>
          {message && <div className="text-sm text-gray-300">{message}</div>}
        </div>
      </form>

      <div className="mt-8">
        <h3 className="text-lg font-semibold text-white mb-3">Recent Adjustments</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-600">
            <thead className="bg-slate-800">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Staff</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Points</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Reason</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Awarded By</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody className="bg-slate-700 divide-y divide-slate-600">
              {adjustments.map((adj) => (
                <tr key={adj.id}>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-white">{adj.staff_username}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-white">{adj.points_delta}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-white">{adj.reason}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-white">{adj.awarded_by_username}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-white">{new Date(adj.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
