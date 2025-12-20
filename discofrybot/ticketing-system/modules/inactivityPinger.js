// ticketing-system/modules/inactivityPinger.js

const logger = require('../utils/logger');
const config = require('../utils/config'); // To access role IDs
const supabaseHandler = require('../handlers/supabaseHandler'); // Import supabaseHandler
const closeHandler = require('./closeHandler'); // Import closeHandler for auto-closure

/**
 * Sends a ping to the user if the ticket has been idle and the last message was from staff.
 * @param {import('discord.js').Client} client - The Discord client instance.
 * @param {object} ticket - The ticket object containing ticket details.
 */
async function pingUserForInactivity(client, ticket) {
    try {
        const channel = client.channels.cache.get(ticket.channel_id);
        if (!channel) {
            logger.warn(`Channel ${ticket.channel_id} not found for ticket ${ticket.id}. Cannot send user ping.`);
            return;
        }

        const userMention = `<@${ticket.user_id}>`;
        let message;

        if (ticket.inactivity_ping_count === 0) {
            message = `👋 Hey ${userMention}, it looks like your ticket has been idle for a while. Do you still need assistance?`;
            logger.info(`Sent first inactivity ping to user ${ticket.user_id} for ticket ${ticket.id}.`);
        } else if (ticket.inactivity_ping_count === 1) {
            message = `⏰ Hey ${userMention}, this is a final reminder that your ticket has been inactive. If we don't hear back from you within 24 hours, this ticket will be automatically closed. Please reply if you still need assistance!`;
            logger.info(`Sent second (final) inactivity ping to user ${ticket.user_id} for ticket ${ticket.id}.`);
        } else {
            logger.warn(`Ticket ${ticket.id} has inactivity_ping_count ${ticket.inactivity_ping_count}. No further user pings will be sent.`);
            return;
        }

        await channel.send(message);

        // Update ping count and timestamp for user inactivity
        await supabaseHandler.updateTicket(ticket.id, {
            inactivity_ping_count: (ticket.inactivity_ping_count || 0) + 1,
            last_inactivity_ping_at: new Date().toISOString()
        });
        logger.info(`Updated inactivity ping count for ticket ${ticket.id} to ${ticket.inactivity_ping_count + 1}.`);
    } catch (error) {
        logger.error(`Error sending user inactivity ping for ticket ${ticket.id}: ${error.message}`, error);
    }
}

/**
 * Sends a ping to the ticket moderator role if the ticket has been idle and the last message was from a user.
 * @param {import('discord.js').Client} client - The Discord client instance.
 * @param {object} ticket - The ticket object containing ticket details.
 */
async function pingModeratorForInactivity(client, ticket) {
    try {
        const channel = client.channels.cache.get(ticket.channel_id);
        if (!channel) {
            logger.warn(`Channel ${ticket.channel_id} not found for ticket ${ticket.id}. Cannot send moderator ping.`);
            return;
        }

        let targetMention;
        let pingMessage;

        if (ticket.staff_ping_count === 0) {
            if (ticket.last_staff_member_id) {
                targetMention = `<@${ticket.last_staff_member_id}>`;
                pingMessage = `🚨 ${targetMention}, ticket ${ticket.id} (${ticket.discord_username || 'N/A'}) has been idle and requires your attention.`;
                logger.info(`Sending first staff inactivity ping to last staff member ${ticket.last_staff_member_id} for ticket ${ticket.id}.`);
            } else {
                targetMention = `<@&${config.ticketModRoleId}>`;
                pingMessage = `🚨 ${targetMention}, ticket ${ticket.id} (${ticket.discord_username || 'N/A'}) has been idle and requires attention.`;
                logger.info(`Sending first staff inactivity ping to Ticket Mod role for ticket ${ticket.id}.`);
            }
        } else if (ticket.staff_ping_count === 1) {
            targetMention = `<@&${config.ticketAdminRoleId}>`;
            pingMessage = `🚨 ${targetMention}, ticket ${ticket.id} (${ticket.discord_username || 'N/A'}) has been idle and requires URGENT attention. This is the second staff ping.`;
            logger.info(`Sending second staff inactivity ping to Ticket Admin role for ticket ${ticket.id}.`);
        } else {
            logger.warn(`Ticket ${ticket.id} has staff_ping_count ${ticket.staff_ping_count}. No further staff pings will be sent.`);
            return;
        }

        if (!targetMention) {
            logger.error(`No target mention found for staff ping. Cannot send moderator ping for ticket ${ticket.id}.`);
            return;
        }

        await channel.send(pingMessage);

        // Update staff ping count and timestamp
        await supabaseHandler.updateTicket(ticket.id, {
            staff_ping_count: (ticket.staff_ping_count || 0) + 1,
            last_staff_ping_at: new Date().toISOString()
        });
        logger.info(`Updated staff inactivity ping count for ticket ${ticket.id} to ${ticket.staff_ping_count + 1}.`);

    } catch (error) {
        logger.error(`Error sending moderator inactivity ping for ticket ${ticket.id}: ${error.message}`, error);
    }
}

/**
 * Automatically closes an inactive ticket if it meets the auto-closure criteria.
 * This applies when the ticket is waiting for the user and has received 2 unanswered pings.
 * @param {import('discord.js').Client} client - The Discord client instance.
 * @param {object} ticket - The ticket object containing ticket details.
 */
async function autoCloseInactiveTicket(client, ticket) {
    try {
        logger.info(`Attempting to auto-close inactive ticket ${ticket.id} (user: ${ticket.user_id}).`);

        // Ensure the ticket is indeed waiting for the user and has reached the ping limit
        if (ticket.last_message_from_role === 'staff' && ticket.inactivity_ping_count >= 2) {
            const channel = client.channels.cache.get(ticket.channel_id);
            if (channel) {
                await channel.send(`This ticket has been inactive for too long and has been automatically closed. If you still need assistance, please open a new ticket.`);
            }

            // Call the closeHandler to perform the actual ticket closure with 'dm' transcript preference
            await closeHandler.processTranscriptPreference(client, ticket.id, ticket.channel_id, 'SYSTEM', 'SYSTEM', 'dm', null);
            logger.info(`Successfully auto-closed ticket ${ticket.id} due to inactivity.`);
        } else {
            logger.warn(`Ticket ${ticket.id} did not meet auto-closure criteria. last_message_from_role: ${ticket.last_message_from_role}, inactivity_ping_count: ${ticket.inactivity_ping_count}.`);
        }
    } catch (error) {
        logger.error(`Error auto-closing inactive ticket ${ticket.id}: ${error.message}`, error);
    }
}

module.exports = {
    pingUserForInactivity,
    pingModeratorForInactivity,
    autoCloseInactiveTicket
};