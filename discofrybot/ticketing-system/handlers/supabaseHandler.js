// ticketing-system/handlers/supabaseHandler.js
const supabase = require('../supabaseClient');
const logger = require('../utils/logger');
const axios = require('axios');
const config = require('../utils/config');
const { formatNumberWithCommas } = require('../utils/ticketUtils');

/**
 * Checks if a Discord channel exists.
 * @param {import('discord.js').Client} client - The Discord client.
 * @param {string} channelId - The Discord channel ID.
 * @returns {Promise<boolean>} True if the channel exists, false otherwise.
 */
async function channelExists(client, channelId) {
    if (!channelId) return false;
    
    try {
        const channel = await client.channels.fetch(channelId);
        return !!channel;
    } catch (error) {
        if (error.code === 10003) { // Unknown Channel
            return false;
        }
        logger.warn(`Error checking if channel ${channelId} exists: ${error.message}`);
        return false; // Assume it doesn't exist on any error
    }
}


/**
 * Cleans up a single orphaned ticket (simple version for individual ticket cleanup).
 * @param {string} ticketId - The ID of the ticket to clean up.
 * @param {string} reason - The reason for cleanup.
 * @returns {Promise<void>}
 */
async function cleanupOrphanedTicket(ticketId, reason = 'Channel not found') {
    try {
        const { error } = await supabase
            .from('tickets')
            .update({ 
                status: 'closed',
                closed_at: new Date().toISOString(),
                closed_by_id: 'SYSTEM',
                closed_by_username: 'SYSTEM_CLEANUP',
                description: reason
            })
            .eq('id', ticketId);

        if (error) {
            logger.error(`Error cleaning up orphaned ticket ${ticketId}: ${error.message}`, error);
            throw error;
        }

        await logBotActivity('info', 'orphaned_ticket_cleanup', `Cleaned up orphaned ticket ${ticketId}: ${reason}`);
        logger.info(`Orphaned ticket ${ticketId} cleaned up: ${reason}`);
    } catch (err) {
        logger.error(`Exception cleaning up orphaned ticket ${ticketId}: ${err.message}`, err);
        throw err;
    }
}

/**
 * Calls the Supabase RPC function to perform comprehensive orphaned tickets cleanup.
 * Handles both stale 'creating' tickets and orphaned 'open' tickets without channel_id.
 * This is more efficient than the JavaScript-based cleanup as it runs server-side.
 * @returns {Promise<Array<object>>} Array of cleanup results.
 */
async function cleanupOrphanedTicketsRpc() {
    try {
        const { data, error } = await supabase.rpc('cleanup_orphaned_tickets');

        if (error) {
            logger.error(`Error calling cleanup_orphaned_tickets RPC: ${error.message}`, error);
            throw error;
        }

        const results = data || [];
        logger.info(`cleanup_orphaned_tickets RPC completed. Results: ${results.length} actions taken.`);
        
        // Log detailed results
        let totalCleaned = 0;
        results.forEach(result => {
            if (result.action === 'cleanup_summary') {
                totalCleaned = result.tickets_affected;
                logger.info(`Orphaned tickets cleanup summary: ${result.tickets_affected} total tickets cleaned`);
            } else if (result.ticket_id) {
                logger.info(`Cleaned up ticket ${result.ticket_id} (${result.action}): ${result.reason}`);
            }
        });

        return { results, totalCleaned };
    } catch (err) {
        logger.error(`Exception calling cleanup_orphaned_tickets RPC: ${err.message}`, err);
        throw err;
    }
}

/**
 * Application-level fallback cleanup to run when the RPC fails.
 * @param {import('discord.js').Client} client - Discord client for channel verification.
 * @returns {Promise<{results: Array<object>, totalCleaned: number, method: string}>}
 */
async function cleanupOrphanedTicketsFallback(client = null) {
    logger.warn('Falling back to application-level orphaned ticket cleanup.');

    const { data: tickets, error } = await supabase
        .from('tickets')
        .select('id, channel_id, status, created_at')
        .in('status', ['open', 'creating']);

    if (error) {
        logger.error(`Fallback cleanup failed to fetch tickets: ${error.message}`, error);
        throw error;
    }

    const results = [];
    let cleaned = 0;
    const now = Date.now();

    for (const ticket of tickets || []) {
        let reason = null;

        // Missing channel_id after grace period
        if (!ticket.channel_id) {
            const ageMs = now - new Date(ticket.created_at).getTime();
            const gracePeriodMs = 5 * 60 * 1000; // 5 minutes
            if (ticket.status === 'creating' && ageMs < gracePeriodMs) {
                continue; // allow active creations to finish
            }
            reason = 'Missing channel reference';
        } else if (client) {
            const exists = await channelExists(client, ticket.channel_id);
            if (!exists) {
                reason = 'Discord channel missing';
            }
        }

        if (!reason) continue;

        await cleanupOrphanedTicket(ticket.id, reason);
        cleaned++;
        results.push({ ticket_id: ticket.id, action: 'application_cleanup', reason });
    }

    return { results, totalCleaned: cleaned, method: 'fallback' };
}

/**
 * Attempts to run the RPC-based cleanup, falling back to the application-level cleanup
 * when specific errors (like SQL ambiguity) occur.
 * @param {import('discord.js').Client} client
 */
async function cleanupOrphanedTickets(client = null) {
    try {
        const result = await cleanupOrphanedTicketsRpc();
        return { ...result, method: 'rpc' };
    } catch (error) {
        if (error?.code === '42702') {
            logger.warn('cleanup_orphaned_tickets RPC failed with ambiguous column error. Falling back to local cleanup.');
            return cleanupOrphanedTicketsFallback(client);
        }
        throw error;
    }
}

/**
 * Enhanced version that checks if a user has an open ticket AND verifies the Discord channel exists.
 * If an orphaned ticket is found, it's automatically cleaned up.
 * @param {string} userId - The Discord user ID.
 * @param {import('discord.js').Client} client - The Discord client (optional, for channel verification).
 * @returns {Promise<object|null>} The existing valid ticket object or null.
 */
async function checkActiveTicket(userId, client = null) {
    try {
        const { data, error } = await supabase
            .from('tickets')
            .select('id, ticket_type, channel_id, created_at')
            .eq('user_id', userId)
            .eq('status', 'open')
            .maybeSingle();

        if (error) {
            logger.error(`Error checking active ticket for user ${userId}: ${error.message}`, error);
            throw error;
        }

        if (!data) {
            return null; // No active ticket found
        }

        // If client is provided, verify the channel exists
        if (client && data.channel_id) {
            const exists = await channelExists(client, data.channel_id);
            if (!exists) {
                logger.warn(`Found orphaned ticket ${data.id} for user ${userId} - channel ${data.channel_id} does not exist`);
                
                // Cleanup the orphaned ticket
                await cleanupOrphanedTicket(data.id, 'Discord channel not found during active ticket check');
                
                // Return null as the ticket is no longer valid
                return null;
            }
        } else if (!data.channel_id) {
            // If no channel_id is set, this is likely an orphaned ticket from failed creation
            logger.warn(`Found ticket ${data.id} for user ${userId} with no channel_id - likely orphaned`);
            
            // Check if it's a very recent ticket (less than 5 minutes old) - give it some time
            const ticketAge = Date.now() - new Date(data.created_at).getTime();
            if (ticketAge > 5 * 60 * 1000) { // 5 minutes
                await cleanupOrphanedTicket(data.id, 'No channel_id set after 5+ minutes');
                return null;
            }
        }

        return data; // Returns the valid ticket object
    } catch (err) {
        logger.error(`Exception in checkActiveTicket for user ${userId}: ${err.message}`, err);
        throw err;
    }
}

