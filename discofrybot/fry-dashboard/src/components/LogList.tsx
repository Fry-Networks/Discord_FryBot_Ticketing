'use client'

import { useEffect, useState, useCallback } from 'react'
import Pagination from '@/components/Pagination'


interface Log {
  id: string
  timestamp: string | null
  level: string
  scope: string | null
  message: string
}

// Client-side logging function to log dashboard activity to Supabase
async function clientLog(level: 'info' | 'warn' | 'error', message: string, scope = 'log_list') {
  await fetch('/api/log-client-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, message: message.slice(0, 1000), scope })
  })
}

export default function LogList() {
  // State for full log data
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters and controls
  const [search, setSearch] = useState('')
  const [level, setLevel] = useState('')
  const [scope, setScope] = useState('')
  const [limit, setLimit] = useState(100)
  const [page, setPage] = useState(1)
  const [archived, setArchived] = useState(false)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [totalCount, setTotalCount] = useState(0)

  // For showing spinner on a specific restore button
  const [restoringId, setRestoringId] = useState<string | null>(null)

  // Tracks which logs have already been restored to Supabase
  const [restoredIds, setRestoredIds] = useState<Set<string>>(new Set())

  const limits = [100, 250, 500, 1000]

 /* // Auto-refresh (live logs only, every 10s, silent)
useEffect(() => {
  if (!archived) {
    const interval = setInterval(async () => {
      try {
        const query = new URLSearchParams()
        query.set('order', sortOrder)
        query.set('from', '0')
        query.set('to', String(limit - 1))
        if (search) query.set('search', search)

        const res = await fetch(`/api/log-client-event?${query.toString()}`)
        const json = await res.json()
        const freshLogs = json.logs || []

        // Only update if there are new logs / count has changed (avoids flicker)
        if (freshLogs.length !== logs.length) {
          setLogs(freshLogs)
        }

      } catch (err) {
        console.error('Auto-refresh failed', err)
      }
    }, 10000)

    return () => clearInterval(interval)
  }
}, [archived, search, sortOrder, limit, logs.length])

  // Scroll to top on page change (so pagination UX feels clean)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [page])
*/

  // ✅ Central fetch logic, stable across renders
  const fetchLogs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    
      try {
        await clientLog('info', 'Fetching logs...', 'log_list')
        let rawLogs: Log[] = []
  
        if (archived) {
          // 1. Fetch all archived file metadata from Google Drive
          const archiveRes = await fetch('/api/list-archives')
          const archiveJson = await archiveRes.json()
          const files = archiveJson.files || []
  
          // 2. Error if no archived files found
          if (files.length === 0) {
            throw new Error('No archived log files found')
          }

        /*  // Log the search intent
          if (search) {
            await clientLog('info', `Searching archived logs for: "${search}"`, 'log_list')
          } */
  
          // 3. Parse all archived CSVs in parallel using /api/parse-archive
          const parsedResults = await Promise.all(
            files.map((file: { id: string }) =>
              fetch('/api/parse-archive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileId: file.id })
              }).then((r) => r.json())
            )
          )
  
          // 4. Combine all parsed logs into one array
          rawLogs = parsedResults.flatMap((r) => r.logs || [])
  
          // 5. Set logs and total
          setLogs(rawLogs)
          setTotalCount(rawLogs.length)

          // ✅ Fetch current Supabase live log IDs to track restored status
          const liveRes = await fetch('/api/log-client-event')
          const liveJson = await liveRes.json()
          const liveLogs = liveJson.logs || []
          const restoredSet = new Set<string>(liveLogs.map((log: Log) => log.id))
          setRestoredIds(restoredSet)
        } else {
          // 1. Prepare live Supabase query params
          const query = new URLSearchParams()
          query.set('order', sortOrder)
          query.set('from', String((page - 1) * limit))
          query.set('to', String((page * limit) - 1))
       //   if (search) query.set('search', search)
  
          // 2. Fetch live logs from Supabase via /api/log-client-event
          const res = await fetch(`/api/log-client-event?${query.toString()}`, {
            headers: { 'Prefer': 'count=exact' }
          })
          const json = await res.json()
  
          // 3. Set logs and total
          rawLogs = json.logs || json.archives || []
          setLogs(rawLogs)
          setTotalCount(json.count || rawLogs.length) // fallback if count is missing

          // ✅ Auto-scroll to top when viewing page 1 on auto-refresh
          if (silent && page === 1) {
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }
        }  
        // Final: Clear error and log the count
        setError(null)
        await clientLog('info', `Fetched ${rawLogs.length} logs`, 'log_list')
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setError('Failed to load logs')
        await clientLog('error', `Fetch error: ${message}`, 'log_list')
      } finally {
        if (!silent) setLoading(false)
      }    
    }, [archived, sortOrder, page, limit]) // ✅ no `search` here

    useEffect(() => {
      if (!archived) {
        const interval = setInterval(() => {
          fetchLogs(true)
        }, 120000)
        return () => clearInterval(interval)
      }
    }, [archived, fetchLogs])

  // Trigger fetch on first load or filter changes
  useEffect(() => {
    fetchLogs()
  }, [fetchLogs, page])

    // Highlight search terms in a text
  function highlight(text: string, search: string) {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return text
    const regex = new RegExp(`(${terms.join('|')})`, 'gi')
    const parts = text.split(regex)
  
    return parts.map((part, i) =>
      terms.includes(part.toLowerCase()) ? (
        <mark key={i} className="bg-yellow-300/10 text-yellow-300 font-semibold px-1 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    )
  }
  
    // Filter logs based on all inputs
    const filteredLogs = logs.filter((log) => {
      const s = search.trim().toLowerCase()
      const msg = log.message || ''
      const lvl = log.level || ''
      const scp = log.scope || ''
      const id = log.id || ''
      return (
        (s === '' ||
          id.toLowerCase().includes(s) ||
          msg.toLowerCase().includes(s) ||
          scp.toLowerCase().includes(s) ||
          lvl.toLowerCase().includes(s)) &&
        (level === '' || lvl === level) &&
        (scope === '' || scp === scope)
      )
    })

    // Count how many total term matches are found
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const matchCount = filteredLogs.reduce((count, log) => {
      const fields = [log.message, log.level, log.scope ?? '', log.id]
      return count + fields.reduce((sum, field) => {
        const matches = terms.flatMap(term =>
          field.toLowerCase().match(new RegExp(term, 'g')) || []
        )
        return sum + matches.length
      }, 0)
    }, 0)

    // Pagination calculations (based on filtered result set)
    const totalPages = Math.ceil(totalCount / limit)
    //const start = (page - 1) * limit
    //const end = start + limit
    //const visibleLogs = filteredLogs.slice(start, end)
    const visibleLogs = filteredLogs
    // Render fallbacks
    if (error) return <div className="p-6 text-red-500">{error}</div>
    if (loading) return <div className="p-6 text-white">Loading logs...</div>

    console.log('logs:', logs.length)
    console.log('filteredLogs:', filteredLogs.length)
    console.log('visibleLogs:', visibleLogs.length)
    console.log('totalPages:', totalPages)
    
  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
        {/* LEFT: Title + Search */}
        <div className="flex items-center gap-4 flex-wrap">
          <h1 className="text-2xl font-bold text-white">Staff Logs</h1>
          <input
            type="text"
            placeholder="Search by message, scope, or level"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="px-3 py-1 rounded bg-black/30 text-white placeholder:text-white/50 text-sm w-64"
          />
        </div>
        {/* RIGHT: Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value))
              setPage(1)
            }}
            className="bg-black/30 text-white text-sm px-3 py-1 rounded border border-white/10"
          >
            {limits.map((option) => (
              <option key={option} value={option}>
                Show {option}
              </option>
            ))}
          </select>

            {/* Level filter */}
          <select
            value={level}
            onChange={(e) => {
              setLevel(e.target.value)
              setPage(1)
            }}
            className="bg-black/30 text-white text-sm px-3 py-1 rounded border border-white/10"
          >
            <option value="">All Levels</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>

            {/* Scope filter */}
          <select
            value={scope}
            onChange={(e) => {
              setScope(e.target.value)
              setPage(1)
            }}
            className="bg-black/30 text-white text-sm px-3 py-1 rounded border border-white/10"
          >
            <option value="">All Scopes</option>
            <option value="dashboard">Dashboard</option>
            <option value="checkStaffRole">Check Staff Role</option>
            <option value="store_tokens">Store Discord Tokens</option>
            <option value="verify_discord_role">Verify Discord Role</option>
            <option value="daily_backup">Daily Backup</option>
          </select>

          {/* Archived toggle */}
          <button
            onClick={() => {
              setArchived(!archived)
              setPage(1)
            }}
            className="bg-slate-600 hover:bg-blue-600 text-white text-sm font-medium px-4 py-1.5 rounded shadow-sm transition-colors"
          >
            {archived ? 'Show Live Logs' : 'View Archived Logs'}
          </button>

          {/* Sort toggle */}
          <button
            onClick={() => {
              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
              setPage(1)
            }}
            className="bg-slate-600 hover:bg-blue-600 text-white text-sm font-medium px-4 py-1.5 rounded shadow-sm transition-colors"
          >
            {sortOrder === 'asc' ? 'Newest → Oldest' : 'Oldest → Newest'}
          </button>
        </div>
      </div>

      {/* Match count display */}
      {search.trim() && (
        <p className="text-sm text-white/70 mb-2">
          Found <span className="font-semibold text-white">{matchCount}</span> result
          {matchCount !== 1 ? 's' : ''} for “<span className="italic">{search}</span>”
        </p>
      )}

      {/* Log entries */}
      <div className="grid gap-4">
        {visibleLogs.map((log) => (
          <div key={log.id} className="border border-white/10 bg-white/5 
          p-4 rounded-xl shadow-sm text-white animate-fade-in">

            {/* Timestamp */}
            <p className="text-xs text-gray-400">
              {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'No timestamp'}
            </p>

            {/* Level and scope */}
            <p className="capitalize font-semibold">
              {highlight(log.level, search)}{' '}
              <span className="text-gray-300 font-normal">[{highlight(log.scope || '', search)}]</span>
            </p>

            {/* Message */}
            <p className="text-sm">{highlight(log.message, search)}</p>

            {/* Archived footer with restore button */}
            {archived && (
              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                <div className="text-white/70 text-sm italic">Archived Log</div>
                {restoredIds.has(log.id) ? (
                  <span className="text-green-400 text-xs font-semibold">Restored</span>
                ) : (
                  <button
                    onClick={async () => {
                      setRestoringId(log.id)
                      const res = await fetch('/api/restore-log', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          id: log.id,
                          timestamp: log.timestamp,
                          level: log.level,
                          scope: log.scope,
                          message: log.message
                        })
                      })
                      const result = await res.json()
                      setRestoringId(null)
                      if (result.success) {
                        alert('✅ Log restored to Supabase')
                        setRestoredIds((prev) => {
                          const updated = new Set(prev)
                          updated.add(log.id)
                          return updated
                        })
                      } else {
                        alert('❌ Failed to restore log')
                      }
                    }}
                    disabled={restoringId === log.id}
                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs flex items-center gap-2 disabled:opacity-60"
                  >
                    {restoringId === log.id ? (
                      <svg
                        className="animate-spin h-4 w-4 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16 8 8 0 01-8-8z" />
                      </svg>
                    ) : (
                      'Restore'
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="fixed bottom-0 left-0 right-[16px] bg-black/40 border border-white/10 shadow-md backdrop-blur z-50 px-6 py-2">
        <Pagination totalPages={totalPages} page={page} setPage={setPage} />
      </div>
    </div> // close page wrapper
  )
}