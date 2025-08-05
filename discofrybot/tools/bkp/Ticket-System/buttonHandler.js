const { supabase } = require('./supabase');
const logger = require('../logger');
const { scheduledClosures, closingTickets, ticketClosePrompted, recentInteractions, cancelMessages } = require('./shared');
const { generateTranscriptHTML } = require('./transcriptGenerator');
const { uploadTranscriptToDrive } = require('./driveUploader');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags } = require('discord.js');

const CLOSED_TICKET_CAT = process.env.CLOSED_TICKET_CAT;
const staffRoleId = process.env.TICKET_MOD_ROLE;

const categoryIds = {
            order_tracking: process.env.TICKET_CAT_ORDER,
            registration: process.env.TICKET_CAT_REGISTRATION,
            miner_keys: process.env.TICKET_CAT_MINER_KEYS,
            rewards: process.env.TICKET_CAT_REWARDS,
            tech_support: process.env.TICKET_CAT_TECH_SUPPORT
        };

async function markTicketTranscribed(ticketId) {
  try {
    const { error } = await supabase
      .from('tickets')
      .update({ is_transcribed: true })
      .eq('channel_id', ticketId);
      
    if (error) {
      logger.error(`Failed to mark ticket ${ticketId} as transcribed: ${error.message}`);
      return false;
    }
    
    logger.info(`Ticket ${ticketId} marked as transcribed`);
    return true;
  } catch (err) {
    logger.error(`Error marking ticket ${ticketId} as transcribed: ${err.message}`);
    return false;
  }
}

// Function to restore scheduled closures
async function restoreScheduledClosures(client) {
  try {
    // Get all tickets with scheduled_close_at not null
    const { data, error } = await supabase
      .from('tickets')
      .select('id, scheduled_close_at, is_transcribed')
      .not('scheduled_close_at', 'is', null)
      .eq('status', 'open');
    
    if (error) {
      logger.error(`Failed to restore scheduled closures: ${error.message}`);
      return;
    }
    
    if (!data || data.length === 0) {
      logger.info('No scheduled closures to restore.');
      return;
    }
    
    logger.info(`Restoring ${data.length} scheduled ticket closures.`);
    
    // For each scheduled closure
    for (const ticket of data) {
      const closeTime = new Date(ticket.scheduled_close_at);
      const now = new Date();
      
      // If scheduled time is in the past, close the ticket now
      if (closeTime <= now) {
        logger.info(`Ticket ${ticket.id} was scheduled to close in the past, closing now.`);
        
        try {
          // Find the channel
          const channel = await findChannelForTicket(client, ticket.id);
          
          if (!channel) {
            logger.error(`Could not find channel for ticket ${ticket.id}, skipping auto-close.`);
            continue;
          }
          
          // Generate transcript
          const transcript = await generateTranscriptHTML(channel);
          
          // Upload to Drive
          if (transcript) {
            try {
              const uploadResult = await uploadTranscriptToDrive(transcript, ticket.id);
              logger.info(`Transcript for delayed closure of ticket ${ticket.id} uploaded to Drive: ${uploadResult.webViewLink}`);
              await markTicketTranscribed(ticket.id);
            } catch (err) {
              logger.error(`Failed to upload transcript for delayed closure of ticket ${ticket.id}: ${err.message}`);
            }
          }
          
          // Move to closed category
          if (channel.type === ChannelType.GuildText) {
            try {
              await channel.setParent(CLOSED_TICKET_CAT);
              await channel.setName(`closed-${channel.name}`);
            } catch (err) {
              logger.warn(`Failed to move/rename channel for delayed closure of ticket ${ticket.id}: ${err.message}`);
            }
          }
          
          // Close the ticket
          await closeTicket(ticket.id, { user: { id: ticket.created_by } }, 'Closed automatically after restart (scheduled time passed)');
          
          // Notify channel
          await channel.send('This ticket has been closed automatically as its scheduled closure time passed while the bot was offline.');
          
        } catch (err) {
          logger.error(`Error processing delayed closure for ticket ${ticket.id}: ${err.message}`);
        }
        
        continue;
      }
      
      // Calculate delay until scheduled close time
      const delayMs = closeTime.getTime() - now.getTime();
      
      // Set up the timeout
      const timeout = setTimeout(async () => {
        try {
          // Find the channel
          const channel = await findChannelForTicket(client, ticket.id);
          
          if (!channel) {
            logger.error(`Could not find channel for ticket ${ticket.id} at scheduled close time.`);
            return;
          }
          
          // Generate transcript
          const transcript = await generateTranscriptHTML(channel);
          
          // Upload to Drive
          if (transcript) {
            try {
              const uploadResult = await uploadTranscriptToDrive(transcript, ticket.id);
              logger.info(`Transcript for scheduled closure of ticket ${ticket.id} uploaded to Drive: ${uploadResult.webViewLink}`);
              await markTicketTranscribed(ticket.id);
            } catch (err) {
              logger.error(`Failed to upload transcript for scheduled closure of ticket ${ticket.id}: ${err.message}`);
            }
          }
          
          // Move to closed category
          if (channel.type === ChannelType.GuildText) {
            try {
              await channel.setParent(CLOSED_TICKET_CAT);
              await channel.setName(`closed-${channel.name}`);
            } catch (err) {
              logger.warn(`Failed to move/rename channel for scheduled closure of ticket ${ticket.id}: ${err.message}`);
            }
          }
          
          // Close the ticket
          await closeTicket(ticket.id, { user: { id: ticket.created_by } }, 'Closed automatically on schedule');
          
          // Notify channel
          await channel.send('This ticket has been automatically closed as scheduled.');
          
          // Clean up
          scheduledClosures.delete(ticket.id);
          
        } catch (err) {
          logger.error(`Error during scheduled closure of ticket ${ticket.id}: ${err.message}`);
        }
      }, delayMs);
      
      // Store the timeout
      scheduledClosures.set(ticket.id, timeout);
      
      // Send cancel message
      try {
        const channel = await findChannelForTicket(client, ticket.id);
        if (channel) {
          const timeLeft = formatTimeLeft(delayMs);
          const cancelMsg = await channel.send({
            content: `This ticket is scheduled to close in ${timeLeft}. Click below to cancel.`,
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 4,
                    label: 'Cancel Auto-Close',
                    custom_id: `cancel_auto_close:${ticket.id}`,
                  }
                ]
              }
            ]
          });
          
          cancelMessages.set(ticket.id, cancelMsg);
        }
      } catch (err) {
        logger.warn(`Failed to send cancel message for restored scheduled closure of ticket ${ticket.id}: ${err.message}`);
      }
      
      logger.info(`Restored scheduled closure for ticket ${ticket.id}, closing in ${Math.round(delayMs / 60000)} minutes.`);
    }
  } catch (err) {
    logger.error(`Error in restoreScheduledClosures: ${err.message}`);
  }
}