/**
 * Inserts a new ticket into the database.
 * @param {object} ticketData - The data for the new ticket.
 * @returns {Promise<object>} The newly created ticket object.
 */
async function insertTicket(ticketData) {
    try {
        const ticketRecord = {
            user_id: ticketData.user_id,
            discord_username: ticketData.discord_username,
            ticket_type: ticketData.ticket_type,
            status: ticketData.status || 'open', // Allow custom status
            full_name: ticketData.full_name || 'N/A',
            email: ticketData.email || 'N/A',
            description: ticketData.description || 'N/A',
            order_number: ticketData.order_number || 'N/A',
            algorand_address: ticketData.algorand_address || 'N/A',
            minerkeys: ticketData.minerkeys || 'N/A',
            request_type: ticketData.request_type || null, // Added new field
            orders_quantities: ticketData.orders_quantities || null, // Added new field
            bold_sign_signed: false, // Added new field, default to false
            selected_region: ticketData.selected_region || null, // Added new field
            // Flxtime Partners Support fields
            solana_wallet_address: ticketData.solana_wallet_address || 'N/A', // Added Solana wallet address field
            flxtime_validated: false, // Default to false
            flxtime_validated_by: null, // No validator initially
            aem_key_issued: null, // No AEM key initially  
            aem_key_issued_at: null, // No issue timestamp initially
            aem_key_issued_by: null, // No issuer initially
        };

        const { data, error } = await supabase
            .from('tickets')
            .insert([ticketRecord])
            .select()
            .single();

        if (error) {
            logger.error('Error inserting new ticket:', { message: error.message, details: error.details, hint: error.hint, ticketData });
            throw error;
        }
        logger.info(`New ticket ${data.id} inserted for user ${ticketData.user_id}`);
        return data;
    } catch (err) {
        logger.error('Exception in insertTicket:', { message: err.message, ticketData });
        throw err;
    }
}

/**
 * Updates a ticket with its Discord channel ID.
 * @param {string|number} ticketId - The ID of the ticket to update.
 * @param {string} channelId - The Discord channel ID.
 * @returns {Promise<object>} The updated ticket object.
 */
async function updateTicketChannelId(ticketId, channelId) {
    try {
        const { data, error } = await supabase
            .from('tickets')
            .update({ channel_id: channelId })
            .eq('id', ticketId)
            .select()
            .maybeSingle();

        if (error) {
            logger.error(`Error updating channel ID for ticket ${ticketId}:`, { message: error.message, details: error.details });
            throw error;
        }
        logger.info(`Ticket ${ticketId} updated with channel ID ${channelId}`);
        return data;
    } catch (err) {
        logger.error(`Exception in updateTicketChannelId for ticket ${ticketId}:`, err);
        throw err;
    }
}

/**
 * Upserts user information into the 'users' table.
 * @param {object} userData - Object containing user details (id, username, discriminator, avatar_url).
 * @returns {Promise<object>} The upserted user data.
 */
async function upsertUser(userData) {
    try {
        const userRecord = {
            id: userData.id,
            username: userData.username,
            discriminator: userData.discriminator,
            avatar_url: userData.avatar_url,
            last_seen: new Date().toISOString(),
        };
        const { data, error } = await supabase
            .from('users') // Ensure this table name is correct
            .upsert(userRecord, { onConflict: 'id' })
            .select()
            .single();

        if (error) {
            logger.error(`Error upserting user ${userData.id}:`, { message: error.message, details: error.details });
            throw error;
        }
        logger.info(`User ${userData.id} (${userData.username}) upserted.`);
        return data;
    } catch (err) {
        logger.error(`Exception in upsertUser for user ${userData.id}:`, err);
        throw err;
    }
}

/**
 * Logs a message associated with a ticket.
 * @param {object} messageData - Object containing ticket_id, user_id, message content, discord_message_id.
 * @returns {Promise<object>} The logged message data.
 */
async function logTicketMessage(messageData) {
    try {
        const { data, error } = await supabase
            .from('ticket_messages') // Ensure this table name is correct
            .insert([messageData])
            .select()
            .single();

        if (error) {
            logger.error(`Error logging message for ticket ${messageData.ticket_id}:`, { message: error.message, details: error.details });
            throw error;
        }

        // Conditionally update ticket based on message sender role
        if (messageData.role === 'user' || messageData.role === 'staff') {
            // If message is from a human (user or staff), update last message info and reset all ping counters
            // Parse the message content to access discordData
            const parsedMessage = JSON.parse(messageData.message);

            await supabase
                .from('tickets')
                .update({
                    last_message_at: new Date(parsedMessage.discordData.created).toISOString(),
                    last_message_from_role: messageData.role,
                    inactivity_ping_count: 0, // Reset user ping count on new message
                    last_inactivity_ping_at: null, // Reset user last ping timestamp on new message
                    staff_ping_count: 0, // Reset staff ping count on new message
                    last_staff_ping_at: null, // Reset staff last ping timestamp on new message
                    // If the message is from staff, update last_staff_member_id
                    ...(messageData.role === 'staff' && { last_staff_member_id: messageData.user_id })
                })
                .eq('id', messageData.ticket_id);
            logger.info(`Ticket ${messageData.ticket_id} updated with new human message info and counters reset.`);
        } else if (messageData.role === 'bot') {
            // If message is from bot, do NOT update last message info, and do NOT reset ping counters.
            // The ping counters should only be reset by human interaction.
            logger.info(`Bot message logged for ticket ${messageData.ticket_id}. Last message info and ping counters not updated.`);
        }

        logger.info(`Message logged for ticket ${messageData.ticket_id} by user ${messageData.user_id}`);
        return data;
    } catch (err) {
        logger.error(`Exception in logTicketMessage for ticket ${messageData.ticket_id}: ${err.message}`, err);
        throw err;
    }
}

/**
 * Calls the Supabase RPC function to close a ticket.
 * @param {string} ticketId - The ID of the ticket to close.
 * @param {string} channelId - The Discord channel ID of the ticket.
 * @param {string} closedByUserId - The Discord user ID of the person closing the ticket (or 'SYSTEM').
 * @param {string} closedByUsername - The Discord username of the person closing the ticket (or 'SYSTEM').* 
 * @param {string} transcriptPreference - The user's preference for the transcript ('dm', 'post', 'none').
 * @param {string|null} scheduledCloseAt - The scheduled closure timestamp, or null for immediate closure.
 * @returns {Promise<object>} The result from the RPC call.
 */
