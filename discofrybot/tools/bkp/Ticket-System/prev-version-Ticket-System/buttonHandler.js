// Ticket-System/buttonHandler.js
const { Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, AttachmentBuilder } = require('discord.js');
const logger = require('../logger');
const { supabase } = require('./supabase');
const { scheduledClosures, closingTickets, ticketClosePrompted, recentInteractions, canceledTickets, cancelMessages } = require('./shared');
const { generateTranscriptHTML } = require('./transcriptGenerator');
const { uploadTranscriptToDrive } = require('./driveUploader');
const fs = require('fs');

const TICKET_CLOSE_COOLDOWN_MS = 10 * 60 * 1000;

const staffRoleId = process.env.TICKET_MOD_ROLE;
const INTERACTION_SPAM_INTERVAL_MS = 5000; // 5 seconds between button clicks
const deleteNowRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('delete_now')
      .setLabel('🗑️ Delete Now')
      .setStyle(ButtonStyle.Danger)
  );

module.exports = (client) => {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;

    const { customId } = interaction;

    try {
      // 🛡️ Global spam protection
      const isStaff = interaction.member?.roles?.cache?.has(process.env.TICKET_MOD_ROLE);
      const key = `${interaction.user.id}_${interaction.customId}`;
      const now = Date.now();
      const lastUsed = recentInteractions.get(key);
      const ticketChannel = interaction.channel;

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
      //******************************************/
      // 🎯 Handle Buttons //
      //If claim_ticket button is clicked //
      //******************************************/
        if (customId === 'claim_ticket') {
                if (!interaction.member.roles.cache.has(staffRoleId)) {
                if (!interaction.replied && !interaction.deferred) {
                    return await interaction.reply({
                    content: '❌ Only staff can claim tickets.',
                    flags: MessageFlags.Ephemeral
                    });
                } else {
                    return await interaction.followUp({
                    content: '❌ Only staff can claim tickets.',
                    flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                }
                }
            
                
                const { data: ticketData } = await supabase
                .from('tickets')
                .select('id, claimed_by')
                .eq('channel_id', ticketChannel.id)
                .single();
            
                if (ticketData?.claimed_by) {
                if (!interaction.replied && !interaction.deferred) {
                    return await interaction.reply({
                    content: `⚠️ This ticket is already claimed by <@${ticketData.claimed_by}>.`,
                    flags: MessageFlags.Ephemeral
                    });
                } else {
                    return await interaction.followUp({
                    content: `⚠️ This ticket is already claimed by <@${ticketData.claimed_by}>.`,
                    flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                }
                }
            
                await supabase
                .from('tickets')
                .update({ claimed_by: interaction.user.id })
                .eq('channel_id', ticketChannel.id);
            
                await supabase.from('staff_actions').insert({
                ticket_id: ticketData?.id,
                staff_id: interaction.user.id,
                action: 'claim'
                });
            
                const unclaimRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('unclaim_ticket')
                    .setLabel('❌ Unclaim Ticket')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('request_close')
                    .setLabel('⏳ Schedule Close')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('🔒 Close Ticket')
                    .setStyle(ButtonStyle.Danger)
                    
                );
            
                await interaction.update({
                content: `🛠️ Ticket claimed by <@${interaction.user.id}>`,
                components: [unclaimRow]
                });
            }

            //******************************************/
            // If unclaim_ticket button is clicked //
            //******************************************/
            else if (customId === 'unclaim_ticket') {
                
                const { data: ticketData } = await supabase
                .from('tickets')
                .select('claimed_by')
                .eq('channel_id', ticketChannel.id)
                .single();
            
                if (!ticketData?.claimed_by) {
                return await interaction.reply({
                    content: '⚠️ This ticket hasn’t been claimed yet.',
                    flags: MessageFlags.Ephemeral
                });
                }
            
                if (ticketData.claimed_by !== interaction.user.id) {
                return await interaction.reply({
                    content: `❌ Only <@${ticketData.claimed_by}> can unclaim this ticket.`,
                    flags: MessageFlags.Ephemeral
                });
                }
            
                await supabase
                .from('tickets')
                .update({ claimed_by: null })
                .eq('channel_id', ticketChannel.id);
            
                await supabase.from('staff_actions').insert({
                ticket_id: ticketData?.id,
                staff_id: interaction.user.id,
                action: 'unclaim'
                });
            
                const claimRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('claim_ticket')
                    .setLabel('🤝 Claim Ticket(For Staff only)')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('request_close')
                    .setLabel('⏳ Schedule Close(For Staff only)')
                    .setStyle(ButtonStyle.Secondary),                
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('🔒 Close Ticket')
                    .setStyle(ButtonStyle.Danger)
                );
            
                await interaction.update({
                content: `Ticket is now unclaimed.`,
                components: [claimRow]
                });
            }

            //******************************************/
            // If close_ticket button is clicked //
            //******************************************/
            else if (customId === 'close_ticket') {
                
                const { data: ticketMeta } = await supabase
                .from('tickets')
                .select('user_id, scheduled_close_at')
                .eq('channel_id', ticketChannel.id)
                .single();
            
                if (ticketClosePrompted.has(ticketChannel.id)) {
                return await interaction.reply({
                    content: '⚠️ This ticket is already awaiting closure confirmation.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
                }
            
                if (scheduledClosures.has(ticketChannel.id) || (ticketMeta?.scheduled_close_at && ticketMeta.scheduled_close_at !== 'transcribed')) {
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
            
                return await interaction.reply({
                    content: '⏳ A scheduled close is already active for this ticket. Would you like to cancel it and close now, or keep the schedule?',
                    components: [cancelRow],
                    flags: MessageFlags.Ephemeral
                });
                }

                //******************************************/
                // 🛡️ Mark the ticket as awaiting close confirmation //
                //******************************************/
                ticketClosePrompted.add(ticketChannel.id);
                setTimeout(() => {
                ticketClosePrompted.delete(ticketChannel.id);
                }, 2 * 60 * 1000); // 2 minutes timeout to prevent stuck channels

                // 📋 Log the close_prompt action
                const ticketIdMatch = ticketChannel.name.match(/^closed-(\d+)/) || ticketChannel.name.match(/^(\d+)/);

                await supabase.from('staff_actions').insert({
                ticket_id: ticketIdMatch ? parseInt(ticketIdMatch[1]) : null,
                staff_id: interaction.user.id,
                action: 'close_prompt'
                });
                const isAuthor = ticketMeta?.user_id === interaction.user.id;
            
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
            
                if (isAuthor) {
                await interaction.reply({
                    content: `Would you like a copy of your ticket transcript before we close this ticket?\n(We always save it internally on our end.)`,
                    components: [transcriptChoiceButtons],
                    flags: MessageFlags.Ephemeral
                });
                } else {
                await interaction.reply({
                    content: `You're about to close this ticket on behalf of the user. The transcript will be posted in this channel.`,
                    components: [staffCloseButtons],
                    flags: MessageFlags.Ephemeral
                });
                }
            }

          //******************************************/
          // If wants_transcript button is clicked //
          //******************************************/
          else if (customId === 'wants_transcript') {
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
                await interaction.update({
                    content: `Do you have DMs enabled to receive the HTML transcript privately?\nIf not, I can post it here instead.\n\nYou can open the transcript in any web browser.`,
                    components: [deliveryOptions]
                });
                } else {
                await interaction.followUp({
                    content: `Do you have DMs enabled to receive the HTML transcript privately?\nIf not, I can post it here instead.\n\nYou can open the transcript in any web browser.`,
                    components: [deliveryOptions]
                }).catch(() => {});
                }
            }

          //******************************************/
          // If no_transcript button is clicked //
          //******************************************/          
          else if (customId === 'no_transcript') {
                
            
                const { data: ticketMeta } = await supabase
                .from('tickets')
                .select('user_id, id')
                .eq('channel_id', ticketChannel.id)
                .single();
            
                const user_id = ticketMeta?.user_id;
                let ticketId = ticketMeta?.id;
                
                // Fallback if no ticketId              
                if (!ticketId) {
                  const ticketIdMatch = ticketChannel.name.match(/^closed-(\d+)/) || ticketChannel.name.match(/^(\d+)/);
                  ticketId = ticketIdMatch ? parseInt(ticketIdMatch[1]) : null;
                  if (!ticketId) {
                    logger.error(`❌ Could not extract ticket ID from channel name: ${ticketChannel.name}`);
                    return await interaction.followUp({
                      content: '⚠️ Ticket ID could not be determined.',
                      flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                  }
                }
              
                // Call close_ticket RPC
                const { error } = await supabase.rpc('close_ticket', {
                  p_channel_id: ticketChannel.id,
                  p_status: 'closed',
                  p_closed_at: new Date().toISOString(),
                  p_scheduled_close_at: null
                });
              
                if (error) {
                  logger.error('❌ Error executing close_ticket RPC:', error, error.message);
                  return await interaction.followUp({
                    content: '⚠️ Failed to close the ticket. Please try again later.',
                    flags: MessageFlags.Ephemeral
                  }).catch(() => {});
                }
              
                // Log staff action
                await supabase.from('staff_actions').insert({
                  ticket_id: ticketId,
                  staff_id: interaction.user.id,
                  action: 'no_transcript'
                });

                // Move the ticket channel to "Closed Tickets" category and rename
                try {
                const currentChannelName = ticketChannel.name;
                if (!currentChannelName.startsWith('closed-')) {
                    await ticketChannel.setName(`closed-${currentChannelName}`);
                    logger.info(`Renamed ticket channel ${ticketChannel.id} to closed-${currentChannelName}`);
                }
                await ticketChannel.setParent(process.env.CLOSED_TICKET_CAT, { lockPermissions: false });
                logger.info(`Moved ticket channel ${ticketChannel.id} to Closed Tickets category.`);
                } catch (error) {
                logger.error(`❌ Failed to move or rename ticket channel ${ticketChannel.id}:`, error.message);
                }

                // No transcript, delete immediately after closure            
                await ticketChannel.send({
                content: `<@${user_id}> ✅ This ticket has been closed. No transcript was requested.\n\n_This channel will be deleted immediately._`,
                components: []
                });
                        
                // Clear scheduled closure if any
                const existingTimeout = scheduledClosures.get(ticketChannel.id);
                if (existingTimeout) {
                clearTimeout(existingTimeout);
                scheduledClosures.delete(ticketChannel.id);
                logger.info(`🧹 Cleaned up scheduled closure for ${ticketChannel.id}`);
                }
            
                // Delete the channel immediately
                if (ticketChannel.deletable) {
                await ticketChannel.delete().catch(err => {
                    if (err.code !== 10003) {
                    logger.error(`❌ Failed to delete channel ${ticketChannel.id}:`, err);
                    }
                });
                }
                scheduledClosures.delete(ticketChannel.id);
                return;
            }

            //******************************************/
            //* If cancel_close_ticket clicked */
            //******************************************/
            else if (customId === 'cancel_close_ticket') {              
                // Remove from close-prompted set
                ticketClosePrompted.delete(ticketChannel.id);
              
                const ticketIdMatch = ticketChannel.name.match(/^closed-(\d+)/) || ticketChannel.name.match(/^(\d+)/);
              
                await supabase.from('staff_actions').insert({
                  ticket_id: ticketIdMatch ? parseInt(ticketIdMatch[1]) : null,
                  staff_id: interaction.user.id,
                  action: 'cancel_close'
                });
              
                if (!interaction.replied && !interaction.deferred) {
                  await interaction.update({
                    content: '❌ Ticket closure canceled.',
                    components: []
                  });
                } else {
                  await interaction.followUp({
                    content: '❌ Ticket closure canceled.',
                    components: []
                  }).catch(() => {});
                }
            }

            //******************************************/
            // If dm_transcript button is clicked //
            //******************************************/
            else if (customId === 'dm_transcript') {
                const deliveryOptions = new ActionRowBuilder().addComponents(
                  new ButtonBuilder()
                    .setCustomId('confirm_close_ticket_dm')
                    .setLabel('✅ Confirm & Send via DM')
                    .setStyle(ButtonStyle.Success),
                  new ButtonBuilder()
                    .setCustomId('cancel_close_ticket')
                    .setLabel('❌ Cancel')
                    .setStyle(ButtonStyle.Danger)
                );
              
                if (!interaction.replied && !interaction.deferred) {
                  await interaction.update({
                    content: '✅ Great! Please confirm below and I will send your HTML transcript via DM before closing the ticket:',
                    components: [deliveryOptions]
                  });
                } else {
                  await interaction.followUp({
                    content: '✅ Great! Please confirm below and I will send your HTML transcript via DM before closing the ticket:',
                    components: [deliveryOptions]
                  }).catch(() => {});
                }
              }

            //******************************************/
            // If post_transcript button is clicked //
            //*****************************************//
            else if (customId === 'post_transcript') {
                const deliveryOptions = new ActionRowBuilder().addComponents(
                  new ButtonBuilder()
                    .setCustomId('confirm_close_ticket_post')
                    .setLabel('✅ Confirm & Post Transcript Here')
                    .setStyle(ButtonStyle.Success),
                  new ButtonBuilder()
                    .setCustomId('cancel_close_ticket')
                    .setLabel('❌ Cancel')
                    .setStyle(ButtonStyle.Danger)
                );
              
                if (!interaction.replied && !interaction.deferred) {
                  await interaction.update({
                    content: '✅ Got it! Please confirm below and I will post your HTML transcript in this channel before closing the ticket:',
                    components: [deliveryOptions]
                  });
                } else {
                  await interaction.followUp({
                    content: '✅ Got it! Please confirm below and I will post your HTML transcript in this channel before closing the ticket:',
                    components: [deliveryOptions]
                  }).catch(() => {});
                }
              }
              

              //******************************************/
              // If confirm_close_ticket_dm, confirm_close_ticket_post, or confirm_close_ticket_no_transcript is clicked //
              //******************************************/
              else if (['confirm_close_ticket_dm',
                        'confirm_close_ticket_post', 
                        'confirm_close_ticket_no_transcript'
                    ].includes(customId)) {

                // Cooldown check
                const now = Date.now();
                const isStaff = interaction.member?.roles?.cache?.has(process.env.TICKET_MOD_ROLE);
                const isAutoClose = !interaction.member;

                if (!isStaff && !isAutoClose) {
                    const { data: cooldownData, error } = await supabase
                      .from('cooldowns')
                      .select('last_action')
                      .eq('user_id', interaction.user.id)
                      .eq('action_type', 'ticket_close')
                      .single();
                  
                    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
                      logger.error('❌ Error checking cooldown:', error.message);
                      closingTickets.delete(ticketChannel.id);
                      return await interaction.followUp({
                        content: '⚠️ Failed to check cooldown. Please try again later.',
                        flags: MessageFlags.Ephemeral
                      }).catch(() => {});
                    }
                  
                    const lastClose = cooldownData?.last_action ? new Date(cooldownData.last_action).getTime() : null;
                  
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
                  
                    // Update or insert cooldown
                    const { error: upsertError } = await supabase
                      .from('cooldowns')
                      .upsert({
                        user_id: interaction.user.id,
                        action_type: 'ticket_close',
                        last_action: new Date().toISOString()
                      }, { onConflict: ['user_id', 'action_type'] });
                  
                    if (upsertError) {
                      logger.error('❌ Error updating cooldown:', upsertError.message);
                      closingTickets.delete(ticketChannel.id);
                      return await interaction.followUp({
                        content: '⚠️ Failed to update cooldown. Please try again later.',
                        flags: MessageFlags.Ephemeral
                      }).catch(() => {});
                    }
                  }

                // Check if already closing                
                    if (closingTickets.has(ticketChannel.id)) {
                    return await interaction.followUp({
                        content: '⚠️ This ticket is already being closed. Please wait...',
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                    }
                    closingTickets.add(ticketChannel.id);
                
                      // Fetch Ticket Info
                    const { data: ticketMeta } = await supabase
                    .from('tickets')
                    .select('id, user_id, scheduled_close_at')
                    .eq('channel_id', ticketChannel.id)
                    .single();
                
                    let ticketId = ticketMeta?.id;
                    const user_id = ticketMeta?.user_id;

                    // Fallback if no ticketId
                    if (!ticketId) {
                        const ticketIdMatch = ticketChannel.name.match(/^closed-(\d+)/) || ticketChannel.name.match(/^(\d+)/);
                        ticketId = ticketIdMatch ? parseInt(ticketIdMatch[1]) : null;
              
                        if (!ticketId) {
                          logger.error(`❌ Could not extract ticket ID from channel name: ${ticketChannel.name}`);
                          closingTickets.delete(ticketChannel.id);
                          return await interaction.followUp({ content: '⚠️ Ticket ID could not be determined. Transcript may fail.', flags: MessageFlags.Ephemeral }).catch(() => {});
                        }
                      }
              
                      // Call close_ticket RPC
                      const { error } = await supabase.rpc('close_ticket', {
                        p_channel_id: ticketChannel.id,
                        p_status: 'closed',
                        p_closed_at: new Date().toISOString(),
                        p_scheduled_close_at: null
                      });
              
                      if (error) {
                        logger.error('❌ Error executing close_ticket RPC:', error, error.message);
                        closingTickets.delete(ticketChannel.id);
                        return await interaction.followUp({
                          content: '⚠️ Failed to close the ticket. Please try again later.',
                          flags: MessageFlags.Ephemeral
                        }).catch(() => {});
                      }

                    // Log into staff_actions
                    await supabase.from('staff_actions').insert({
                        ticket_id: ticketId,
                        staff_id: interaction.user.id,
                        action: customId === 'confirm_close_ticket_dm' ? 'confirm_dm' :
                                customId === 'confirm_close_ticket_post' ? 'confirm_post' :
                                'confirm_no_transcript'
                    });
                                
                    // Move to Closed Tickets category
                    try {
                    const currentChannelName = ticketChannel.name;
                    if (!currentChannelName.startsWith('closed-')) {
                        await ticketChannel.setName(`closed-${currentChannelName}`);
                        logger.info(`Renamed ticket channel ${ticketChannel.id} to closed-${currentChannelName}`);
                    }
                    await ticketChannel.setParent(process.env.CLOSED_TICKET_CAT, { lockPermissions: false });
                    logger.info(`Moved ticket channel ${ticketChannel.id} to Closed Tickets category.`);
                    } catch (moveError) {
                    logger.error(`❌ Failed to move/rename ticket channel ${ticketChannel.id}:`, moveError.message);
                    }
                
                    // Generate Transcript (if needed)
                    let filePath;
                    const transcriptExists = ticketMeta?.is_transcribed === true;

                    if (!interaction.customId.includes('no_transcript') && !transcriptExists) {
                    const ticketUser = await client.users.fetch(user_id).catch(() => null);
                    filePath = await generateTranscriptHTML(ticketId, ticketUser?.username || 'user');
                    
                    if (!filePath) {
                        logger.error('❌ Error generating transcript HTML file.');
                        closingTickets.delete(ticketChannel.id);
                        return await interaction.followUp({ content: '⚠️ Failed to generate transcript.', flags: MessageFlags.Ephemeral }).catch(() => {});
                    }
                    }

                    const fileAttachment = filePath ? new AttachmentBuilder(filePath) : null;
                    let deleteDelay = 0; // 0 = immediate deletion
                    let transcriptPosted = false;
                
                    // Handle DM or Post transcript
                    if (customId === 'confirm_close_ticket_dm' && fileAttachment) {
                    const user = await client.users.fetch(user_id).catch(() => null);
                    if (!user) {
                        logger.warn('❌ Could not fetch user for DMing transcript.');
                    } else {
                        try {
                        await user.send({
                            content: '**Here is the transcript for your closed ticket.**\n\nYou can open this file in any web browser.',
                            files: [fileAttachment],
                        });
                
                        await ticketChannel.send({
                            content: `<@${user_id}> ✅ Ticket closed. Transcript has been sent to your DMs.\n\n_This channel will be deleted in 30 seconds._`
                          });
                  
                          deleteDelay = 30000; // 30 seconds after DM success
                        } catch (dmError) {
                          logger.error('❌ Failed to DM transcript, posting instead:', dmError);
                  
                          await ticketChannel.send({
                            content: `<@${user_id}> ⚠️ Could not send transcript via DM. Posting here instead.\n\n_This channel will be deleted in **24 hours**. You can also delete it manually below:_`,
                            files: [fileAttachment],
                            components: [deleteNowRow]
                          });
                  
                          deleteDelay = 86400000; // 24 hours fallback
                          transcriptPosted = true;
                        }
                      }
                    } else if (customId === 'confirm_close_ticket_post' && fileAttachment) {
                      await ticketChannel.send({
                        content: `<@${user_id}> ✅ Ticket closed. Here’s your transcript:\n\n_This channel will be deleted in **24 hours**. You can also delete it manually below:_`,
                        files: [fileAttachment],
                        components: [deleteNowRow]
                      });
                  
                      deleteDelay = 86400000;
                      transcriptPosted = true;
                    } else if (customId === 'confirm_close_ticket_no_transcript') {
                      await ticketChannel.send({
                        content: `<@${user_id}> ✅ Ticket closed. No transcript requested.\n\n_This channel will be deleted in 30 seconds._`
                      });
                  
                      deleteDelay = 30000;
                    }
                  
                    // Upload Transcript to Drive if generated
                    if (filePath && !transcriptExists) {
                    const driveLink = await uploadTranscriptToDrive(filePath);
                    if (!driveLink) {
                        logger.error('❌ Failed to upload transcript to Drive.');
                        closingTickets.delete(ticketChannel.id);
                        return await interaction.followUp({
                          content: '⚠️ Failed to upload transcript to Drive. Please try again.',
                          flags: MessageFlags.Ephemeral
                        }).catch(() => {});
                      }
                      logger.info(`✅ Uploaded to Drive: ${driveLink}`);
                      await supabase
                        .from('tickets')
                        .update({ is_transcribed: true })
                        .eq('id', ticketId);
                
                    // Delete local file
                    fs.unlink(filePath, (err) => {
                        if (err) logger.error(`⚠️ Failed to delete local transcript file: ${filePath}`, err);
                        else logger.info(`🧹 Deleted local transcript: ${filePath}`);
                    });
                    }
                
                    // Clear any previous scheduled closure
                    const existingTimeout = scheduledClosures.get(ticketChannel.id);
                    if (existingTimeout) {
                    clearTimeout(existingTimeout);
                    scheduledClosures.delete(ticketChannel.id);
                    logger.info(`🧹 Cleaned up scheduled closure for ${ticketChannel.id}`);
                    }
                
                    // Schedule Deletion
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
                
                    scheduledClosures.set(ticketChannel.id, timeout);
                
                    } else {
                    if (ticketChannel.deletable) {
                        await ticketChannel.delete().catch(err => {
                        if (err.code !== 10003) {
                            logger.error(`❌ Failed to delete channel ${ticketChannel.id}:`, err);
                        }
                        });
                    }
                    scheduledClosures.delete(ticketChannel.id);
                    }
                
                    closingTickets.delete(ticketChannel.id);
                    return;
                }

            //******************************************/
            // If request_close button is clicked //
            //******************************************/
            // Handle "Request Close" button (initiates scheduled close)//
            else if (customId === 'request_close') {
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
                        content: '⚠️ A scheduled auto-close is already active for this ticket ⏳. Please **Cancel Auto-Close** first if you want to pick a new delay.',
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
                //******************************************/
                // If close_delay_* button is clicked //
                //******************************************/
            else if (customId.startsWith('close_delay_')) {

                const staffUser = interaction.user;
                const parts = interaction.customId.split('_');
                const delayStr = parts[2]; // e.g., "1m", "12h", "24h", "48h"
                const transcriptOption = parts[3]; // dm, post, or no
                let delayMs;

                // Defer the interaction immediately to avoid timeout
                await interaction.deferUpdate();
                // Remove the ephemeral message with delay options
                const delayEmoji = delayStr.includes('m') ? '🕐' : '🕑';
                    await interaction.editReply({
                    content: `${delayEmoji} You selected **${delayStr}** delay (${transcriptOption === 'dm' ? 'DM Transcript' : transcriptOption === 'post' ? 'Post Transcript' : 'No Transcript'})!`,
                    components: []
                });

                // 🛡️ Fetch fresh ticket status after clearing old scheduled closures
                const { data: freshTicketData } = await supabase
                    .from('tickets')
                    .select('status, scheduled_close_at')
                    .eq('channel_id', ticketChannel.id)
                    .single();

                if (!freshTicketData) {
                    await interaction.followUp({
                        content: '⚠️ Failed to fetch ticket status. Please try again.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                if (scheduledClosures.has(ticketChannel.id) || (freshTicketData?.scheduled_close_at && freshTicketData.scheduled_close_at !== 'transcribed')) {
                    await interaction.followUp({
                        content: '⚠️ A scheduled auto-close is already active for this ticket ⏳. Please **Cancel Auto-Close** first if you want to pick a new delay.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }


                const ticketStatus = freshTicketData.status;

                if (ticketStatus === 'closed') {
                    await interaction.followUp({
                        content: '⚠️ This ticket is already closed.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
               

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

                if (scheduledClosures.has(ticketChannel.id) || (ticketData?.scheduled_close_at && ticketData.scheduled_close_at !== 'transcribed')) {
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
                        content: '⚠️ A scheduled auto-close is already active for this ticket ⏳. Please **Cancel Auto-Close** first if you want to pick a new delay.',
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
                const transcriptExists = ticketMeta?.is_transcribed === true;

                let filePath;
                if (transcriptOption !== 'no' && !transcriptExists && !filePath) {
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
                    // 🛡️ After ALL sending logic, now check:
                    if (deleteDelay === 0) {
                        const existingTimeout = scheduledClosures.get(ticketChannel.id);
                        if (existingTimeout) {
                            clearTimeout(existingTimeout);
                            scheduledClosures.delete(ticketChannel.id);
                            logger.info(`🛡️ Cleared scheduled closure immediately because ticket will delete soon: ${ticketChannel.id}`);
                        }
                    }

                // Upload transcript to Google Drive immediately (if not already uploaded)
                if (filePath && !transcriptExists) {
                    const newDriveLink = await uploadTranscriptToDrive(filePath);
                    if (newDriveLink) {
                        logger.info(`✅ Uploaded to Drive: ${newDriveLink}`);
                        // Mark transcript as generated using scheduled_close_at
                        await supabase
                            .from('tickets')
                            .update({ is_transcribed: true })
                            .eq('id', ticketId);
                    }
                }

                // Clean local file immediately (if generated)
                if (filePath) {
                    fs.unlink(filePath, (err) => {
                        if (err) logger.error(`⚠️ Could not delete local transcript file: ${filePath}`, err);
                        else logger.info(`🧹 Deleted local transcript: ${filePath}`);
                    });
                }

                // Clear any previous scheduled timeout to prevent duplicates
                const existingTimeout = scheduledClosures.get(ticketChannel.id);
                if (existingTimeout) {
                    clearTimeout(existingTimeout);
                    scheduledClosures.delete(ticketChannel.id);
                    logger.info(`🧹 Cleaned up scheduled closure for ${ticketChannel.id}`);
                }

                // Schedule the closure
                const timeout = setTimeout(async () => {
                    try {
                        // 🛡️ Skip if canceled manually
                        if (canceledTickets.has(ticketChannel.id)) {
                            logger.info(`🛡️ Aborting scheduled closure because ticket ${ticketChannel.id} was manually canceled.`);
                            canceledTickets.delete(ticketChannel.id); // clean memory
                            scheduledClosures.delete(ticketChannel.id); // clean memory
                            return;
                        }

                        // 🛡️ Extra: Skip if somehow scheduledClosures is missing (backup protection)
                        if (!scheduledClosures.has(ticketChannel.id)) {
                            logger.info(`ℹ️ Skipping scheduled closure for ${ticketChannel.id} because timeout was cleared manually.`);
                            return;
                        }

                    // 🛡️ Double-check ticket status before proceeding
                        const { data: latestTicketStatus } = await supabase
                        .from('tickets')
                        .select('status')
                        .eq('channel_id', ticketChannel.id)
                        .single();

                        if (!latestTicketStatus || latestTicketStatus.status !== 'scheduled_close') {
                        logger.info(`ℹ️ Skipping scheduled closure for ${ticketChannel.id} because status is now ${latestTicketStatus?.status || 'unknown'}`);
                        scheduledClosures.delete(ticketChannel.id);
                        return;
                        }

                        // ✅ Only after confirming, fetch the channel
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
                    
                    // Clean up cancel auto-close message if it exists
                    const cancelMessage = cancelMessages.get(channel.id);
                    if (cancelMessage) {
                        try {
                            await cancelMessage.edit({
                                content: cancelMessage.content,
                                components: []
                            });
                            cancelMessages.delete(channel.id);
                            logger.info(`🧹 Cleared cancel buttons after ticket closed for ${channel.id}`);
                        } catch (error) {
                            logger.error(`❌ Failed to clear cancel buttons after closure for ${channel.id}:`, error.message);
                        }
                    }

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
                        }}
                    } catch (error) {
                        logger.error(`❌ Unexpected error during scheduled closure of ${interaction.channelId}:`, error);
                    } finally {
                        const existingTimeout = scheduledClosures.get(ticketChannel.id);
                        if (existingTimeout) {
                            clearTimeout(existingTimeout);
                            scheduledClosures.delete(ticketChannel.id);
                            logger.info(`🧹 Cleaned up scheduled closure for ${ticketChannel.id}`);
                        }                    
                    }
                }, delayMs);

                scheduledClosures.set(ticketChannel.id, timeout);

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
            }
            
                //******************************************/
                // If cancel_auto_close button is clicked //
                //******************************************/
            else if (customId === 'cancel_auto_close') {

            // ✅ Fetch latest ticket data before checking status
            const { data: ticketDataDelay } = await supabase
            .from('tickets')
            .select('status')
            .eq('channel_id', ticketChannel.id)
            .single();

        const ticketStatus = ticketDataDelay.status;
        if (ticketStatus === 'closed') {
            await interaction.reply({
                content: '⚠️ This ticket is already closed.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        if (!scheduledClosures.has(ticketChannel.id)) {
            await interaction.reply({
                content: '⚠️ No scheduled close is active for this ticket.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const existingTimeout = scheduledClosures.get(ticketChannel.id);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
            scheduledClosures.delete(ticketChannel.id);
            canceledTickets.add(ticketChannel.id);
            logger.info(`🛡️ Marked ticket ${ticketChannel.id} as canceled for scheduled closure.`);
            logger.info(`🧹 Cleaned up scheduled closure for ${ticketChannel.id}`);
            // 🧹 Auto-clean canceledTickets entry after 5 minutes
                setTimeout(() => {
                    canceledTickets.delete(ticketChannel.id);
                    logger.info(`🧹 Cleaned up canceled ticket entry for ${ticketChannel.id}`);
                }, 5 * 60 * 1000); // 5 minutes
        }

        // Remove the cancel message
        const cancelMessage = cancelMessages.get(interaction.channelId);
        if (cancelMessage) {
            try {
                await cancelMessage.edit({
                    content: cancelMessage.content,
                    components: []
                });
                cancelMessages.delete(interaction.channelId);
            } catch (editError) {
                logger.error(`❌ Failed to edit cancel message for channel ${interaction.channelId}:`, editError.message);
            }
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
            content: `🛡️ Auto-close canceled! <@${user_id}>, your ticket is now **open** and active again.`,
            components: []          
        });
        return;    

        //******************************************/
        // If delete_now button is clicked //
        //******************************************/
    } else if (customId === 'delete_now') {
        
        if (!ticketChannel || !ticketChannel.deletable) {
          return await interaction.reply({
            content: '⚠️ I don’t have permission to delete this channel.',
            flags: MessageFlags.Ephemeral
          }).catch(() => {});
        }
      
        // Check ticket status
        const { data: ticketMeta } = await supabase
          .from('tickets')
          .select('id, status')
          .eq('channel_id', ticketChannel.id)
          .single();
      
        if (!ticketMeta) {
          logger.warn(`⚠️ Ticket not found for channel ${ticketChannel.id}, proceeding with deletion.`);
        } else if (ticketMeta.status !== 'closed') {
          // Close ticket if not already closed
          const { error } = await supabase.rpc('close_ticket', {
            p_channel_id: ticketChannel.id,
            p_status: 'closed',
            p_closed_at: new Date().toISOString(),
            p_scheduled_close_at: null
          });
      
          if (error) {
            logger.error('❌ Error executing close_ticket RPC:', error, error.message);
            return await interaction.reply({
              content: '⚠️ Failed to close ticket before deletion. Please try again.',
              flags: MessageFlags.Ephemeral
            }).catch(() => {});
          }
      
          // Log staff action
          await supabase.from('staff_actions').insert({
            ticket_id: ticketMeta.id,
            staff_id: interaction.user.id,
            action: 'delete_now'
          });
        }
      
        // Clear scheduled closure
        const scheduledTimeout = scheduledClosures.get(ticketChannel.id);
        if (scheduledTimeout) {
          clearTimeout(scheduledTimeout);
          scheduledClosures.delete(ticketChannel.id);
        }
      
        await interaction.reply({
          content: '🧹 Deleting ticket now... _Please wait a few seconds._',
          flags: MessageFlags.Ephemeral
        });
      
        return await ticketChannel.delete().catch(err => {
          logger.error(`❌ Failed to delete ticket channel ${ticketChannel.id}:`, err);
        });
      }
      
      // (other buttons we migrate later)
    } catch (err) {
      logger.error('❌ Error handling button interaction:', err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '⚠️ An error occurred while processing the button.', flags: MessageFlags.Ephemeral });
      }
    }
  });
};