//*****************************// 
// Helper function to find channel for a ticket
//*****************************// 
async function findChannelForTicket(client, ticketId) {
  try {
    // Get the ticket data to find the channel
    const { data: ticketData } = await supabase
      .from('tickets')
      .select('channel_id')
      .eq('id', ticketId)
      .single();
      
    if (!ticketData || !ticketData.channel_id) return null;
    
    // Find the channel
    return client.channels.cache.get(ticketData.channel_id) || 
           await client.channels.fetch(ticketData.channel_id).catch(() => null);
  } catch (err) {
    logger.error(`Error finding channel for ticket ${ticketId}: ${err.message}`);
    return null;
  }
}

// Function fpr synchronous conversion to parse id 
function ensureNumeric(id) {
  return typeof id === 'string' ? parseInt(id, 10) : id;
}

// Helper function to format time remaining
function formatTimeLeft(ms) {
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  
  let result = '';
  if (days > 0) result += `${days} day${days > 1 ? 's' : ''} `;
  if (hours > 0) result += `${hours} hour${hours > 1 ? 's' : ''} `;
  if (minutes > 0) result += `${minutes} minute${minutes > 1 ? 's' : ''}`;
  
  return result.trim() || 'less than a minute';
}

//*****************************//
// Utility function to close a ticket
//*****************************//
async function closeTicket(ticketId, interaction, reason = 'No reason provided') {
  try {
    logger.info(`Finalizing closure of ticket ${ticketId}`);
    
    // Call the RPC function to close the ticket
    const { data, error } = await supabase.rpc('close_ticket', {
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
    
    // Clean up memory structures
    if (scheduledClosures.has(ticketId)) scheduledClosures.delete(ticketId);
    if (closingTickets.has(ticketId)) closingTickets.delete(ticketId);
    if (ticketClosePrompted.has(ticketId)) ticketClosePrompted.delete(ticketId);
    if (cancelMessages.has(ticketId)) {
      const cancelMsg = cancelMessages.get(ticketId);
      if (cancelMsg && cancelMsg.deletable) await cancelMsg.delete().catch(() => {});
      cancelMessages.delete(ticketId);
    }
    
    logger.info(`Successfully closed ticket ${ticketId}`);
    return true;
  } catch (err) {
    logger.error(`Error in closeTicket utility for ${ticketId}: ${err.message}`);
    return false;
  }
}

//*****************************// 
// Button handler function
//*****************************// 
async function handleTicketButton(interaction, buttonId, ticketId) {
  try {
    // Anti-spam protection
    const interactionKey = `${interaction.user.id}-${buttonId}-${ticketId}`;
    if (recentInteractions.has(interactionKey)) {
      return interaction.reply({ content: 'Please wait before clicking again.', flags: MessageFlags.Ephemeral });
    }
  
  // Add to recent interactions for 3 seconds
  recentInteractions.set(interactionKey, Date.now());
  setTimeout(() => recentInteractions.delete(interactionKey), 3000);
  
  // Handle different button actions
  switch(buttonId) {

//*****************************//
// Handle the claim button 
//******************************//
    case 'claim_ticket':
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      try {
        // Check if user has staff role
        if (!interaction.member.roles.cache.has(staffRoleId)) {
          await interaction.editReply({
            content: '❌ Only staff can claim tickets.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        
        // Check if ticket is already claimed
        const { data: ticketData } = await supabase
          .from('tickets')
          .select('id, claimed_by')
          .eq('channel_id', ticketId)
          .single();
        
        if (ticketData?.claimed_by) {
          await interaction.editReply({
            content: `⚠️ This ticket is already claimed by <@${ticketData.claimed_by}>.`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        
        // Update ticket in database
        await supabase
          .from('tickets')
          .update({ claimed_by: interaction.user.id })
          .eq('channel_id', ticketId);
        
        // Log staff action
        await supabase.from('staff_actions').insert({
          action_type: 'claim',
          user_id: interaction.user.id,
          ticket_id: ticketId,
          details: 'Claimed ticket'
        });
        
        // Create new action row with updated buttons
        const unclaimRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`unclaim_ticket:${ticketId}`)
            .setLabel('❌ Unclaim Ticket')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`request_close:${ticketId}`)
            .setLabel('⏳ Schedule Close')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`close_ticket:${ticketId}`)
            .setLabel('🔒 Close Ticket')
            .setStyle(ButtonStyle.Danger)
        );
        
        // Update the original message
        await interaction.message.edit({
          content: `🤝 Ticket claimed by <@${interaction.user.id}>`,
          components: [unclaimRow]
        });
        
        await interaction.editReply({
          content: `You have claimed this ticket.`,
          flags: MessageFlags.Ephemeral
        });
      } catch (err) {
        logger.error(`Error claiming ticket ${ticketId}: ${err.message}`);
        await interaction.editReply({
          content: 'Failed to claim the ticket. Please try again or contact an administrator.',
          flags: MessageFlags.Ephemeral
        });
      }
      break;

//*****************************//
// Handle the unclaim button
//*****************************//
    case 'unclaim_ticket':
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      try {
        // Check if ticket is claimed
        const { data: ticketData } = await supabase
          .from('tickets')
          .select('claimed_by')
          .eq('channel_id', ticketId)
          .single();
        
        if (!ticketData?.claimed_by) {
          await interaction.editReply({
            content: '⚠️ This ticket hasn\'t been claimed yet.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        
        // Check if user is the claimer
        if (ticketData.claimed_by !== interaction.user.id) {
          await interaction.editReply({
            content: `❌ Only <@${ticketData.claimed_by}> can unclaim this ticket.`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        
        // Update ticket in database
        await supabase
          .from('tickets')
          .update({ claimed_by: null })
          .eq('channel_id', ticketId);
        
        // Log staff action
        await supabase.from('staff_actions').insert({
          action_type: 'unclaim',
          user_id: interaction.user.id,
          ticket_id: ticketId,
          details: 'Unclaimed ticket'
        });
        
        // Create new action row with updated buttons
        const claimRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`claim_ticket:${ticketId}`)
            .setLabel('🤝 Claim Ticket')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`request_close:${ticketId}`)
            .setLabel('⏳ Schedule Close')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`close_ticket:${ticketId}`)
            .setLabel('🔒 Close Ticket Now')
            .setStyle(ButtonStyle.Danger)
        );
        
        // Update the original message
        await interaction.message.edit({
          content: `Ticket is now unclaimed.`,
          components: [claimRow]
        });
        
        await interaction.editReply({
          content: `You have unclaimed this ticket.`,
          flags: MessageFlags.Ephemeral
        });
      } catch (err) {
        logger.error(`Error unclaiming ticket ${ticketId}: ${err.message}`);
        await interaction.editReply({
          content: 'Failed to unclaim the ticket. Please try again or contact an administrator.',
          flags: MessageFlags.Ephemeral
        });
      }
      break;

//*****************************// 
// Handle the close_ticket option
//*****************************// 
    case 'close_ticket':
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      // Check if ticket is already being closed or scheduled
      if (closingTickets.has(ticketId) || scheduledClosures.has(ticketId)) {
        await interaction.editReply({
          content: 'This ticket is already awaiting confirmation or scheduled for closure.'
        });
        return;
      }
      
      // Mark this ticket as prompted for closure
      ticketClosePrompted.set(ticketId, interaction.user.id);
      
      // Send confirmation message with options
      const confirmMsg = await interaction.editReply({
        content: 'How would you like to handle the ticket closure?',
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 2,
                label: 'DM Transcript',
                custom_id: `confirm_close_ticket_dm:${ticketId}`,
              },
              {
                type: 2,
                style: 2,
                label: 'Post Transcript',
                custom_id: `confirm_close_ticket_post:${ticketId}`,
              },
              {
                type: 2,
                style: 2,
                label: 'No Transcript',
                custom_id: `confirm_close_ticket_no_transcript:${ticketId}`,
              },
              {
                type: 2,
                style: 4,
                label: 'Cancel',
                custom_id: `cancel_close_ticket:${ticketId}`,
              }
            ]
          }
        ]
      });
      break;

//*****************************//       
// Handle the wants_transcript option
//*****************************// 
    case 'wants_transcript':
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      // Send the transcript options
      await interaction.editReply({
        content: 'How would you like to receive the transcript?',
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 2,
                label: 'DM Me',
                custom_id: `dm_transcript:${ticketId}`,
              },
              {
                type: 2,
                style: 2,
                label: 'Post Here',
                custom_id: `post_transcript:${ticketId}`,
              },
              {
                type: 2,
                style: 4,
                label: 'Cancel',
                custom_id: `cancel_close_ticket:${ticketId}`,
              }
            ]
          }
        ]
      });
      break;

//*****************************//       
// Handle the no_transcript option
//*****************************//       
      case 'no_transcript':
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          // Update the original options message
          try {
            const messages = await interaction.channel.messages.fetch({ limit: 10 });
            const optionsMessage = messages.find(msg => 
              msg.author.bot && 
              msg.components.length > 0 &&
              msg.components.some(row => 
                row.components.some(comp => 
                  (comp.customId === `no_transcript:${ticketId}` ||
                   comp.customId?.includes('confirm_close_ticket_')) &&
                  comp.customId?.endsWith(`:${ticketId}`)
                )
              )
            );
            
            if (optionsMessage && !optionsMessage.deleted) {
              await optionsMessage.edit({
                content: `${optionsMessage.content}\n\n✅ Selected: No Transcript`,
                components: [] // Remove all components
              });
            }
          } catch (err) {
            logger.warn(`Failed to update options message for ticket ${ticketId}: ${err.message}`);
          }
                  
        if (!ticketId) {
          logger.error('Missing ticketId in no_transcript handler');
          await interaction.editReply({ content: 'Error: Could not identify the ticket.' });
          
          // Log error to Supabase
          await supabase.from('staff_actions').insert({
            action_type: 'error',
            user_id: interaction.user.id,
            ticket_id: null,
            details: 'Missing ticketId in no_transcript handler'
          });
          return;
        }
          // Mark ticket as being closed to prevent racing conditions
          closingTickets.set(ticketId, true);
          
          // Log the staff action
          await supabase.from('staff_actions').insert({
            action_type: 'close_ticket',
            user_id: interaction.user.id,
            ticket_id: ticketId,
            details: 'Closed without transcript'
          });
          
          // Move to closed category and rename
          const channel = interaction.channel;
          if (channel.type === ChannelType.GuildText) {
            try {
              await channel.setParent(CLOSED_TICKET_CAT);
              await channel.setName(`closed-${channel.name}`);
            } catch (err) {
              logger.warn(`Failed to move/rename channel for ticket ${ticketId}: ${err.message}`);
            }
          }
          
          // Generate transcript and upload to Drive
          const transcript = await generateTranscriptHTML(channel);
          if (transcript) {
            try {
              const uploadResult = await uploadTranscriptToDrive(transcript, ticketId);
              logger.info(`Transcript for ticket ${ticketId} uploaded to Drive: ${uploadResult.webViewLink}`);
              await markTicketTranscribed(ticketId);
            } catch (err) {
              logger.error(`Failed to upload transcript for ticket ${ticketId}: ${err.message}`);
            }
          }
          
          // Finalize ticket closure
          await closeTicket(ticketId, interaction, 'Closed without transcript');
          
          await interaction.editReply({ content: 'Ticket has been closed without generating a transcript.' });
        } catch (err) {
          logger.error(`Error closing ticket ${ticketId} with no_transcript: ${err.message}`);
          await interaction.editReply({ content: 'Failed to close the ticket. Please try again or contact an administrator.' });
          // Remove from closing tickets if there was an error
          if (closingTickets.has(ticketId)) closingTickets.delete(ticketId);
        }
        break;