async function closeTicketRpc(ticketId, channelId, closedByUserId, closedByUsername, transcriptPreference, scheduledCloseAt = null, transcriptGenerated = null) {
    try {
        // Determine status based on whether it's a scheduled closure
        const status = scheduledCloseAt ? 'scheduled' : 'closed'; // Assuming 'scheduled' is a valid status

        const { data, error } = await supabase.rpc('close_ticket', {
            p_channel_id: channelId,
            p_status: status,
            p_closed_at: status === 'closed' ? new Date().toISOString() : null, // Set closed_at only for immediate closure
            p_scheduled_close_at: scheduledCloseAt,
            p_is_transcribed: transcriptGenerated ? true : null,
            p_closed_by_id: closedByUserId,
            p_closed_by_username: closedByUsername
        });

        if (error) {
            logger.error(`Error calling close_ticket RPC for ticket ${ticketId}: ${error.message}`, error);
            throw error;
        }
        logger.info(`close_ticket RPC called successfully for ticket ${ticketId}. Result:`, data);
        return data;
    } catch (err) {
        logger.error(`Exception calling close_ticket RPC for ticket ${ticketId}: ${err.message}`, err);
        throw err;
    }
}

/**
 * Fetches a ticket by its ID.
 * @param {string} ticketId - The ID of the ticket to fetch.
 * @returns {Promise<object|null>} The ticket object or null.
 */
async function getTicketById(ticketId) {
    logger.info(`[DEBUG] getTicketById called for ticketId=${ticketId}`);
    try {
        const { data, error } = await supabase
            .from('tickets')
            .select('id, is_transcribed, user_id, channel_id, discord_username, scheduled_close_at, original_message_id, claimed_by, claimed_by_username, validated, registration_waived, ticket_type, status, full_name, email, description, order_number, algorand_address, minerkeys, request_type, orders_quantities, bold_sign_signed, selected_region, created_at, closed_at, original_category_id, transcript_preference, sn_picture_confirmed, factory_reset_picture_confirmed, validated_by, program_status, coupon_code, forgo_return_message_ids, closed_by_username, closed_by_id, last_staff_member_id, last_message_at, last_message_from_role, inactivity_ping_count, last_inactivity_ping_at, staff_ping_count, last_staff_ping_at, ignore_inactivity, solana_wallet_address, flxtime_validated, flxtime_validated_by, aem_key_issued, aem_key_issued_at, aem_key_issued_by') 
            // Select necessary columns including user_id, channel_id, discord_username, scheduled_close_at, claimed_by, validated, registration_waived, and Flxtime fields
            .eq('id', ticketId)
            .maybeSingle(); // Changed to .maybeSingle()

        logger.info(`[DEBUG] getTicketById result for ticketId=${ticketId}: data=${JSON.stringify(data)}, error=${error?.message}`);

        if (error) {
            logger.error(`Error fetching ticket by ID ${ticketId}: ${error.message}`, error);
            throw error;
        }

        logger.info(`[DEBUG] getTicketById - Returning data for ticketId=${ticketId}: ${JSON.stringify(data)}`);
        return data; // Returns the ticket object if found, or null otherwise
    } catch (err) {
        logger.error(`Exception in getTicketById for ticket ${ticketId}: ${err.message}`, err);
        throw err;
    }
}

/**
 * Fetches a user's username by their ID.
 * @param {string} userId - The Discord user ID.
 * @returns {Promise<string|null>} The username or null if not found.
 */
async function getUserById(userId) {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('username')
            .eq('id', userId)
            .maybeSingle();

        if (error) {
            logger.error(`Error fetching username for user ${userId}: ${error.message}`, error);
            // Do not throw error here, just return null to indicate user not found or error
            return null;
        }
        return data ? data.username : null;
    } catch (err) {
        logger.error(`Exception in getUserById for user ${userId}: ${err.message}`, err);
        return null;
    }
}

/**
 * Updates specific columns for a ticket by its ID.
 * @param {string} ticketId - The ID of the ticket to update.
 * @param {object} updates - An object containing the columns and values to update.
 * @returns {Promise<object|null>} The updated ticket object or null on error.
 */
async function updateTicket(ticketId, updates) {
    try {
        const { data, error } = await supabase
            .from('tickets')
            .update(updates)
            .eq('id', ticketId)
            .select()
            .maybeSingle();

        if (error) {
            logger.error(`Error updating ticket ${ticketId}: ${error.message}`, error);
            throw error;
        }
        logger.info(`Ticket ${ticketId} updated with:`, updates);
        return data;
    } catch (err) {
        logger.error(`Exception in updateTicket for ticket ${ticketId}: ${err.message}`, err);
        throw err;
    }
}

/**
 * Logs a staff action associated with a ticket.
 * @param {string|number} ticketId - The related ticket ID.
 * @param {string} staffId - The Discord ID of the staff member.
 * @param {string} action - Description of the action taken.
 * @returns {Promise<object|null>} The inserted log entry or null on error.
 */
