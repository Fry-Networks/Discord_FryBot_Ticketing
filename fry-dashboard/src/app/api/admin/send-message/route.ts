import { NextResponse } from 'next/server';
import { checkStaffRoleServerSide } from '@/utils/checkStaffRole';
import { createClient } from '@/utils/supabase/server';
import { serviceSupabase } from '@/utils/supabase/serviceRole';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isStaff = await checkStaffRoleServerSide(user.id);
  if (!isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: adminUser } = await serviceSupabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();

  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { channelId, message, replyToMessageId } = await request.json();

  if (!channelId || !message) {
    return NextResponse.json({ error: 'Missing channelId or message' }, { status: 400 });
  }

  try {
    const discordApiUrl = `https://discord.com/api/v10/channels/${channelId}/messages`;
    const body = {
      content: message,
      ...(replyToMessageId && { message_reference: { message_id: replyToMessageId } }),
    };

    const response = await fetch(discordApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error sending message to Discord:', errorData);
      throw new Error(`Error sending message: ${response.statusText}`);
    }

    // Log the announcement to the database
    await serviceSupabase.from('announcements').insert({
      channel_id: channelId,
      message,
      sent_by: user.id,
      reply_to_message_id: replyToMessageId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error sending message' }, { status: 500 });
  }
}
