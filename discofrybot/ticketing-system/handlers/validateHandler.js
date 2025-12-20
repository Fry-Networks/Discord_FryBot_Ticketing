const supabase = require('../supabaseClient');
const supabaseHandler = require('./supabaseHandler');
const logger = require('../utils/logger');
const { getTicketActionRow } = require('../utils/ticketUtils');
const { MessageFlags } = require('discord.js');

/**
 * Handles the "Validate" button interaction for Node Forgo tickets.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @param {string} ticketId - The ID of the ticket.
 */
async function handleValidateButton(interaction, ticketId) {
    let currentTicketId = ticketId;

    // If ticketId is missing from the button custom ID, try to get it from the channel name
    if (!currentTicketId) {
        const channelName = interaction.channel?.name;
        if (channelName) {
            const match = channelName.match(/^(?:ticket|closed)-(\d+)-|^(\d+)-/); // Updated regex
            const parsedTicketId = match ? (match[1] || match[2]) : null; // Extract from either group

            if (parsedTicketId) {
                currentTicketId = parsedTicketId;
                logger.info(`Parsed ticketId ${currentTicketId} from channel name ${channelName} for validate.`);
            } else {
                logger.warn(`Could not parse ticketId from channel name ${channelName} for validate.`);
            }
        }
    }

    if (!currentTicketId) {
        logger.warn(`handleValidateButton called with undefined or unparsable ticketId for interaction ${interaction.id}. Button customId: ${interaction.customId}, ChannelName: ${interaction.channel?.name}`);
        return interaction.reply({
            content: '⚠️ This button is from an older ticket format, and the ticket ID could not be determined from the channel name. Some button functionality might be limited. You can still manage this ticket via the dashboard or create a new ticket if needed.',
            flags: MessageFlags.Ephemeral
        });
    }

    const staffId = interaction.user.id;
    const staffUsername = interaction.user.username;

    try {
        // Update Supabase tickets table
        const { data: updatedTicket, error: updateError } = await supabase
            .from('tickets')
            .update({
                validated: true,
                validated_by: staffUsername
            })
            .eq('id', ticketId)
            .select() // Select the updated row to get the latest ticket data
            .single();

        if (updateError) {
            logger.error(`Failed to update ticket ${ticketId} as validated: ${updateError.message}`);
            await interaction.reply({
                content: '⚠️ An error occurred while validating the ticket.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // 3. Log action to staff_actions table
        const { error: logError } = await supabase
            .from('staff_actions')
            .insert({
                ticket_id: ticketId,
                staff_id: staffId,
                action: `${staffUsername} validated the ticket.`,
                timestamp: new Date().toISOString(),
            });

        if (logError) {
            logger.error(`Failed to log staff validation action for ticket ${ticketId}: ${logError.message}`);
            // Continue execution even if logging fails
        }

        // 4. Update the original message to disable the button
        const channel = await interaction.client.channels.fetch(updatedTicket.channel_id);
        if (channel && updatedTicket.original_message_id) {
            try {
                const originalMessage = await channel.messages.fetch(updatedTicket.original_message_id);
                // Use the updatedTicket object to get the latest state for button rendering
                await originalMessage.edit({
                    components: getTicketActionRow(updatedTicket), // Pass the array directly
                });
                logger.info(`Updated action row for ticket ${ticketId} after validation.`);
            } catch (err) {
                logger.warn(`Could not update action row for ticket ${ticketId} after validation: ${err.message}`);
            }
        } else {
             logger.warn(`Could not fetch channel or original message ID for ticket ${ticketId} to update action row after validation.`);
        }


        // 5. Send ephemeral confirmation message
        await interaction.reply({
            content: `✅ Ticket \`${ticketId}\` has been validated by ${staffUsername}.`,
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        logger.error(`Exception in handleValidateButton for ticket ${ticketId}, staff ${staffId}: ${error.message}`, error);
        if (!interaction.replied && !interaction.deferred) {
             await interaction.reply({
                content: '⚠️ An unexpected error occurred while validating the ticket.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
}

/**
 * Handles the "Unvalidate" button interaction for Node Forgo tickets.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @param {string} ticketId - The ID of the ticket.
 */
async function handleUnvalidateButton(interaction, ticketId) {
    let currentTicketId = ticketId;

    // If ticketId is missing from the button custom ID, try to get it from the channel name
    if (!currentTicketId) {
        const channelName = interaction.channel?.name;
        if (channelName) {
            const match = channelName.match(/^(?:ticket|closed)-(\d+)-|^(\d+)-/); // Updated regex
            const parsedTicketId = match ? (match[1] || match[2]) : null; // Extract from either group

            if (parsedTicketId) {
                currentTicketId = parsedTicketId;
                logger.info(`Parsed ticketId ${currentTicketId} from channel name ${channelName} for unvalidate.`);
            } else {
                logger.warn(`Could not parse ticketId from channel name ${channelName} for unvalidate.`);
            }
        }
    }

    if (!currentTicketId) {
        logger.warn(`handleUnvalidateButton called with undefined or unparsable ticketId for interaction ${interaction.id}. Button customId: ${interaction.customId}, ChannelName: ${interaction.channel?.name}`);
        return interaction.reply({
            content: '⚠️ This button is from an older ticket format, and the ticket ID could not be determined from the channel name. Some button functionality might be limited. You can still manage this ticket via the dashboard or create a new ticket if needed.',
            flags: MessageFlags.Ephemeral
        });
    }

    const staffId = interaction.user.id;
    const staffUsername = interaction.user.username;

    try {
        // Update Supabase tickets table
        const { data: updatedTicket, error: updateError } = await supabase
            .from('tickets')
            .update({
                validated: false,
                validated_by: null // Clear the validated_by field
            })
            .eq('id', ticketId)
            .select() // Select the updated row to get the latest ticket data
            .single();

        if (updateError) {
            logger.error(`Failed to update ticket ${ticketId} as unvalidated: ${updateError.message}`);
            await interaction.reply({
                content: '⚠️ An error occurred while unvalidating the ticket.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Log action to staff_actions table
        const { error: logError } = await supabase
            .from('staff_actions')
            .insert({
                ticket_id: ticketId,
                staff_id: staffId,
                action: `${staffUsername} unvalidated the ticket.`,
                timestamp: new Date().toISOString(),
            });

        if (logError) {
            logger.error(`Failed to log staff unvalidation action for ticket ${ticketId}: ${logError.message}`);
            // Continue execution even if logging fails
        }

        // Update the original message to re-enable the validate button and remove checkmark
        const channel = await interaction.client.channels.fetch(updatedTicket.channel_id);
        if (channel && updatedTicket.original_message_id) {
            try {
                const originalMessage = await channel.messages.fetch(updatedTicket.original_message_id);
                // Use the updatedTicket object to get the latest state for button rendering
                await originalMessage.edit({
                    components: getTicketActionRow(updatedTicket), // Pass the array directly
                });
                logger.info(`Updated action row for ticket ${ticketId} after unvalidation.`);
            } catch (err) {
                logger.warn(`Could not update action row for ticket ${ticketId} after unvalidation: ${err.message}`);
            }
        } else {
             logger.warn(`Could not fetch channel or original message ID for ticket ${ticketId} to update action row after unvalidation.`);
        }


        // Send ephemeral confirmation message
        await interaction.reply({
            content: `❌ Ticket \`${ticketId}\` has been unvalidated by ${staffUsername}.`,
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        logger.error(`Exception in handleUnvalidateButton for ticket ${ticketId}, staff ${staffId}: ${error.message}`, error);
        if (!interaction.replied && !interaction.deferred) {
             await interaction.reply({
                content: '⚠️ An unexpected error occurred while unvalidating the ticket.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
}


module.exports = {
    handleValidateButton,
    handleUnvalidateButton, // Export the new handler
};
