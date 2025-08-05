const { ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const config = require('../utils/config');
const logger = require('../utils/logger');
const supabaseHandler = require('./supabaseHandler');
const { getTicketActionRow } = require('../utils/ticketUtils');

/**
 * Handles the "Issue Coupon" button interaction.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @param {string} ticketId - The ID of the ticket.
 */
async function handleIssueCouponButton(interaction, ticketId) {
    // Role restriction check
    if (!interaction.member.roles.cache.has(config.ticketModRoleId)) {
        return interaction.reply({
            content: '❌ You do not have permission to issue coupons.',
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        // Check if coupon already issued
        const ticket = await supabaseHandler.getTicketById(ticketId);
        if (ticket && ticket.coupon_code) {
            return interaction.reply({
                content: '⚠️ A coupon has already been issued for this ticket.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Prompt staff member for coupon code using a modal
        const modal = new ModalBuilder()
            .setCustomId(`issue_coupon_modal:${ticketId}`)
            .setTitle('Issue 50% Off Coupon');

        const couponCodeInput = new TextInputBuilder()
            .setCustomId('couponCodeInput')
            .setLabel('Enter 50% Off Coupon Code')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const firstActionRow = new ActionRowBuilder().addComponents(couponCodeInput);

        modal.addComponents(firstActionRow);

        await interaction.showModal(modal);

    } catch (error) {
        logger.error(`Error handling Issue Coupon button for ticket ${ticketId}: ${error.message}`, error);
        await interaction.reply({
            content: '⚠️ An error occurred while trying to issue the coupon. Please try again later.',
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * Handles the modal submission for issuing a coupon.
 * @param {import('discord.js').ModalSubmitInteraction} interaction - The modal submit interaction.
 */
async function handleIssueCouponModalSubmit(interaction) {
    const ticketId = interaction.customId.split(':')[1];
    const couponCode = interaction.fields.getTextInputValue('couponCodeInput');

    if (!couponCode) {
        return interaction.reply({
            content: '❌ Coupon code cannot be empty.',
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        // Update Supabase with the coupon code
        await supabaseHandler.updateTicket(ticketId, { coupon_code: couponCode });
        logger.info(`Coupon issued for ticket ${ticketId} by staff ${interaction.user.id} with code: ${couponCode}`);

        // Fetch the updated ticket to get the latest info for message update
        const updatedTicket = await supabaseHandler.getTicketById(ticketId);
        if (!updatedTicket || !updatedTicket.channel_id) {
             logger.error(`Could not fetch updated ticket ${ticketId} or channel_id after issuing coupon.`);
             await interaction.reply({
                content: '✅ Coupon issued, but could not update the message or send confirmation. Please refresh the ticket channel.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const ticketChannel = interaction.client.channels.cache.get(updatedTicket.channel_id);
        if (!ticketChannel) {
             logger.error(`Could not find ticket channel ${updatedTicket.channel_id} in cache for ticket ${ticketId}.`);
             await interaction.reply({
                content: '✅ Coupon issued, but could not update the message or send confirmation. Please refresh the ticket channel.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Fetch the message with the action row to update it using the original_message_id
        const messageToUpdate = await ticketChannel.messages.fetch(updatedTicket.original_message_id);

        if (messageToUpdate) {
            // Add a 3-second delay before updating the message components
            setTimeout(async () => {
                try {
                    // Re-fetch the ticket to ensure the latest data is used after the delay
                    const reFetchedTicket = await supabaseHandler.getTicketById(ticketId);
                    if (!reFetchedTicket) {
                        logger.error(`Could not re-fetch ticket ${ticketId} after delay for message update.`);
                        return;
                    }

                    // Get the updated action row (which will now show the static label)
                    const updatedActionRow = getTicketActionRow(reFetchedTicket);

                    // Edit the original message to replace the components
                    await messageToUpdate.edit({ components: updatedActionRow });
                    logger.info(`Successfully updated message components for ticket ${ticketId} after delay.`);
                } catch (updateError) {
                    logger.error(`Error updating message components for ticket ${ticketId} after delay: ${updateError.message}`, updateError);
                }
            }, 3000); // 3-second delay

        } else {
             logger.warn(`Could not find message with action row in channel ${updatedTicket.channel_id} for ticket ${ticketId}.`);
        }

        // Send styled message to the user
        const userMessage = `<@${updatedTicket.user_id}> 🎁 Your 50% off coupon has been issued!

**Coupon Code:** \`${couponCode}\`

Please note: Your coupon is valid for the same number of uses as the number of nodes you’re forgoing. 
For example, if you forgo 1 node, the coupon can be used on 1 order. If you forgo 5 nodes, you’ll be able to use the coupon on up to 5 separate orders. 
You can redeem it during your next order at https://www.frynetworks.com/.
Let us know if you have any questions!`;

        await ticketChannel.send(userMessage);

        // Check if this is a forgo ticket and conditions are met to prompt closure
        if (updatedTicket.request_type === 'forgo' && updatedTicket.bold_sign_signed && updatedTicket.registration_waived) {
            const finalForgoMessage = `Your Node Forgo request is now complete! We have validated your BoldSign form, waived your registration, and issued your 50% off coupon. You will also receive your high APR NFT reward towards the end of Q3.

If you have no further questions and your issue is resolved, you can close the ticket using the button below. If you still need assistance, click "More Questions".`;

            const closeButton = new ButtonBuilder()
                .setCustomId(`conclude_close_ticket:${ticketId}`)
                .setLabel('🔒 Close Ticket')
                .setStyle(ButtonStyle.Success);

            const moreQuestionsButton = new ButtonBuilder()
                .setCustomId(`conclude_more_questions:${ticketId}`)
                .setLabel('❓ More Questions')
                .setStyle(ButtonStyle.Primary);

            const actionRow = new ActionRowBuilder().addComponents(closeButton, moreQuestionsButton);

            await ticketChannel.send({
                content: finalForgoMessage,
                components: [actionRow]
            });
        }

        await interaction.reply({
            content: '✅ Coupon has been successfully issued and message sent to user.',
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        logger.error(`Error handling Issue Coupon modal submit for ticket ${ticketId}: ${error.message}`, error);
        await interaction.reply({
            content: '⚠️ An error occurred while issuing the coupon. Please try again later.',
            flags: MessageFlags.Ephemeral
        });
    }
}


module.exports = {
    handleIssueCouponButton,
    handleIssueCouponModalSubmit
};
