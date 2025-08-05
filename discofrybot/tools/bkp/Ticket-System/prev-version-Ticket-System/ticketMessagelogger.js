const { Events } = require('discord.js');
const { supabase } = require('./supabase');
const logger = require('../logger');

module.exports = (client) => {
    client.on(Events.MessageCreate, async (message) => {
        if (message.author.bot || !message.channel.name.match(/^\d+-.+$/)) return;
        const ticketIdMatch = message.channel.name.match(/^(\d+)/);
        const ticketId = ticketIdMatch ? parseInt(ticketIdMatch[1]) : null;
        if (!ticketId) {
            logger.error(`⚠️ Invalid ticket ID extracted from channel: ${message.channel.name}`);
            return;
        }

        logger.info(`📩 Message detected: "${message.content}" from ${message.author.username} in ${message.channel.name}`);

        const messagePayload = {
            discordData: {
                id: message.id,
                user_id: message.author.id,
                username: message.author.username,
                nick: message.member?.nickname || message.author.username,
                avatar: message.author.displayAvatarURL({ format: 'png' }),
                content: message.cleanContent,
                created: message.createdTimestamp,
                bot: message.author.bot
            },
            embeds: message.embeds.map(e => e.toJSON()),
            attachments: []
        };

        const { error: messageError } = await supabase
            .from('ticket_messages')
            .insert([{
                ticket_id: ticketId,
                user_id: message.author.id,
                message: JSON.stringify(messagePayload),
                discord_message_id: message.id
            }]);
        if (messageError) {
            logger.error('❌ Error logging message to ticket_messages:', JSON.stringify(messageError, null, 2));
        }
    });
};