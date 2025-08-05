import { NextResponse } from 'next/server'
import { serviceSupabase as supabase } from '@/utils/supabase/serviceRole'

export async function POST(req: Request) {
  const { ticket_id } = await req.json()

  if (!ticket_id) {
    return NextResponse.json({ error: 'Missing ticket_id' }, { status: 400 })
  }

  const { data, error } = await supabase
    .schema('api')
    .from('ticketsbot_messages')
    .select('user_id, username, role, message, created_at')
    .eq('ticket_id', ticket_id)
    .order('created_at', { ascending: true })
    .range(0, 9999)

  if (error) {
    console.error('❌ Supabase error:', error.message)
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
  }

  return NextResponse.json({ messages: data })
}
