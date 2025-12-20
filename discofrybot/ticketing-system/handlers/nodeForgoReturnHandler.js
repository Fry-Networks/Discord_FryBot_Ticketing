const { ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ActionRowBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const logger = require('../utils/logger');
const supabaseHandler = require('./supabaseHandler'); 

// Define approved and disallowed regions for returns (moved from interactionHandler.js)
const APPROVED_RETURN_REGIONS = [
    'North America',
    'Europe',
    'Great Britain',
    'Ireland',
    'Asia',
    'Oceania'
];

const DISALLOWED_RETURN_REGIONS = [
    'South Africa',
    'India',
    'Middle East',
    'Kyrgyzstan',
    'Ukraine',
    'Africa (entire continent)',
    'Brazil',
    'South America (entire continent)',
    'Central America'
];

/**
 * Sends the appropriate instructions and buttons for Node Forgo/Return tickets.
 * This function encapsulates the logic for both initial selection and switching.
 * @param {import('discord.js').Interaction} interaction - The interaction object.
 * @param {string} ticketId - The ID of the ticket.
 * @param {string} requestType - The requested type ('forgo' or 'return').
 * @param {import('discord.js').Client} discordClient - The Discord client instance.
 */
async function sendNodeForgoReturnInstructions(interaction, ticketId, requestType, discordClient) {
    try {
        // Fetch ticket data to get the channel ID
        const ticket = await supabaseHandler.getTicketById(ticketId);
        if (!ticket || !ticket.channel_id) {
            logger.error(`Ticket ${ticketId} not found or missing channel_id during forgo/return instructions.`);
            await interaction.followUp({
                content: '⚠️ Could not find ticket information. Please try again later.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        const ticketChannel = discordClient.channels.cache.get(ticket.channel_id);
        if (!ticketChannel) {
            logger.error(`Ticket channel ${ticket.channel_id} not found in cache for ticket ${ticketId}.`);
            await interaction.followUp({
                content: '⚠️ Could not find the ticket channel. Please try again later.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Update ticket with selected request type
        await supabaseHandler.updateTicket(ticketId, { request_type: requestType });
        logger.info(`Ticket ${ticketId} request type set to ${requestType} by user ${interaction.user.id}`);

        // Remove the ephemeral buttons if this is a fresh interaction (not from !switch)
        // This interaction.update() should only happen if the interaction is not a follow-up from !switch command
        // For !switch, the ephemeral message is deleted by the command itself.
        if (interaction.replied || interaction.deferred) {
            // Check if the interaction is from a button click that needs its components removed
            if (interaction.isButton() && interaction.customId.startsWith('forgo_return_select')) {
                logger.info(`[DEBUG] Attempting to remove components for interaction ${interaction.id}`);
                try {
                    await interaction.editReply({ components: [] });
                    logger.info(`[DEBUG] Successfully removed components for interaction ${interaction.id}`);
                } catch (e) {
                    logger.warn(`[DEBUG] Failed to remove components for interaction ${interaction.id}: ${e.message}`);
                }
            }
        }

        const docSignedButton = new ButtonBuilder()
            .setCustomId(`doc_signed:${ticketId}`)
            .setLabel('✍️  I have signed the form')
            .setStyle(ButtonStyle.Success);

        const docSignedRow = new ActionRowBuilder().addComponents(docSignedButton);
        
        /*  // Send BoldSign link and instructions to the ticket channel
            await ticketChannel.send({
                content: `Thank you for selecting **${requestType.toUpperCase()}**.\n\nPlease complete the required form via this link: https://app.boldsign.com/document/sign-bulk-links/?documentId=f1699863-c9ac-411b-9369-70f48e7dcc53s_rbVc2\n\nOnce you have completed and submitted the form, please click the button below to confirm.`
            });
        */

        let sentMessageIds = []; // Array to store message IDs sent in this flow

        if (requestType === 'return') {
            // Present region selection dropdown
            const regionSelectMenu = new StringSelectMenuBuilder()
                .setCustomId(`select_region_return:${ticketId}`)
                .setPlaceholder('Select your region for return...')
                .addOptions(
                    ...APPROVED_RETURN_REGIONS.map(region => ({
                        label: region,
                        value: region,
                        description: `Select if you are in ${region}`
                    })),
                    ...DISALLOWED_RETURN_REGIONS.map(region => ({
                        label: region,
                        value: region,
                        description: `Select if you are in ${region}`
                    }))
                );

            const regionSelectRow = new ActionRowBuilder().addComponents(regionSelectMenu);

            const msg1 = await ticketChannel.send({
                content: 'Please select your region from the dropdown below to proceed with your return request:',
                components: [regionSelectRow]
            });
            sentMessageIds.push(msg1.id);

            // Do NOT send the BoldSign link or other instructions yet.
            // These will be sent after the region is selected and approved in handleSelectMenu.

        } else { // requestType is 'forgo'
            // Send BoldSign link and instructions to the ticket channel for forgo
            const boldSignEmbed = new EmbedBuilder()
                .setTitle(`✍️ BoldSign Form for Node ${requestType.toUpperCase()} Request`)
                .setDescription(`Thank you for selecting **${requestType.toUpperCase()}**.\n\nPlease complete the required form via the link below.`)
                .addFields(
                    { name: 'Form Link', value: '[BoldSign Form](https://app.boldsign.com/document/sign-bulk-links/?documentId=f1699863-c9ac-411b-9369-70f48e7dcc53s_rbVc2)' },
                    { name: 'Important: BoldSign Form', value: 'For the BoldSign form, it\'s very important that you include first AND last name as you have it on the order(s) you placed with us.' }
                )
                .setColor(0x0099FF) // Blue color
                .setFooter({ text: 'Fry Networks Ticketing System', iconURL: discordClient.user.displayAvatarURL() })
                .setTimestamp();

            const msg1 = await ticketChannel.send({
                embeds: [boldSignEmbed]
            });
            sentMessageIds.push(msg1.id);

            // Send manual distribution announcement to the ticket channel for forgo
            const msg2 = await ticketChannel.send({
                content: '**Please note**: You have chosen to forgo receiving your node hardware. This means you will not receive a physical node device.\n\nThis process may take some time, so we appreciate your patience while we handle your request.\n\nOnce your forgo request is processed, we will manually generate and send you your one-time-use, 50% off coupon code for the Fry hardware store. Your ticket will be closed at this stage.\n\nFor the high APR NFT reward: we’re already collecting your Algorand wallet address now, so there’s no need to open a new ticket later. Once the NFTs are ready (towards the end of Q3), we’ll distribute them automatically and announce it to everyone.\n\n**You can still install the node software on your own device to start earning rewards. If your node order is over 1 year old, you can ask us for the miner keys to register and install the node software on your own device.**\n\nThank you for your cooperation and understanding!'
            });
            sentMessageIds.push(msg2.id);

            // Send the "Doc Signed" button to the ticket channel for forgo
            const msg3 = await ticketChannel.send({
                content: 'Click the button below once you have signed the BoldSign form:',
                components: [docSignedRow]
            });
            sentMessageIds.push(msg3.id);
        }

        // Update the ticket in Supabase with the new message IDs
        // Fetch existing IDs to append, not overwrite
        const currentTicket = await supabaseHandler.getTicketById(ticketId);
        const existingMessageIds = currentTicket?.forgo_return_message_ids || [];
        const updatedMessageIds = [...existingMessageIds, ...sentMessageIds];
        logger.info(`[DEBUG] sentMessageIds for ticket ${ticketId}: ${JSON.stringify(sentMessageIds)}`);
        logger.info(`[DEBUG] existingMessageIds for ticket ${ticketId}: ${JSON.stringify(existingMessageIds)}`);
        logger.info(`[DEBUG] updatedMessageIds for ticket ${ticketId}: ${JSON.stringify(updatedMessageIds)}`);

        await supabaseHandler.updateTicket(ticketId, { forgo_return_message_ids: updatedMessageIds });
        logger.info(`Ticket ${ticketId} updated with forgo_return_message_ids: ${updatedMessageIds.join(', ')}`);

    } catch (error) {
        logger.error(`Error handling sendNodeForgoReturnInstructions for ticket ${ticketId}: ${error.message}`, error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
                content: '⚠️ An error occurred while processing your request. Please try again later.',
                flags: MessageFlags.Ephemeral
            });
        } else {
            await interaction.reply({
                content: '⚠️ An error occurred while processing your request. Please try again later.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
}

module.exports = {
    sendNodeForgoReturnInstructions
};
