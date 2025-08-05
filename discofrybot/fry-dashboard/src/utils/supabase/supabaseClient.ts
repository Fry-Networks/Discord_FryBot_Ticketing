// utils/supabaseClient.ts

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'

export function createClient<T = Database>() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'fallback_url'
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'fallback_key'
  
    return createBrowserClient<T>(url, key)
  }
  

