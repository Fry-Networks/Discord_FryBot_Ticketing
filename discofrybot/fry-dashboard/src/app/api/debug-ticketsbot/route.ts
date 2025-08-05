import { NextResponse } from 'next/server'
import { serviceSupabase as supabase } from '@/utils/supabase/serviceRole'

export async function GET() {
  const { data, count, error } = await supabase
    .schema('api')
    .from('tickets_ticketsbot')
    .select('id', { count: 'exact' })
    .range(0, 9999)

  if (error) {
    console.error('❌ Debug error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    returned: data?.length,
    total: count
  })
}
