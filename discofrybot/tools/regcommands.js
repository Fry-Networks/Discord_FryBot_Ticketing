const { REST, Routes } = require('discord.js');
require('dotenv').config();

const commands = [
    // Add a simple command for testing
    {
        name: 'setup-ticket-panel',
        description: 'Setup-ticket-panel'
    }
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Registering commands...');
        await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
        console.log('✅ Commands registered!');
    } catch (error) {
        console.error('❌ Error:', error);
    }
})();
