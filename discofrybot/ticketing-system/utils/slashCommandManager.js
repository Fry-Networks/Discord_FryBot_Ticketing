const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const logger = require('./logger'); // Assuming logger is available relative to this path
const slashCommands = require('../commands/slashCommands'); // Import the new slash commands

/**
 * Registers slash commands with Discord.
 * @param {string} clientId - The bot's client ID.
 * @param {string} guildId - The ID of the guild to register commands in.
 * @param {string} token - The bot's Discord token.
 */
async function registerSlashCommands(clientId, guildId, token) {
    const commands = slashCommands.map(cmd => cmd.data.toJSON()); // Use all commands from the imported slashCommands

    const rest = new REST({ version: '10' }).setToken(token);

    try {
        logger.info(`Started refreshing ${commands.length} application (/) commands for guild ${guildId}.`);

        // The put method is used to fully refresh all commands in the guild with the current set
        const data = await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands },
        );

        logger.info(`Successfully reloaded ${data.length} application (/) commands for guild ${guildId}.`);
    } catch (error) {
        logger.error(`Error reloading application (/) commands for guild ${guildId}: ${error.message}`, error);
    }
}

module.exports = {
    registerSlashCommands
};
