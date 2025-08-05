import { NextResponse } from 'next/server';
import { checkStaffRoleServerSide } from '@/utils/checkStaffRole';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isStaff = await checkStaffRoleServerSide(user.id);
  if (!isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const response = await fetch(`https://discord.com/api/v10/guilds/${process.env.DISCORD_GUILD_ID}/channels`, {
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Error fetching channels: ${response.statusText}`);
    }

    const channels = await response.json();
    const textChannels = channels.filter((channel: any) => channel.type === 0);

    return NextResponse.json(textChannels.map((channel: any) => ({ id: channel.id, name: channel.name })));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error fetching channels' }, { status: 500 });
  }
}