//*****************************//
// Handle cancel button
//*****************************//   
case 'cancel_close_ticket':
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  
  try {
    // Cancel any close prompts
    if (ticketClosePrompted.has(ticketId)) {
      ticketClosePrompted.delete(ticketId);
    }
    
    // Cancel any scheduled closures
    let wasScheduled = false;
    if (scheduledClosures.has(ticketId)) {
      const timeout = scheduledClosures.get(ticketId);
      clearTimeout(timeout);
      scheduledClosures.delete(ticketId);
      wasScheduled = true;
      
      // Update database to remove scheduled_close_at
      const { error } = await supabase
        .from('tickets')
        .update({ scheduled_close_at: null })
        .eq('id', ticketId);
        
      if (error) {
        logger.warn(`Failed to update scheduled_close_at to null for ticket ${ticketId}: ${error.message}`);
      }
    }
    
    // Handle cancel messages separately with proper edit
    if (cancelMessages.has(ticketId)) {
      const cancelMsg = cancelMessages.get(ticketId);
      if (cancelMsg && !cancelMsg.deleted) {
        await cancelMsg.edit({
          content: `~~${cancelMsg.content}~~\n\n❌ Auto-close cancelled by <@${interaction.user.id}>.`,
          components: []  // Remove buttons
        });
      }
      cancelMessages.delete(ticketId);
    }
    
    // Find and update all other messages with ticket-related buttons
    const messages = await interaction.channel.messages.fetch({ limit: 15 });
    let updatedCount = 0;
    
    for (const [_, message] of messages) {
      // Skip non-bot messages or messages without components
      if (!message.author.bot || message.components.length === 0) continue;
      
      // Skip if we already updated this message (cancel message)
      if (cancelMessages.has(ticketId) && cancelMessages.get(ticketId).id === message.id) continue;
      
      // Check if this message has relevant buttons
      const hasRelevantButtons = message.components.some(row => 
        row.components.some(comp => {
          if (!comp.customId) return false;
          return comp.customId.includes(`:${ticketId}`) && 
                (comp.customId.includes('close_ticket') || 
                 comp.customId.includes('close_delay') ||
                 comp.customId.includes('confirm_close'));
        })
      );
      
      if (hasRelevantButtons && !message.deleted) {
        try {
          await message.edit({
            content: `~~${message.content}~~\n\n❌ Ticket closure cancelled by <@${interaction.user.id}>.`,
            components: [] // Remove all components
          });
          updatedCount++;
          
          // We don't want to edit too many messages
          if (updatedCount >= 3) break;
          
        } catch (err) {
          logger.warn(`Failed to update message ${message.id} for ticket ${ticketId} cancellation: ${err.message}`);
        }
      }
    }
    
    // Send appropriate response to user
    await interaction.editReply({ 
      content: wasScheduled ? 
        'Automatic ticket closure has been cancelled.' : 
        'Ticket closure process cancelled.' 
    });
    
    // Only send a channel message if we didn't already update other messages
    if (updatedCount === 0) {
      await interaction.channel.send({ 
        content: `Ticket closure has been cancelled by <@${interaction.user.id}>.` 
      });
    }
    
    // Log the action
    await supabase.from('staff_actions').insert({
      action_type: 'cancel_close',
      user_id: interaction.user.id,
      ticket_id: ticketId,
      details: wasScheduled ? 'Cancelled scheduled closure' : 'Cancelled manual closure'
    }).catch(err => {
      logger.warn(`Failed to log cancellation action for ticket ${ticketId}: ${err.message}`);
    });
    
  } catch (err) {
    logger.error(`Error in cancel_close_ticket for ticket ${ticketId}: ${err.message}`);
    await interaction.editReply({
      content: 'There was an error cancelling the ticket closure. Please try again or contact an administrator.'
    });
  }
  break;

