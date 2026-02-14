// ticketing-system/modules/scheduleHandler.js
const logger = require('../utils/logger');
const supabaseHandler = require('../handlers/supabaseHandler'); // To be imported
const { ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, ButtonBuilder, ButtonStyle } = require('discord.js');
const { scheduleTicketDeletion } = require('./closeHandler'); // Import scheduleTicketDeletion
const config = require('../utils/config'); // Import config for closedTicketsCategoryId
const transcriptGenerator = require('../utils/transcriptGenerator'); // Import transcriptGenerator
const driveUploader = require('../utils/driveUploader'); // Import driveUploader
const supabase = require('../supabaseClient');
const { getTicketActionRow } = require('../utils/ticketUtils');

// Reason: keep debug logs helpful without dumping full ticket records.
function summarizeTicketData(ticketData) {
    if (!ticketData || typeof ticketData !== 'object') {
        return { hasTicketData: false };
    }
    return {
        id: ticketData.id,
        ticketType: ticketData.ticket_type,
        status: ticketData.status,
        channelId: ticketData.channel_id,
        originalMessageId: ticketData.original_message_id
    };
}

/**
 * Handles the "Schedule Close" button interaction.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @param {string} ticketId - The ID of the ticket to schedule closure for.
 */
async function handleScheduleCloseButton(interaction, ticketId) {
    try {
        // Permission check: Ensure user has the ticket moderator role
        if (!interaction.member.roles.cache.has(config.ticketModRoleId)) {
            return interaction.reply({
                content: '❌ You do not have permission to schedule ticket closures.',
                flags: MessageFlags.Ephemeral
            });
        }
        // Check if the user is the one who claimed the ticket (if claimed)
        const { data: ticket, error: fetchError } = await supabaseHandler.getTicketById(ticketId);
        if (fetchError || (ticket?.claimed_by && ticket.claimed_by !== interaction.user.id)) {
             if (fetchError) logger.error(`Error fetching ticket ${ticketId} for schedule permission check: ${fetchError.message}`, fetchError);
             return interaction.reply({
                 content: '❌ You can only schedule closure for tickets you have claimed.',
                 flags: MessageFlags.Ephemeral
             });
        }

        // Store the original category ID before presenting options
        const originalCategoryId = interaction.channel.parentId;
        if (originalCategoryId) {
            // Assuming 'original_category_id' column exists in 'tickets' table
            await supabaseHandler.updateTicket(ticketId, { original_category_id: originalCategoryId });
            logger.info(`Stored original category ID ${originalCategoryId} for ticket ${ticketId}`);
        } else {
            logger.warn(`Could not get original category ID for ticket ${ticketId}. Cannot store for cancellation.`);
        }

        // Present timer options and prompt for transcript preference
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`schedule_close_timer_select_${ticketId}`)
            .setPlaceholder('Select a closure time...')
            .addOptions([
                { label: '1 Minute (Test)', value: '1m', description: 'Close in 1 minute (for testing)' },
                { label: '12 Hours', value: '12h', description: 'Close in 12 hours' },
                { label: '24 Hours', value: '24h', description: 'Close in 24 hours' },
                { label: '48 Hours', value: '48h', description: 'Close in 48 hours' },
            ]);

        const timerRow = new ActionRowBuilder().addComponents(selectMenu);

        // Also prompt for transcript preference via a modal after timer selection
        // Or, could include it in the initial interaction reply with buttons/selects?
        // Let's use a modal after timer selection for simplicity for now.

        await interaction.reply({
            content: '⏳ Select a time to schedule the ticket closure:',
            components: [timerRow],
            flags: MessageFlags.Ephemeral,
        });

    } catch (error) {
        logger.error(`Error handling schedule_close_ticket button for ticket ${ticketId}: ${error.message}`, error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '⚠️ An error occurred while preparing to schedule the ticket closure.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
}

/**
 * Handles the timer selection for scheduling a ticket closure.
 * @param {import('discord.js').StringSelectMenuInteraction} interaction - The select menu interaction.
 */
async function handleScheduleTimerSelect(interaction) {
    // Permission check: Ensure user has the ticket moderator role
    if (!interaction.member.roles.cache.has(config.ticketModRoleId)) {
       return interaction.reply({
           content: '❌ You do not have permission to schedule ticket closures.',
           flags: MessageFlags.Ephemeral
       });
   }
    // Check if the user is the one who claimed the ticket (if claimed)
    const customIdParts = interaction.customId.split('_');
    const ticketId = customIdParts[customIdParts.length - 1]; // Extract ticketId
    const { data: ticket, error: fetchError } = await supabaseHandler.getTicketById(ticketId);
    if (fetchError || (ticket?.claimed_by && ticket.claimed_by !== interaction.user.id)) {
         if (fetchError) logger.error(`Error fetching ticket ${ticketId} for schedule timer permission check: ${fetchError.message}`, fetchError);
         return interaction.reply({
             content: '❌ You can only schedule closure for tickets you have claimed.',
             flags: MessageFlags.Ephemeral
         });
    }


    const selectedTime = interaction.values[0]; // e.g., '1m', '12h'

    // Send ephemeral message with transcript preference buttons
    const dmButton = new ButtonBuilder()
        .setCustomId(`schedule_transcript_pref_dm:${ticketId}:${selectedTime}`) // Include ticketId and selectedTime
        .setLabel('DM Transcript')
        .setStyle(ButtonStyle.Primary);

    const postButton = new ButtonBuilder()
        .setCustomId(`schedule_transcript_pref_post:${ticketId}:${selectedTime}`) // Include ticketId and selectedTime
        .setLabel('Post Transcript')
        .setStyle(ButtonStyle.Primary);

    const noneButton = new ButtonBuilder()
        .setCustomId(`schedule_transcript_pref_none:${ticketId}:${selectedTime}`) // Include ticketId and selectedTime
        .setLabel('No Transcript')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(dmButton, postButton, noneButton);

    await interaction.update({ // Use update to modify the ephemeral select menu message
        content: 'How would you like to receive the ticket transcript?',
        components: [row],
    });
}


/**
 * Handles the transcript preference selected by the user for a scheduled closure.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 */
async function handleScheduledTranscriptPreferenceButton(interaction) {
    logger.info(`[DEBUG] Entered handleScheduledTranscriptPreferenceButton for interaction ${interaction.id}`);
    const customIdParts = interaction.customId.split(':');
    // Custom ID format: schedule_transcript_pref_[preference]:[ticketId]:[selectedTime]
    const transcriptPreference = customIdParts[0].replace('schedule_transcript_pref_', ''); // Extract preference ('dm', 'post', or 'none')
    const ticketId = customIdParts[1]; // Extract ticketId
    const selectedTime = customIdParts[2]; // Extract selectedTime

    logger.info(`[DEBUG] transcriptPreference=${transcriptPreference}, ticketId=${ticketId}, selectedTime=${selectedTime}`);

    // Re-check permissions on button click for security
    if (!interaction.member.roles.cache.has(config.ticketModRoleId)) {
        logger.info('[DEBUG] Permission denied: missing ticketModRoleId');
       return interaction.reply({
           content: '❌ You do not have permission to schedule ticket closures.',
           flags: MessageFlags.Ephemeral
       });
   }
   // Check if the user is the one who claimed the ticket (if claimed)
   const { data: ticket, error: fetchError } = await supabaseHandler.getTicketById(ticketId);
   if (fetchError || (ticket?.claimed_by && ticket.claimed_by !== interaction.user.id)) {
        if (fetchError) logger.error(`Error fetching ticket ${ticketId} for scheduled preference permission check: ${fetchError.message}`, fetchError);
        logger.info(`[DEBUG] Permission denied: claimed_by check failed or fetchError=${fetchError?.message}`);
        return interaction.reply({
            content: '❌ You can only schedule closure for tickets you have claimed.',
            flags: MessageFlags.Ephemeral
        });
   }
   logger.info(`[DEBUG] Permission checks passed for ticketId=${ticketId}`);

   await interaction.update({ content: `Processing scheduled ticket closure for ticket ${ticketId} in ${selectedTime}...`, components: [] }); // Update the ephemeral message and remove buttons

   // Convert selected time to milliseconds
   let delayMs;
   switch (selectedTime) {
       case '1m': delayMs = 60 * 1000; break;
       case '12h': delayMs = 12 * 60 * 60 * 1000; break;
       case '24h': delayMs = 24 * 60 * 60 * 1000; break;
       case '48h': delayMs = 48 * 60 * 60 * 1000; break;
       default:
           logger.error(`Invalid scheduled time received in preference button: ${selectedTime}`);
           await interaction.followUp({ content: '⚠️ An internal error occurred with the selected time.', flags: MessageFlags.Ephemeral });
           return;
   }

   const scheduledCloseAt = new Date(Date.now() + delayMs).toISOString();

   try {
       // Update the ticket in Supabase with the scheduled close time and transcript preference
       const { data, error } = await supabaseHandler.updateTicket(ticketId, {
           scheduled_close_at: scheduledCloseAt,
           transcript_preference: transcriptPreference
       });

       if (error) {
           logger.error(`Error updating ticket ${ticketId} with scheduled close time from preference button: ${error.message}`, error);
           await interaction.followUp({ content: '⚠️ An error occurred while saving the schedule to the database.', flags: MessageFlags.Ephemeral });
           return;
       }
        // Reason: verify update without dumping full ticket payload fields into runtime logs.
        const fetchTest = await supabase
            .from('tickets')
            .select('id, ticket_type, status, channel_id, original_message_id')
            .eq('id', ticketId)
            .maybeSingle();
        logger.info(`[DEBUG] Post-update fetch summary:`, summarizeTicketData(fetchTest?.data));
       logger.info(`Ticket ${ticketId} scheduled to close at ${scheduledCloseAt} with preference ${transcriptPreference} via preference button.`);

       // Fetch the channel object and move it to the closed category
       const channel = await interaction.client.channels.fetch(interaction.channelId);
       if (channel && channel.manageable && config.closedTicketsCategoryId) {
           await channel.setParent(config.closedTicketsCategoryId, { lockPermissions: false });
           logger.info(`Moved ticket channel ${channel.id} to closed category ${config.closedTicketsCategoryId} after scheduling closure.`);
       } else {
           logger.warn(`Could not move ticket channel ${interaction.channelId} to closed category after scheduling closure.`);
       }

       await interaction.followUp({ content: `✅ Ticket ${ticketId} is scheduled to close in ${selectedTime}. A background process will handle the closure at the scheduled time.`, flags: MessageFlags.Ephemeral });

       // Add Cancel and Re-schedule buttons to the original message
       const cancelScheduleButton = new ButtonBuilder()
           .setCustomId(`cancel_schedule_ticket:${ticketId}`)
           .setLabel('Cancel Schedule')
           .setStyle(ButtonStyle.Danger);

       const rescheduleButton = new ButtonBuilder()
           .setCustomId(`reschedule_ticket:${ticketId}`)
           .setLabel('Re-schedule')
           .setStyle(ButtonStyle.Secondary);

       const actionRow = new ActionRowBuilder().addComponents(cancelScheduleButton, rescheduleButton);

       // Fetch the ticket again to get the original message ID
       const ticketData = await supabaseHandler.getTicketById(ticketId);
       // Reason: avoid logging full ticket records during schedule debug flow.
       logger.info(`[DEBUG] ticketData for message update:`, summarizeTicketData(ticketData));

       if (!ticketData?.original_message_id) {
           logger.warn(`Could not fetch ticket ${ticketId} or original message ID for adding Cancel/Re-schedule buttons: ${fetchError?.message || 'ID not found'}`);
           // Proceed without adding buttons if message ID is not available
       } else {
           try {
            logger.info(`[DEBUG] Attempting to fetch original message: messageId=${ticketData.original_message_id} in channel=${interaction.channel.id} (ticket channel=${ticketData.channel_id})`);
               const originalMessage = await interaction.channel.messages.fetch(ticketData.original_message_id);
               await originalMessage.edit({ components: [actionRow] });
               logger.info(`Added Cancel/Re-schedule buttons to original ticket action row message ${ticketData.original_message_id} in channel ${interaction.channelId}.`);
           } catch (messageFetchError) {
               logger.warn(`Could not fetch or edit original message ${ticketData.original_message_id} in channel ${interaction.channelId}: ${messageFetchError.message}`);
           }
       }

   } catch (error) {
       logger.error(`Error in handleScheduledTranscriptPreferenceButton for ticket ${ticketId}: ${error.message}`, error);
       await interaction.followUp({ content: '⚠️ An unexpected error occurred during scheduling.', flags: MessageFlags.Ephemeral });
   }
}


/**
 * Cancels a scheduled ticket closure.
 * @param {string} ticketId - The ID of the ticket to cancel the scheduled closure for.
 * @returns {Promise<boolean>} True if a scheduled closure was found and cancelled, false otherwise.
 */
async function cancelScheduledClosure(ticketId) {
    try {
        // Clear the scheduled_close_at timestamp in the database
        const { data, error } = await supabaseHandler.updateTicket(ticketId, {
            scheduled_close_at: null,
            transcript_preference: null // Clear preference as well
        });

        if (error) {
            logger.error(`Error clearing scheduled_close_at for ticket ${ticketId}: ${error.message}`, error);
            return false;
        }

        // Check if the ticket actually had a scheduled time before
        // This requires fetching the ticket first, or relying on the update result
        // For simplicity, we'll assume the update succeeded means it was cancelled if it existed.
        logger.info(`Cancelled scheduled closure for ticket ${ticketId} in database.`);
        return true; // Assuming the update operation indicates success
    } catch (error) {
        logger.error(`Error in cancelScheduledClosure for ticket ${ticketId}: ${error.message}`, error);
        return false;
    }
}

/**
 * Handles the "Cancel Schedule" button interaction.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @param {string} ticketId - The ID of the ticket to cancel the schedule for.
 */
async function handleCancelScheduleButton(interaction, ticketId) {
    try {
        // Defer the interaction immediately
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Permission check: Ensure user has the ticket moderator role
        if (!interaction.member.roles.cache.has(config.ticketModRoleId)) {
            return interaction.editReply({ // Use editReply after deferring
                content: '❌ You do not have permission to cancel scheduled closures.',
                // flags: MessageFlags.Ephemeral // flags are set by deferReply
            });
        }
        // Check if the user is the one who scheduled the ticket (if scheduled by a user)
        const { data: ticket, error: fetchError } = await supabaseHandler.getTicketById(ticketId);
        if (fetchError || (ticket?.claimed_by && ticket.claimed_by !== interaction.user.id)) {
            if (fetchError) logger.error(`Error fetching ticket ${ticketId} for cancel schedule permission check: ${fetchError.message}`, fetchError);
            return interaction.editReply({ // Use editReply after deferring
                content: '❌ You can only cancel scheduled closure for tickets you have claimed.',
                // flags: MessageFlags.Ephemeral // flags are set by deferReply
            });
        }

        // Cancel the scheduled closure in the database FIRST
        const wasCancelled = await cancelScheduledClosure(ticketId);

        if (wasCancelled) {
            // Fetch the ticket again to get the original message ID and claim status
            const ticketData = await supabaseHandler.getTicketById(ticketId);
            logger.info(`[DEBUG] interaction.channel.id=${interaction.channel.id}, ticketData.channel_id=${ticketData.channel_id}, original_message_id=${ticketData.original_message_id}`);

            // Attempt to restore the original button row on the action message (visible to everyone)
            if (ticketData?.original_message_id && ticketData?.channel_id) {
                try {
                    // Always fetch the channel by ID (most reliable)
                    const channel = await interaction.client.channels.fetch(ticketData.channel_id);
                    if (channel && channel.isTextBased()) {
                        try {
                            const originalMessage = await channel.messages.fetch(ticketData.original_message_id);
                            // Reason: avoid logging full ticket records during action row restoration.
                            logger.info(`[DEBUG] Calling getTicketActionRow with ticketData in handleCancelScheduleButton:`, summarizeTicketData(ticketData));
                            await originalMessage.edit({
                                content: 'Staff Actions:',
                                components: getTicketActionRow(ticketData), // Pass the full ticketData object
                            });
                            logger.info(`Restored action row on ticket ${ticketId} after canceling schedule.`);
                        } catch (messageFetchOrEditError) {
                            logger.warn(`Could not fetch or edit original message ${ticketData.original_message_id} in channel ${ticketData.channel_id} for ticket ${ticketId}: ${messageFetchOrEditError.message}`);
                            // Inform user ephemerally that message couldn't be updated
                            await interaction.followUp({
                                content: `⚠️ Scheduled closure for ticket ${ticketId} has been cancelled in the database, but the original action message could not be updated.`,
                                flags: MessageFlags.Ephemeral,
                            }).catch(e => logger.error('Failed to send followup about message update failure', e));
                        }
                    } else {
                         logger.warn(`Could not fetch channel ${ticketData.channel_id} for ticket ${ticketId} to restore action row.`);
                         // Inform user ephemerally that message couldn't be updated
                         await interaction.followUp({
                            content: `⚠️ Scheduled closure for ticket ${ticketId} has been cancelled in the database, but the original action message could not be updated (channel not found).`,
                            flags: MessageFlags.Ephemeral,
                        }).catch(e => logger.error('Failed to send followup about channel not found', e));
                    }
                } catch (channelFetchError) {
                    logger.warn(`Could not fetch channel ${ticketData.channel_id} for ticket ${ticketId} to restore action row: ${channelFetchError.message}`);
                    // Inform user ephemerally that message couldn't be updated
                    await interaction.followUp({
                        content: `⚠️ Scheduled closure for ticket ${ticketId} has been cancelled in the database, but the original action message could not be updated (channel fetch error).`,
                        flags: MessageFlags.Ephemeral,
                    }).catch(e => logger.error('Failed to send followup about channel fetch error', e));
                }
            } else {
                 logger.warn(`Original message ID or channel ID not found for ticket ${ticketId}. Cannot restore action row.`);
                 // Inform user ephemerally that message couldn't be updated
                 await interaction.followUp({
                    content: `⚠️ Scheduled closure for ticket ${ticketId} has been cancelled in the database, but the original action message could not be updated (message/channel ID missing).`,
                    flags: MessageFlags.Ephemeral,
                }).catch(e => logger.error('Failed to send followup about missing IDs', e));
            }


            // Only show cancellation confirmation to staff (ephemeral)
            // Use editReply for the final confirmation after deferring
            await interaction.editReply({
                content: `❌ Scheduled closure for ticket ${ticketId} has been cancelled.`,
                components: [],
                // flags: MessageFlags.Ephemeral, // flags are set by deferReply
            });

            logger.info(`Scheduled closure for ticket ${ticketId} cancelled by ${interaction.user.username} (${interaction.user.id})`);
        } else {
            // If wasCancelled is false, it means no active schedule was found in the DB
            // Use editReply after deferring
            await interaction.editReply({
                content: `⚠️ No active scheduled closure found for ticket ${ticketId}.`,
                components: [],
                // flags: MessageFlags.Ephemeral, // flags are set by deferReply
            });
        }
    } catch (error) {
        logger.error(`Error handling cancel_schedule button for ticket ${ticketId}: ${error.message}`, error);
        // Ensure a reply is sent even if a general error occurs
        // Use editReply after deferring
        await interaction.editReply({ content: '⚠️ An error occurred while trying to cancel the schedule.' });
    }
}



/**
 * Handles the "Re-schedule" button interaction.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @param {string} ticketId - The ID of the ticket to re-schedule.
 */
async function handleRescheduleButton(interaction, ticketId) {
    try {
        // Permission check: Ensure user has the ticket moderator role
        if (!interaction.member.roles.cache.has(config.ticketModRoleId)) {
            return interaction.reply({
                content: '❌ You do not have permission to re-schedule ticket closures.',
                flags: MessageFlags.Ephemeral
            });
        }
        // Check if the user is the one who scheduled the ticket (if scheduled by a user)
        const { data: ticket, error: fetchError } = await supabaseHandler.getTicketById(ticketId);
        if (fetchError || (ticket?.claimed_by && ticket.claimed_by !== interaction.user.id)) { // Assuming claimed_by is set when scheduled by a user
             if (fetchError) logger.error(`Error fetching ticket ${ticketId} for reschedule permission check: ${fetchError.message}`, fetchError);
             return interaction.reply({
                 content: '❌ You can only re-schedule tickets you have claimed.',
                 flags: MessageFlags.Ephemeral
             });
        }

        // Cancel any existing schedule first in the database
        await cancelScheduledClosure(ticketId);

        // Re-trigger the schedule flow
        await interaction.update({
            content: `⏳ Re-scheduling ticket closure for ticket ${ticketId}...`,
            components: [], // Remove old buttons
        });

        // Call the initial schedule handler to prompt for new time/preference
      //  await handleScheduleCloseButton(interaction, ticketId);
      // Instead, create a new message for the dropdown:
            const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`schedule_close_timer_select_${ticketId}`)
            .setPlaceholder('Select a closure time...')
            .addOptions([
                { label: '1 Minute (Test)', value: '1m', description: 'Close in 1 minute (for testing)' },
                { label: '12 Hours', value: '12h', description: 'Close in 12 hours' },
                { label: '24 Hours', value: '24h', description: 'Close in 24 hours' },
                { label: '48 Hours', value: '48h', description: 'Close in 48 hours' },
            ]);
            const timerRow = new ActionRowBuilder().addComponents(selectMenu);

            await interaction.followUp({
            content: '⏳ Select a time to schedule the ticket closure:',
            components: [timerRow],
            flags: MessageFlags.Ephemeral,
            });  
        logger.info(`Scheduled closure for ticket ${ticketId} re-triggered by ${interaction.user.username} (${interaction.user.id})`);

    } catch (error) {
        logger.error(`Error handling reschedule_ticket button for ticket ${ticketId}: ${error.message}`, error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '⚠️ An error occurred while trying to re-schedule.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
}


module.exports = {
    handleScheduleCloseButton,
    handleScheduleTimerSelect,
    handleScheduledTranscriptPreferenceButton, // Export the new handler
    cancelScheduledClosure,
    handleCancelScheduleButton,
    handleRescheduleButton,
};