async function logStaffAction(ticketId, staffId, action) {
    const numericTicketId = typeof ticketId === 'string' ? parseInt(ticketId, 10) : ticketId;

    if (Number.isNaN(numericTicketId)) {
        const errorMessage = `logStaffAction called with invalid ticketId: ${ticketId}`;
        logger.error(errorMessage);
        throw new Error(errorMessage);
    }

    try {
        const record = {
            ticket_id: numericTicketId,
            staff_id: staffId,
            action,
            timestamp: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('staff_actions')
            .insert([record])
            .select()
            .maybeSingle();

        if (error) {
            logger.error(`Error logging staff action for ticket ${ticketId}: ${error.message}`, error);
            throw error;
        }

        logger.info(`Logged staff action for ticket ${ticketId} by ${staffId}: ${action}`);
        return data;
    } catch (err) {
        logger.error(`Exception in logStaffAction for ticket ${ticketId}: ${err.message}`, err);
        throw err;
    }
}

/**
 * Deletes a ticket by its ID.
 * @param {string|number} ticketId - The ID of the ticket to delete.
 * @returns {Promise<void>}
 */
async function deleteTicket(ticketId) {
    try {
        const { error } = await supabase
            .from('tickets')
            .delete()
            .eq('id', ticketId);

        if (error) {
            logger.error(`Error deleting ticket ${ticketId}: ${error.message}`, error);
            throw error;
        }
        logger.info(`Ticket ${ticketId} deleted after failed channel creation.`);
    } catch (err) {
        logger.error(`Exception deleting ticket ${ticketId}: ${err.message}`, err);
        throw err;
    }
}


/**
 * Calls the Supabase RPC function to get tickets due for scheduled closure.
 * @returns {Promise<object|null>} An array of due tickets or null on error.
 */
async function getDueScheduledTicketsRpc() {
    try {
        const { data, error } = await supabase.rpc('get_due_scheduled_tickets');

        if (error) {
            logger.error(`Error calling get_due_scheduled_tickets RPC: ${error.message}`, error);
            throw error;
        }
        // RPCs typically return data directly, not in a 'data' property for single results
        // Assuming this RPC returns an array of objects
        logger.info(`get_due_scheduled_tickets RPC called successfully. Found ${data ? data.length : 0} due tickets.`);
        return data;
    } catch (err) {
        logger.error(`Exception calling get_due_scheduled_tickets RPC: ${err.message}`, err);
        throw err;
    }
}

/**
 * Increments the message count for a staff member on a specific ticket.
 * Fetches the current count, increments it, and updates the row.
 * @param {string|number} ticketId - The ID of the ticket.
 * @param {string} staffId - The ID of the staff member.
 * @returns {Promise<object|null>} The updated ticket_staff entry or null on error.
 */
async function incrementMessageCount(ticketId, staffId) {
    try {
        // Fetch staff username
        const staffUsername = await getUserById(staffId);

        // Fetch the current ticket_staff entry
        const { data: currentData, error: fetchError } = await supabase
            .from('ticket_staff')
            .select('messages_contributed')
            .eq('ticket_id', ticketId)
            .eq('staff_id', staffId)
            .maybeSingle(); // Changed to maybeSingle()

        if (fetchError) {
            logger.error(`Error fetching current message count for ticket ${ticketId}, staff ${staffId}: ${fetchError.message}`, fetchError);
            throw fetchError; // Re-throw if there's an actual error, not just no rows
        }

        let newCount;
        let updatedData;
        let updateError;

        if (!currentData) {
            // If no entry exists, insert a new one
            const { data, error } = await supabase
                .from('ticket_staff')
                .insert([{ ticket_id: ticketId, staff_id: staffId, messages_contributed: 1, staff_username: staffUsername }])
                .select()
                .single();
            newCount = 1;
            updatedData = data;
            updateError = error;
        } else {
            // If entry exists, update it
            newCount = (currentData.messages_contributed || 0) + 1;
            const { data, error } = await supabase
                .from('ticket_staff')
                .update({ messages_contributed: newCount, staff_username: staffUsername })
                .eq('ticket_id', ticketId)
                .eq('staff_id', staffId)
                .select()
                .maybeSingle();
            updatedData = data;
            updateError = error;
        }

        if (updateError) {
            logger.error(`Error updating message count for ticket ${ticketId}, staff ${staffId}: ${updateError.message}`, updateError);
            throw updateError; // Re-throw to be handled by the caller
        }

        logger.info(`Message count incremented for ticket ${ticketId}, staff ${staffId}. New count: ${updatedData.messages_contributed}`);
        return updatedData;

    } catch (err) {
        logger.error(`Exception in incrementMessageCount for ticket ${ticketId}, staff ${staffId}: ${err.message}`, err);
        throw err;
    }
}

/**
 * Fetches an open ticket by its Discord channel ID.
 * @param {string} channelId - The Discord channel ID.
 * @returns {Promise<object|null>} The open ticket object or null.
 */
async function getTicketByChannelId(channelId) {
    try {
        const { data, error } = await supabase
            .from('tickets')
            .select('id, user_id, channel_id, status') // Select necessary columns
            .eq('channel_id', channelId)
            .eq('status', 'open') // Only get open tickets
            .maybeSingle();

        if (error) {
            logger.error(`Error fetching ticket by channel ID ${channelId}: ${error.message}`, error);
            throw error;
        }
        return data; // Returns the ticket object if found and open, or null otherwise
    } catch (err) {
        logger.error(`Exception in getTicketByChannelId for channel ${channelId}: ${err.message}`, err);
        throw err;
    }
}
/**
 * Inserts a log entry into the 'bot_logs' table.
 * @param {string} level - The log level (e.g., 'info', 'error').
 * @param {string} scope - The scope of the log (e.g., 'ticket_closure').
 * @param {string} message - The log message.
 * @returns {Promise<object|null>} The inserted log data or null on error.
 */
async function logBotActivity(level, scope, message) {
    try {
        const { data, error } = await supabase
            .from('bot_logs') // Ensure this table name is correct
            .insert([{ level, scope, message }])
            .select()
            .single();

        if (error) {
            logger.error(`Error logging bot activity: ${error.message}`, error);
            // Do not throw error here, just return null to indicate logging failed
            return null;
        }
        // logger.info(`Bot activity logged: ${message}`); // Avoid excessive logging of logs
        return data;
    } catch (err) {
        logger.error(`Exception in logBotActivity: ${err.message}`, err);
        return null;
    }
}

/**
 * Calls the Supabase RPC function to get inactive tickets.
 * @returns {Promise<Array<object>|null>} An array of inactive tickets or null on error.
 */
async function getInactiveTicketsRpc() {
    try {
        const { data, error } = await supabase.rpc('get_inactive_tickets');

        if (error) {
            logger.error(`Error calling get_inactive_tickets RPC: ${error.message}`, error);
            throw error;
        }
        // RPCs typically return data directly, not in a 'data' property for single results
        // Assuming this RPC returns an array of objects
        logger.info(`get_inactive_tickets RPC called successfully. Found ${data ? data.length : 0} inactive tickets.`);
        return data;
    } catch (err) {
        logger.error(`Exception calling get_inactive_tickets RPC: ${err.message}`, err);
        throw err;
    }
}

/**
 * Calls the Supabase RPC function to get Flxtime tickets needing screenshot reminders.
 * @returns {Promise<Array<object>|null>} An array of Flxtime tickets needing reminders or null on error.
 */
async function getFlxtimeTicketsNeedingReminderRpc() {
    try {
        const { data, error } = await supabase.rpc('get_flxtime_tickets_needing_reminder');

        if (error) {
            logger.error(`Error calling get_flxtime_tickets_needing_reminder RPC: ${error.message}`, error);
            throw error;
        }
        // RPCs typically return data directly, not in a 'data' property for single results
        // Assuming this RPC returns an array of objects
        logger.info(`get_flxtime_tickets_needing_reminder RPC called successfully. Found ${data ? data.length : 0} Flxtime tickets needing reminders.`);
        return data;
    } catch (err) {
        logger.error(`Exception calling get_flxtime_tickets_needing_reminder RPC: ${err.message}`, err);
        throw err;
    }
}

/**
 * Updates a message in the 'ticket_messages' table.
 * @param {string} discordMessageId - The Discord message ID of the message to update.
 * @param {string} newContent - The new content of the message (JSON string).
 * @returns {Promise<object|null>} The updated message data or null on error.
 */
async function updateTicketMessage(discordMessageId, newContent) {
    try {
        const { data, error } = await supabase
            .from('ticket_messages')
            .update({ message: newContent })
            .eq('discord_message_id', discordMessageId)
            .select()
            .maybeSingle();

        if (error) {
            logger.error(`Error updating message ${discordMessageId}: ${error.message}`, error);
            throw error;
        }
        logger.info(`Message ${discordMessageId} updated successfully.`);
        return data;
    } catch (err) {
        logger.error(`Exception in updateTicketMessage for message ${discordMessageId}: ${err.message}`, err);
        throw err;
    }
}

/**
 * Deletes a message from the 'ticket_messages' table.
 * @param {string} discordMessageId - The Discord message ID of the message to delete.
 * @returns {Promise<object|null>} The deleted message data or null on error.
 */
async function deleteTicketMessage(discordMessageId) {
    try {
        const { data, error } = await supabase
            .from('ticket_messages')
            .delete()
            .eq('discord_message_id', discordMessageId)
            .select()
            .maybeSingle();

        if (error) {
            logger.error(`Error deleting message ${discordMessageId}: ${error.message}`, error);
            throw error;
        }
        logger.info(`Message ${discordMessageId} deleted successfully.`);
        return data;
    } catch (err) {
        logger.error(`Exception in deleteTicketMessage for message ${discordMessageId}: ${err.message}`, err);
        throw err;
    }
}
/**
 * Placeholder function to check conversion eligibility based on Algorand address.
 * This will be implemented fully once the snapshot data is available in Supabase.
 * @param {string} algorandAddress - The Algorand address to check.
 * @returns {Promise<object>} An object indicating eligibility (e.g., { eligible: true, balance: 100000 } or { eligible: false }).
 */
async function checkConversionEligibility(algorandAddress) {
    logger.info(`Checking conversion eligibility for Algorand address: ${algorandAddress}`);
    try {
        const { data, error } = await supabase
            .from('conversion_eligibility_mirror') // Query the new table
            .select('*') // Select all columns to get detailed breakdown
            .eq('address', algorandAddress)
            .maybeSingle();

        if (error) {
            logger.error(`Error checking conversion eligibility for ${algorandAddress}: ${error.message}`, error);
            return { eligible: false, error: error.message };
        }

        if (data) {
            // If data is found, the address is eligible.
            // We can also check if available_for_conversion is > 0 if needed.
            return { eligible: true, data: data };
        } else {
            // No data found for the address
            return { eligible: false, data: null };
        }
    } catch (err) {
        logger.error(`Exception in checkConversionEligibility for ${algorandAddress}: ${err.message}`, err);
        return { eligible: false, error: err.message };
    }
}

async function getFry1Balance(address) {
    try {
        const response = await axios.get(`https://mainnet-api.algonode.cloud/v2/accounts/${address}`);
        // Log the response data immediately after a successful API call
        // logger.debug(`Response data for FRY 1.0 balance for address ${address}:`, response.data);
        const assets = response.data.assets;
        const fry1Asset = assets.find(asset => asset['asset-id'] === config.ASSET_ID_FRY1);
        return fry1Asset ? fry1Asset.amount / 1000000 : 0;
    } catch (error) {
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            logger.error(`Axios Error for FRY 1.0 balance (${address}): Status ${error.response.status}, Data:`, error.response.data);
        } else if (error.request) {
            // The request was made but no response was received
            logger.error(`Axios Error for FRY 1.0 balance (${address}): No response received. Request:`, error.request);
        } else {
            // Something happened in setting up the request that triggered an Error
            logger.error(`Axios Error for FRY 1.0 balance (${address}): Request setup error. Message:`, error.message);
        }
        return 0; // Return 0 on any error
    }
}

