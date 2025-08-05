const { ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const config = require('../utils/config');
const logger = require('../utils/logger');
const supabaseHandler = require('./supabaseHandler');
const { getTicketActionRow } = require('../utils/ticketUtils'); // To update the message components

/**
 * Handles the "Waive Registration" button interaction.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @param {string} ticketId - The ID of the ticket.
 */
async function handleWaiveRegistrationButton(interaction, ticketId) {
    // Role restriction check (should also be done in interactionHandler, but good to have here too)
    if (!interaction.member.roles.cache.has(config.ticketModRoleId)) {
        return interaction.reply({
            content: '❌ You do not have permission to waive registration.',
            flags: MessageFlags.Ephemeral
        });
    }

    // Send confirmation message with buttons
    const confirmWaiveButton = new ButtonBuilder()
        .setCustomId(`confirm_waive_registration:yes:${ticketId}`)
        .setLabel('Yes, Waive Registration')
        .setStyle(ButtonStyle.Danger); // Danger style for a confirmation of a significant action

    const cancelWaiveButton = new ButtonBuilder()
        .setCustomId(`confirm_waive_registration:no:${ticketId}`)
        .setLabel('No, Cancel')
        .setStyle(ButtonStyle.Secondary);

    const confirmationRow = new ActionRowBuilder().addComponents(confirmWaiveButton, cancelWaiveButton);

    await interaction.reply({
        content: '⚠️ Are you sure you want to waive the registration for this ticket?',
        components: [confirmationRow],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * Handles the confirmation buttons for waiving registration.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @param {string} ticketId - The ID of the ticket.
 * @param {string} confirmation - 'yes' or 'no'.
 */
async function handleWaiveRegistrationConfirmation(interaction, ticketId, confirmation) {
    if (confirmation === 'yes') {
        try {
            // Update Supabase
            await supabaseHandler.updateTicket(ticketId, { registration_waived: true });
            logger.info(`Ticket ${ticketId} registration waived by staff ${interaction.user.id}`);

            // Fetch the original message to update its components
            // Assuming the confirmation interaction happened on the ephemeral message
            // We need to find the original ticket message. This might require fetching the channel and finding the relevant message.
            // For now, let's assume the original message is the one the button was on.
            // A more robust solution might involve storing the original message ID.
            // For this implementation, we'll rely on the interaction.message which is the ephemeral reply.
            // We need to get the message that *triggered* the ephemeral reply. This is not directly available.
            // A simpler approach for now is to refetch the ticket and update the message that contains the action row.
            // This assumes the action row is on the latest message in the channel or a specific pinned message.
            // Let's fetch the ticket and then the channel to find the message with the action row.

            const ticket = await supabaseHandler.getTicketById(ticketId);
            if (!ticket || !ticket.channel_id) {
                logger.error(`Could not fetch ticket ${ticketId} or channel_id after waiving registration.`);
                 await interaction.update({
                    content: '✅ Registration waived, but could not update the message. Please refresh the ticket channel.',
                    components: [],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const ticketChannel = interaction.client.channels.cache.get(ticket.channel_id);
            if (!ticketChannel) {
                 logger.error(`Could not find ticket channel ${ticket.channel_id} in cache for ticket ${ticketId}.`);
                  await interaction.update({
                    content: '✅ Registration waived, but could not update the message. Please refresh the ticket channel.',
                    components: [],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Fetch the original message using the original_message_id from the ticket
            let messageToUpdate;
            try {
                messageToUpdate = await ticketChannel.messages.fetch(ticket.original_message_id);
            } catch (fetchError) {
                logger.error(`Failed to fetch original message ${ticket.original_message_id} for ticket ${ticketId}: ${fetchError.message}`, fetchError);
                await interaction.update({
                    content: '✅ Registration waived, but could not update the message. Please refresh the ticket channel.',
                    components: [],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            if (messageToUpdate) {
                 // Get the updated action row (which will now show the static label)
                const updatedTicket = await supabaseHandler.getTicketById(ticketId); // Re-fetch to be sure
                 if (!updatedTicket) {
                     logger.error(`Could not fetch updated ticket ${ticketId} for message update.`);
                      await interaction.update({
                         content: '✅ Registration waived, but could not update the message. Please refresh the ticket channel.',
                         components: [],
                         flags: MessageFlags.Ephemeral
                     });
                 return;
             }

            // Add this logging line:
            logger.info(`[DEBUG] Ticket ${ticketId} validated status after waiving registration: ${updatedTicket.validated}`);
            // logger.debug('Original message components:', messageToUpdate.components);

            // Manually update the components to replace the "Waive Registration" button
            const updatedComponents = messageToUpdate.components.map(row => {
                if (row && Array.isArray(row.components)) { // Changed condition here
                    const newComponents = row.components.map(component => {
                        if (component.customId && component.customId.startsWith('waive_registration:')) {
                            // logger.debug('Replacing button with customId:', component.customId);
                            // Replace with disabled "Registration Waived" label
                            return new ButtonBuilder()
                                .setCustomId(`registration_waived_label:${ticketId}`)
                                .setLabel('✅ Registration Waived')
                                .setStyle(ButtonStyle.Success)
                                .setDisabled(true);
                        }
                        return component;
                    });
                    return new ActionRowBuilder().addComponents(newComponents);
                }
                return row;
            });

           // logger.debug('Attempting to edit message with new components.');
            // Edit the original message to replace the components
            await messageToUpdate.edit({ components: updatedComponents });
            logger.info(`Updated action row for ticket ${ticketId} after waiving registration.`);
            await interaction.update({
                content: '✅ Registration has been successfully waived.',
                components: [],
                flags: MessageFlags.Ephemeral
            });
            
            } else {
                 logger.warn(`Could not find message with action row (ID: ${ticket.original_message_id}) in channel ${ticket.channel_id} for ticket ${ticketId}.`);
                  await interaction.update({
                    content: '✅ Registration waived, but could not find the message to update. Please refresh the ticket channel.',
                    components: [],
                    flags: MessageFlags.Ephemeral
                });
            }


        } catch (error) {
            logger.error(`Error waiving registration for ticket ${ticketId}: ${error.message}`, error);
             await interaction.update({
                content: '⚠️ An error occurred while waiving registration. Please try again later.',
                components: [],
                flags: MessageFlags.Ephemeral
            });
        }
    } else { // confirmation === 'no'
        await interaction.update({
            content: '❌ Waive registration action cancelled.',
            components: [],
            flags: MessageFlags.Ephemeral
        });
    }
}

module.exports = {
    handleWaiveRegistrationButton,
    handleWaiveRegistrationConfirmation
};
