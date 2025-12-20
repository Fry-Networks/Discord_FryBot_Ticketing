//claimHandler.js
const supabase = require('../supabaseClient');
const supabaseHandler = require('../handlers/supabaseHandler'); // Import supabaseHandler
const { getTicketActionRow } = require('../utils/ticketUtils'); // Import getTicketActionRow
const logger = require('../utils/logger');
const { MessageFlags } = require('discord.js');
const config = require('../utils/config');

/**
 * Handles staff joining or leaving a ticket, updates the database,
 * and updates the Discord message to show claimed staff.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @param {string} ticketId - The ID of the ticket.
 * @returns {Promise<{ success: boolean, error?: string }>}
 */

/*
async function claimTicket(interaction, ticketId) {
  const staffId = interaction.user.id;
  const staffUsername = interaction.user.username;

  try {
    logger.info(`[DEBUG] Attempting to defer interaction for ticket ${ticketId}`);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }); // Defer the interaction reply to allow for processing time
    logger.info(`[DEBUG] Interaction deferred successfully for ticket ${ticketId}`);

    // Get the original message ID, channel ID, and other necessary info to update the message and move the channel
    const { data: ticketInfo, error: fetchTicketInfoError } = await supabase
        .from('tickets')
        .select('id, channel_id, original_message_id, ticket_type, validated') // Select all necessary fields
        .eq('id', ticketId)
        .maybeSingle();

    if (fetchTicketInfoError || !ticketInfo || !ticketInfo.id || !ticketInfo.channel_id || !ticketInfo.original_message_id) {
        logger.error(`Failed to fetch ticket info for claim operation for ticket ${ticketId}: ${fetchTicketInfoError?.message || 'Missing essential ticket info'}`);
        return { success: false, error: `Failed to fetch ticket information.` };
    }

    // Check if staff member is already working on this ticket
    const { data: existingStaff, error: fetchStaffError } = await supabase
      .from('ticket_staff')
      .select('staff_id')
      .eq('ticket_id', ticketId)
      .eq('staff_id', staffId)
      .maybeSingle();

    if (fetchStaffError) {
      return { success: false, error: `Failed to check staff status: ${fetchStaffError.message}` };
    }

    let actionTaken;

    if (existingStaff) {
      // Staff is already on the ticket, perform "Leave" action
      const { error: deleteError } = await supabase
        .from('ticket_staff')
        .delete()
        .eq('ticket_id', ticketId)
        .eq('staff_id', staffId);

      if (deleteError) {
        return { success: false, error: `Failed to leave ticket: ${deleteError.message}` };
      }
      actionTaken = 'left';

      // Log leave action
      const { error: logError } = await supabase
        .from('staff_actions')
        .insert({
          ticket_id: ticketId,
          staff_id: staffId,
          action: `${staffUsername} left the ticket.`,
          timestamp: new Date().toISOString(),
        });

      if (logError) {
        logger.error(`Failed to log staff leave action: ${logError.message}`); // Log but don't fail the main operation
      }

    } else {
      // Staff is not on the ticket, perform "Join" action
      const { error: insertError } = await supabase
        .from('ticket_staff')
        .insert({
          ticket_id: ticketId,
          staff_id: staffId,
          staff_username: staffUsername, // Include staff_username
        });

      if (insertError) {
        return { success: false, error: `Failed to join ticket: ${insertError.message}` };
      }
      actionTaken = 'joined';

      // Check and set "Initial Claimer" if not already set
      const { data: ticket, error: fetchTicketError } = await supabase
        .from('tickets')
        .select('claimed_by')
        .eq('id', ticketId)
        .maybeSingle();

      let isInitialClaimant = false;
      if (fetchTicketError) {
        logger.error(`Failed to fetch ticket for initial claimer check: ${fetchTicketError.message}`); // Log but don't fail
      } else if (ticket && !ticket.claimed_by) {
        // This staff member is the initial claimant
        isInitialClaimant = true;
        const { error: updateTicketError } = await supabase
          .from('tickets')
          .update({
            claimed_by: staffId,
            claimed_by_username: staffUsername,
          })
          .eq('id', ticketId);

        if (updateTicketError) {
          logger.error(`Failed to set initial claimer for ticket ${ticketId}: ${updateTicketError.message}`); // Log but don't fail
        }
      } else if (ticket && ticket.claimed_by === staffId) {
          // This staff member is re-claiming the ticket and was the initial claimant
          isInitialClaimant = true;
      }


      // Log join action
      const { error: logError } = await supabase
        .from('staff_actions')
        .insert({
          ticket_id: ticketId,
          staff_id: staffId,
          action: `${staffUsername} joined the ticket.`,
          timestamp: new Date().toISOString(),
        });

      if (logError) {
        logger.error(`Failed to log staff join action: ${logError.message}`); // Log but don't fail the main operation
      }

      // Check if the initial claimant has a dedicated category configured and move the channel
      const claimantCategoryId = config.staffCategoryMapping?.[staffId]; // Use staffId as it's the claimant's ID
      // Only move the channel if this is the initial claim by this staff member and they have a configured category
      if (isInitialClaimant && claimantCategoryId) {
          // Fetch the channel object
          const channel = await interaction.client.channels.fetch(ticketInfo.channel_id); // Use ticketInfo.channel_id
          if (channel && channel.manageable) {
              await channel.setParent(claimantCategoryId, { lockPermissions: false });
              logger.info(`Moved ticket channel ${channel.id} to initial claimant's category ${claimantCategoryId} after claiming.`);
          } else {
              logger.warn(`Could not move ticket channel ${ticketInfo.channel_id} to initial claimant's category ${claimantCategoryId} after claiming.`);
          }
      } else if (!isInitialClaimant && claimantCategoryId) {
           logger.info(`Staff member ${staffUsername} (${staffId}) is not the initial claimant. Keeping channel in initial claimant's category.`);
      } else if (isInitialClaimant && !claimantCategoryId) {
           logger.info(`Initial claimant ${staffUsername} (${staffId}) does not have a dedicated category configured. Keeping channel in current category.`);
      }
    } // Corrected placement of the closing brace for the 'else' block

    // Fetch the updated list of staff members for the ticket
    const { data: currentStaffEntries, error: fetchCurrentStaffError } = await supabase
      .from('ticket_staff')
      .select('staff_id, staff_username') // Select staff_username as well
      .eq('ticket_id', ticketId); // Filter by ticketId

    logger.info(`[DEBUG] Fetched currentStaffEntries for ticket ${ticketId}:`, currentStaffEntries);

    if (fetchCurrentStaffError) {
      logger.error(`Failed to fetch current staff for ticket ${ticketId}: ${fetchCurrentStaffError.message}`);
      // Proceed without updating message if fetching staff fails
      return { success: true, action: actionTaken };
    }

    // Fetch usernames for the staff members
    // Since we are now storing staff_username in ticket_staff, we can use that directly
    const staffUsernames = currentStaffEntries.map(entry => entry.staff_username);
    logger.info(`[DEBUG] Constructed staffUsernames list:`, staffUsernames);

    // Fetch the channel and message objects using ticketInfo
    const channel = await interaction.client.channels.fetch(ticketInfo.channel_id);
    if (!channel) {
        logger.error(`Failed to fetch channel ${ticketInfo.channel_id} for message update.`);
         return { success: true, action: actionTaken };
    }

    const message = await channel.messages.fetch(ticketInfo.original_message_id);
     if (!message) {
        logger.error(`Failed to fetch message ${ticketInfo.original_message_id} in channel ${channel.id} for update.`);
         return { success: true, action: actionTaken };
    }

    // Construct the new message content
    const staffListString = staffUsernames.length > 0 ? staffUsernames.join(', and ') : 'None';
    const newMessageContent = `# 🤝Claimed by: ${staffListString}`;

    // Fetch the most up-to-date ticket data before regenerating the action row
    const updatedTicketInfo = await supabaseHandler.getTicketById(ticketId); // Directly assign the result

    logger.info(`[DEBUG] claimTicket - updatedTicketInfo: ${JSON.stringify(updatedTicketInfo)}`);
    // Removed fetchUpdatedTicketInfoError logging as getTicketById throws on error

    // Refined error check: Check if the fetched data is missing or doesn't have an ID
    if (!updatedTicketInfo || !updatedTicketInfo.id) { // Simplified condition
        logger.error(`Failed to fetch updated ticket info for action row regeneration for ticket ${ticketId}. Error: Fetched data is null or missing ID`); // Improved error logging
        // Proceed with regenerating the action row using the initial ticketInfo if fetching updated fails
        logger.info(`[DEBUG] Calling getTicketActionRow with initial ticketInfo due to fetch error:`, ticketInfo);
        await message.edit({
            content: newMessageContent,
            components: getTicketActionRow(ticketInfo), // Use initial ticketInfo as fallback, pass array directly
        });
    } else {
        // Update the message with the new action row using the updated ticket info
        logger.info(`[DEBUG] Calling getTicketActionRow with updatedTicketInfo:`, updatedTicketInfo);
        await message.edit({
            content: newMessageContent,
            components: getTicketActionRow(updatedTicketInfo), // Pass the updated ticketInfo object, pass array directly
        });
    }

    // Send ephemeral confirmation message and finalize the interaction
    await interaction.followUp({
        content: `✅ You have successfully ${actionTaken} ticket \`${ticketId}\`.`,
        //flags: MessageFlags.Ephemeral // MessageFlags.Ephemeral
    });

    return { success: true, action: actionTaken };

  } catch (err) {
    logger.error(`Exception in claimTicket for ticket ${ticketId}, staff ${staffId}: ${err.message}`, err);
    return { success: false, error: `Unexpected error: ${err.message}` };
  }
}
*/
module.exports = {
  //claimTicket,
};
