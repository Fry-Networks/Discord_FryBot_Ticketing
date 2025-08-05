const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const config = require('../utils/config');
const logger = require('../utils/logger');
const supabaseHandler = require('./supabaseHandler');
const { getTicketActionRow } = require('../utils/ticketUtils');

/**
 * Handles the confirmation of the S/N picture for a node forgo/return ticket.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @param {string} ticketId - The ID of the ticket.
 */
async function handleConfirmSnPicture(interaction, ticketId) {
    // 🚫 Role restriction check
    if (!interaction.member.roles.cache.has(config.ticketModRoleId)) {
        return interaction.reply({
            content: '❌ You do not have permission to confirm pictures.',
            flags: MessageFlags.Ephemeral
        });
    }
    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }); // Defer the reply

        // Update ticket in Supabase
        await supabaseHandler.updateTicket(ticketId, { sn_picture_confirmed: true });
        logger.info(`Ticket ${ticketId} S/N picture confirmed by staff ${interaction.user.id}`);

        // Fetch the updated ticket information
        const updatedTicket = await supabaseHandler.getTicketById(ticketId);
        if (!updatedTicket) {
             logger.error(`Could not fetch updated ticket ${ticketId} after S/N picture confirmation.`);
             await interaction.editReply({ content: '⚠️ Failed to update ticket information after confirmation.', flags: MessageFlags.Ephemeral });
             return;
        }

        // Regenerate action rows with updated ticket info
        const updatedActionRows = getTicketActionRow(updatedTicket);

        // Edit the original message to update components
        const originalMessage = await interaction.channel.messages.fetch(updatedTicket.original_message_id);
        if (originalMessage) {
            await originalMessage.edit({ components: updatedActionRows });
            logger.info(`Updated action row message ${originalMessage.id} for ticket ${ticketId} after S/N picture confirmation.`);
        } else {
            logger.warn(`Original message ${updatedTicket.original_message_id} not found for ticket ${ticketId} to update components.`);
        }

        await interaction.editReply({ content: '✅ S/N picture validated.', flags: MessageFlags.Ephemeral });

    } catch (error) {
        logger.error(`Error handling S/N picture confirmation for ticket ${ticketId}: ${error.message}`, error);
        await interaction.editReply({
            content: '⚠️ An error occurred while confirming the S/N picture. Please try again later.',
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * Handles the confirmation of the factory reset picture for a node forgo/return ticket.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @param {string} ticketId - The ID of the ticket.
 */
async function handleConfirmFactoryResetPicture(interaction, ticketId) {
     // 🚫 Role restriction check
    if (!interaction.member.roles.cache.has(config.ticketModRoleId)) {
        return interaction.reply({
            content: '❌ You do not have permission to confirm pictures.',
            flags: MessageFlags.Ephemeral
        });
    }
    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }); // Defer the reply

        // Update ticket in Supabase
        await supabaseHandler.updateTicket(ticketId, { factory_reset_picture_confirmed: true });
        logger.info(`Ticket ${ticketId} factory reset picture confirmed by staff ${interaction.user.id}`);

        // Fetch the updated ticket information
        const updatedTicket = await supabaseHandler.getTicketById(ticketId);
         if (!updatedTicket) {
             logger.error(`Could not fetch updated ticket ${ticketId} after factory reset picture confirmation.`);
             await interaction.editReply({ content: '⚠️ Failed to update ticket information after confirmation.', flags: MessageFlags.Ephemeral });
             return;
        }

        // Regenerate action rows with updated ticket info
        const updatedActionRows = getTicketActionRow(updatedTicket);

        // Edit the original message to update components
        const originalMessage = await interaction.channel.messages.fetch(updatedTicket.original_message_id);
         if (originalMessage) {
            await originalMessage.edit({ components: updatedActionRows });
            logger.info(`Updated action row message ${originalMessage.id} for ticket ${ticketId} after factory reset picture confirmation.`);
        } else {
            logger.warn(`Original message ${updatedTicket.original_message_id} not found for ticket ${ticketId} to update components.`);
        }

        await interaction.editReply({ content: '✅ Factory reset picture validated.', flags: MessageFlags.Ephemeral });

    } catch (error) {
        logger.error(`Error handling factory reset picture confirmation for ticket ${ticketId}: ${error.message}`, error);
        await interaction.editReply({
            content: '⚠️ An error occurred while confirming the factory reset picture. Please try again later.',
            flags: MessageFlags.Ephemeral
        });
    }
}

module.exports = {
    handleConfirmSnPicture,
    handleConfirmFactoryResetPicture,
};
