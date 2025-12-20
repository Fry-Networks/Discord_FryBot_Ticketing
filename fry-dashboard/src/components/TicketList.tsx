'use client'
import { useState, useEffect } from 'react'
import Pagination from '@/components/Pagination'
import TicketPointsDisplay from '@/components/TicketPointsDisplay'

export type TicketSource = 'live' | 'ticketsbot' | 'tickettool'

export interface Ticket {
  ticket_number?: string | null
  id: number
  created_at: string | null
  closed_at: string | null
  claimed_by: string | null
  claimed_by_username?: string | null
  closed_by?: string | null
  closed_by_username?: string | null
  closed_by_id?: string | null // Added closed_by_id
  close_reason?: string | null
  description: string | null
  status: string | null
  ticket_type: string | null
  discord_username: string | null
  full_name?: string | null
  email?: string | null
  order_number?: string | null
  algorand_address?: string | null
  minerkeys?: string | null
  orders_quantities?: string | null // Corrected column name
  request_type?: string | null // Added request_type
  user_id?: string | null
  transcriptSource?: TicketSource
}

interface TranscriptMessage {
  user_id: string
  username: string
  role: string
  message: string
  created_at: string
}

interface TicketListProps {
  tickets: Ticket[]
  source: TicketSource
  onSourceChange?: (source: TicketSource) => void
  accessToken?: string | null // Added accessToken prop
}

