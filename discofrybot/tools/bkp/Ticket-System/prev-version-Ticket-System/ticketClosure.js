/*const {
    AttachmentBuilder, ActionRowBuilder, Events, MessageFlags, ButtonBuilder, ButtonStyle
} = require('discord.js');
const { supabase } = require('./supabase');
const { generateTranscriptHTML } = require('./transcriptGenerator');
const { uploadTranscriptToDrive } = require('./driveUploader');
const { scheduledClosures, recentInteractions, ticketCloseCooldown } = require('./shared');
const logger = require('../logger');

const closingTickets = new Set();
const TICKET_CLOSE_COOLDOWN_MS = 10 * 60 * 1000;
const ticketClosePrompted = new Set();
const INTERACTION_SPAM_INTERVAL_MS = 3000;

module.exports = (client) => {
    client.on(Events.InteractionCreate, async (interaction) => {
        /*try { 
            // Handle initial spam check for all buttons
            const isStaff = interaction.member?.roles?.cache?.has(process.env.TICKET_MOD_ROLE);
            const key = `${interaction.user.id}_${interaction.customId}`;
            const now = Date.now();
            const lastUsed = recentInteractions.get(key);

            // Skip spam check for staff
            if (!isStaff && lastUsed && now - lastUsed < INTERACTION_SPAM_INTERVAL_MS) {
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

            // Existing "Close Ticket" logic
            if (interaction.isButton() && interaction.customId === 'close_ticket') {
                const { data: ticketMeta } = await supabase
                    .from('tickets')
                    .select('user_id, scheduled_close_at')
                    .eq('channel_id', ticketChannel.id)
                    .single();

                if (ticketClosePrompted.has(ticketChannel.id)) {
                    if (!interaction.replied && !interaction.deferred) {
                        return await interaction.reply({
                            content: '⚠️ This ticket is already awaiting closure confirmation.'
                        });
                    } else {
                        return await interaction.followUp({
                            content: '⚠️ This ticket is already awaiting closure confirmation.'
                        }).catch(() => {});
                    }
                }

                // Check if a scheduled close is already active
                if (scheduledClosures.has(interaction.channelId) || (ticketMeta?.scheduled_close_at && ticketMeta.scheduled_close_at !== 'transcribed')) {
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
                        content: '⏳ A scheduled close is already active for this ticket. Would you like to cancel it and proceed with closing now, or keep the scheduled close?',
                        components: [cancelRow]
                    });
                    return;
                }

                ticketClosePrompted.add(ticketChannel.id);
                const ticketIdMatch = ticketChannel.name.match(/^closed-(\d+)/) || ticketChannel.name.match(/^(\d+)/);

                await supabase.from('staff_actions').insert({
                    ticket_id: ticketIdMatch ? parseInt(ticketIdMatch[1]) : null,
                    staff_id: interaction.user.id,
                    action: 'close_prompt'
                });

                setTimeout(() => {
                    ticketClosePrompted.delete(ticketChannel.id);
                }, 2 * 60 * 1000);

                const isAuthor = ticketMeta?.user_id === interaction.user.id;
                if (isAuthor) {
                    const transcriptChoiceButtons = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('wants_transcript')
                            .setLabel('✅ Yes, I want a transcript')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('no_transcript')
                            .setLabel('❌ No, just close it')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('cancel_close_ticket')
                            .setLabel('🛑 Cancel')
                            .setStyle(ButtonStyle.Danger)
                    );

                    if (!interaction.replied && !interaction.deferred) {
                        return await interaction.reply({
                            content: `Would you like a copy of your ticket transcript before we close this ticket?\n(We always save it internally on our end.)`,
                            components: [transcriptChoiceButtons]
                        });
                    } else {
                        return await interaction.followUp({
                            content: `Would you like a copy of your ticket transcript before we close this ticket?\n(We always save it internally on our end.)`,
                            components: [transcriptChoiceButtons]
                        }).catch(() => {});
                    }
                } else {
                    const staffCloseButtons = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('confirm_close_ticket_post')
                            .setLabel('✅ Close and post transcript in channel')
                            .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                            .setCustomId('cancel_close_ticket')
                            .setLabel('❌ Cancel')
                            .setStyle(ButtonStyle.Secondary)
                    );

                    return await interaction.reply({
                        content: `You're about to close this ticket on behalf of the user. The transcript will be posted in this channel.`,
                        components: [staffCloseButtons]
                    });
                }
            }

            // Handle transcript preference
            const deleteNowRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('delete_now')
                    .setLabel('🗑️ Delete Now')
                    .setStyle(ButtonStyle.Danger)
            );

            if (interaction.customId === 'wants_transcript') {
                const deliveryOptions = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('dm_transcript')
                        .setLabel('✅ Yes, send via DM')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('post_transcript')
                        .setLabel('📄 No, post in this channel')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('cancel_close_ticket')
                        .setLabel('❌ Cancel')
                        .setStyle(ButtonStyle.Danger)
                );

                if (!interaction.replied && !interaction.deferred) {
                    return await interaction.update({
                        content: `Do you have DMs enabled to receive the HTML transcript privately?\nIf not, I can post it here instead.\n\nYou can open the transcript in any web browser.`,
                        components: [deliveryOptions]
                    });
                } else {
                    return await interaction.followUp({
                        content: `Do you have DMs enabled to receive the HTML transcript privately?\nIf not, I can post it here instead.\n\nYou can open the transcript in any web browser.`,
                        components: [deliveryOptions]
                    }).catch(() => {});
                }
            }

            if (interaction.customId === 'no_transcript') {
                const ticketChannel = interaction.channel;

                const { data: ticketMeta } = await supabase
                    .from('tickets')
                    .select('user_id')
                    .eq('channel_id', ticketChannel.id)
                    .single();

                const user_id = ticketMeta?.user_id;

                // Update ticket status to closed
                await supabase
                    .from('tickets')
                    .update({ status: 'closed', closed_at: new Date().toISOString(), scheduled_close_at: null })
                    .eq('channel_id', ticketChannel.id);

                // Move the ticket channel to the "Closed Tickets" category and rename
                try {
                    const currentChannelName = ticketChannel.name;
                    if (!currentChannelName.startsWith('closed-')) {
                        await ticketChannel.setName(`closed-${currentChannelName}`);
                        logger.info(`Renamed ticket channel ${ticketChannel.id} to closed-${currentChannelName}`);
                    }
                    await ticketChannel.setParent(process.env.CLOSED_TICKET_CAT, { lockPermissions: false });
                    logger.info(`Moved ticket channel ${ticketChannel.id} to Closed Tickets category.`);
                } catch (error) {
                    logger.error(`❌ Failed to move or rename ticket channel ${ticketChannel.id} to Closed Tickets category:`, error.message);
                }

                // No transcript, delete immediately after closure
                await ticketChannel.send({
                    content: `<@${user_id}> ✅ This ticket has been closed. No transcript was requested.\n\n_This channel will be deleted immediately._`,
                    components: []
                });

                // Clear any previous scheduled timeout to prevent duplicates
                const existingTimeout = scheduledClosures.get(interaction.channelId);
                if (existingTimeout) {
                    clearTimeout(existingTimeout);
                    scheduledClosures.delete(interaction.channelId);
                }

                // Delete immediately
                if (ticketChannel.deletable) {
                    await ticketChannel.delete().catch(err => {
                        if (err.code !== 10003) {
                            logger.error(`❌ Failed to delete channel ${ticketChannel.id}:`, err);
                        }
                    });
                }
                scheduledClosures.delete(ticketChannel.id);

                return;
            }*/

            /*if (interaction.customId === 'dm_transcript') {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.update({
                        content: '✅ Great — I’ll send your HTML transcript via DM!',
                        components: []
                    });
                } else {
                    await interaction.followUp({
                        content: '✅ Great — I’ll send your HTML transcript via DM!',
                        components: []
                    }).catch(() => {});
                }
                const ticketIdMatch = ticketChannel.name.match(/^closed-(\d+)/) || ticketChannel.name.match(/^(\d+)/);
                interaction.customId = 'confirm_close_ticket_dm';
                client.emit(Events.InteractionCreate, interaction);
                await supabase.from('staff_actions').insert({
                    ticket_id: ticketIdMatch ? parseInt(ticketIdMatch[1]) : null,
                    staff_id: interaction.user.id,
                    action: 'confirm_dm'
                });
                return;
            }*/

            /*if (interaction.customId === 'post_transcript') {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.update({
                        content: '✅ Got it — I’ll post the HTML transcript in this channel!',
                        components: []
                    });
                } else {
                    await interaction.followUp({
                        content: '✅ Got it — I’ll post the HTML transcript in this channel!',
                        components: []
                    }).catch(() => {});
                }

                interaction.customId = 'confirm_close_ticket_post';
                client.emit(Events.InteractionCreate, interaction);
                return;
            }*/

            /*if (interaction.customId === 'cancel_close_ticket') {
                ticketClosePrompted.delete(interaction.channel.id);

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
            }

            // Handle "Delete Now" button (used for both immediate close and scheduled close)
            if (interaction.customId === 'delete_now') {
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


            /*
            // Handle Confirm Close Ticket (DM, Post, or No Transcript)
            if ([
                'confirm_close_ticket_dm',
                'confirm_close_ticket_post',
                'confirm_close_ticket_no_transcript'
            ].includes(interaction.customId)) {

                // Cooldown check
                const now = Date.now();
                const isStaff = interaction.member?.roles?.cache?.has(process.env.TICKET_MOD_ROLE);
                const isAutoClose = !interaction.member;

                if (!isStaff && !isAutoClose) {
                    const lastClose = ticketCloseCooldown.get(interaction.user.id);

                    if (lastClose && now - lastClose < TICKET_CLOSE_COOLDOWN_MS) {
                        const remaining = Math.ceil((TICKET_CLOSE_COOLDOWN_MS - (now - lastClose)) / 60000);
                        const cooldownReply = {
                            content: `⚠️ You're trying to close tickets too quickly. Please wait **${remaining} more minute(s)** before trying again.`
                        };

                        if (!interaction.replied && !interaction.deferred) {
                            return await interaction.reply(cooldownReply);
                        } else {
                            return await interaction.followUp(cooldownReply).catch(err => logger.error(err));
                        }
                    }

                    ticketCloseCooldown.set(interaction.user.id, now);
                    setTimeout(() => ticketCloseCooldown.delete(interaction.user.id), TICKET_CLOSE_COOLDOWN_MS);
                }

                // Check if already closing
                if (closingTickets.has(ticketChannel.id)) {
                    return await interaction.followUp({
                        content: '⚠️ This ticket is already being closed. Please wait...',
                        flags: MessageFlags.Ephemeral
                    });
                }
                closingTickets.add(ticketChannel.id);

                const { data: ticketMeta } = await supabase
                    .from('tickets')
                    .select('id, user_id, scheduled_close_at')
                    .eq('channel_id', ticketChannel.id)
                    .single();

                const user_id = ticketMeta?.user_id;

                // Update ticket status to closed
                const { error } = await supabase
                    .from('tickets')
                    .update({ status: 'closed', closed_at: new Date().toISOString(), scheduled_close_at: null })
                    .eq('channel_id', ticketChannel.id);

                if (error) {
                    logger.error('❌ Error updating ticket status in database:', error.message);
                    return await interaction.followUp({
                        content: '⚠️ Failed to close the ticket. Please try again later.',
                        components: []
                    });
                }

                // Move the ticket channel to the "Closed Tickets" category and rename
                try {
                    const currentChannelName = ticketChannel.name;
                    if (!currentChannelName.startsWith('closed-')) {
                        await ticketChannel.setName(`closed-${currentChannelName}`);
                        logger.info(`Renamed ticket channel ${ticketChannel.id} to closed-${currentChannelName}`);
                    }
                    await ticketChannel.setParent(process.env.CLOSED_TICKET_CAT, { lockPermissions: false });
                    logger.info(`Moved ticket channel ${ticketChannel.id} to Closed Tickets category.`);
                } catch (error) {
                    logger.error(`❌ Failed to move or rename ticket channel ${ticketChannel.id} to Closed Tickets category:`, error.message);
                }

                const ticketIdMatch = interaction.channel.name.match(/^closed-(\d+)/) || interaction.channel.name.match(/^(\d+)/);
                const ticketId = ticketIdMatch ? parseInt(ticketIdMatch[1]) : null;

                if (!ticketId) {
                    logger.error(`❌ Could not extract ticket ID from channel name: ${interaction.channel.name}`);
                    return await interaction.followUp({ content: '⚠️ Ticket ID could not be determined. Transcript may fail.', flags: MessageFlags.Ephemeral });
                }

                let filePath;
                const transcriptExists = ticketMeta?.scheduled_close_at === 'transcribed';

                if (!interaction.customId.includes('no_transcript') && !filePath) {
                    const ticketUser = await client.users.fetch(user_id).catch(() => null);
                    filePath = await generateTranscriptHTML(ticketId, ticketUser?.username || 'user');
                    if (!filePath) {
                        logger.error('❌ Error generating transcript HTML file.');
                        if (!interaction.replied && !interaction.deferred) {
                            return await interaction.reply({ content: '⚠️ Could not generate transcript.', flags: MessageFlags.Ephemeral });
                        } else {
                            return await interaction.followUp({ content: '⚠️ Could not generate transcript.', flags: MessageFlags.Ephemeral }).catch(() => {});
                        }
                    }
                }

                const fileAttachment = filePath ? new AttachmentBuilder(filePath) : null;
                let deleteDelay = 0; // Default to immediate deletion
                let transcriptPosted = false; // Track if transcript is posted 
                //////////////////////////////////

                if (interaction.customId === 'confirm_close_ticket_dm') {
                    const user = await client.users.fetch(user_id).catch(() => null);
                    if (!user) {
                        logger.warn('❌ Could not fetch user for DMing transcript.');
                    } else {
                        try {
                            await user.send({
                                content: '**Here is the transcript for your closed ticket.**\n\nYou can open this file in any web browser.',
                                files: [fileAttachment]
                            });
                            deleteDelay = 0; // Immediate deletion

                            if (!interaction.replied && !interaction.deferred) {
                                await interaction.update({
                                    content: `<@${user_id}> ✅ This ticket has been closed.\n\n_This channel will be deleted immediately._`,
                                    components: []
                                });
                            } else {
                                await ticketChannel.send({
                                    content: `<@${user_id}> ✅ This ticket has been closed.\n\n_This channel will be deleted immediately._`,
                                    components: []
                                });
                            }

                            // Delete immediately
                            if (ticketChannel.deletable) {
                                await ticketChannel.delete().catch(err => {
                                    if (err.code !== 10003) {
                                        logger.error(`❌ Failed to delete channel ${ticketChannel.id}:`, err);
                                    }
                                });
                            }
                            scheduledClosures.delete(ticketChannel.id);
                        } catch (dmError) {
                            logger.error('❌ Failed to DM transcript to user:', dmError);
                            if (!interaction.replied && !interaction.deferred) {
                                await interaction.update({
                                    content: `<@${user_id}> ⚠️ Could not send the transcript via DM. You likely have DMs disabled, so here it is instead.\n\nYou can open this file in any web browser. This channel will be deleted in **24 hours** to give you time to download the transcript.`,
                                    files: [fileAttachment],
                                    components: [deleteNowRow]
                                });
                            } else {
                                await ticketChannel.send({
                                    content: `<@${user_id}> ⚠️ Could not send the transcript via DM. You likely have DMs disabled, so here it is instead.\n\nYou can open this file in any web browser. This channel will be deleted in **24 hours** to give you time to download the transcript.`,
                                    files: [fileAttachment],
                                    components: [deleteNowRow]
                                });
                            }
                            deleteDelay = 86400000; // 24 hours
                            transcriptPosted = true;
                        }
                    }
                }

                if (interaction.customId === 'confirm_close_ticket_post') {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.update({
                            content: `<@${user_id}> ✅ This ticket has been closed. Here’s your transcript!\n\nYou can open this file in any web browser. This channel will be deleted in **24 hours** to give you time to download the transcript.`,
                            files: [fileAttachment],
                            components: [deleteNowRow]
                        });
                    } else {
                        await ticketChannel.send({
                            content: `<@${user_id}> ✅ This ticket has been closed. Here’s your transcript!\n\nYou can open this file in any web browser. This channel will be deleted in **24 hours** to give you time to download the transcript.`,
                            files: [fileAttachment],
                            components: [deleteNowRow]
                        });
                    }
                    deleteDelay = 86400000; // 24 hours
                    transcriptPosted = true;
                }

                if (interaction.customId === 'confirm_close_ticket_no_transcript') {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.update({
                            content: `<@${user_id}> ✅ This ticket has been closed. No transcript was requested.\n\n_This channel will be deleted immediately._`,
                            components: []
                        });
                    } else {
                        await ticketChannel.send({
                            content: `<@${user_id}> ✅ This ticket has been closed. No transcript was requested.\n\n_This channel will be deleted immediately._`,
                            components: []
                        });
                    }

                    // Delete immediately
                    if (ticketChannel.deletable) {
                        await ticketChannel.delete().catch(err => {
                            if (err.code !== 10003) {
                                logger.error(`❌ Failed to delete channel ${ticketChannel.id}:`, err);
                            }
                        });
                    }
                    scheduledClosures.delete(ticketChannel.id);
                }

                // Clear any previous scheduled timeout to prevent duplicates
                const existingTimeout = scheduledClosures.get(interaction.channelId);
                if (existingTimeout) {
                    clearTimeout(existingTimeout);
                    scheduledClosures.delete(interaction.channelId);
                }

                // Schedule delete if delay is greater than 0
                if (deleteDelay > 0) {
                    const timeout = setTimeout(async () => {
                        const channel = await client.channels.fetch(ticketChannel.id).catch(() => null);
                        if (!channel) {
                            logger.info(`ℹ️ Channel ${ticketChannel.id} already deleted or inaccessible.`);
                            scheduledClosures.delete(ticketChannel.id);
                            return;
                        }
                        if (channel.deletable) {
                            await channel.delete().catch(err => {
                                if (err.code !== 10003) {
                                    logger.error(`❌ Failed to delete channel ${ticketChannel.id}:`, err);
                                }
                            });
                        }
                        scheduledClosures.delete(ticketChannel.id);
                    }, deleteDelay);

                    scheduledClosures.set(interaction.channelId, timeout);
                }

                // Upload to Drive for staff (if not already uploaded)
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

                // Clean up local file
                if (filePath) {
                    const fs = require('fs');
                    fs.unlink(filePath, (err) => {
                        if (err) logger.error(`⚠️ Could not delete local transcript file: ${filePath}`, err);
                        else logger.info(`🧹 Deleted local transcript: ${filePath}`);
                    });
                }

                // Remove from active closing tickets tracking
                closingTickets.delete(ticketChannel.id);
            }
        } catch (err) {
            logger.error('❌ Unhandled error in InteractionCreate handler:', err);
        }
    });
}; */