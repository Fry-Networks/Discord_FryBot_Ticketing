// NewTicketLogic/utils/validationErrorManager.js
const ERROR_MESSAGES = {
    CONTACT_INFO: '⚠️ Invalid contact information format. Please use "Full Name email", e.g., "John Doe john.doe@example.com".',
    EMAIL: '⚠️ Invalid email address. Please try again.',
    ORDER_NUMBER: '⚠️ Order number must be a 5-digit number.',
    ALGORAND_ADDRESS: '⚠️ Algorand address must be 58 characters (A-Z, 1-9 only).',
    MINER_KEYS: '⚠️ Miner keys must be a valid prefix (e.g., BM, ISM) followed by a hyphen and 31-33 alphanumeric characters.',
    ORDERS_QUANTITIES_EMPTY: '⚠️ Orders and Quantities cannot be empty. Please provide at least one order and quantity.',
    ORDERS_QUANTITIES_FORMAT: '⚠️ Invalid format for Orders and Quantities. Each line should be "Order #XXXXX: Y nodes".',    
    GENERAL: '⚠️ Please check your input and try again.'
};

const { MessageFlags } = require('discord.js');

/**
 * Handles sending a validation error message back to the user.
 * @param {import('discord.js').Interaction} interaction - The interaction to reply to.
 * @param {string} errorMessage - The specific error message to display.
 */
async function handleValidationError(interaction, errorMessage) {
    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
            content: errorMessage,
            flags: MessageFlags.Ephemeral
        });
    } else {
        await interaction.reply({
            content: errorMessage,
            flags: MessageFlags.Ephemeral
        });
    }
}

module.exports = {
    ERROR_MESSAGES,
    handleValidationError
};