//*****************************//         
// Handle transcript options
//*****************************//   
      case 'dm_transcript':
      case 'post_transcript':
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
          // Update the original transcript options message
          try {
            const messages = await interaction.channel.messages.fetch({ limit: 10 });
            const optionsMessage = messages.find(msg => 
              msg.author.bot && 
              msg.components.length > 0 &&
              msg.components.some(row => 
                row.components.some(comp => 
                  (comp.customId === `dm_transcript:${ticketId}` || 
                   comp.customId === `post_transcript:${ticketId}`) &&
                  comp.customId?.endsWith(`:${ticketId}`)
                )
              )
            );
            
            if (optionsMessage && !optionsMessage.deleted) {
              // Determine which option was selected
              let optionText = buttonId === 'dm_transcript' ? 'DM Transcript' : 'Post Transcript';
              
              await optionsMessage.edit({
                content: `${optionsMessage.content}\n\n✅ Selected: ${optionText}`,
                components: [] // Remove all components
              });
            }
          } catch (err) {
            logger.warn(`Failed to update transcript option message for ticket ${ticketId}: ${err.message}`);
          }
              
          // Mark ticket as being closed
          closingTickets.set(ticketId, true);
          
          // Generate transcript
          const transcript = await generateTranscriptHTML(interaction.channel);
          if (!transcript) {
            await interaction.editReply({ content: 'Failed to generate transcript. Please try again.' });
            closingTickets.delete(ticketId);
            return;
          }
          
          // Upload transcript to Drive
          let driveLink;
          try {
            const uploadResult = await uploadTranscriptToDrive(transcript, ticketId);
            driveLink = uploadResult.webViewLink;
            logger.info(`Transcript for ticket ${ticketId} uploaded to Drive: ${driveLink}`);
            await markTicketTranscribed(ticketId);
          } catch (err) {
            logger.error(`Failed to upload transcript for ticket ${ticketId}: ${err.message}`);
          }
          
          // Send transcript based on choice
          if (buttonId === 'dm_transcript') {
            try {
              await interaction.user.send({
                content: `Here's the transcript for ticket ${ticketId}:`,
                files: [{
                  attachment: Buffer.from(transcript),
                  name: `transcript-${ticketId}.html`
                }]
              });
              await interaction.editReply({ content: 'Transcript has been sent to your DMs.' });
            } catch (err) {
              logger.error(`Failed to DM transcript for ${ticketId} to ${interaction.user.id}: ${err.message}`);
              await interaction.editReply({ content: 'Failed to send transcript to your DMs. Please check your privacy settings.' });
            }
          } else { // post_transcript
            await interaction.channel.send({
              content: `Transcript for this ticket (requested by <@${interaction.user.id}>):`,
              files: [{
                attachment: Buffer.from(transcript),
                name: `transcript-${ticketId}.html`
              }]
            });
            await interaction.editReply({ content: 'Transcript has been posted in the channel.' });
          }
          
          // Move to closed category and rename
          const channel = interaction.channel;
          if (channel.type === ChannelType.GuildText) {
            try {
              await channel.setParent(CLOSED_TICKET_CAT);
              await channel.setName(`closed-${channel.name}`);
            } catch (err) {
              logger.warn(`Failed to move/rename channel for ticket ${ticketId}: ${err.message}`);
            }
          }
          
          // Finalize ticket closure
          await closeTicket(ticketId, interaction, `Closed with transcript (${buttonId === 'dm_transcript' ? 'DM' : 'Posted'})`);
          
        } catch (err) {
          logger.error(`Error in ${buttonId} handler for ticket ${ticketId}: ${err.message}`);
          await interaction.editReply({ content: 'Failed to process transcript. Please try again.' });
          if (closingTickets.has(ticketId)) closingTickets.delete(ticketId);
        }
        break;

