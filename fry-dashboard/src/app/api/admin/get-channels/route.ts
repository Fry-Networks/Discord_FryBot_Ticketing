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

    const allChannels = await response.json();

    // Filter for text channels (type 0) and category channels (type 4)
    const textChannels = allChannels.filter((channel: any) => channel.type === 0);
    const categoryChannels = allChannels.filter((channel: any) => channel.type === 4);

    // Map text channels to include parent_id and parent_name
    const mappedChannels = textChannels.map((channel: any) => {
      const parentCategory = categoryChannels.find((cat: any) => cat.id === channel.parent_id);
      return {
        id: channel.id,
        name: channel.name,
        parent_id: channel.parent_id || null,
        parent_name: parentCategory ? parentCategory.name : null,
      };
    });

    return NextResponse.json(mappedChannels);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error fetching channels' }, { status: 500 });
  }
}
