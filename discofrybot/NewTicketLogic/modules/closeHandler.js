// NewTicketLogic/modules/closeHandler.js
const logger = require('../utils/logger');
const transcriptGenerator = require('../utils/transcriptGenerator'); // To be imported
const driveUploader = require('../utils/driveUploader'); // To be imported
const supabaseHandler = require('../handlers/supabaseHandler'); // To be imported
const { ModalBuilder, TextInputStyle, TextInputBuilder, ActionRowBuilder, ButtonStyle, ButtonBuilder, MessageFlags } = require('discord.js');
const config = require('../utils/config');

// Map to store auto-delete timeouts, keyed by channel ID
const autoDeleteTimeouts = new Map();

/**
 * Handles the "Close Ticket Now" button interaction.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @param {string} ticketId - The ID of the ticket to close.
 */
async function handleCloseNowButton(interaction, ticketId) {
    logger.info(`[DEBUG] handleCloseNowButton received ticketId: ${ticketId}`);
    try {
        // Defer the reply immediately to prevent "Unknown interaction" errors
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        if (!ticketId) {
            logger.warn(`handleCloseNowButton called with undefined ticketId for interaction ${interaction.id}. Button customId: ${interaction.customId}`);
            return interaction.editReply({
                content: '⚠️ This ticket button seems to be from an older ticket format and cannot be processed. Please create a new ticket if you still require assistance.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Send ephemeral message with transcript preference buttons
        const dmButton = new ButtonBuilder()
            .setCustomId(`transcript_pref_dm:${ticketId}`)
            .setLabel('DM Transcript')
            .setStyle(ButtonStyle.Primary);

        const postButton = new ButtonBuilder()
            .setCustomId(`transcript_pref_post:${ticketId}`)
            .setLabel('Post Transcript')
            .setStyle(ButtonStyle.Primary);

        const noneButton = new ButtonBuilder()
            .setCustomId(`transcript_pref_none:${ticketId}`)
            .setLabel('No Transcript')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(dmButton, postButton, noneButton);

        await interaction.editReply({
            content: 'How would you like to receive the ticket transcript?',
            components: [row],
            flags: MessageFlags.Ephemeral
        });

        // Log the ticket closure initiation
        await supabaseHandler.logBotActivity('info', 'ticket_closure', `User ${interaction.user.username} (${interaction.user.id}) initiated closure for ticket ${ticketId}`);

    } catch (error) {
        logger.error(`Error handling close_ticket_now button for ticket ${ticketId}: ${error.message}`, error);
        if (interaction.deferred || interaction.replied) { // Check if deferred or replied
            await interaction.editReply({ // Use editReply if already deferred/replied
                content: '⚠️ An error occurred while preparing to close the ticket.',
                flags: MessageFlags.Ephemeral
            });
        } else {
            await interaction.reply({ // Otherwise, use reply
                content: '⚠️ An error occurred while preparing to close the ticket.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
}

/**
 * Processes the transcript preference selected by the user and closes the ticket.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @param {string} ticketId - The ID of the ticket to close.
 * @param {string} channelId - The ID of the ticket channel.
 * @param {string} userId - The ID of the user triggering the closure (or 'SYSTEM').
 * @param {string} username - The username of the user triggering the closure (or 'SYSTEM').
 * @param {'dm' | 'post' | 'none'} transcriptPreference - The user's transcript preference.
 * @param {import('discord.js').ButtonInteraction | null} [interaction=null] - The interaction object if triggered by a user interaction.
 */
async function processTranscriptPreference(client, ticketId, channelId, userId, username, transcriptPreference, interaction = null) {
    // This function can be called by an interaction handler or a background process.
    // If interaction is provided, handle interaction-specific responses.
   // const userMention = userId ? `<@${userId}>` : (ticketData?.user_id ? `<@${ticketData.user_id}>` : '');

    if (interaction) {
   await interaction.update({ content: 'Processing ticket closure...', components: [] }); // Update the ephemeral message and remove buttons
    } else {
        // Log for background process triggers
        logger.info(`Processing scheduled ticket closure for ticket ${ticketId} in channel ${channelId} triggered by ${username} (${userId}).`);
    }


    try {
        // Fetch the channel object
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            logger.error(`Channel ${channelId} not found for ticket ${ticketId}. Cannot proceed with closure.`);
            // TODO: Handle this case - maybe update ticket status to indicate closure failed?
            if (interaction) {
                 await interaction.followUp({ content: '⚠️ Could not find the ticket channel. Closure failed.', flags: MessageFlags.Ephemeral });
            }
            return; // Stop execution if channel is not found
        }

        // Check if a transcript already exists for this ticket using the is_transcribed flag
        let ticketData;
        try {
            ticketData = await supabaseHandler.getTicketById(ticketId);
            if (!ticketData) {
                logger.error(`Ticket ${ticketId} not found in getTicketById. Cannot proceed with closure.`);
                if (interaction) {
                    await interaction.followUp({ content: '⚠️ Ticket data not found. Closure failed.', flags: MessageFlags.Ephemeral });
                }
                return;
            }
        } catch (err) {
            logger.error(`Error fetching ticket ${ticketId} for transcript check: ${err.message}`, err);
            if (interaction) {
                await interaction.followUp({ content: '⚠️ Error fetching ticket data. Closure failed.', flags: MessageFlags.Ephemeral });
            }
            return;
        }

        // Use the original ticket creator's ID and username for pings and DMs
        const originalTicketCreatorId = ticketData.user_id;
        const originalTicketCreatorUsername = ticketData.discord_username;

        // userMention should now always refer to the original ticket creator
        const userMention = originalTicketCreatorId ? `<@${originalTicketCreatorId}>` : 'Ticket User'; // Fallback for safety


        // Use the discord_username from ticketData for renaming and transcript generation
        const userDiscordUsername = ticketData?.discord_username || 'unknown_user';
        logger.info(`Processing ticket ${ticketId}. User Discord Username: ${userDiscordUsername}`);

        let transcriptGenerated = false;
        let transcriptFilePath = null; // Store the file path

        if (ticketData?.is_transcribed) {
            logger.info(`Transcript already exists for ticket ${ticketId} (is_transcribed is true). Skipping generation and upload.`);
            transcriptGenerated = true; // Mark as generated if already exists
            // If transcript already exists and preference is DM/Post, regenerate for sending
             if (transcriptPreference !== 'none') {
                 logger.info(`Regenerating transcript HTML for ticket ${ticketId} for sending.`);
                 // Use the discord_username from ticket data
                 transcriptFilePath = await transcriptGenerator.generateTranscriptHTML(ticketId, userDiscordUsername);
                 if (!transcriptFilePath) {
                     logger.warn(`Failed to regenerate transcript HTML for ticket ${ticketId} for sending.`);
                 }
             }

        } else {
            // Implement transcript generation and upload only if no transcript exists
            // Use the discord_username from ticket data
            transcriptFilePath = await transcriptGenerator.generateTranscriptHTML(ticketId, userDiscordUsername);
            if (transcriptFilePath) {
                 // Assuming uploadTranscriptToDrive handles the upload and returns success status or similar
                 const uploadSuccess = await driveUploader.uploadTranscriptToDrive(transcriptFilePath); // Assuming uploadTranscriptToDrive takes file path
                 if (uploadSuccess) {
                    transcriptGenerated = true;
                    // Update is_transcribed in the database
                    await supabaseHandler.updateTicket(ticketId, { is_transcribed: true });
                    logger.info(`Updated is_transcribed to true for ticket ${ticketId} after successful upload.`);
                 } else {
                    logger.warn(`Transcript upload failed for ticket ${ticketId}.`);
                 }
            } else {
                logger.warn(`Transcript generation failed for ticket ${ticketId}. Skipping upload.`);
            }
        }

        // Call Supabase RPC to close the ticket
        // The RPC should handle setting is_transcribed to true if transcriptGenerated is true
        await supabaseHandler.updateTicket(ticketId, { transcript_preference: transcriptPreference });
        await supabaseHandler.closeTicketRpc(ticketId, channelId, userId, username, transcriptPreference, null, transcriptGenerated); // Pass userId and username

        // Update Discord channel (archive, rename, etc.)
        try {
            // Use the fetched channel object
            if (channel && channel.manageable) {
                // Assuming a 'closedTicketsCategoryId' exists in config
                if (config.closedTicketsCategoryId) {
                    await channel.setParent(config.closedTicketsCategoryId, { lockPermissions: false }); // Move to closed category
                    // Rename channel, e.g., add a prefix
                    await channel.setName(`closed-${ticketId}-${userDiscordUsername}`); // Use discord_username from ticket data
                    logger.info(`Moved ticket channel ${channel.id} to closed category ${config.closedTicketsCategoryId} and renamed to closed-${ticketId}-${userDiscordUsername}`);

                 // Send confirmation message and transcript based on preference
                 const confirmationMessage = "Please download and open this HTML file in any browser to view your ticket transcript. We also keep a copy of the transcript on file if you ever need it.";

                 if (transcriptPreference === 'post' && transcriptFilePath) {
                    try {
                        await channel.send({
                            content: `✅ Ticket closed ${userMention}. ${confirmationMessage}`,
                            files: [transcriptFilePath]
                        });
                        logger.info(`Posted transcript for ticket ${ticketId} in channel ${channel.id}.`);
                    } catch (postError) {
                        logger.error(`Could not post transcript for ticket ${ticketId} in channel ${channel.id}: ${postError.message}`, postError);
                        await channel.send(`✅ Ticket closed ${userMention}. Failed to post transcript.`);
                    }
                 } else if (transcriptPreference === 'dm' && transcriptFilePath) {
                    try {
                        // Need to fetch the user object to DM
                        const user = await client.users.fetch(originalTicketCreatorId); // Use originalTicketCreatorId
                        if (user) {
                            await user.send({
                                content: `${userMention} ✅ Your ticket ${ticketId} has been closed. ${confirmationMessage}`,
                                files: [transcriptFilePath]
                            });
                            logger.info(`DM'd transcript for ticket ${ticketId} to user ${originalTicketCreatorId}.`);
                            await channel.send(`✅ Ticket closed ${userMention}. Transcript sent via DM.`); // Confirm in channel
                        } else {
                            logger.warn(`Could not fetch user ${originalTicketCreatorId} to DM transcript for ticket ${ticketId}.`);
                            await channel.send(`✅ Ticket closed ${userMention}. Could not DM transcript to user.`); // Inform in channel
                        }
                    } catch (dmError) {
                        logger.warn(`Could not DM transcript for ticket ${ticketId} to user ${originalTicketCreatorId}: ${dmError.message}`);
                        await channel.send(`✅ Ticket closed ${userMention}. Could not DM transcript to user.`); // Inform in channel
                    }
                 } else {
                    // Preference is 'none' or transcript generation/upload failed
                    await channel.send(`✅ Ticket closed ${userMention}.`);
                 }

                // Schedule ticket deletion and add delete button
                // Moved this block after sending the confirmation message
                if (config.closedTicketsCategoryId) {
                    await scheduleTicketDeletion(channel, ticketId, userDiscordUsername, transcriptPreference); // Use discord_username from ticket data for deletion scheduling
                    logger.info(`Scheduled deletion for ticket channel ${channel.id} (${ticketId}).`); // Add logging for clarity
                } else {
                    logger.warn('config.closedTicketsCategoryId is not set. Skipping channel deletion scheduling.');
                }


            } else {
                logger.warn(`Ticket channel ${channelId} is not manageable. Skipping channel updates and deletion scheduling.`);
            }
            }
        } catch (channelError) {
            logger.error(`Error updating ticket channel ${channelId} after closure: ${channelError.message}`, channelError);
            // Continue execution even if channel update fails
        }

        // Handle interaction follow-up if interaction object is provided
        if (interaction) {
            await interaction.followUp({ content: `✅ Ticket ${ticketId} closed successfully.`, flags: MessageFlags.Ephemeral }); // Send a new ephemeral confirmation
        }

        // Remove buttons from the original message (the one with Claim/Schedule/Close)
        const ticket = await supabaseHandler.getTicketById(ticketId);
        if (ticket?.original_message_id && channel) {
            try {
                const originalMessage = await channel.messages.fetch(ticket.original_message_id);
                await originalMessage.edit({ content: '# 🛑 Ticket Closed', components: []  });
                logger.info(`Removed buttons from original ticket action row message ${ticket.original_message_id} in channel ${channel.id} after ticket close.`);
            } catch (err) {
                logger.warn(`Could not remove buttons from original message ${ticket.original_message_id} after close: ${err.message}`);
            }
        }

    } catch (error) {
        logger.error(`Error processing transcript preference for ticket ${ticketId}: ${error.message}`, error);
        if (interaction) {
            await interaction.followUp({ content: '⚠️ An error occurred during ticket closure.', flags: MessageFlags.Ephemeral });
        }
        // TODO: Handle error for background triggers - maybe log to database?
    }
}


/**
 * Schedules the deletion of a ticket channel and sends a notification message with a delete button.
 * @param {import('discord.js').TextChannel} channel - The ticket channel to schedule deletion for.
 * @param {string} ticketId - The ID of the ticket.
 * @param {string} username - The username of the ticket creator.
 * @param {string} transcriptPreference - The user's transcript preference ('dm', 'post', 'none').
 */
async function scheduleTicketDeletion(channel, ticketId, username, transcriptPreference) {
    try {
        let delayMs = 60 * 1000; // Default 1 minute for 'none' and 'dm'
        let delayReason = '1 minute';

        if (transcriptPreference === 'post') {
            delayMs = 24 * 60 * 60 * 1000; // 24 hours for 'post'
            delayReason = '24 hours';
        }

        const deleteButton = new ButtonBuilder()
            .setCustomId(`delete_ticket_now_${channel.id}`) // Use channel ID for button custom ID
            .setLabel('Delete Now')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(deleteButton);

        await channel.send({
            content: `This ticket will be automatically deleted in ${delayReason}.`,
            components: [row]
        });
        // Remove buttons from the original message (the one with Claim/Schedule/Close)
        const ticket = await supabaseHandler.getTicketById(ticketId);
        if (ticket?.original_message_id && channel) {
            try {
                const originalMessage = await channel.messages.fetch(ticket.original_message_id);
                await originalMessage.edit({ content: '# 🛑 Ticket CLOSED', components: [] });
                logger.info(`Removed buttons from original ticket action row message ${ticket.original_message_id} in channel ${channel.id} after ticket close.`);
            } catch (err) {
                logger.warn(`Could not remove buttons from original message ${ticket.original_message_id} after close: ${err.message}`);
            }
        }
        const timeoutId = setTimeout(async () => {
            logger.info(`Attempting scheduled deletion for channel ${channel.id} (${ticketId}).`);
            await deleteTicketChannel(channel);
        }, delayMs);

        autoDeleteTimeouts.set(channel.id, timeoutId);
        logger.info(`Scheduled deletion for ticket channel ${channel.id} (${ticketId}) in ${delayReason}. Timeout ID: ${timeoutId}`);

    } catch (error) {
        logger.error(`Error scheduling ticket deletion for channel ${channel.id} (${ticketId}): ${error.message}`, error);
    }
}

/**
 * Handles the "Delete Now" button interaction.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 */
async function handleDeleteNowButton(interaction) {
    logger.info(`[DEBUG] handleDeleteNowButton received customId: ${interaction.customId}`);
    const channelId = interaction.customId.split('_')[3]; // Extract channel ID from custom ID
    logger.info(`[DEBUG] Extracted channelId: ${channelId}`);
    logger.info(`Delete Now button clicked for channel ${channelId}.`);

    await interaction.reply({ content: 'Deleting ticket channel...', flags: MessageFlags.Ephemeral });

    try {
        const channel = interaction.client.channels.cache.get(channelId);
        if (channel) {
            logger.info(`Channel ${channelId} found in cache. Attempting manual deletion.`);
            // Clear the scheduled auto-delete timeout if it exists
            if (autoDeleteTimeouts.has(channelId)) {
                clearTimeout(autoDeleteTimeouts.get(channelId));
                autoDeleteTimeouts.delete(channelId);
                logger.info(`Cleared auto-delete timeout for channel ${channelId} due to manual deletion.`);
            }
            await deleteTicketChannel(channel);
            logger.info(`Manual deletion process initiated for channel ${channelId}.`);
        } else {
            logger.warn(`Attempted to manually delete channel ${channelId} but it was not found in cache.`);
            await interaction.editReply({ content: '⚠️ Channel not found or already deleted.' });
        }
    } catch (error) {
        logger.error(`Error handling delete_ticket_now button for channel ${channelId}: ${error.message}`, error);
        await interaction.editReply({ content: '⚠️ An error occurred while trying to delete the channel.' });
    }
}

/**
 * Handles the buttons from the ticket conclusion prompt message.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @param {string} ticketId - The ID of the ticket.
 */
async function handleConclusionPromptButtons(interaction, ticketId) {
    logger.info(`[DEBUG] handleConclusionPromptButtons received customId: ${interaction.customId}, ticketId: ${ticketId}`);
    const [action, _] = interaction.customId.split(':'); // Extract action

    try {
        if (action === 'conclude_close_ticket') {
            // Initiate the ticket closure process (similar to handleCloseNowButton)
            // Send ephemeral message with transcript preference buttons
            const dmButton = new ButtonBuilder()
                .setCustomId(`transcript_pref_dm:${ticketId}`)
                .setLabel('DM Transcript')
                .setStyle(ButtonStyle.Primary);

            const postButton = new ButtonBuilder()
                .setCustomId(`transcript_pref_post:${ticketId}`)
                .setLabel('Post Transcript')
                .setStyle(ButtonStyle.Primary);

            const noneButton = new ButtonBuilder()
                .setCustomId(`transcript_pref_none:${ticketId}`)
                .setLabel('No Transcript')
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(dmButton, postButton, noneButton);

            await interaction.reply({
                content: 'How would you like to receive the ticket transcript?',
                components: [row],
                flags: MessageFlags.Ephemeral
            });

            // Remove the conclusion prompt buttons from the original message
            await interaction.message.edit({ components: [] });

            // Log the ticket closure initiation
            await supabaseHandler.logBotActivity('info', 'ticket_closure', `User ${interaction.user.username} (${interaction.user.id}) initiated closure from conclusion prompt for ticket ${ticketId}`);


        } else if (action === 'conclude_more_questions') {
            // Send confirmation message and remove prompt buttons
            await interaction.reply({
                content: 'Okay, the ticket will remain open. A staff member will assist you further if needed.',
                flags: MessageFlags.Ephemeral
            });

            // Remove the conclusion prompt buttons from the original message
            await interaction.message.edit({ components: [] });

            // Log that the user had more questions
            await supabaseHandler.logBotActivity('info', 'ticket_closure', `User ${interaction.user.username} (${interaction.user.id}) indicated more questions from conclusion prompt for ticket ${ticketId}`);
        }

    } catch (error) {
        logger.error(`Error handling conclusion prompt buttons for ticket ${ticketId}: ${error.message}`, error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '⚠️ An error occurred while processing your request.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
}

/**
 * Deletes a Discord channel.
 * @param {import('discord.js').TextChannel} channel - The channel to delete.
 */
async function deleteTicketChannel(channel) {
    try {
        if (channel && channel.deletable) {
            logger.info(`Channel ${channel.id} is deletable. Attempting to delete.`);
            await channel.delete();
            logger.info(`Deleted ticket channel ${channel.id}.`);
        } else {
            logger.warn(`Attempted to delete channel ${channel?.id} but it was not found or not deletable.`);
        }
    } catch (error) {
        logger.error(`Error deleting ticket channel ${channel?.id}: ${error.message}`, error);
    }
}

/**
 * Finalizes a scheduled ticket closure, intended to be called by a background process.
 * @param {import('discord.js').Client} client - The Discord client instance.
 * @param {object} ticket - The ticket object returned by the RPC (includes all necessary data).
 */
async function finalizeScheduledTicketClosure(client, ticket) { // Receive the full ticket object
    logger.info(`Finalizing scheduled ticket closure for ticket ${ticket.ticket_id} with preference ${ticket.transcript_preference}.`);

    const ticketId = ticket.ticket_id;
    const channelId = ticket.channel_id;
    const userId = ticket.user_id; // User who created the ticket
    const userDiscordUsername = ticket.discord_username; // Use the correct column name from RPC result
    const transcriptPreference = ticket.transcript_preference; // Use preference from RPC result
    const isTranscribed = ticket.is_transcribed; // Use is_transcribed from RPC result
    const scheduledCloseAt = ticket.scheduled_close_at; // Use scheduled_close_at from RPC result
    const userMention = userId ? `<@${userId}>` : (ticketData?.user_id ? `<@${ticketData.user_id}>` : '');


    // Fetch the channel object
    let channel;
    try {
        channel = await client.channels.fetch(channelId);
        if (!channel) {
            logger.error(`Channel ${channelId} not found for ticket ${ticketId} during scheduled closure finalization. Cannot proceed.`);
            // TODO: Handle this case - maybe update ticket status to indicate closure failed?
            return; // Stop execution if channel is not found
        }
    } catch (fetchChannelError) {
         logger.error(`Error fetching channel ${channelId} for ticket ${ticketId} during scheduled closure finalization: ${fetchChannelError.message}`, fetchChannelError);
         // TODO: Handle this error - maybe update ticket status to indicate closure failed?
         return; // Stop execution if channel cannot be fetched
    }


    // Check if a transcript already exists for this ticket using the is_transcribed flag
    let transcriptGenerated = false;
    let transcriptFilePath = null; // Store the file path

    try {
        if (isTranscribed) { // Use isTranscribed from RPC result
            logger.info(`Transcript already exists for ticket ${ticketId} (is_transcribed is true). Skipping generation and upload.`);
            transcriptGenerated = true; // Mark as generated if already exists
            // If transcript already exists and preference is DM/Post, regenerate for sending
             if (transcriptPreference !== 'none') {
                 logger.info(`Regenerating transcript HTML for ticket ${ticketId} for sending.`);
                 // Use the discord_username from RPC result
                 transcriptFilePath = await transcriptGenerator.generateTranscriptHTML(ticketId, userDiscordUsername);
                 if (!transcriptFilePath) {
                     logger.warn(`Failed to regenerate transcript HTML for ticket ${ticketId} for sending.`);
                 }
             }

        } else {
            // Implement transcript generation and upload only if no transcript exists
            // Use the discord_username from RPC result
            transcriptFilePath = await transcriptGenerator.generateTranscriptHTML(ticketId, userDiscordUsername);
            if (transcriptFilePath) {
                 // Assuming uploadTranscriptToDrive handles the upload and returns success status or similar
                 const uploadSuccess = await driveUploader.uploadTranscriptToDrive(transcriptFilePath); // Assuming uploadTranscriptToDrive takes file path
                 if (uploadSuccess) {
                    transcriptGenerated = true;
                    // Update is_transcribed in the database
                    // This update is now handled by the close_ticket RPC, no need to do it here
                    // await supabaseHandler.updateTicket(ticketId, { is_transcribed: true });
                    logger.info(`Transcript uploaded successfully for scheduled ticket ${ticketId}.`);
                 } else {
                    logger.warn(`Transcript upload failed for scheduled ticket ${ticketId}.`);
                 }
            } else {
                logger.warn(`Transcript generation failed for scheduled ticket ${ticketId}. Skipping upload.`);
            }
        }
    } catch (transcriptError) {
         logger.error(`Error during transcript generation/upload for ticket ${ticketId}: ${transcriptError.message}`, transcriptError);
         // Decide how to handle this error - proceed with closure without transcript or abort?
         // For now, we'll log and continue with closure.
    }


    // Call Supabase RPC to close the ticket
    try {
        // The RPC should handle setting is_transcribed to true if transcriptGenerated is true
        await supabaseHandler.updateTicket(ticketId, { transcript_preference: transcriptPreference });
        logger.info(`Updated transcript preference for scheduled ticket ${ticketId} to ${transcriptPreference}.`);

        await supabaseHandler.closeTicketRpc(ticketId, channelId, 'SYSTEM', 'SYSTEM', transcriptPreference, scheduledCloseAt, transcriptGenerated); // Pass channelId, Pass 'SYSTEM' for both ID and username, preference, and scheduledCloseAt
        logger.info(`close_ticket RPC called successfully for scheduled ticket ${ticketId}.`);
    } catch (rpcError) {
         logger.error(`Error calling close_ticket RPC for scheduled ticket ${ticketId}: ${rpcError.message}`, rpcError);
         // TODO: Handle this error - maybe update ticket status to indicate closure failed?
    }

try {
    // Update Discord channel (archive, rename, etc.)
    try {
        // Use the fetched channel object
        // Re-fetch channel in case it was deleted between fetching and this step
        channel = await client.channels.fetch(channelId);
        if (channel && channel.manageable) {
            // Channel is already moved and renamed when scheduled.
            // Just send confirmation message, transcript, and schedule deletion.

            const confirmationMessage = "Please download and open this HTML file in any browser to view your ticket transcript. We also keep a copy of the transcript on file if you ever need it.";

            if (transcriptPreference === 'post' && transcriptFilePath) {
                try {
                    await channel.send({
                        content: `✅ Ticket closed ${userMention}. ${confirmationMessage}`,
                        files: [transcriptFilePath]
                    });
                    logger.info(`Posted transcript for ticket ${ticketId} in channel ${channel.id}.`);
                } catch (postError) {
                    logger.error(`Could not post transcript for ticket ${ticketId} in channel ${channel.id}: ${postError.message}`, postError);
                    await channel.send(`✅ Ticket closed ${userMention}. Failed to post transcript.`);
                }
            } else if (transcriptPreference === 'dm' && transcriptFilePath) {
                try {
                    const user = await client.users.fetch(userId);
                    if (user) {
                        await user.send({
                            content: `${userMention} ✅ Your ticket ${ticketId} has been closed. ${confirmationMessage}`,
                            files: [transcriptFilePath]
                        });
                        logger.info(`DM'd transcript for ticket ${ticketId} to user ${userId}.`);
                        await channel.send(`✅ Ticket closed ${userMention}. Transcript sent via DM.`);
                    }
                } catch (dmError) {
                    logger.warn(`Could not DM transcript for ticket ${ticketId} to user ${userId}: ${dmError.message}`);
                    await channel.send(`✅ Ticket closed ${userMention}. Could not DM transcript to user.`);
                }
            } else {
                await channel.send(`✅ Ticket closed ${userMention}.`);
            }

            if (config.closedTicketsCategoryId) {
                await scheduleTicketDeletion(channel, ticketId, userDiscordUsername, transcriptPreference);
                logger.info(`Scheduled deletion for ticket channel ${channel.id} (${ticketId}).`);
            } else {
                logger.warn('config.closedTicketsCategoryId is not set. Skipping channel deletion scheduling.');
            }
        }
    } catch (channelUpdateError) {
        logger.error(`Error updating scheduled ticket channel ${channelId} after closure: ${channelUpdateError.message}`, channelUpdateError);
        // Continue execution even if channel update fails
    }

    // ✅ Any additional steps here (like DB update, logging, etc.)
    // TODO: Handle success/failure logging for background triggers
} catch (error) {
    logger.error(`Error finalizing scheduled ticket closure for ticket ${ticketId}: ${error.message}`, error);
    // TODO: Handle error for background triggers - maybe log to database?
}
}

module.exports = {
    handleCloseNowButton,
    processTranscriptPreference, // Export the new function
    handleDeleteNowButton, // Export the delete button handler
    scheduleTicketDeletion, // Export for use in scheduleHandler
    handleConclusionPromptButtons, // Export the conclusion prompt handler
    finalizeScheduledTicketClosure, // Export the new function for background process
};