//*****************************//         
// Handle confirmation of ticket closure
//*****************************// 
case 'confirm_close_ticket_dm':
case 'confirm_close_ticket_post':
case 'confirm_close_ticket_no_transcript':
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    // Update the original options message
    try {
      const messages = await interaction.channel.messages.fetch({ limit: 10 });
      const optionsMessage = messages.find(msg => 
        msg.author.bot && 
        msg.components.length > 0 &&
        msg.components.some(row => 
          row.components.some(comp => 
            (comp.customId?.startsWith('confirm_close_ticket_') || 
             comp.customId === `close_ticket:${ticketId}`) &&
            comp.customId?.endsWith(`:${ticketId}`)
          )
        )
      );
      
      if (optionsMessage && !optionsMessage.deleted) {
        // Determine which option was selected
        let optionText = '';
        if (buttonId === 'confirm_close_ticket_dm') optionText = 'DM Transcript';
        else if (buttonId === 'confirm_close_ticket_post') optionText = 'Post Transcript';
        else optionText = 'No Transcript';
        
        await optionsMessage.edit({
          content: `${optionsMessage.content}\n\n✅ Selected: ${optionText}`,
          components: [] // Remove all components
        });
      }
    } catch (err) {
      logger.warn(`Failed to update option message for ticket ${ticketId}: ${err.message}`);
    }

  // Mark ticket as being closed
  closingTickets.set(ticketId, true);
  
    const channel = interaction.channel;
    let transcript = null;
    let driveLink = null;
    
    // For transcript options, generate and handle accordingly
    if (buttonId !== 'confirm_close_ticket_no_transcript') {

      // Generate transcript
      transcript = await generateTranscriptHTML(channel);

      // Upload to Drive
      try {
        const uploadResult = await uploadTranscriptToDrive(transcript, ticketId);
        driveLink = uploadResult.webViewLink;
        logger.info(`Transcript for ticket ${ticketId} uploaded to Drive: ${driveLink}`);
        await markTicketTranscribed(ticketId); 
      } catch (err) {
        logger.error(`Failed to upload transcript for ticket ${ticketId}: ${err.message}`);
      }
      
      // Handle transcript based on choice
      if (buttonId === 'confirm_close_ticket_dm') {
        try {
          await interaction.user.send({
            content: `Here's the transcript for ticket ${ticketId}:`,
            files: [{
              attachment: Buffer.from(transcript),
              name: `transcript-${ticketId}.html`
            }]
          });
          await interaction.editReply({ content: 'Transcript has been sent to your DMs.' });
        } catch (err) {
          logger.error(`Failed to DM transcript for ${ticketId} to ${interaction.user.id}: ${err.message}`);
          await interaction.editReply({ 
            content: 'Failed to send transcript to your DMs. Please check your privacy settings.' 
          });
        }
      } else if (buttonId === 'confirm_close_ticket_post') {
        await channel.send({
          content: `Transcript for this ticket (requested by <@${interaction.user.id}>):`,
          files: [{
            attachment: Buffer.from(transcript),
            name: `transcript-${ticketId}.html`
          }]
        });
        await interaction.editReply({ content: 'Transcript has been posted in the channel.' });
      }
    } else {
      await interaction.editReply({ content: 'Closing ticket without generating a transcript.' });
    }
    
    // Move to closed category and rename
    if (channel.type === ChannelType.GuildText) {
      try {
        await channel.setParent(CLOSED_TICKET_CAT);
        await channel.setName(`closed-${channel.name}`);
      } catch (err) {
        logger.warn(`Failed to move/rename channel for ticket ${ticketId}: ${err.message}`);
      }
    }
    
    // Log the action
    const actionDetails = buttonId === 'confirm_close_ticket_no_transcript' 
      ? 'Closed without transcript' 
      : `Closed with transcript (${buttonId === 'confirm_close_ticket_dm' ? 'DM' : 'Posted'})`;
    
    await supabase.from('staff_actions').insert({
      action_type: 'close_ticket',
      user_id: interaction.user.id,
      ticket_id: ticketId,
      details: actionDetails
    });
    
    // Finalize ticket closure
    await closeTicket(ticketId, interaction, actionDetails);
    
    if (!interaction.replied && !interaction.deferred) {
      await interaction.editReply({ content: 'Ticket has been closed.' });
    }
  } catch (err) {
    logger.error(`Error in ${buttonId} for ticket ${ticketId}: ${err.message}`);
    await interaction.editReply({ 
      content: 'An error occurred while processing the ticket closure. Please try again.'
    });
    if (closingTickets.has(ticketId)) closingTickets.delete(ticketId);
  }
  break;

