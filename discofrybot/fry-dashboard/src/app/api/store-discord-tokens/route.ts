import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { type Database } from '@/types/supabase'
import { logger } from '@/utils/logger'

export async function POST(req: Request) {
  const supabase = await createClient<Database>()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    await logger.warn('Unauthorized token store attempt (no user)', 'store_tokens')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const maskedUserId = `***${user.id.slice(-6)}`
 
  const { access_token, refresh_token, expires_in } = await req.json()
  const expires_at = new Date(Date.now() + expires_in * 1000).toISOString()
  await logger.info(`Access Token: ***${access_token.slice(-6)}`, 'store_tokens')
  await logger.info(`Refresh Token: ***${refresh_token.slice(-6)}`, 'store_tokens')
  await logger.info(`Expires At: ${expires_at}`, 'store_tokens')
  await logger.info(`User ID: ${maskedUserId}`, 'store_tokens')

  const discordUserId = user.user_metadata?.provider_id as string | null; // Discord ID is in provider_id
  await logger.info(`Discord User ID: ${discordUserId}`, 'store_tokens');

  const maskedMetadata = { ...user.user_metadata }

  if (maskedMetadata.email) {
    const [local, domain] = maskedMetadata.email.split('@')
    const visible =
      local.length >= 3
        ? `${local[0]}***${local.slice(-2)}@${domain}`
        : `***@${domain}`
    maskedMetadata.email = visible
  }
  
  await logger.info(`User Metadata: ${JSON.stringify(maskedMetadata)}`, 'store_tokens')
    
  const { error } = await supabase
    .schema('api')  
    .from('user_tokens')
    .upsert({
      user_id: user.id,
      access_token,
      refresh_token,
      expires_at,
      discord_user_id: discordUserId // Store the Discord user ID
    })

    if (error) {
      const debugMessage = `Token store failed for user ${maskedUserId}: ${error.message}` +
        (error.details ? ` | Details: ${error.details}` : '') +
        (error.hint ? ` | Hint: ${error.hint}` : '')
        
      await logger.error(debugMessage, 'store_tokens')
      return NextResponse.json({ error: 'Insert failed', message: error.message, details: error.details, hint: error.hint }, { status: 500 })
    }
  
    await logger.info(`Stored Discord tokens for user ${maskedUserId}`, 'store_tokens')
    return NextResponse.json({ success: true })
}
