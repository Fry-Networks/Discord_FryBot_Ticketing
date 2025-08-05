const { Routes, REST, SlashCommandBuilder } = require('discord.js');
const logger = require('../logger');

async function registerTicketCommands() {
    const commands = [
        new SlashCommandBuilder()
            .setName('setup-ticket-panel')
            .setDescription('Set up the ticket panel in a specified channel')
            .addChannelOption(option =>
                option.setName('channel')
                    .setDescription('The channel where the ticket panel will be posted')
                    .setRequired(true)
            )
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        logger.info('🛠️ Clearing old commands...');
        await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: [] });
        logger.info('✅ Old commands cleared.');

        logger.info('🚀 Registering ticket commands...');
        await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
        logger.info('✅ Ticket system commands registered successfully!');
    } catch (error) {
        logger.error('❌ Error registering ticket system commands:', error.message);
    }
}

module.exports = { registerTicketCommands };