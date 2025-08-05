const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const logger = require('./logger'); // Import logger

/**
 * Helper: builds full action row with dynamic buttons based on ticket state.
 * @param {object} ticketInfo - The ticket information object.
 * @returns {import('discord.js').ActionRowBuilder[]} An array of action row components.
 */
function getTicketActionRow(ticketInfo) {
    logger.info(`[DEBUG] getTicketActionRow received ticketInfo:`, ticketInfo);

    const baseComponents = [
        new ButtonBuilder()
            .setCustomId(`show_faq_categories:${ticketInfo.id}`)
            .setLabel('❓FAQs')
            .setStyle(ButtonStyle.Primary),
        /*new ButtonBuilder()
            .setCustomId(`claim_ticket:${ticketInfo.id}`)
            .setLabel('🤝 Claim')
            .setStyle(ButtonStyle.Success),*/
        new ButtonBuilder()
            .setCustomId(`schedule_close_ticket:${ticketInfo.id}`)
            .setLabel('⏳ Schedule Close')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`close_ticket_now:${ticketInfo.id}`)
            .setLabel('🔒 Close Now')
            .setStyle(ButtonStyle.Danger)
    ];

    const rows = [new ActionRowBuilder().addComponents(...baseComponents)];

    // Add Node Forgo/Return specific buttons to a second row if applicable
    if (ticketInfo.ticket_type === 'node_forgo_return') {
        const nodeForgoReturnComponents = [];

        // Add Validate button if not validated
        if (!ticketInfo.validated) {
            nodeForgoReturnComponents.push(
                new ButtonBuilder()
                    .setCustomId(`validate_ticket:${ticketInfo.id}`)
                    .setLabel('✅ Validate')
                    .setStyle(ButtonStyle.Success)
            );
        }

        // Add Unvalidate button if validated
        if (ticketInfo.validated) {
            nodeForgoReturnComponents.push(
                new ButtonBuilder()
                    .setCustomId(`unvalidate_ticket:${ticketInfo.id}`)
                    .setLabel('❌ Unvalidate')
                    .setStyle(ButtonStyle.Danger) // Using Danger style for Unvalidate
            );
        }

        // Add Waive Registration button or label
        if (ticketInfo.registration_waived) {
            // If registration is already waived, show a static label (disabled button)
            nodeForgoReturnComponents.push(
                new ButtonBuilder()
                    .setCustomId(`registration_waived_label:${ticketInfo.id}`) // Unique ID for the label
                    .setLabel('✅ Registration Waived')
                    .setStyle(ButtonStyle.Success) // Use Success style for waived status
                    .setDisabled(true)
            );
        } else {
            // If registration is not waived, show the Waive Registration button
            nodeForgoReturnComponents.push(
                new ButtonBuilder()
                    .setCustomId(`waive_registration:${ticketInfo.id}`)
                    .setLabel('✋ Waive Registration')
                    .setStyle(ButtonStyle.Primary) // Or Secondary, depending on desired prominence
            );
        }

        // Add Issue Coupon button if no coupon has been issued yet
        if (!ticketInfo.coupon_code) {
             nodeForgoReturnComponents.push(
                new ButtonBuilder()
                    .setCustomId(`issue_coupon:${ticketInfo.id}`)
                    .setLabel('🎁 Issue Coupon')
                    .setStyle(ButtonStyle.Primary)
            );
        } else {
             // If coupon is already issued, show a static label (disabled button)
             nodeForgoReturnComponents.push(
                new ButtonBuilder()
                    .setCustomId(`coupon_issued_label:${ticketInfo.id}`) // Unique ID for the label
                    .setLabel('✅ Coupon Issued')
                    .setStyle(ButtonStyle.Success) // Use Success style for issued status
                    .setDisabled(true)
            );
        }
        
        // Add buttons for picture validation if request type is 'return'
        if (ticketInfo.request_type === 'return') {
            nodeForgoReturnComponents.push(
                new ButtonBuilder()
                    .setCustomId(`confirm_sn_picture:${ticketInfo.id}`)
                    .setLabel('Picture of mini PC S/N validated')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(ticketInfo.sn_picture_confirmed === true) // Disable if already confirmed
            );
            nodeForgoReturnComponents.push(
                new ButtonBuilder()
                    .setCustomId(`confirm_factory_reset_picture:${ticketInfo.id}`)
                    .setLabel('Picture of factory reset validated')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(ticketInfo.factory_reset_picture_confirmed === true) // Disable if already confirmed
            );
        }

        if (nodeForgoReturnComponents.length > 0) {
            rows.push(new ActionRowBuilder().addComponents(...nodeForgoReturnComponents));
        }
    }


    return rows; // Return an array of action rows
}

/**
 * Formats a number with commas for readability, and handles decimal places.
 * @param {number} number - The number to format.
 * @param {number} [decimalPlaces=0] - The number of decimal places to display.
 * @returns {string} The formatted number string.
 */
function formatNumberWithCommas(number, decimalPlaces = 0) {
    return number.toLocaleString('en-US', {
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces
    });
}

module.exports = {
    getTicketActionRow,
    formatNumberWithCommas
};
