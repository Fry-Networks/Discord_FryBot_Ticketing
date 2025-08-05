// NewTicketLogic/handlers/supabaseHandler.js
const supabase = require('../supabaseClient');
const logger = require('../utils/logger');
const axios = require('axios');
const config = require('../utils/config');

/**
 * Checks if a user already has an open ticket.
 * @param {string} userId - The Discord user ID.
 * @returns {Promise<object|null>} The existing ticket object or null.
 */
async function checkActiveTicket(userId) {
    try {
        const { data, error } = await supabase
            .from('tickets')
            .select('id, ticket_type, channel_id')
            .eq('user_id', userId)
            .eq('status', 'open') // Assuming 'open' is the status for active tickets
            .maybeSingle();

        if (error) {
            logger.error(`Error checking active ticket for user ${userId}: ${error.message}`, error);
            throw error; // Re-throw to be handled by the caller
        }
        return data; // Returns the ticket object if found, or null otherwise
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
            status: 'open',
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
            .select('id, is_transcribed, user_id, channel_id, discord_username, scheduled_close_at, original_message_id, claimed_by, claimed_by_username, validated, registration_waived, ticket_type, status, full_name, email, description, order_number, algorand_address, minerkeys, request_type, orders_quantities, bold_sign_signed, selected_region, created_at, closed_at, original_category_id, transcript_preference, sn_picture_confirmed, factory_reset_picture_confirmed, validated_by, program_status, coupon_code, forgo_return_message_ids, closed_by_username, closed_by_id, last_staff_member_id, last_message_at, last_message_from_role, inactivity_ping_count, last_inactivity_ping_at, staff_ping_count, last_staff_ping_at, ignore_inactivity') 
            // Select necessary columns including user_id, channel_id, discord_username, scheduled_close_at, claimed_by, validated, registration_waived, and other relevant fields
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
            .from('conversion_eligibility') // Query the new table
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
async function checkBurnTransaction(senderAddress, eligibleAmount, timeframeDays = 7) {
    // logger.info(`Checking burn transactions for ${senderAddress} within last ${timeframeDays} days, matching eligible amount ${eligibleAmount}`);
    const burnTransactions = [];

    try {
        // First, verify the account exists by checking account info
        // logger.debug(`Verifying account exists: ${senderAddress}`);
        const accountResponse = await axios.get(`https://mainnet-api.algonode.cloud/v2/accounts/${senderAddress}`);
        // logger.debug(`Account verification successful for ${senderAddress}`);

        // Try without any time filter first to see if we can get any transactions
        // logger.debug(`Fetching recent transactions for address ${senderAddress} (no time filter)`);
        
        let response;
        try {
            response = await axios.get(
                `https://mainnet-api.algonode.cloud/v2/accounts/${senderAddress}/transactions`,
                {
                    params: {
                        'limit': 1000
                    }
                }
            );
        } catch (txError) {
            // If transactions endpoint fails, try the indexer API instead
            logger.warn(`Standard transactions API failed, trying indexer API for ${senderAddress}`);
            response = await axios.get(
                `https://mainnet-idx.algonode.cloud/v2/accounts/${senderAddress}/transactions`,
                {
                    params: {
                        'limit': 1000
                    }
                }
            );
        }
        
        const transactions = response.data.transactions;
        // logger.debug(`Found ${transactions.length} total transactions for ${senderAddress}`);

        // Calculate timeframe for filtering
        const now = new Date();
        const timeframeDaysAgo = new Date(now.getTime() - (timeframeDays * 24 * 60 * 60 * 1000));
        const timeframeCutoff = Math.floor(timeframeDaysAgo.getTime() / 1000); // Convert to Unix timestamp

        const amountTolerance = 0.000001; // Small tolerance for floating point comparisons

        for (const tx of transactions) {
            // Check if transaction is within timeframe (round-time is Unix timestamp)
            if (tx['round-time'] && tx['round-time'] < timeframeCutoff) {
                continue; // Skip transactions older than timeframe
            }

            // Check if it's an asset transfer for FRY 1.0 and sent to the burn wallet
            if (tx['tx-type'] === 'axfer' && 
                tx['asset-transfer-transaction'] && 
                tx['asset-transfer-transaction']['asset-id'] === config.ASSET_ID_FRY1 &&
                tx['asset-transfer-transaction'].receiver === config.BURN_WALLET_ADDRESS) {
                
                const sentAmount = tx['asset-transfer-transaction'].amount / 1_000_000; // Convert from microunits to full units
                
              //  logger.debug(`Found FRY burn transaction: ${tx.id}, amount: ${sentAmount}, eligible: ${eligibleAmount}, timestamp: ${tx['round-time']}`);

                // Check if the sent amount is close to the eligible amount
                if (Math.abs(sentAmount - eligibleAmount) < amountTolerance) {
                    burnTransactions.push({
                        txID: tx.id,
                        amount: sentAmount,
                        timestamp: tx['round-time'] // Unix timestamp of the round
                    });
                }
            }
        }
        
       // logger.info(`Found ${burnTransactions.length} matching burn transactions for ${senderAddress}`);
        
    } catch (error) {
        if (error.response) {
            logger.error(`Axios Error for burn transactions (${senderAddress}): Status ${error.response.status}, Data:`, error.response.data);
            // If it's a 404, the account might not exist or have no transactions
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
    getDueScheduledTicketsRpc, // Export function to get due scheduled tickets
    incrementMessageCount, // Export function to increment message count
    getTicketByChannelId, // Export function to get ticket by channel ID
    logBotActivity, // Export function for logging bot activity
    getInactiveTicketsRpc, // Export RPC function
    checkConversionEligibility, // Export function to check conversion eligibility
    getFry1Balance, // Export function to get FRY 1.0 balance
    getAlgoBalance, // Export function to get ALGO balance
    checkBurnTransaction, // Export function to check burn transaction
    updateTicketMessage, // Export function to update ticket message
    getLockedAlgoBalance, // Export function to get locked ALGO balance
    deleteTicketMessage // Export function to delete ticket message
};