/**
 * Fetches the native Algorand (ALGO) balance for a given address.
 * @param {string} address - The Algorand address to check.
 * @returns {Promise<number>} The ALGO balance in Algos, or 0 on error/not found.
 */
async function getAlgoBalance(address) {
    try {
        const response = await axios.get(`https://mainnet-api.algonode.cloud/v2/accounts/${address}`);
        // Log the response data immediately after a successful API call
        // logger.debug(`Response data for ALGO balance for address ${address}:`, response.data);
        // Algorand native asset amount is in microAlgos, convert to Algos
        return response.data.amount / 1_000_000;
    } catch (error) {
        if (error.response) {
            logger.error(`Axios Error for ALGO balance (${address}): Status ${error.response.status}, Data:`, error.response.data);
        } else if (error.request) {
            logger.error(`Axios Error for ALGO balance (${address}): No response received. Request:`, error.request);
        } else {
            logger.error(`Axios Error for ALGO balance (${address}): Request setup error. Message:`, error.message);
        }
        return 0;
    }
}

/**
 * Fetches the minimum balance (locked balance) for a given Algorand address using the Algod API.
 * @param {string} address - The Algorand address to check.
 * @returns {Promise<number>} The minimum balance in Algos, or 0 on error/not found.
 */
async function getLockedAlgoBalance(address) {
    try {
        const response = await axios.get(`https://mainnet-api.algonode.cloud/v2/accounts/${address}`);
        // Log the response data immediately after a successful API call
        // logger.debug(`Response data for locked ALGO balance for address ${address}:`, response.data);
        // The 'min-balance' field is in microAlgos, convert to Algos
        return response.data['min-balance'] / 1_000_000;
    } catch (error) {
        if (error.response) {
            logger.error(`Axios Error for locked ALGO balance (${address}): Status ${error.response.status}, Data:`, error.response.data);
        } else if (error.request) {
            logger.error(`Axios Error for locked ALGO balance (${address}): No response received. Request:`, error.request);
        } else {
            logger.error(`Axios Error for locked ALGO balance (${address}): Request setup error. Message:`, error.message);
        }
        return 0;
    }
}

/**
 * Checks for Fry 1.0 burn transactions from a given address to the BURN_WALLET_ADDRESS within a specific timeframe,
 * and optionally matches the amount to the eligible conversion amount.
 * @param {string} senderAddress - The Algorand address of the sender.
 * @param {number} eligibleAmount - The user's total eligible FRY 1.0 for conversion.
 * @param {number} timeframeDays - The number of days back from now to check for transactions.
 * @returns {Promise<Array<object>>} An array of matching burn transaction details (txID, amount), or empty array if none found.
 */
