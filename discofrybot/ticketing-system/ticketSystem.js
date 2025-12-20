// ticketing-system/ticketSystem.js
const { Events } = require('discord.js'); // Import Events
const logger = require('./utils/logger');
const config = require('./utils/config'); // For any top-level configs, though client is passed in
const { initializeInteractionHandlers } = require('./handlers/interactionHandler');
require('dotenv').config({ path: '../.env' }); // Load environment variables
const supabaseHandler = require('./handlers/supabaseHandler'); // Import supabaseHandler
const closeHandler = require('./modules/closeHandler'); // Import closeHandler
const { registerSlashCommands } = require('./utils/slashCommandManager'); // Import command registration function
const inactivityPinger = require('./modules/inactivityPinger'); // Import inactivity pinger module
const flxtimePartnersHandler = require('./handlers/flxtimePartnersHandler'); // Import Flxtime Partners handler
const screenshotDetectionHandler = require('./handlers/screenshotDetectionHandler'); // Import screenshot detection handler

// Define the interval for checking scheduled closures (in milliseconds)
const SCHEDULED_CLOSURE_CHECK_INTERVAL = 7200000; // Check every 2 hours
const INACTIVITY_CHECK_INTERVAL = 432100000; // Check every 48 hours

/**
 * Initializes the new ticket system logic.
 * This function should be called from the main bot file (e.g., discofrybot.js),
 * passing the existing Discord client instance.
 *
 * @param {import('discord.js').Client} client - The existing Discord client instance.
 * @param {string} prefix - The command prefix used by the bot.
 */
