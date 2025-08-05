const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const checkBalances = require('../../balanceCheck');
const config = require('../utils/config'); // For staff role IDs
const logger = require('../utils/logger');

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName(config.checkBalCommand) // Use configurable command name
            .setDescription('Manually triggers the bot status and balance check.'),
        async execute(interaction) {
            // Defer the reply to give the bot time to process
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            // Check if the user has the required staff role
            const STAFF_ROLE_ID = config.staffRoleId;
            const INTERN_ROLE_ID = config.internRoleId;

            if (!interaction.member.roles.cache.has(STAFF_ROLE_ID) && !interaction.member.roles.cache.has(INTERN_ROLE_ID)) {
                return interaction.editReply({ content: "❌ You don't have permission to use this command." });
            }

            try {
                // Call the checkBalances function, passing the client from the interaction
                // The checkBalances function will send messages to the LOW_BAL_CHANNEL_ID
                await checkBalances(interaction.client);
                logger.info(`Manual balance check triggered by ${interaction.user.tag}`);
                await interaction.editReply({ content: '✅ Balance check triggered successfully. Results will be posted in the designated balance alert channel.' });
            } catch (error) {
                logger.error(`Error executing /${config.checkBalCommand} command: ${error.message}`, error);
                await interaction.editReply({ content: '⚠️ An unexpected error occurred while trying to trigger the balance check.' });
            }
        },
    },
    {
        data: new SlashCommandBuilder()
            .setName('setup-ticket-panel')
            .setDescription('Sets up the ticket panel message in a specified channel.')
            .setDefaultMemberPermissions(0) // Only administrators can use this command
            .addChannelOption(option =>
                option.setName('channel')
                    .setDescription('The channel where the ticket panel should be posted.')
                    .setRequired(true)
                    .addChannelTypes(0) // 0 is GuildText channel type
            ),
        async execute(interaction) {
            // This command's logic is handled in interactionHandler.js
            // This definition is primarily for registration.
            // The actual execution logic is in handleSlashCommand within interactionHandler.js
            // We just need to ensure it's defined here for registration.
        },
    },
];