export default function TicketList({ tickets, source, onSourceChange, accessToken  }: TicketListProps) {
  
  const [limit, setLimit] = useState(100)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('all')
  const [ticketType, setTicketType] = useState('all')
  const [search, setSearch] = useState('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
// ✅ NEW: Store transcript messages per ticket + loading state
  const [transcripts, setTranscripts] = useState<Record<string, TranscriptMessage[]>>({})
  const [loadingId, setLoadingId] = useState<string | null>(null)

  // ✅ ADDED: Track which ticket is expanded
  const [expandedId, setExpandedId] = useState<string | null>(null)
  
  const toggleExpand = async (ticketKey: string, ticketData: Ticket) => {
    setExpandedId((prev) => (prev === ticketKey ? null : ticketKey))
  
    const id = source === 'live' ? ticketData.id : (ticketData.ticket_number || String(ticketData.id));
    console.log('TicketList: Expanding:', ticketKey, 'with ID:', id);

    if (!transcripts[ticketKey]) {
      setLoadingId(ticketKey)
      try {
        let endpoint = '';
        let requestBody: any = {};

        if (source === 'live') {
          endpoint = '/api/get-live-ticket-messages';
          requestBody = { ticket_id: ticketData.id }; // Use ticketData.id for live tickets
        } else if (source === 'ticketsbot') {
          endpoint = '/api/get-ticketsbot-messages';
          requestBody = { ticket_id: id };
        } else if (source === 'tickettool') {
          endpoint = '/api/get-tickettool-messages';
          requestBody = { ticket_id: id };
        }

        if (!endpoint) {
          console.error('Invalid ticket source:', source);
          setLoadingId(null);
          return;
        }

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}` // Added Authorization header
          },
          body: JSON.stringify(requestBody)
        })
  
        if (res.ok) {
          const { messages } = await res.json()
          setTranscripts((prev) => ({ ...prev, [ticketKey]: messages }))
        }
      } catch (err) {
        console.error(`Failed to load transcript for ticket ${id}`)
      } finally {
        setLoadingId(null)
      }
    }
  }
  
    
  const limits = [25, 50, 100, 250, 500]

  const filteredTickets = tickets.filter((t) => {
    const matchesStatus =
      statusFilter === 'all' || t.status === statusFilter

    const matchesType =
      ticketType === 'all' || t.ticket_type === ticketType

    const matchesSearch =
      search === '' ||
      t.discord_username?.toLowerCase().includes(search.toLowerCase()) ||
      String(t.id).includes(search)

    return matchesStatus && matchesType && matchesSearch
  })

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [page])

  const total = filteredTickets.length
  const totalPages = Math.ceil(total / limit)
  const start = (page - 1) * limit
  const end = start + limit
  const sortedTickets = [...filteredTickets].sort((a, b) => {
    const timeA = new Date(a.created_at || '').getTime()
    const timeB = new Date(b.created_at || '').getTime()
    return sortOrder === 'asc' ? timeA - timeB : timeB - timeA
  })
  
  const visibleTickets = sortedTickets.slice(start, end)
  /*console.log(
    'Visible Tickets:',
    visibleTickets.map((t) => ({
      source,
      id: t.id,
      created_at: t.created_at,
      ticket_number: t.ticket_number,
    }))
  )  */
  const formatTicketType = (type: string | null) => {
    if (!type) return 'N/A'
    return type
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  }

  function highlight(text: string, query: string) {
    if (!query) return text
    const i = text.toLowerCase().indexOf(query.toLowerCase())
    if (i === -1) return text
    return (
      <>
        {text.slice(0, i)}
        <span className="bg-yellow-300 text-black font-semibold px-0.5 rounded-sm">
          {text.slice(i, i + query.length)}
        </span>
        {text.slice(i + query.length)}
      </>
    )
  }

  function CopyValue({
    label,
    value,
    className = '',
  }: {
    label: string
    value: string
    className?: string
  }) {
      const [copied, setCopied] = useState(false)
  
      const handleCopy = async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1000)
      }
  
      return (
        <div className="flex items-center gap-2">
          <strong>{label}:</strong>{' '}
          <span className={className}>{value}</span>
          <div className="relative group">
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleCopy()
              }}
              className="text-gray-300 hover:text-white transition"
              aria-label="Copy to clipboard"
            >
              {/* Clipboard icon */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 4h8m-4-2v2m0 0a2 2 0 002 2h4a2 2 0 012 2v10a2 2 0 01-2 2h-4a2 2 0 00-2 2v2m-4-2a2 2 0 01-2-2H4a2 2 0 01-2-2V8a2 2 0 012-2h4a2 2 0 002-2"
                />
              </svg>
            </button>
            <span className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 px-2 py-1 text-xs bg-black text-white rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-10">
              {copied ? 'Copied!' : 'Copy'}
            </span>
          </div>
        </div>
      )
    }
  

  return (
    <div className="p-6">
      {/* === ADDED: Source toggle buttons === */}
      <div className="sticky top-2 z-30 bg-black/12 backdrop-blur border-b border-white/10 px-3 py-2">
      <div className="flex justify-center mb-6 gap-3">
        <button
          onClick={() => onSourceChange?.('live')}
          className={`px-4 py-1.5 rounded-xl text-sm font-semibold border ${
            source === 'live'
              ? 'bg-slate-700 text-white border-slate-500'
              : 'bg-slate-600 text-gray-300 border-slate-400 hover:bg-slate-500'
          }`}
        >
          Live Tickets
        </button>
        <button
          onClick={() => onSourceChange?.('ticketsbot')}
          className={`px-4 py-1.5 rounded-xl text-sm font-semibold border ${
            source === 'ticketsbot'
              ? 'bg-slate-700 text-white border-slate-500'
              : 'bg-slate-600 text-gray-300 border-slate-400 hover:bg-slate-500'
          }`}
        >
          Ticketsbot Archive
        </button>
        <button
          onClick={() => onSourceChange?.('tickettool')}
          className={`px-4 py-1.5 rounded-xl text-sm font-semibold border ${
            source === 'tickettool'
              ? 'bg-slate-700 text-white border-slate-500'
              : 'bg-slate-600 text-gray-300 border-slate-400 hover:bg-slate-500'
          }`}
        >
          TicketTool Archive
        </button>
      </div>

      {/* === MODIFIED: Header title updates based on source === */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <h2 className="text-2xl font-bold text-white">
            {source === 'live' && 'Tickets'}
            {source === 'ticketsbot' && 'Ticketsbot Archive'}
            {source === 'tickettool' && 'TicketTool Archive'}
          </h2>
          <span className="text-gray-400 text-sm">
            Showing {total} result{total !== 1 && 's'}
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Search by ticket # or username"
            className="bg-black/30 text-white text-sm px-3 py-1 rounded border border-white/10 w-64"
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
  
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(1)
            }}
            className="bg-black/30 text-white text-sm px-3 py-1 rounded border border-white/10"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="claimed">Claimed</option>
            <option value="unclaimed">Unclaimed</option>
            <option value="closed">Closed</option>
          </select>
  
          <select
            value={ticketType}
            onChange={(e) => {
              setTicketType(e.target.value)
              setPage(1)
            }}
            className="bg-black/30 text-white text-sm px-3 py-1 rounded border border-white/10"
          >
            <option value="all">All Types</option>
            <option value="miner_keys">Miner Keys</option>
            <option value="order_tracking">Order Issues</option>
            <option value="registration">Registration</option>
            <option value="rewards">Rewards</option>
            <option value="technical_support">Tech Support</option>
            <option value="node_forgo_return">Node Forgo/Return</option> {/* Added new ticket type */}
            <option value="fry_conversion_issues">FRY Conversion Issues</option>
            <option value="cancellation">Cancellation</option>
          </select>
          
          {/* Sort toggle */}
          <button
            onClick={() => {
              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
              setPage(1)
            }}
            className="px-4 py-1.5 rounded-xl text-sm font-semibold border bg-slate-700 text-white border-slate-500 bg-slate-600 text-gray-300 border-slate-400 hover:bg-slate-500"
          >
            {sortOrder === 'asc' ? 'Newest → Oldest' : 'Oldest → Newest'}
          </button>
        </div>
      </div>
    </div>

      {/* === UPDATED: Ticket cards now expandable === */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {visibleTickets.map((ticket, index) => {
           const ticketKey = `${source}-${ticket.id}-${index}`
           const isExpanded = expandedId === ticketKey
           const transcriptKey = ticketKey

           console.log(`TicketList: Rendering ticket ${ticketKey}. isExpanded: ${isExpanded}, source: ${source}`);

           return (
            <div
              key={ticketKey}
              className="bg-white/5 backdrop-blur rounded-2xl p-4 border border-white/10 shadow transition-shadow"
            >
              {/* 🔘 Only the top part is clickable */}
              <div
                onClick={() => toggleExpand(ticketKey, ticket)}
                className="hover:shadow-lg transition-shadow"
              >
                <h3 className="text-lg font-semibold text-white cursor-pointer">
                  Ticket #{highlight(String(ticket.ticket_number || ticket.id), search)}
                  <span className="ml-2 text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                    {source === 'live' && 'Live'}
                    {source === 'ticketsbot' && 'Ticketsbot'}
                    {source === 'tickettool' && 'TicketTool'}
                  </span>
                </h3>
                
                <p className="text-sm text-gray-300 mt-1 line-clamp-2">
                  {ticket.description || 'No description'}
                </p>

                <div className="mt-3 text-sm text-gray-400 space-y-1">
                  <div className="flex justify-between">
                    <span>Opened: {ticket.created_at ? new Date(ticket.created_at).toLocaleDateString() : 'Unknown'}</span>
                    <span>
                      Status:{' '}
                      <span
                        className={
                          ticket.status === 'closed'
                            ? 'text-red-400'
                            : ticket.status === 'claimed'
                            ? 'text-blue-400'
                            : ticket.status === null
                            ? 'text-gray-300'
                            : 'text-yellow-300'
                        }
                      >
                        {ticket.status ?? 'unclaimed'}
                      </span>
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span>Type: {formatTicketType(ticket.ticket_type)}</span>
                    <span>
                      User:{' '}
                      {ticket.discord_username
                        ? highlight(ticket.discord_username, search)
                        : 'Unknown'}
                    </span>
                  </div>
                </div>
  
                {/* ✅ ADDED: Expand to show full metadata */}
                {isExpanded && (
                    <div
                    className="pt-3 border-t border-white/10 text-gray-300 space-y-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {ticket.discord_username && ticket.discord_username !== 'N/A' && (
                      <div className="group relative block">
                        <CopyValue label="User" value={ticket.discord_username} />
                        {ticket.user_id && (
                          <span className="absolute bottom-full left-0 mb-1 hidden group-hover:block bg-black text-white text-xs px-2 py-1 rounded shadow">
                            ID: {ticket.user_id}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="group relative block">
                      <strong>Claimed By:</strong>{' '}
                      {ticket.claimed_by_username || ticket.claimed_by || 'Unclaimed'}
                      {ticket.claimed_by && (
                        <span className="absolute bottom-full left-0 mb-1 hidden group-hover:block bg-black text-white text-xs px-2 py-1 rounded shadow z-10">
                          ID: {ticket.claimed_by}
                        </span>
                      )}
                    </div>
                    <div><strong>Opened:</strong> {ticket.created_at || 'N/A'}</div>
                    {/* === Custom metadata === */}
                    {ticket.description && ticket.description !== 'N/A' && (
                      <div><strong>Description:</strong> {ticket.description}</div>
                    )}
                    {ticket.full_name && ticket.full_name !== 'N/A' && (
                      <div><strong>Full Name:</strong> {ticket.full_name}</div>
                    )}
                    {ticket.email && ticket.email !== 'N/A' && (
                      <CopyValue label="Email" value={ticket.email} />
                    )}
                    {ticket.order_number && ticket.order_number !== 'N/A' && (
                      <CopyValue label="Order Number" value={ticket.order_number} />
                    )}
                    {ticket.algorand_address && ticket.algorand_address !== 'N/A' && (
                      <CopyValue
                      label="Algorand Address"
                      value={ticket.algorand_address}
                      className="break-all whitespace-pre-wrap"
                      />
                    )}
                    {ticket.minerkeys && ticket.minerkeys !== 'N/A' && (
                      <CopyValue
                      label="Miner Keys"
                      value={ticket.minerkeys}
                      className="break-all whitespace-pre-wrap"
                      />
                    )}
                    {/* ✅ ADDED: Display orders_quantities and request_type for specific ticket type */}
                    {ticket.ticket_type === 'node_forgo_return' && (
                      <>
                        {/* Parse orders_quantities and display each order and quantity */}
                        <div>
                          <strong>Order Quantities:</strong>
                          {(() => {
                            try {
                              if (!ticket.orders_quantities) return ' N/A';
                              const quantities = JSON.parse(ticket.orders_quantities);
                              if (Array.isArray(quantities) && quantities.length > 0) {
                                return (
                                  <ul className="list-disc list-inside ml-4">
                                    {quantities.map((item, index) => (
                                      <li key={index}>
                                        Order {item.order}: {item.quantity}
                                      </li>
                                    ))}
                                  </ul>
                                );
                              }
                              return ' N/A';
                            } catch (error) {
                              console.error('Error parsing orders_quantities in expanded view:', error);
                              return ' Error';
                            }
                          })()}
                        </div>
                        {ticket.request_type && (
                          <div><strong>Request Type:</strong> {formatTicketType(ticket.request_type)}</div>
                        )}
                      </>
                    )}
                    <div className="group relative block">
                      <strong>Closed By:</strong>{' '}
                      {ticket.closed_by_username || ticket.closed_by || 'N/A'}
                      {(ticket.closed_by_username || ticket.closed_by) && ticket.closed_by_id && (
                        <span className="absolute bottom-full left-0 mb-1 hidden group-hover:block bg-black text-white text-xs px-2 py-1 rounded shadow z-10">
                          ID: {ticket.closed_by_id}
                        </span>
                      )}
                    </div>
                    <div><strong>Close Reason:</strong> {ticket.close_reason || 'N/A'}</div>
                    <div><strong>Closed:</strong> {ticket.closed_at || 'N/A'}</div>
                    {isExpanded && (
                      <>
                        <TicketPointsDisplay
                          ticketId={source === 'live' ? ticket.id : (ticket.ticket_number || String(ticket.id))}
                          accessToken={accessToken || ''} // Pass accessToken
                        />
                        {console.log('TicketList: Passing to TicketPointsDisplay - ticketId:', source === 'live' ? ticket.id : (ticket.ticket_number || String(ticket.id)), 'accessToken present:', !!(accessToken || ''))}
                      </>
                    )}
                    {(source === 'live' || source === 'ticketsbot' || source === 'tickettool') && (
                  <div className="mt-4 p-3 rounded bg-black/20 border border-white/10 text-sm max-h-[300px] overflow-y-auto space-y-2">
                    {loadingId === transcriptKey && (
                      <div className="text-gray-400">Loading transcript...</div>
                    )}
                    {transcripts[transcriptKey]?.length > 0 ? (
                      transcripts[transcriptKey].map((msg, i) => {
                        const isStaff = msg.role === 'staff'
                        const isBot = msg.role === 'bot'
                        const bubbleColor = isStaff
                          ? 'bg-slate-700'
                          : isBot
                          ? 'bg-slate-600'
                          : 'bg-slate-800'
                      
                        return (
                          <div key={i} className={`rounded px-3 py-2 ${bubbleColor} text-sm`}>
                            <div className="text-gray-300 mb-1">
                              <span className="font-semibold">{msg.username}</span>{' '}
                              <span className="text-xs text-gray-400">({msg.role})</span>
                              <span className="text-xs text-gray-500 ml-2">ID: {msg.user_id}</span>
                              <span className="ml-2 text-xs text-gray-500">
                                {new Date(msg.created_at).toLocaleString()}
                            </span>
                          </div>
                          <div className="text-white ml-2">
                            {/* Attempt to parse JSON message */}
                            {(() => {
                                    function renderFields(fields: { name: string; value: string; inline?: boolean }[]) {
                                      if (!fields || !Array.isArray(fields)) return null;
                                      return (
                                        <div className="mt-2 space-y-1">
                                          {fields.map((field, idx) => (
                                            <div key={idx}>
                                              <div className="font-semibold text-gray-400 text-xs">{field.name}</div>
                                              <div className="text-gray-300 text-sm whitespace-pre-line">{field.value.replace(/```/g, '')}</div>
                                            </div>
                                          ))}
                                        </div>
                                      );
                                    }

                                    function safeParse(str: string) {
                                      try {
                                        let parsed = JSON.parse(str);
                                        if (typeof parsed === "string") parsed = JSON.parse(parsed);
                                        return parsed;
                                      } catch {
                                        return null;
                                      }
                                    }

                                    // Parse once
                                    let parsed = safeParse(msg.message);

                                    // 1. Discord-style object with .discordData containing a stringified embed message (sometimes double-wrapped)
                                    if (parsed?.discordData) {
                                      // Sometimes content is a plain message, sometimes it's an embed as a JSON string
                                      if (parsed.discordData.content) {
                                        return <div>{parsed.discordData.content}</div>;
                                      }
                                      // Sometimes discordData itself is an embed object
                                      if (parsed.discordData.title && parsed.discordData.fields) {
                                        return (
                                          <div>
                                            <div className="font-bold text-blue-300 mb-1">{parsed.discordData.title}</div>
                                            {renderFields(parsed.discordData.fields)}
                                            {parsed.discordData.footer?.text && (
                                              <div className="text-xs text-gray-400 mt-2">{parsed.discordData.footer.text}</div>
                                            )}
                                            {parsed.discordData.timestamp && (
                                              <div className="text-xs text-gray-500 mt-1">{new Date(parsed.discordData.timestamp).toLocaleString()}</div>
                                            )}
                                          </div>
                                        );
                                      }
                                    }

                                    // 2. Ticketsbot/TicketTool embed style (title/fields at top level)
                                    if (parsed?.title && parsed?.fields) {
                                      return (
                                        <div>
                                          <div className="font-bold text-blue-300 mb-1">{parsed.title}</div>
                                          {renderFields(
                                            typeof parsed.fields === "string" ? safeParse(parsed.fields) : parsed.fields
                                          )}
                                          {parsed.footer?.text && (
                                            <div className="text-xs text-gray-400 mt-2">{parsed.footer.text}</div>
                                          )}
                                          {parsed.timestamp && (
                                            <div className="text-xs text-gray-500 mt-1">{new Date(parsed.timestamp).toLocaleString()}</div>
                                          )}
                                        </div>
                                      );
                                    }

                                    // 3. Discord embed array under .embeds (type: rich, etc)
                                    if (parsed?.embeds && Array.isArray(parsed.embeds)) {
                                      return parsed.embeds.map((embed: any, idx: number) => (
                                        <div key={idx}>
                                          {embed.title && (
                                            <div className="font-bold text-blue-300 mb-1">{embed.title}</div>
                                          )}
                                          {embed.fields && renderFields(embed.fields)}
                                          {embed.footer?.text && (
                                            <div className="text-xs text-gray-400 mt-2">{embed.footer.text}</div>
                                          )}
                                          {embed.timestamp && (
                                            <div className="text-xs text-gray-500 mt-1">{new Date(embed.timestamp).toLocaleString()}</div>
                                          )}
                                          {embed.description && (
                                            <div className="text-gray-300 text-sm mt-1">{embed.description}</div>
                                          )}
                                        </div>
                                      ));
                                    }

                                    // 4. Discord embed style with type: "rich"
                                    if (parsed?.type === "rich" && (parsed?.title || parsed?.fields)) {
                                      return (
                                        <div>
                                          {parsed.title && <div className="font-bold text-blue-300 mb-1">{parsed.title}</div>}
                                          {parsed.fields && renderFields(parsed.fields)}
                                          {parsed.footer?.text && (
                                            <div className="text-xs text-gray-400 mt-2">{parsed.footer.text}</div>
                                          )}
                                          {parsed.timestamp && (
                                            <div className="text-xs text-gray-500 mt-1">{new Date(parsed.timestamp).toLocaleString()}</div>
                                          )}
                                          {parsed.description && (
                                            <div className="text-gray-300 text-sm mt-1">{parsed.description}</div>
                                          )}
                                        </div>
                                      );
                                    }

                                    // 5. Generic .content field
                                    if (parsed?.content) {
                                      return <div>{parsed.content}</div>;
                                    }

                                    // 6. Fallback to plain text
                                    return <div>{msg.message}</div>;
                                  })()}
                          </div>
                        </div>
                      )})
                    ) : (
                      loadingId !== transcriptKey && <div className="text-gray-400">No messages found.</div>
                    )}
                  </div>
                )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="fixed bottom-0 left-0 right-[16px] bg-black/40 border border-white/10 shadow-md backdrop-blur z-50 px-6 py-2">
          <Pagination totalPages={totalPages} page={page} setPage={setPage} />
        </div>
      )}
    </div>
  )
}
