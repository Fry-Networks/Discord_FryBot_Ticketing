const {
    AttachmentBuilder, ActionRowBuilder, Events, MessageFlags, ButtonBuilder, ButtonStyle
} = require('discord.js');
const { supabase } = require('./supabase');
const { generateTranscriptHTML } = require('./transcriptGenerator');
const { uploadTranscriptToDrive } = require('./driveUploader');
const { scheduledClosures, recentInteractions } = require('./shared');
const logger = require('../logger');

module.exports = (client) => {

// On bot startup, check for pending scheduled closures
client.on(Events.ClientReady, async () => {
    const { data: tickets, error } = await supabase
        .from('tickets')
        .select('channel_id, scheduled_close_at, is_transcribed')
        .eq('status', 'scheduled_close');

    if (error) {
        logger.error('❌ Failed to fetch scheduled closures on startup:', error.message);
        return;
    }

    for (const ticket of tickets) {
        const { channel_id, scheduled_close_at } = ticket;
        if (is_transcribed === 'transcribed') continue; // Skip if only transcript marker

        const closeTime = new Date(scheduled_close_at).getTime();
        const now = Date.now();
        const delayMs = Math.max(0, closeTime - now);

        if (delayMs === 0) {
            // If the scheduled close time has passed, close immediately
            const channel = await client.channels.fetch(channel_id).catch(() => null);
            if (!channel) {
                logger.info(`ℹ️ Channel ${channel_id} already deleted or inaccessible.`);
                continue;
            }

            await supabase
                .from('tickets')
                .update({ status: 'closed', closed_at: new Date().toISOString(), scheduled_close_at: null })
                .eq('channel_id', channel_id);

            const deleteNowRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('delete_now')
                    .setLabel('🗑️ Delete Now')
                    .setStyle(ButtonStyle.Danger)
            );

            const { data: ticketMeta } = await supabase
                .from('tickets')
                .select('user_id')
                .eq('channel_id', channel_id)
                .single();

            const user_id = ticketMeta?.user_id;

            await channel.send({
                content: `<@${user_id}> ✅ This ticket has been closed.\n\n_This channel will be deleted immediately._`,
                components: []
            });

            if (channel.deletable) {
                await channel.delete().catch(err => {
                    if (err.code !== 10003) {
                        logger.error(`❌ Failed to delete channel ${channel_id}:`, err);
                    }
                });
            }
        } else {
            // Reschedule the closure
            const timeout = setTimeout(async () => {
                try {
                    const channel = await client.channels.fetch(channel_id).catch(() => null);
                    if (!channel) {
                        logger.info(`ℹ️ Channel ${channel_id} already deleted or inaccessible.`);
                        return;
                    }

                    // Update ticket to closed
                    await supabase
                        .from('tickets')
                        .update({ status: 'closed', closed_at: new Date().toISOString(), scheduled_close_at: null })
                        .eq('channel_id', channel_id);

                    const deleteNowRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('delete_now')
                            .setLabel('🗑️ Delete Now')
                            .setStyle(ButtonStyle.Danger)
                    );

                    const { data: ticketMeta } = await supabase
                        .from('tickets')
                        .select('user_id')
                        .eq('channel_id', channel_id)
                        .single();

                    const user_id = ticketMeta?.user_id;

                    const labelText = delayMs === 0 
                        ? 'immediately'
                        : {
                            60000: 'in 1 minute',
                            43200000: 'in 12 hours',
                            86400000: 'in 24 hours',
                            172800000: 'in 48 hours'
                        }[delayMs] || 'soon';


                    await channel.send({
                        content: `<@${user_id}> ✅ This ticket has been closed.${labelText ? `\n\n_This channel will be deleted ${labelText}._` : ''}${delayMs > 0 ? '\n\nYou can also delete it immediately by clicking below:' : ''}`,
                        components: delayMs > 0 ? [deleteNowRow] : []
                    });
                    

                    if (delayMs > 0) {
                        setTimeout(async () => {
                            const stillExists = await client.channels.fetch(channel_id).catch(() => null);
                            if (stillExists && stillExists.deletable) {
                                await stillExists.delete().catch(err => {
                                    if (err.code !== 10003) {
                                        logger.error(`❌ Failed to delete channel ${channel_id}:`, err);
                                    }
                                });
                            }
                        }, delayMs);
                    } else {
                        if (channel.deletable) {
                            await channel.delete().catch(err => {
                                if (err.code !== 10003) {
                                    logger.error(`❌ Failed to delete channel ${channel_id}:`, err);
                                }
                            });
                        }
                    }
            
                } catch (error) {
                    logger.error(`❌ Error during scheduled closure of ${channel_id}:`, error);
                } finally {
                    scheduledClosures.delete(channel_id);
                }
            }, delayMs);
            
            scheduledClosures.set(ticketChannel.id, timeout);                
        }
    }
});
};
    /*client.on(Events.InteractionCreate, async (interaction) => {
        try {
            // Handle initial spam check for all buttons
            const isStaff = interaction.member?.roles?.cache?.has(process.env.TICKET_MOD_ROLE);
            const key = `${interaction.user.id}_${interaction.customId}`;
            const now = Date.now();
            const lastUsed = recentInteractions.get(key);

            // Skip spam check for staff
            if (!isStaff && lastUsed && now - lastUsed < 3000) {
                const warningMessage = '⚠️ You just clicked this — give it a second.';
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: warningMessage,
                        flags: MessageFlags.Ephemeral
                    });
                } else {
                    await interaction.followUp({
                        content: warningMessage,
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                }

                const logMessage = `[interaction_repeat] ${interaction.user.tag} (${interaction.user.id}) clicked ${interaction.customId} too fast.`;
                logger.warn(logMessage);

                await supabase.from('bot_logs').insert({
                    timestamp: new Date().toISOString(),
                    level: 'warn',
                    scope: 'interaction_repeat',
                    message: logMessage
                });

                return;
            }

            recentInteractions.set(key, now);

            const ticketChannel = interaction.channel;

            // Handle "Request Close" button (initiates scheduled close)
            if (interaction.isButton() && interaction.customId === 'request_close') {
                const staffRoleId = process.env.TICKET_MOD_ROLE;
                if (!interaction.member.roles.cache.has(staffRoleId)) {
                    if (!interaction.replied && !interaction.deferred) {
                        return await interaction.reply({
                            content: '❌ Only staff can request delayed closures.',
                            flags: MessageFlags.Ephemeral
                        });
                    } else {
                        return await interaction.followUp({
                            content: '❌ Only staff can request delayed closures.',
                            flags: MessageFlags.Ephemeral
                        }).catch(() => {});
                    }
                }

                const { data: ticketData } = await supabase
                    .from('tickets')
                    .select('id, scheduled_close_at')
                    .eq('channel_id', ticketChannel.id)
                    .single();

                // Check if a scheduled close is already active
                if (ticketData?.scheduled_close_at && ticketData.scheduled_close_at !== 'transcribed') {
                    const cancelRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('cancel_auto_close')
                            .setLabel('Cancel Scheduled Close')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('delete_now')
                            .setLabel('Close Now')
                            .setStyle(ButtonStyle.Danger)
                    );

                    await interaction.reply({
                        content: '⏳ A scheduled close is already active for this ticket. Would you like to cancel it and set a new schedule, or close the ticket now?',
                        components: [cancelRow],
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                await supabase.from('staff_actions').insert({
                    ticket_id: ticketData?.id,
                    staff_id: interaction.user.id,
                    action: 'request_close'
                });

                const testDelayOptions = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_delay_1m_dm')
                        .setLabel('🧪 1m • DM Transcript')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('close_delay_1m_post')
                        .setLabel('🧪 1m • Post Transcript')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('close_delay_1m_no')
                        .setLabel('🧪 1m • No Transcript')
                        .setStyle(ButtonStyle.Secondary)
                );

                const delayOptions = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_delay_12h_dm')
                        .setLabel('🕐 12h • DM Transcript')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('close_delay_12h_post')
                        .setLabel('🕐 12h • Post Transcript')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('close_delay_12h_no')
                        .setLabel('🕐 12h • No Transcript')
                        .setStyle(ButtonStyle.Secondary)
                );

                const moreDelayOptions = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_delay_24h_dm')
                        .setLabel('🕑 24h • DM Transcript')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('close_delay_24h_post')
                        .setLabel('🕑 24h • Post Transcript')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('close_delay_24h_no')
                        .setLabel('🕑 24h • No Transcript')
                        .setStyle(ButtonStyle.Secondary)
                );

                const evenMoreDelayOptions = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_delay_48h_dm')
                        .setLabel('🕑 48h • DM Transcript')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('close_delay_48h_post')
                        .setLabel('🕑 48h • Post Transcript')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('close_delay_48h_no')
                        .setLabel('🕑 48h • No Transcript')
                        .setStyle(ButtonStyle.Secondary)
                );

                const cancelOption = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('cancel_close_ticket')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Danger)
                );

                await interaction.reply({
                    content: '🕒 Select a delay and transcript delivery method:',
                    components: [testDelayOptions, delayOptions, moreDelayOptions, evenMoreDelayOptions, cancelOption],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
*/
            // Handle delay selection (e.g., close_delay_1m_dm, close_delay_12h_post, etc.)
         /*   if (interaction.isButton() && interaction.customId.startsWith('close_delay_')) {
                // Defer the interaction immediately to avoid timeout
                await interaction.deferUpdate();

                const staffUser = interaction.user;
                const parts = interaction.customId.split('_');
                const delayStr = parts[2]; // e.g., "1m", "12h", "24h", "48h"
                const transcriptOption = parts[3]; // dm, post, or no
                let delayMs;

                // Check if the delay is in minutes ("m") or hours ("h")
                if (delayStr.endsWith('m')) {
                    const delayMinutes = parseInt(delayStr.replace('m', '')); // e.g., 1
                    delayMs = delayMinutes * 60 * 1000; // Convert minutes to milliseconds
                } else {
                    const delayHours = parseInt(delayStr.replace('h', '')); // e.g., 12, 24, 48
                    delayMs = delayHours * 60 * 60 * 1000; // Convert hours to milliseconds
                }

                let transcriptAction;
                if (transcriptOption === 'dm') {
                    transcriptAction = 'confirm_close_ticket_dm';
                } else if (transcriptOption === 'post') {
                    transcriptAction = 'confirm_close_ticket_post';
                } else {
                    transcriptAction = 'confirm_close_ticket_no_transcript';
                }

                // Validate delay and transcript option
                if (!delayMs || !transcriptAction) {
                    return await interaction.editReply({
                        content: '❌ Invalid delay option.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                // Check if a scheduled close is already active
                const { data: ticketData } = await supabase
                    .from('tickets')
                    .select('scheduled_close_at')
                    .eq('channel_id', ticketChannel.id)
                    .single();

                if (scheduledClosures.has(interaction.channelId) || (ticketData?.scheduled_close_at && ticketData.scheduled_close_at !== 'transcribed')) {
                    const cancelRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('cancel_auto_close')
                            .setLabel('Cancel Scheduled Close')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('delete_now')
                            .setLabel('Close Now')
                            .setStyle(ButtonStyle.Danger)
                    );

                    await interaction.editReply({
                        content: '⏳ A scheduled close is already active for this ticket. Would you like to cancel it and set a new schedule, or close the ticket now?',
                        components: [cancelRow],
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                // Update ticket status to scheduled close
                await supabase
                    .from('tickets')
                    .update({ status: 'scheduled_close', scheduled_close_at: new Date(Date.now() + delayMs).toISOString() })
                    .eq('channel_id', ticketChannel.id);

                // Move the ticket channel to the "Closed Tickets" category and rename
                try {
                    const currentChannelName = ticketChannel.name;
                    if (!currentChannelName.startsWith('closed-')) {
                        await ticketChannel.setName(`closed-${currentChannelName}`);
                        logger.info(`Renamed ticket channel ${ticketChannel.id} to closed-${currentChannelName}`);
                    }
                    await ticketChannel.setParent(process.env.CLOSED_TICKET_CAT, { lockPermissions: false });
                    logger.info(`Moved ticket channel ${ticketChannel.id} to Closed Tickets category for scheduled close.`);
                } catch (error) {
                    logger.error(`❌ Failed to move or rename ticket channel ${ticketChannel.id}:`, error.message);
                }

                // Generate transcript immediately (if applicable)
                const { data: ticketMeta } = await supabase
                    .from('tickets')
                    .select('id, user_id, scheduled_close_at')
                    .eq('channel_id', ticketChannel.id)
                    .single();

                const ticketIdMatch = ticketChannel.name.match(/^closed-(\d+)/) || ticketChannel.name.match(/^(\d+)/);
                const ticketId = ticketIdMatch ? parseInt(ticketIdMatch[1]) : null;
                const user_id = ticketMeta?.user_id;
                const transcriptExists = ticketMeta?.scheduled_close_at === 'transcribed';

                let filePath;
                if (transcriptOption !== 'no' && !filePath) {
                    const ticketUser = await client.users.fetch(user_id).catch(() => null);
                    filePath = await generateTranscriptHTML(ticketId, ticketUser?.username || 'user');

                    if (!ticketId) {
                        logger.error(`❌ Could not extract ticket ID from channel name: ${ticketChannel.name}`);
                        await interaction.followUp({ content: '⚠️ Ticket ID could not be determined. Transcript may fail.', flags: MessageFlags.Ephemeral });
                        return;
                    }

                    if (!filePath) {
                        logger.error('❌ Error generating transcript HTML file.');
                        await interaction.followUp({ content: '⚠️ Could not generate transcript.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                }

                // Log the scheduled close action to staff_actions
                await supabase.from('staff_actions').insert({
                    ticket_id: ticketId,
                    staff_id: interaction.user.id,
                    action: `closed_with_delay_${delayStr}_${transcriptOption}`
                });

                // Handle transcript delivery and Drive upload immediately
                let deleteDelay = 0; // Default to immediate deletion
                let transcriptPosted = false; // Track if transcript is posted
                const fileAttachment = filePath ? new AttachmentBuilder(filePath) : null;

                if (transcriptOption === 'dm') {
                    const user = await client.users.fetch(user_id).catch(() => null);
                    if (user) {
                        try {
                            await user.send({
                                content: '**Here is the transcript for your ticket.**\n\nYou can open this file in any web browser.',
                                files: [fileAttachment]
                            });
                            await ticketChannel.send(
                                `⏳ This ticket will auto-close in **${delayStr}**. Transcript has been sent via DM to <@${user_id}> (set by <@${staffUser.id}>).`
                            );
                            deleteDelay = 0; // Immediate deletion after closure
                        } catch (dmError) {
                            logger.error('❌ Failed to DM transcript:', dmError);
                            await ticketChannel.send({
                                content: `⏳ This ticket will auto-close in **${delayStr}**. Failed to DM transcript to <@${user_id}>, posting here instead (set by <@${staffUser.id}>):\n\nYou can open this file in any web browser.`,
                                files: [fileAttachment]
                            });
                            deleteDelay = 86400000; // 24 hours
                            transcriptPosted = true;
                        }
                    }
                } else if (transcriptOption === 'post') {
                    await ticketChannel.send({
                        content: `⏳ This ticket will auto-close in **${delayStr}**. Here is the transcript <@${user_id}> (set by <@${staffUser.id}>):\n\nYou can open this file in any web browser.`,
                        files: [fileAttachment]
                    });
                    deleteDelay = 86400000; // 24 hours
                    transcriptPosted = true;
                } else {
                    await ticketChannel.send(
                        `⏳ This ticket will auto-close in **${delayStr}** with no transcript, <@${user_id}> (set by <@${staffUser.id}>).`
                    );
                    deleteDelay = 0; // Immediate deletion after closure
                }

                // Upload transcript to Google Drive immediately (if not already uploaded)
                if (filePath && !transcriptExists) {
                    const newDriveLink = await uploadTranscriptToDrive(filePath);
                    if (newDriveLink) {
                        logger.info(`✅ Uploaded to Drive: ${newDriveLink}`);
                        // Mark transcript as generated using scheduled_close_at
                        await supabase
                            .from('tickets')
                            .update({ scheduled_close_at: 'transcribed' })
                            .eq('id', ticketId);
                    }
                }

                // Clean local file immediately (if generated)
                if (filePath) {
                    const fs = require('fs');
                    fs.unlink(filePath, (err) => {
                        if (err) logger.error(`⚠️ Could not delete local transcript file: ${filePath}`, err);
                        else logger.info(`🧹 Deleted local transcript: ${filePath}`);
                    });
                }

                // Clear any previous scheduled timeout to prevent duplicates
                const existingTimeout = scheduledClosures.get(interaction.channelId);
                if (existingTimeout) {
                    clearTimeout(existingTimeout);
                    scheduledClosures.delete(interaction.channelId);
                }

                // Schedule the closure
                const timeout = setTimeout(async () => {
                    const channel = await client.channels.fetch(ticketChannel.id).catch(() => null);
                    if (!channel) {
                        logger.info(`ℹ️ Channel ${ticketChannel.id} already deleted or inaccessible.`);
                        scheduledClosures.delete(ticketChannel.id);
                        return;
                    }

                    // Update ticket status to closed
                    await supabase
                        .from('tickets')
                        .update({ status: 'closed', closed_at: new Date().toISOString(), scheduled_close_at: null })
                        .eq('channel_id', channel.id);

                    const deleteNowRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('delete_now')
                            .setLabel('🗑️ Delete Now')
                            .setStyle(ButtonStyle.Danger)
                    );

                    const labelText = transcriptPosted
                        ? 'in **24 hours** to give you time to download the transcript, which you can open in any web browser'
                        : 'immediately';

                    await channel.send({
                        content: `<@${user_id}> ✅ This ticket has been closed.\n\n_This channel will be deleted ${labelText}._${deleteDelay > 0 ? '\n\nYou can also delete it immediately by clicking below:' : ''}`,
                        components: deleteDelay > 0 ? [deleteNowRow] : []
                    });

                    // Schedule the deletion if delay is greater than 0
                    if (deleteDelay > 0) {
                        setTimeout(async () => {
                            const stillExists = await client.channels.fetch(channel.id).catch(() => null);
                            if (stillExists && stillExists.deletable) {
                                await stillExists.delete().catch(err => {
                                    if (err.code !== 10003) {
                                        logger.error(`❌ Failed to delete channel ${channel.id}:`, err);
                                    }
                                });
                            }
                            scheduledClosures.delete(channel.id);
                        }, deleteDelay);
                    } else {
                        // Delete immediately if no delay
                        if (channel.deletable) {
                            await channel.delete().catch(err => {
                                if (err.code !== 10003) {
                                    logger.error(`❌ Failed to delete channel ${channel.id}:`, err);
                                }
                            });
                        }
                        scheduledClosures.delete(channel.id);
                    }
                }, delayMs);

                scheduledClosures.set(interaction.channelId, timeout);

                // Add "Cancel Auto-Close" and "Close Now" buttons
                const actionRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('cancel_auto_close')
                        .setLabel('Cancel Auto-Close')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('delete_now')
                        .setLabel('Close Now')
                        .setStyle(ButtonStyle.Danger)
                );

                const delayText = {
                    60000: '1 minute',
                    43200000: '12 hours',
                    86400000: '24 hours',
                    172800000: '48 hours'
                }[delayMs] || `${delayMs / 1000 / 60} minutes`;

                await ticketChannel.send({
                    content: `<@${user_id}> ⏳ This ticket is scheduled to close in **${delayText}**. If your issue is still not resolved, you can press "Cancel Auto-Close" to keep the ticket open. Alternatively, press "Close Now" to close and delete it immediately.`,
                    components: [actionRow]
                });

                return;
            }*/

            // Handle "Cancel Auto-Close" button
           /* if (interaction.isButton() && interaction.customId === 'cancel_auto_close') {
                const existingTimeout = scheduledClosures.get(interaction.channelId);
                if (existingTimeout) {
                    clearTimeout(existingTimeout);
                    scheduledClosures.delete(interaction.channelId);
                }

                // Revert ticket status to open
                await supabase
                    .from('tickets')
                    .update({ status: 'open', scheduled_close_at: null })
                    .eq('channel_id', ticketChannel.id);

                // Move the ticket channel back to its original category and rename
                const ticketIdMatch = ticketChannel.name.match(/^closed-(\d+)/) || ticketChannel.name.match(/^(\d+)/);
                const ticketId = ticketIdMatch ? parseInt(ticketIdMatch[1]) : null;
                const { data: ticketData } = await supabase
                    .from('tickets')
                    .select('ticket_type')
                    .eq('id', ticketId)
                    .single();

                const categoryIds = {
                    order_tracking: process.env.TICKET_CAT_ORDER,
                    registration: process.env.TICKET_CAT_REGISTRATION,
                    miner_keys: process.env.TICKET_CAT_MINER_KEYS,
                    rewards: process.env.TICKET_CAT_REWARDS,
                    tech_support: process.env.TICKET_CAT_TECH_SUPPORT
                };

                const originalCategory = categoryIds[ticketData?.ticket_type] || process.env.TICKET_CAT_ORDER;
                try {
                    const currentChannelName = ticketChannel.name;
                    if (currentChannelName.startsWith('closed-')) {
                        await ticketChannel.setName(currentChannelName.replace('closed-', ''));
                        logger.info(`Renamed ticket channel ${ticketChannel.id} back to ${currentChannelName.replace('closed-', '')}`);
                    }
                    await ticketChannel.setParent(originalCategory, { lockPermissions: false });
                    logger.info(`Moved ticket channel ${ticketChannel.id} back to original category ${originalCategory} after canceling auto-close.`);
                } catch (error) {
                    logger.error(`❌ Failed to move or rename ticket channel ${ticketChannel.id} back to original category:`, error.message);
                }

                const { data: ticketMeta } = await supabase
                    .from('tickets')
                    .select('user_id')
                    .eq('channel_id', ticketChannel.id)
                    .single();

                const user_id = ticketMeta?.user_id;

                await interaction.update({
                    content: `<@${user_id}> ✅ Auto-close canceled. The ticket is now open again.`,
                    components: []
                });
                return;
            }*/

            /*if (interaction.customId === 'cancel_close_ticket') {
                await supabase.from('staff_actions').insert({
                    ticket_id: interaction.channel.name.match(/^closed-(\d+)/)?.[1] || interaction.channel.name.match(/^(\d+)/)?.[1] || null,
                    staff_id: interaction.user.id,
                    action: 'cancel_close'
                });

                if (!interaction.replied && !interaction.deferred) {
                    return await interaction.update({
                        content: '❌ Ticket closure canceled.',
                        components: []
                    });
                } else {
                    return await interaction.followUp({
                        content: '❌ Ticket closure canceled.',
                        components: []
                    }).catch(() => {});
                }
            }*/

            // Handle "Delete Now" button (used for both immediate close and scheduled close)
           /* if (interaction.customId === 'delete_now') {
                const ticketChannel = interaction.channel;

                if (!ticketChannel || !ticketChannel.deletable) {
                    return await interaction.reply({
                        content: '⚠️ I don’t have permission to delete this channel.'
                    });
                }

                const scheduledTimeout = scheduledClosures.get(ticketChannel.id);
                if (scheduledTimeout) {
                    clearTimeout(scheduledTimeout);
                    scheduledClosures.delete(ticketChannel.id);
                }

                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: '🧹 Deleting ticket now...' });
                } else {
                    await interaction.followUp({ content: '🧹 Deleting ticket now...' }).catch(() => {});
                }

                return ticketChannel.delete().catch(err => logger.error(err));
            }
        } catch (err) {
            logger.error('❌ Unhandled error in InteractionCreate handler:', err);
        }
    });*/

    