async function checkBurnTransaction(senderAddress, eligibleAmount, timeframeDays = 7, minAmount = 0) {
    // timeframeDays: how many days back to look
    // minAmount: if >0, accept transactions with sentAmount >= minAmount (in FRY units)
    const burnTransactions = [];

    try {
        // Verify account exists
        await axios.get(`https://mainnet-api.algonode.cloud/v2/accounts/${senderAddress}`);

        // Prepare pagination loop. Prefer indexer endpoint which supports pagination tokens.
        const indexerBase = `https://mainnet-idx.algonode.cloud/v2/accounts/${senderAddress}/transactions`;
        let nextToken = null;
        const now = new Date();
        const timeframeDaysAgo = new Date(now.getTime() - (timeframeDays * 24 * 60 * 60 * 1000));
        const timeframeCutoff = Math.floor(timeframeDaysAgo.getTime() / 1000); // Unix timestamp
        const amountTolerance = 0.000001; // tolerance for matching eligibleAmount
        const maxPages = 50; // safety cap to avoid runaway pagination
        let pageCount = 0;
        let keepPaging = true;

        while (keepPaging && pageCount < maxPages) {
            pageCount += 1;
            const params = { limit: 1000 };
            if (nextToken) params.next = nextToken;

            let response;
            try {
                response = await axios.get(indexerBase, { params });
            } catch (err) {
                // If indexer fails, fallback to the non-indexer transactions endpoint for a single page and stop paging
                logger.warn(`Indexer transactions endpoint failed for ${senderAddress} (page ${pageCount}), falling back to standard transactions endpoint: ${err.message}`);
                try {
                    response = await axios.get(`https://mainnet-api.algonode.cloud/v2/accounts/${senderAddress}/transactions`, { params: { limit: 1000 } });
                    // After fallback single page, do not attempt further pages
                    nextToken = null;
                    keepPaging = false;
                } catch (innerErr) {
                    logger.error(`Both indexer and standard transactions endpoints failed for ${senderAddress}: ${innerErr.message}`, innerErr);
                    break;
                }
            }

            const transactions = response.data.transactions || [];
            // If no transactions, end
            if (!transactions.length) break;

            for (const tx of transactions) {
                // If tx has round-time and it's older than cutoff, we can stop processing further older transactions
                if (tx['round-time'] && tx['round-time'] < timeframeCutoff) {
                    keepPaging = false;
                    break;
                }

                if (tx['tx-type'] === 'axfer' &&
                    tx['asset-transfer-transaction'] &&
                    tx['asset-transfer-transaction']['asset-id'] === config.ASSET_ID_FRY1 &&
                    tx['asset-transfer-transaction'].receiver === config.BURN_WALLET_ADDRESS) {

                    const sentAmount = tx['asset-transfer-transaction'].amount / 1_000_000;

                    if (minAmount && sentAmount >= minAmount) {
                        burnTransactions.push({
                            txID: tx.id,
                            amount: sentAmount,
                            timestamp: tx['round-time']
                        });
                    } else if (!minAmount && eligibleAmount && Math.abs(sentAmount - eligibleAmount) < amountTolerance) {
                        burnTransactions.push({
                            txID: tx.id,
                            amount: sentAmount,
                            timestamp: tx['round-time']
                        });
                    }
                }
            }

            // Determine next token for pagination (indexer uses 'next-token' or 'next' depending on provider)
            nextToken = response.data['next-token'] || response.data.next || null;
            if (!nextToken) keepPaging = false;
        }

    } catch (error) {
        if (error.response) {
            logger.error(`Axios Error for burn transactions (${senderAddress}): Status ${error.response.status}, Data:`, error.response.data);
            if (error.response.status === 404) {
                logger.error(`Account ${senderAddress} not found or has no transactions`);
            }
        } else if (error.request) {
            logger.error(`Axios Error for burn transactions (${senderAddress}): No response received. Request:`, error.request);
        } else {
            logger.error(`Axios Error for burn transactions (${senderAddress}): Request setup error. Message:`, error.message);
        }
    }

    return burnTransactions;
}

/**
 * Fetches conversion status from the conversion_eligibility_mirror table.
 * @param {string} algorandAddress - The Algorand address to check.
 * @returns {Promise<object>} An object with mirror data or null if not found.
 */
async function getConversionMirrorStatus(algorandAddress) {
    logger.info(`Checking conversion mirror status for Algorand address: ${algorandAddress}`);
    try {
        const { data, error } = await supabase
            .from('conversion_eligibility_mirror')
            .select('*')
            .eq('address', algorandAddress)
            .maybeSingle();

        if (error) {
            logger.error(`Error checking conversion mirror status for ${algorandAddress}: ${error.message}`, error);
            return { found: false, error: error.message };
        }

        if (data) {
            return { found: true, data: data };
        } else {
            return { found: false, data: null };
        }
    } catch (err) {
        logger.error(`Exception in getConversionMirrorStatus for ${algorandAddress}: ${err.message}`, err);
        return { found: false, error: err.message };
    }
}

/**
 * Calculates the current vesting status based on mirror data and current date.
 * @param {object} mirrorData - Data from conversion_eligibility_mirror table.
 * @param {Date} currentDate - Current date (defaults to now).
 * @returns {object} Vesting status information.
 */
function calculateVestingStatus(mirrorData, currentDate = new Date()) {
    const vestingStart = new Date('2025-08-01T00:00:00.000Z');
    const vestingEnd = new Date('2026-07-01T00:00:00.000Z');
    
    // Calculate months since vesting started
    const monthsDiff = (currentDate.getFullYear() - vestingStart.getFullYear()) * 12 + 
                      (currentDate.getMonth() - vestingStart.getMonth());
    
    // Current vesting month (1-12, capped)
    const currentVestingMonth = Math.min(Math.max(monthsDiff + 1, 1), 12);
    
    // Parse data from mirror table
    const claimedMonths = parseInt(mirrorData.claimedmonths) || 0;
    const claimableAmount = parseFloat(mirrorData.claimableamount) || 0;
    const pendingAmount = parseFloat(mirrorData.pendingamount) || 0;
    const totalAmount = parseFloat(mirrorData.amount) || 0;
    
    // Calculate status
    const monthsAvailableToClaim = Math.max(currentVestingMonth - claimedMonths, 0);
    const isFullyClaimed = claimedMonths >= currentVestingMonth;
    const isConversionComplete = claimedMonths >= 12;
    
    // Calculate next claim date
    let nextClaimDate = null;
    if (!isConversionComplete && currentVestingMonth < 12) {
        const nextMonth = currentVestingMonth + 1; // vesting month index (1..12)
        if (nextMonth <= 12) {
            // Vesting months map as:
            // 1 -> Aug 2025, 2 -> Sep 2025, ..., 5 -> Dec 2025,
            // 6 -> Jan 2026, ..., 12 -> Jul 2026
            const nextClaimYear = nextMonth <= 5 ? 2025 : 2026;
            const nextClaimMonth = nextMonth + 7; // Aug = 1 + 7 => 8, etc.
            // JS Date month is 0-based; use modulo to wrap into 0-11 range
            nextClaimDate = new Date(nextClaimYear, (nextClaimMonth - 1) % 12, 1);
        }
    }
    
    return {
        currentVestingMonth,
        totalMonths: 12,
        claimedMonths,
        claimableAmount,
        pendingAmount,
        totalAmount,
        isFullyClaimed,
        isConversionComplete,
        monthsAvailableToClaim,
        nextClaimDate,
        vestingStarted: currentDate >= vestingStart,
        vestingEnded: currentDate >= vestingEnd
    };
}

/**
 * Determines the conversion stage based on mirror data and vesting status.
 * @param {object} mirrorData - Data from conversion_eligibility_mirror table.
 * @param {object} vestingStatus - Calculated vesting status.
 * @returns {object} Stage information with stage number and description.
 */