//*****************************// 
// Handle request_close button
//*****************************// 
case 'request_close':
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  
    // Disable any previous cancel messages
    if (cancelMessages.has(ticketId)) {
      try {
        const cancelMsg = cancelMessages.get(ticketId);
        if (cancelMsg && !cancelMsg.deleted) {
          const disabledComponents = cancelMsg.components.map(row => {
            const newRow = { type: row.type, components: [] };
            for (const component of row.components) {
              newRow.components.push({
                ...component.data,
                disabled: true
              });
            }
            return newRow;
          });
          
          await cancelMsg.edit({ 
            content: cancelMsg.content + ' (Superseded by a new request)',
            components: disabledComponents 
          });
        }
      } catch (err) {
        logger.warn(`Failed to disable previous cancel message for ticket ${ticketId}: ${err.message}`);
      }
    }  
    
  try {
    // Check if ticket is already scheduled for closure
    const { data: ticketData } = await supabase
      .from('tickets')
      .select('scheduled_close_at')
      .eq('id', ticketId)
      .single();
    
    if (scheduledClosures.has(ticketId) || (ticketData && ticketData.scheduled_close_at)) {
      await interaction.editReply({ 
        content: 'This ticket is already scheduled for closure.' 
      });
      return;
    }
    
    // Send options for delayed closure
    await interaction.editReply({
      content: 'When would you like to close this ticket?',
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 2,
              label: '5 minutes',
              custom_id: `close_delay_5m:${ticketId}`,
            },
            {
              type: 2,
              style: 2,
              label: '15 minutes',
              custom_id: `close_delay_15m:${ticketId}`,
            },
            {
              type: 2,
              style: 2,
              label: '30 minutes',
              custom_id: `close_delay_30m:${ticketId}`,
            }
          ]
        },
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 2,
              label: '1 hour',
              custom_id: `close_delay_1h:${ticketId}`,
            },
            {
              type: 2, 
              style: 2,
              label: '3 hours',
              custom_id: `close_delay_3h:${ticketId}`,
            },
            {
              type: 2,
              style: 2,
              label: '12 hours',
              custom_id: `close_delay_12h:${ticketId}`,
            }
          ]
        },
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 4,
              label: 'Close Now',
              custom_id: `close_ticket:${ticketId}`,
            },
            {
              type: 2,
              style: 2,
              label: 'Cancel',
              custom_id: `cancel_close_ticket:${ticketId}`,
            }
          ]
        }
      ]
    });
  } catch (err) {
    logger.error(`Error in request_close for ticket ${ticketId}: ${err.message}`);
    await interaction.editReply({ 
      content: 'Failed to process request. Please try again.' 
    });
  }
  break;