function initializeTicketSystem(client, prefix) {
    if (!client) {
        logger.error('TicketSystem: Discord client instance was not provided. System cannot start.');
        throw new Error('Discord client is required for TicketSystem initialization.');
    }

    logger.info('Initializing Ticketing System...');

    // Initialize all interaction handlers (slash commands, buttons, modals, select menus)
    initializeInteractionHandlers(client);

    // Initialize screenshot detection for Flxtime Partners Support tickets
    screenshotDetectionHandler.initializeScreenshotDetection(client);
    logger.info('📸 Screenshot detection handler registered via ticket system.');

    // Add message listener to log messages in ticket channels
    client.on(Events.MessageCreate, async (message) => {
        // Ignore messages from bots
       // if (message.author.bot) return;

        // Ignore messages that are commands
        if (message.content.startsWith(prefix)) {
            logger.info(`Ignoring command message "${message.content}" from ${message.author.tag} for logging.`);
            return;
        }
        
        // Check if the message is in a ticket channel
        try {
            const ticket = await supabaseHandler.getTicketByChannelId(message.channelId);

            if (ticket) {
                // Message is in an open ticket channel, log it
                const messageData = {
                    ticket_id: ticket.id,
                    user_id: message.author.id,
                    discord_message_id: message.id,
                    message: JSON.stringify({
                        discordData: {
                            username: message.author.username,
                            avatar: message.author.displayAvatarURL(), // Use displayAvatarURL to get the avatar link
                            created: message.createdTimestamp, // Use createdTimestamp for a numerical timestamp
                            content: message.content
                        },
                        embeds: message.embeds
                        // attachments: message.attachments
                    }),
                    discord_username: message.author.username, // Add discord_username
                    role: message.author.bot ? 'bot' : (message.member && message.member.roles.cache.has(config.ticketModRoleId) ? 'staff' : 'user'), // Determine and add the role
                    // Add attachments or embeds if needed in the future
                };
                await supabaseHandler.logTicketMessage(messageData);
                logger.info(`Logged message ${message.id} in ticket channel ${message.channelId}`);

                // Increment staff message count if the author is staff
                if (message.member && message.member.roles.cache.has(config.ticketModRoleId)) {
                    await supabaseHandler.incrementMessageCount(ticket.id, message.author.id);
                }

            }
        } catch (error) {
            logger.error(`Error processing message ${message.id} in channel ${message.channelId}: ${error.message}`, error);
            // Decide how to handle errors here - maybe send an ephemeral message to staff?
        }
    });

    // Add message update listener to update messages in ticket channels
    client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
        // Ignore partial messages if they cannot be fetched
        if (newMessage.partial) {
            try {
                await newMessage.fetch();
            } catch (error) {
                logger.error(`Error fetching partial message for update: ${error.message}`, error);
                return;
            }
        }

        // Ignore messages from bots
        if (newMessage.author.bot) return;

        // Check if the message is in a ticket channel
        try {
            const ticket = await supabaseHandler.getTicketByChannelId(newMessage.channelId);

            if (ticket) {
                // Message is in an open ticket channel, update it
                const newContent = JSON.stringify({
                    discordData: {
                        username: newMessage.author.username,
                        avatar: newMessage.author.displayAvatarURL(),
                        created: newMessage.createdTimestamp,
                        content: newMessage.content
                    },
                    embeds: newMessage.embeds
                });
                await supabaseHandler.updateTicketMessage(newMessage.id, newContent);
                logger.info(`Updated message ${newMessage.id} in ticket channel ${newMessage.channelId}`);
            }
        } catch (error) {
            logger.error(`Error processing message update for message ${newMessage.id} in channel ${newMessage.channelId}: ${error.message}`, error);
        }
    });

    // Add message delete listener to delete messages from ticket channels
    client.on(Events.MessageDelete, async (message) => {
        // Ignore partial messages if they cannot be fetched (content might be lost anyway)
        if (message.partial) {
            try {
                // Attempt to fetch if partial, though content might be null for deleted messages
                await message.fetch();
            } catch (error) {
                logger.warn(`Could not fetch partial message for deletion: ${message.id}. Proceeding with available data.`);
            }
        }

        // Ignore messages from bots (we don't log bot messages for deletion)
        if (message.author && message.author.bot) return;

        // Check if the message was in a ticket channel
        try {
            const ticket = await supabaseHandler.getTicketByChannelId(message.channelId);

            if (ticket) {
                // Message was in an open ticket channel, delete it from DB
                await supabaseHandler.deleteTicketMessage(message.id);
                logger.info(`Deleted message ${message.id} from ticket channel ${message.channelId}`);
            }
        } catch (error) {
            logger.error(`Error processing message delete for message ${message.id} in channel ${message.channelId}: ${error.message}`, error);
        }
    });

    // Start the periodic check for scheduled closures
    setInterval(async () => {
        logger.info('Checking for due scheduled tickets...');
            try {
                // Call the Supabase RPC to get due tickets
                let dueTickets = await supabaseHandler.getDueScheduledTicketsRpc();

            // Convert the returned object values to an array if dueTickets is an object
            if (dueTickets && typeof dueTickets === 'object' && !Array.isArray(dueTickets)) {
                 logger.warn('Received non-array from get_due_scheduled_tickets RPC. Converting object to array.');
                 dueTickets = Object.values(dueTickets);
            }


            // Check if there are due tickets and process them
            if (dueTickets && dueTickets.length > 0) {
                logger.info(`Found ${dueTickets.length} due scheduled tickets. Processing...`);

                // Process each due ticket
                for (const ticket of dueTickets) {
                    try {
                        // Call the function to finalize the scheduled closure, passing the entire ticket object
                        await closeHandler.finalizeScheduledTicketClosure(client, ticket);
                        logger.info(`Successfully triggered finalization for scheduled ticket ${ticket.ticket_id}.`);
                    } catch (processingError) {
                        logger.error(`Error processing due scheduled ticket ${ticket.ticket_id}: ${processingError.message}`, processingError);
                        // Continue to the next ticket even if one fails
                    }
                }
            } else {
                logger.info('No due scheduled tickets found.');
            }

        } catch (error) {
            logger.error(`Unhandled error during scheduled ticket check interval: ${error.message}`, error);
        }
    }, SCHEDULED_CLOSURE_CHECK_INTERVAL);

    // Register slash commands
    // It's generally better to register commands once on bot startup in the main file,
    // but following the commented-out structure here:
    // This should ideally be awaited, but initializeTicketSystem is not async.
    // A better approach would be to call registerSlashCommands in the main bot file's client.once('ready') block.
    // For now, calling it here as a non-awaited promise.
    registerSlashCommands(process.env.CLIENT_ID, process.env.GUILD_ID, process.env.DISCORD_TOKEN)
        .catch(error => logger.error('Failed to register slash commands:', error));


    // Event listener for when the client is ready (if needed for specific post-ready actions)
    // client.once('ready', () => {
    //     logger.info('ticketing-system System confirmed client is ready.');
    //     // Perform any actions that must happen after the bot is fully ready
    // });

    logger.info('ticketing-system System has been initialized and handlers are active.');

    // --- Orphaned Ticket Cleanup (RPC-based) ---
    // Run cleanup every 30 minutes using the efficient Supabase RPC function
    setInterval(async () => {
        try {
            logger.info('Running periodic orphaned ticket cleanup via RPC...');
            const { results, totalCleaned } = await supabaseHandler.cleanupOrphanedTicketsRpc();
            
            if (totalCleaned > 0) {
                logger.info(`Orphaned ticket cleanup completed: ${totalCleaned} tickets cleaned`);
            } else {
                logger.info('Orphaned ticket cleanup completed: No orphaned tickets found');
            }
        } catch (error) {
            logger.error(`Error during periodic orphaned ticket cleanup: ${error.message}`, error);
        }
    }, 30 * 60 * 1000); // Every 30 minutes

    // --- Inactivity Check Interval ---
    // Define the interval for checking inactivity (in milliseconds)
    // This should ideally be configurable via config.js or .env

    if (!config.inactivityMonitoringEnabled) {
        logger.warn('Inactivity monitoring is disabled. Skipping inactivity checks and auto-closures.');
    } else {
        setInterval(async () => {
            logger.info('Checking for inactive tickets...');
            try {
                // TODO: Implement get_inactive_tickets RPC in Supabase
                // For now, assuming it returns an array of tickets that need pinging
                let inactiveTickets = await supabaseHandler.getInactiveTicketsRpc(); // Call the actual RPC function

                if (inactiveTickets && inactiveTickets.length > 0) {
                    // Filter out tickets that are set to ignore inactivity
                    const filteredTickets = inactiveTickets.filter(ticket => !ticket.ignore_inactivity);

                    logger.info(`Found ${inactiveTickets.length} inactive tickets. ${filteredTickets.length} remaining after ignoring exemptions. Processing pings...`);

                    const now = Date.now();
                    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

                    for (const ticket of filteredTickets) { // Iterate over filtered tickets
                        const lastMessageAt = new Date(ticket.last_message_at).getTime();
                        const idleDuration = now - lastMessageAt;
                        const lastUserPingAt = ticket.last_inactivity_ping_at ? new Date(ticket.last_inactivity_ping_at).getTime() : 0;
                        const timeSinceLastUserPing = now - lastUserPingAt;
                        const lastStaffPingAt = ticket.last_staff_ping_at ? new Date(ticket.last_staff_ping_at).getTime() : 0;
                        const timeSinceLastStaffPing = now - lastStaffPingAt;


                        if (ticket.last_message_from_role === 'staff') { // Waiting for user
                            if (ticket.inactivity_ping_count === 0 && idleDuration >= TWENTY_FOUR_HOURS_MS) {
                                logger.info(`Ticket ${ticket.id} (user: ${ticket.user_id}) idle for >24h, sending first user ping.`);
                                await inactivityPinger.pingUserForInactivity(client, ticket);
                            } else if (ticket.inactivity_ping_count === 1 && timeSinceLastUserPing >= TWENTY_FOUR_HOURS_MS) { // 24 hours after first user ping (48h total idle)
                                logger.info(`Ticket ${ticket.id} (user: ${ticket.user_id}) idle for >48h, sending second user ping.`);
                                await inactivityPinger.pingUserForInactivity(client, ticket);
                            } else if (ticket.inactivity_ping_count >= 2 && timeSinceLastUserPing >= TWENTY_FOUR_HOURS_MS) { // 24 hours after second user ping (72h total idle)
                                logger.info(`Ticket ${ticket.id} (user: ${ticket.user_id}) idle for >72h, triggering auto-close.`);
                                await inactivityPinger.autoCloseInactiveTicket(client, ticket);
                            }
                        } else if (ticket.last_message_from_role === 'user') { // Waiting for staff
                            if (ticket.staff_ping_count === 0 && idleDuration >= TWENTY_FOUR_HOURS_MS) { // First staff ping (mod role)
                                logger.info(`Ticket ${ticket.id} (user: ${ticket.user_id}) idle for >24h, last message from user, sending first staff ping.`);
                                await inactivityPinger.pingModeratorForInactivity(client, ticket);
                            } else if (ticket.staff_ping_count === 1 && timeSinceLastStaffPing >= TWENTY_FOUR_HOURS_MS) { // Second staff ping (admin role)
                                logger.info(`Ticket ${ticket.id} (user: ${ticket.user_id}) idle for >48h, last message from user, sending second staff ping.`);
                                await inactivityPinger.pingModeratorForInactivity(client, ticket);
                            }
                        }
                        // Ignore 'bot' role or if role is not set
                    }
                } else {
                    logger.info('No inactive tickets found requiring a ping.');
                }

                // Check for Flxtime tickets needing screenshot reminders (24-hour system)
                logger.info('Checking for Flxtime tickets needing screenshot reminders...');
                try {
                    let flxtimeTicketsNeedingReminder = await supabaseHandler.getFlxtimeTicketsNeedingReminderRpc();
                    
                    if (flxtimeTicketsNeedingReminder && flxtimeTicketsNeedingReminder.length > 0) {
                        logger.info(`Found ${flxtimeTicketsNeedingReminder.length} Flxtime tickets needing screenshot reminders. Processing...`);
                        
                        for (const ticket of flxtimeTicketsNeedingReminder) {
                            try {
                                await flxtimePartnersHandler.sendScreenshotReminder(client, ticket);
                                logger.info(`Successfully sent screenshot reminder for Flxtime ticket ${ticket.id}.`);
                            } catch (processingError) {
                                logger.error(`Error sending screenshot reminder for Flxtime ticket ${ticket.id}: ${processingError.message}`, processingError);
                                // Continue to the next ticket even if one fails
                            }
                        }
                    } else {
                        logger.info('No Flxtime tickets found needing screenshot reminders.');
                    }
                } catch (flxtimeError) {
                    logger.error(`Error checking Flxtime tickets needing reminders: ${flxtimeError.message}`, flxtimeError);
                }

            } catch (error) {
                logger.error(`Unhandled error during inactivity check interval: ${error.message}`, error);
            }
        }, INACTIVITY_CHECK_INTERVAL);
    }
}

module.exports = {
    initializeTicketSystem
};

// Example of how this might be called in the main bot file (e.g., discofrybot.js):
// const { Client, GatewayIntentBits } = require('discord.js');
// const { initializeTicketSystem } = require('./ticketing-system/ticketSystem');
// const config = require('./ticketing-system/utils/config'); // Or main bot config
//
// const client = new Client({ intents: [
//     GatewayIntentBits.Guilds,
//     GatewayIntentBits.GuildMessages,
//     GatewayIntentBits.GuildMembers, // Ensure necessary intents
//     GatewayIntentBits.MessageContent // If reading message content
// ] });
//
// initializeTicketSystem(client);
//
// client.login(config.discordToken);
