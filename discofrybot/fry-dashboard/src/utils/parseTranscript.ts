// /src/utils/parseTranscript.ts

export interface TranscriptEmbed {
  title?: string
  description?: string
  timestamp?: string
  url?: string
  fields?: { name: string; value: string; inline?: boolean }[]
  [key: string]: unknown
}

export interface TranscriptAttachment {
  id?: string
  url?: string
  proxy_url?: string
  content_type?: string
  size?: number
  filename?: string
  height?: number
  width?: number
  [key: string]: unknown
}

export interface TranscriptMessage {
  id: string
  authorId: string
  authorName: string
  isBot: boolean
  timestamp: string
  content: string
  embeds?: TranscriptEmbed[]
  attachments?: TranscriptAttachment[]
}

export interface TicketsbotRawMessage {
  id: string | number
  author: string | number
  timestamp: string
  content?: string
  embeds?: TranscriptEmbed[]
  attachments?: TranscriptAttachment[]
}

export function parseTicketsbotTranscript(data: { messages: TicketsbotRawMessage[] }): TranscriptMessage[] {
  if (!data?.messages) return []

  return data.messages.map((msg) => ({
    id: String(msg.id),
    authorId: String(msg.author),
    authorName: String(msg.author),
    isBot: false, // Ticketsbot doesn't include bot flag
    timestamp: msg.timestamp,
    content: msg.content || '',
    embeds: msg.embeds || [],
    attachments: msg.attachments || []
  }))
}

export interface TicketToolRawMessage {
  id: string | number
  user_id: string
  username?: string
  nick?: string
  bot?: boolean
  created: string
  content?: string
  embeds?: TranscriptEmbed[]
  attachments?: TranscriptAttachment[]
}

export function parseTicketToolTranscript(messages: TicketToolRawMessage[]): TranscriptMessage[] {
  return messages.map((msg) => ({
    id: String(msg.id),
    authorId: msg.user_id,
    authorName: msg.username || msg.nick || 'Unknown',
    isBot: msg.bot || false,
    timestamp: msg.embeds?.[0]?.timestamp || new Date(msg.created).toISOString(),
    content: msg.content || '',
    embeds: msg.embeds || [],
    attachments: msg.attachments || []
  }))
}