//*****************************//   
// Handle the close_delay options
//*****************************//  
    case 'close_delay_5m':
    case 'close_delay_15m':
    case 'close_delay_30m':
    case 'close_delay_1h':
    case 'close_delay_3h':
    case 'close_delay_12h':
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  
  try {
    // Parse the delay time
    const delayLabel = buttonId.split('_')[2];
    let delayMs;
    
    if (delayLabel.endsWith('m')) {
      const minutes = parseInt(delayLabel.replace('m', ''));
      delayMs = minutes * 60 * 1000;
    } else if (delayLabel.endsWith('h')) {
      const hours = parseInt(delayLabel.replace('h', ''));
      delayMs = hours * 60 * 60 * 1000;
    } else {
      throw new Error(`Invalid delay format: ${delayLabel}`);
    }
    
    // Check if already scheduled
    if (scheduledClosures.has(ticketId)) {
      await interaction.editReply({ 
        content: 'This ticket is already scheduled for closure.' 
      });
      return;
    }

      // Update the original message with the delay options
      try {
        const messages = await interaction.channel.messages.fetch({ limit: 10 });
        const delayOptionsMessage = messages.find(msg => 
          msg.author.bot && 
          msg.components.length > 0 &&
          msg.components.some(row => 
            row.components.some(comp => 
              comp.customId?.startsWith('close_delay_') &&
              comp.customId?.endsWith(`:${ticketId}`)
            )
          )
        );
        
        if (delayOptionsMessage && !delayOptionsMessage.deleted) {
          await delayOptionsMessage.edit({
            content: `${delayOptionsMessage.content}\n\n✅ Selected: Close in ${delayLabel.replace('m', ' minutes').replace('h', ' hours')}`,
            components: [] // Remove the buttons
          });
        }
      } catch (err) {
        logger.warn(`Failed to update delay options message for ticket ${ticketId}: ${err.message}`);
      }            
    // Calculate the close time
    const closeTime = new Date(Date.now() + delayMs);
    
    // Update the database with scheduled close time
    const { error } = await supabase
      .from('tickets')
      .update({ status: 'scheduled_close', scheduled_close_at: new Date(Date.now() + delayMs).toISOString() })
      .eq('channel_id', ticketId);
    
    if (error) {
      logger.error(`Failed to update scheduled_close_at for ticket ${ticketId}: ${error.message}`);
      throw new Error('Database update failed');
    }
    
    // Set a timeout to close the ticket
    const timeout = setTimeout(async () => {
      try {
        const channel = interaction.channel;
        if (!channel) return;
        
        // Generate and upload transcript
        const transcript = await generateTranscriptHTML(channel);
        if (transcript) {
          try {
            const uploadResult = await uploadTranscriptToDrive(transcript, ticketId);
            logger.info(`Transcript for scheduled closure of ticket ${ticketId} uploaded to Drive: ${uploadResult.webViewLink}`);
            await markTicketTranscribed(ticketId);
          } catch (err) {
            logger.error(`Failed to upload transcript for scheduled closure of ticket ${ticketId}: ${err.message}`);
          }
        }
        
        // Move to closed category and rename
        if (channel.type === ChannelType.GuildText) {
          try {
            await channel.setParent(CLOSED_TICKET_CAT);
            await channel.setName(`closed-${channel.name}`);
          } catch (err) {
            logger.warn(`Failed to move/rename channel for scheduled closure of ticket ${ticketId}: ${err.message}`);
          }
        }
        
        // Automatically close the ticket
        await closeTicket(ticketId, { user: { id: interaction.user.id } }, 
          `Auto-closed after ${delayLabel} delay`);
        
        // Send closure notification
        await channel.send(`This ticket has been automatically closed after the scheduled ${delayLabel} delay.`);
        
        // Clean up
        scheduledClosures.delete(ticketId);
        
      } catch (err) {
        logger.error(`Error during scheduled closure of ticket ${ticketId}: ${err.message}`);
      }
    }, delayMs);
    
    // Store the timeout reference
    scheduledClosures.set(ticketId, timeout);
    
    // Send a cancellation message
    const cancelMsg = await interaction.channel.send({
      content: `This ticket is scheduled to close in ${delayLabel.replace('m', ' minutes').replace('h', ' hours')}. Click below to cancel.`,
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 4,
              label: 'Cancel Auto-Close',
              custom_id: `cancel_auto_close:${ticketId}`,
            }
          ]
        }
      ]
    });
    
    cancelMessages.set(ticketId, cancelMsg);
    
    await interaction.editReply({ 
      content: `Ticket scheduled to close in ${delayLabel.replace('m', ' minutes').replace('h', ' hours')}.` 
    });
    
    // Log the scheduled closure
    await supabase.from('staff_actions').insert({
      action_type: 'scheduled_close',
      user_id: interaction.user.id,
      ticket_id: ticketId,
      details: `Scheduled to close in ${delayLabel.replace('m', ' minutes').replace('h', ' hours')} (${closeTime.toISOString()})`
    });
    
  } catch (err) {
    logger.error(`Error scheduling closure for ticket ${ticketId}: ${err.message}`);
    await interaction.editReply({ 
      content: 'Failed to schedule ticket closure. Please try again.' 
    });
  }
  break;