function determineConversionStage(mirrorData, vestingStatus) {
    const status = mirrorData.status;
    const assetId = mirrorData.asset_id;
    const { isConversionComplete, isFullyClaimed, claimedMonths, monthsAvailableToClaim } = vestingStatus;
    
    if (!status && !assetId) {
        return {
            stage: 0,
            name: 'Not Started',
            description: 'User has not started the conversion process'
        };
    }
    
    if (status === 'valid' && assetId === '924268058') {
        return {
            stage: 1,
            name: 'Eligibility Checked',
            description: 'User has checked eligibility but not initiated conversion'
        };
    }
    
    if (status === 'pending' && monthsAvailableToClaim > 0) {
        return {
            stage: 2,
            name: 'Conversion Initiated',
            description: 'User has initiated conversion and has claimable amounts'
        };
    }
    
    if (claimedMonths > 0 && !isFullyClaimed) {
        return {
            stage: 3,
            name: 'Partially Claimed',
            description: 'User has claimed some months but is behind current vesting schedule'
        };
    }
    
    if (isFullyClaimed && !isConversionComplete) {
        return {
            stage: 4,
            name: 'Fully Claimed (Current)',
            description: 'User is up to date with current vesting schedule'
        };
    }
    
    if (isConversionComplete) {
        return {
            stage: 5,
            name: 'Conversion Complete',
            description: 'User has claimed all 12 months of vesting'
        };
    }
    
    // Default fallback
    return {
        stage: 1,
        name: 'Unknown Status',
        description: 'Unable to determine exact conversion stage'
    };
}

/**
 * Gets comprehensive conversion progress for an address.
 * @param {string} algorandAddress - The Algorand address to check.
 * @param {Date} currentDate - Current date (defaults to now).
 * @returns {Promise<object>} Complete conversion progress information.
 */
async function getConversionProgress(algorandAddress, currentDate = new Date()) {
    try {
        // Get mirror data
        const mirrorResult = await getConversionMirrorStatus(algorandAddress);
        
        if (!mirrorResult.found) {
            return {
                found: false,
                stage: { stage: 0, name: 'Not Started', description: 'Not eligible for conversion' },
                vestingStatus: null,
                mirrorData: null,
                eligibilityData: null,
                error: mirrorResult.error
            };
        }
        
        // Calculate vesting status
        const vestingStatus = calculateVestingStatus(mirrorResult.data, currentDate);
        
        // Determine stage
        const stage = determineConversionStage(mirrorResult.data, vestingStatus);

        // Additional: Detect on-chain burn TXs that are NOT yet reflected in the mirror.
        // We will NOT modify any DB records here — only detect and return the data so callers can notify staff.
        let hasUnregisteredBurn = false;
        let unregisteredBurnTxs = [];

        try {
            // Only run burn detection when the mirror exists but status does not indicate 'pending' (i.e., conversion not initiated)
            const mirrorStatus = mirrorResult.data?.status;
            const eligibleAmount = parseFloat(mirrorResult.data?.amount) || 0;

            if (mirrorStatus !== 'pending' && eligibleAmount > 0) {
                // Use configured lookback and min amount defaults
                const lookbackDays = config.BURN_TX_LOOKBACK_DAYS || 180;
                const minAmount = config.BURN_TX_MIN_AMOUNT || 100;

                // checkBurnTransaction(senderAddress, eligibleAmount, timeframeDays = 7, minAmount = 0)
                const burnTxs = await checkBurnTransaction(algorandAddress, eligibleAmount, lookbackDays, minAmount);

                if (Array.isArray(burnTxs) && burnTxs.length > 0) {
                    hasUnregisteredBurn = true;
                    unregisteredBurnTxs = burnTxs;
                }
            }
        } catch (burnCheckErr) {
            logger.warn(`Burn detection failed for ${algorandAddress}: ${burnCheckErr.message}`);
            // Do not fail the whole progress check if burn detection fails; proceed without marking.
        }
                
        return {
            found: true,
            stage,
            vestingStatus,
            mirrorData: mirrorResult.data,
            eligibilityData: null,
            error: null,
            // supplemental fields for callers
            hasUnregisteredBurn,
            unregisteredBurnTxs
        };
        
    } catch (err) {
        logger.error(`Exception in getConversionProgress for ${algorandAddress}: ${err.message}`, err);
        return {
            found: false,
            stage: null,
            vestingStatus: null,
            mirrorData: null,
            eligibilityData: null,
            error: err.message
        };
    }
}

/**
 * Checks if a user has already received an AEM key from a previous Flxtime Partners ticket.
 * @param {string} userId - The Discord user ID to check.
 * @returns {Promise<object>} Object with hasKey boolean and previous ticket details if found.
 */
async function checkFlxtimeKeyHistory(userId) {
    try {
        logger.info(`Checking Flxtime AEM key history for user ${userId}`);
        
        const { data, error } = await supabase
            .from('tickets')
            .select('id, aem_key_issued, aem_key_issued_at, aem_key_issued_by, channel_id')
            .eq('user_id', userId)
            .eq('ticket_type', 'flxtime_partners_support')
            .not('aem_key_issued', 'is', null)
            .order('aem_key_issued_at', { ascending: true })
            .limit(1);

        if (error) {
            logger.error(`Error checking Flxtime key history for user ${userId}: ${error.message}`, error);
            return { hasKey: false, error: error.message };
        }

        if (data && data.length > 0) {
            const previousTicket = data[0];
            logger.info(`Found previous AEM key for user ${userId}: ticket ${previousTicket.id}, key: ${previousTicket.aem_key_issued}`);
            return {
                hasKey: true,
                previousTicket: {
                    id: previousTicket.id,
                    keyIssued: previousTicket.aem_key_issued,
                    issuedAt: previousTicket.aem_key_issued_at,
                    issuedBy: previousTicket.aem_key_issued_by,
                    channelId: previousTicket.channel_id
                }
            };
        } else {
            logger.info(`No previous AEM key found for user ${userId}`);
            return { hasKey: false, previousTicket: null };
        }
    } catch (err) {
        logger.error(`Exception in checkFlxtimeKeyHistory for user ${userId}: ${err.message}`, err);
        return { hasKey: false, error: err.message };
    }
}

/**
 * Generates a stage-specific status message for the user.
 * @param {string} algorandAddress - The Algorand address.
 * @param {object} progressData - Complete progress data from getConversionProgress.
 * @returns {string} Formatted status message.
 */
