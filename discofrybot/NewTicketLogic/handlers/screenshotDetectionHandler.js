// NewTicketLogic/handlers/screenshotDetectionHandler.js
const { Events } = require('discord.js');
const config = require('../utils/config');
const logger = require('../utils/logger');
const supabaseHandler = require('./supabaseHandler');
const flxtimePartnersHandler = require('./flxtimePartnersHandler');

/**
 * Initializes the screenshot detection handler for Flxtime Partners Support tickets
 * @param {import('discord.js').Client} client - The Discord client instance
 */
function initializeScreenshotDetection(client) {
    client.on(Events.MessageCreate, async (message) => {
        try {
            // SECURITY: Only process messages from real users (not bots)
            if (message.author.bot) return;
            
            // SECURITY: Only process messages in guilds, not DMs
            if (!message.guild) return;

            // SECURITY: Only process messages in ticket categories to limit scope
            // Get ticket category IDs from config
            const ticketCategoryIds = Object.values(config.categoryIds || {});
            if (!ticketCategoryIds.includes(message.channel.parentId)) return;

            // SECURITY: Only process messages in channels with ticket naming pattern
            if (!message.channel.name || !message.channel.name.match(/^\d+-/)) return;

            // Extract ticket ID from channel name
            const ticketIdMatch = message.channel.name.match(/^(\d+)-/);
            if (!ticketIdMatch) return;

            const ticketId = ticketIdMatch[1];

            // SECURITY: Fetch ticket data to verify it's legitimately a Flxtime ticket
            const ticket = await supabaseHandler.getTicketById(ticketId);
            if (!ticket || ticket.ticket_type !== 'flxtime_partners_support') return;

            // SECURITY: Only allow the original ticket creator to trigger this (not staff/other users)
            if (message.author.id !== ticket.user_id) return;

            // EFFICIENCY: Check if screenshot already submitted to avoid unnecessary processing
            if (ticket.screenshot_submitted_at) return;

            // SECURITY: Only check for basic image indicators, never download/process actual content
            // This just checks if Discord indicates images are present, doesn't access the files
            const hasImages = message.attachments.size > 0 || 
                            message.embeds.some(embed => embed.image || embed.thumbnail) ||
                            message.content.match(/https?:\/\/.*\.(png|jpg|jpeg|gif|webp)/i);

            if (hasImages) {
                // Mark screenshot as submitted in database
                await flxtimePartnersHandler.trackScreenshotSubmission(ticketId);
                
                // Send confirmation message
                await message.react('✅');
                await message.channel.send({
                    content: `${message.author} ✅ Screenshot received! Our team will review it to verify your Flxtime Flexer status. You will no longer receive screenshot reminders.`
                });

                logger.info(`Screenshot submitted for Flxtime ticket ${ticketId} by user ${message.author.id}`);
            }

        } catch (error) {
            logger.error(`Error in screenshot detection handler: ${error.message}`, error);
        }
    });

    logger.info('Screenshot detection handler initialized with security restrictions.');
}

module.exports = {
    initializeScreenshotDetection
};