//*****************************// 
// Handle cancel_auto_close button
//*****************************// 
  case 'cancel_auto_close':
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    try {
      // Check if ticket is scheduled for closure
      if (!scheduledClosures.has(ticketId)) {
        await interaction.editReply({ 
          content: 'This ticket is not scheduled for automatic closure.' 
        });
        return;
      }
      
      // Clear the timeout
      const timeout = scheduledClosures.get(ticketId);
      clearTimeout(timeout);
      scheduledClosures.delete(ticketId);
      
      // Remove the cancel message
      if (cancelMessages.has(ticketId)) {
        try {
          const cancelMsg = cancelMessages.get(ticketId);
          if (cancelMsg && !cancelMsg.deleted) {
            await cancelMsg.edit({
              content: `~~${cancelMsg.content}~~\n\n❌ Auto-close cancelled by <@${interaction.user.id}>.`,
              components: [] // Remove the cancel button
            });
          }
          cancelMessages.delete(ticketId);
        } catch (err) {
          logger.warn(`Failed to update cancel message for ticket ${ticketId}: ${err.message}`);
        }
      }
      
      // Update database to remove scheduled close
      const { error } = await supabase
        .from('tickets')
        .update({ scheduled_close_at: null })
        .eq('id', ticketId);
      
      if (error) {
        logger.error(`Failed to update scheduled_close_at for ticket ${ticketId}: ${error.message}`);
      }
      
      // Move ticket back to original category if needed
      const channel = interaction.channel;
      if (channel.parentId === CLOSED_TICKET_CAT && channel.name.startsWith('closed-')) {
        try {
          // Get the ticket data to find original category
          const { data: ticketData } = await supabase
            .from('tickets')
            .select('ticket_type')
            .eq('id', ticketId)
            .single();
            
            if (ticketData && ticketData.ticket_type) {
              const categoryId = categoryIds[ticketData.ticket_type];
              if (categoryId) {
                await channel.setParent(categoryId);
                // Remove the 'closed-' prefix from the name
                const newName = channel.name.replace('closed-', '');
                await channel.setName(newName);
              }
            }
          } catch (err) {        
          logger.warn(`Failed to restore channel for ticket ${ticketId}: ${err.message}`);
        }
      }
      
      // Log the action
      await supabase.from('staff_actions').insert({
        action_type: 'cancel_auto_close',
        user_id: interaction.user.id,
        ticket_id: ticketId,
        details: 'Cancelled automatic ticket closure'
      });
        
      // Send confirmation message
      await interaction.editReply({ 
        content: 'Automatic ticket closure has been cancelled.' 
      });
      
    } catch (err) {
      logger.error(`Error cancelling scheduled closure for ticket ${ticketId}: ${err.message}`);
      await interaction.editReply({ 
        content: 'Failed to cancel automatic closure. Please try again or contact an administrator.' 
      });
    }
    break;

//*****************************//   
//  Handle delete_now button
//*****************************// 
  case 'delete_now':
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    try {
      // Check if ticket is already closed in the database
      const { data: ticketData } = await supabase
        .from('tickets')
        .select('status')
        .eq('id', ticketId)
        .single();
      
      // If ticket isn't closed yet, close it first
      if (ticketData && ticketData.status !== 'CLOSED') {
        // Generate transcript if it doesn't already exist
        const transcript = await generateTranscriptHTML(interaction.channel);
        
        // Upload to Drive
        if (transcript) {
          try {
            const uploadResult = await uploadTranscriptToDrive(transcript, ticketId);
            logger.info(`Transcript for ticket ${ticketId} uploaded to Drive before deletion: ${uploadResult.webViewLink}`);
            await markTicketTranscribed(ticketId);
          } catch (err) {
            logger.error(`Failed to upload transcript for ticket ${ticketId} before deletion: ${err.message}`);
          }
        }
        
        // Mark it as closed in the database
        await closeTicket(ticketId, interaction, 'Closed via delete_now button');
      }
      
      // Log the delete action
      await supabase.from('staff_actions').insert({
        action_type: 'delete_ticket',
        user_id: interaction.user.id,
        ticket_id: ticketId,
        details: 'Ticket channel deleted immediately'
      });
      
      await interaction.editReply({ content: 'Deleting this ticket channel...' });
      
      // Clean up memory structures
      if (scheduledClosures.has(ticketId)) {
        const timeout = scheduledClosures.get(ticketId);
        clearTimeout(timeout);
        scheduledClosures.delete(ticketId);
      }
      if (closingTickets.has(ticketId)) closingTickets.delete(ticketId);
      if (ticketClosePrompted.has(ticketId)) ticketClosePrompted.delete(ticketId);
      if (cancelMessages.has(ticketId)) {
        const cancelMsg = cancelMessages.get(ticketId);
        if (cancelMsg && cancelMsg.deletable) await cancelMsg.delete().catch(() => {});
        cancelMessages.delete(ticketId);
      }
      
      // Delete the channel after a short delay to ensure the reply is seen
      setTimeout(async () => {
        try {
          if (interaction.channel && interaction.channel.deletable) {
            await interaction.channel.delete();
          }
        } catch (err) {
          logger.error(`Failed to delete channel for ticket ${ticketId}: ${err.message}`);
        }
      }, 3000);
      
    } catch (err) {
      logger.error(`Error deleting ticket ${ticketId}: ${err.message}`);
      await interaction.editReply({ 
        content: 'Failed to delete the ticket. Please try again or contact an administrator.' 
      });
    }
    break;
  
  default:
    logger.warn(`Unknown button ID: ${buttonId} for ticket ${ticketId}`);
    await interaction.reply({ 
      content: 'This button action is not recognized or implemented.',
      flags: MessageFlags.Ephemeral 
    });
  }
} catch (err) {
    logger.error(`Unhandled error in button handler for ${buttonId}, ticket ${ticketId}: ${err.message}`);
    
    // Try to respond to user if possible
    try {
      const response = { 
        content: 'An unexpected error occurred. Please try again or contact an administrator.',
        flags: MessageFlags.Ephemeral
      };
      
      if (interaction.deferred) {
        await interaction.editReply(response);
      } else if (!interaction.replied) {
        await interaction.reply(response);
      }
    } catch (replyErr) {
      logger.error(`Failed to reply to button interaction: ${replyErr.message}`);
    }
  }
}

module.exports = { handleTicketButton, restoreScheduledClosures };