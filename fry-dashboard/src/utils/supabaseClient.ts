'use client'

import { createBrowserClient } from '@supabase/ssr'

const customFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  let url = input.toString();
  if (url.includes('/rest/v1/')) {
    const u = new URL(url);
    if (u.search) {
      const queryString = u.search.substring(1);
      u.search = '';
      url = u.toString();
      init = init || {};
      const headers = new Headers(init.headers || {});
      headers.set('X-PostgREST-Query', queryString);
      init.headers = headers;
    }
  }
  return fetch(url, init);
};

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    global: {
      fetch: customFetch as any,
    },
  }
)