function generateConversionStatusMessage(algorandAddress, progressData) {
    const { stage, vestingStatus, mirrorData } = progressData;
    
    if (!progressData.found) {
        return `❌ **Conversion Status Check**\n\nYour Algorand address \`${algorandAddress}\` was not found in the conversion eligibility data. Please verify your address or check if you had FRY 1.0 holdings on December 1st, 2024.`;
    }
    
    const currentDate = new Date();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
    
    let message = '';
    
    switch (stage.stage) {
        case 0:
            message = `🔍 **Conversion Status - Not Started**\n\n` +
                     `📍 **Your Address**: \`${algorandAddress}\`\n` +
                     `✅ **Eligibility**: Confirmed eligible for conversion\n` +
                     `💰 **Total Eligible**: ${mirrorData ? parseFloat(mirrorData.amount).toLocaleString() : 'Unknown'} FRY 1.0\n\n` +
                     `🚀 **Next Steps**:\n` +
                     `1. Visit the Fry Dashboard to check your eligibility\n` +
                     `2. Choose your conversion option (FRY 2.0 or fNode)\n` +
                     `3. Send your FRY 1.0 to the burn wallet\n\n` +
                     `📅 **Vesting Info**: Conversion unlocks 1/12th monthly starting August 1st, 2025`;
            break;
            
        case 1:
            message = `✅ **Conversion Status - Eligibility Confirmed**\n\n` +
                     `📍 **Your Address**: \`${algorandAddress}\`\n` +
                     `💰 **Total Eligible**: ${parseFloat(mirrorData.amount).toLocaleString()} FRY 1.0\n` +
                     `🎯 **Status**: Eligibility confirmed, ready to convert\n\n` +
                     `🚀 **Next Steps**:\n` +
                     `1. Choose your conversion option (FRY 2.0 at 80:1 or fNode at 40:1)\n` +
                     `2. Send your FRY 1.0 to the burn wallet via the dashboard\n` +
                     `3. Return to claim your converted tokens\n\n` +
                     `📅 **Vesting**: Starts August 1st, 2025 (1/12th monthly)\n\n` +
                     `ℹ️ If you have recently sent FRY 1.0 to the burn wallet, you can click the **Check Burn TX** button below to verify the transaction.`;
            break;
            
        case 2:
        case 3:
            const monthName = monthNames[currentDate.getMonth()];
            const year = currentDate.getFullYear();
            message = `🪙 **Conversion Status - Month ${vestingStatus.currentVestingMonth} of 12**\n\n` +
                     `📅 **Current Period**: ${monthName} ${year} (Month ${vestingStatus.currentVestingMonth})\n` +
                     `🎯 **Your Progress**:\n` +
                     `- Claimed: ${vestingStatus.claimedMonths}/${vestingStatus.currentVestingMonth} months ${vestingStatus.isFullyClaimed ? '✅' : '⚠️'}\n`;
            
            // Determine converted token type
            let convertedTokenType = 'tokens'; // Default
            const totalConvertedAmount = vestingStatus.claimableAmount * 12;
            const tolerance = 0.001; // Small tolerance for floating point comparison

            if (Math.abs(totalConvertedAmount * 80 - vestingStatus.totalAmount) < tolerance) {
                convertedTokenType = 'FRY 2.0';
            } else if (Math.abs(totalConvertedAmount * 40 - vestingStatus.totalAmount) < tolerance) {
                convertedTokenType = 'fNode';
            }

            if (vestingStatus.monthsAvailableToClaim > 0) {
                message += `- **Available to claim: ${vestingStatus.monthsAvailableToClaim} month(s)**\n` +
                          `- Claimable amount: ${formatNumberWithCommas(vestingStatus.claimableAmount, 6)} ${convertedTokenType}\n\n` +
                          `🚀 **Action Required**: Visit the dashboard to claim your pending month(s)!`;
            } else {
                message += `- Available to claim: 0 months\n\n` +
                          `✅ **Status**: You're up to date! ${vestingStatus.nextClaimDate ? `Next claim available: ${vestingStatus.nextClaimDate.toLocaleDateString()}` : 'All months claimed!'}`;
            }
            
            message += `\n\n💰 **Amounts**:\n` +
                      `- Total eligible: ${formatNumberWithCommas(vestingStatus.totalAmount, 6)} FRY 1.0\n` +
                      `- Remaining: ${formatNumberWithCommas(vestingStatus.pendingAmount, 6)} FRY 1.0 (${12 - vestingStatus.claimedMonths} months)\n` +
                      `*Note: The "Remaining" amount refers to FRY 1.0 still to be converted as vesting unlocks. The full eligible FRY 1.0 amount was required to be sent in one transaction at the beginning of the conversion process.*`;
            break;
                        
        case 4:
            message = `✅ **Conversion Status - Fully Up to Date**\n\n` +
                     `📅 **Current Period**: Month ${vestingStatus.currentVestingMonth} of 12\n` +
                     `🎯 **Your Progress**: ${vestingStatus.claimedMonths}/${vestingStatus.currentVestingMonth} months claimed ✅\n\n` +
                     `🎉 **Great job!** You're fully up to date with the vesting schedule.\n\n`;
            
            if (vestingStatus.nextClaimDate) {
                message += `🗓️ **Next Claim**: ${vestingStatus.nextClaimDate.toLocaleDateString()} (Month ${vestingStatus.currentVestingMonth + 1})`;
            } else {
                message += `🏁 **Conversion Complete**: All 12 months have been claimed!`;
            }
            break;
            
        case 5:
            message = `🏁 **Conversion Complete!**\n\n` +
                     `📅 **Final Status**: All 12 months claimed ✅\n` +
                     `💰 **Total Converted**: ${vestingStatus.totalAmount.toLocaleString()} FRY 1.0\n\n` +
                     `🎉 **Congratulations!** Your FRY 1.0 conversion is now complete.\n` +
                     `You can view your complete claim history in the dashboard.`;
            break;
            
        default:
            message = `❓ **Conversion Status - Unknown**\n\n` +
                     `We couldn't determine your exact conversion stage. Please contact support for assistance.`;
    }
    
    return message;
}

module.exports = {
    checkActiveTicket,
    insertTicket,
    updateTicketChannelId,
    upsertUser,
    logTicketMessage,
    closeTicketRpc,
    getTicketById,
    getUserById, // Export function to get user by ID
    updateTicket, // Export update function to update ticket
    deleteTicket, // Export delete function for cleanup scenarios
    getDueScheduledTicketsRpc, // Export function to get due scheduled tickets
    incrementMessageCount, // Export function to increment message count
    getTicketByChannelId, // Export function to get ticket by channel ID
    logBotActivity, // Export function for logging bot activity
    logStaffAction, // Export function to log staff actions
    getInactiveTicketsRpc, // Export RPC function
    cleanupOrphanedTicketsRpc, // Export RPC function for cleaning up orphaned tickets
    cleanupOrphanedTickets, // Export combined cleanup (RPC + fallback)
    getFlxtimeTicketsNeedingReminderRpc, // Export RPC function for Flxtime reminders
    checkConversionEligibility, // Export function to check conversion eligibility
    getFry1Balance, // Export function to get FRY 1.0 balance
    getAlgoBalance, // Export function to get ALGO balance
    checkBurnTransaction, // Export function to check burn transaction
    updateTicketMessage, // Export function to update ticket message
    getLockedAlgoBalance, // Export function to get locked ALGO balance
    deleteTicketMessage, // Export function to delete ticket message
    getConversionMirrorStatus, // Export function to get conversion mirror status
    calculateVestingStatus, // Export function to calculate vesting status
    determineConversionStage, // Export function to determine conversion stage
    getConversionProgress, // Export function to get comprehensive conversion progress
    generateConversionStatusMessage, // Export function to generate status messages
    checkFlxtimeKeyHistory // Export function to check Flxtime key history
};
