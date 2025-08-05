const fetch = require('node-fetch');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const userIds = [
  '1198345793430626354',
  '351920000224985099'
];

async function resolveUser(id) {
  const res = await fetch(`https://discord.com/api/users/${id}`, {
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`
    }
  });

  if (!res.ok) {
    console.error(`Failed to fetch ${id}: ${res.status}`);
    return null;
  }

  const user = await res.json();
  const avatar = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
    : `https://cdn.discordapp.com/embed/avatars/${Number(user.discriminator) % 5}.png`;

  return {
    id: user.id,
    username: user.username,
    avatar
  };
}

(async () => {
  for (const id of userIds) {
    const result = await resolveUser(id);
    if (result) {
      console.log(`${result.username}_AVATAR="${result.avatar}"`);
    }
  }
})();