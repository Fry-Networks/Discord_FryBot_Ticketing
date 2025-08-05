const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const logger = require('../utils/logger');
const supabaseHandler = require('./supabaseHandler');
const { formatNumberWithCommas } = require('../utils/ticketUtils');
const config = require('../utils/config');

/**
 * Handles the 'check_eligibility' button click.
 * Creates and shows the eligibility check modal.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @param {string} ticketId - The ID of the ticket.
 */
async function handleCheckEligibilityButton(interaction, ticketId) {
    const modal = new ModalBuilder()
        .setCustomId(`eligibility_check_modal:${ticketId}`)
        .setTitle('Check Conversion Eligibility');

    const algorandAddressInput = new TextInputBuilder()
        .setCustomId('algorand_address_input')
        .setLabel('Enter Algorand Address')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., RL6VDLXCN5G7N2GRTS7YLVDSFT4PVBBUOVTVS7T26OQ5MLXYQKRMI5ADXY');

    modal.addComponents(new ActionRowBuilder().addComponents(algorandAddressInput));
    await interaction.showModal(modal);
}

/**
 * Handles the modal submission for conversion eligibility check.
 * @param {import('discord.js').ModalSubmitInteraction} interaction - The modal submission interaction.
 * @param {string} ticketId - The ID of the ticket.
 */
async function handleEligibilityModalSubmit(interaction, ticketId) {
    const algorandAddress = interaction.fields.getTextInputValue('algorand_address_input');

    await interaction.deferReply({ ephemeral: false }); // Make reply visible to everyone

    try {
        const eligibility = await supabaseHandler.checkConversionEligibility(algorandAddress);
        let eligibilityMessage;
        if (eligibility.eligible && eligibility.data) {
            const data = eligibility.data;
            let breakdown = '';
            const columnMapping = {
                fry_1_0_held: 'Fry 1.0 Held',
                fry_1_0_staked_verification: 'Fry 1.0 Staked (Verification)',
                fry_1_0_staked_cometa: 'Fry 1.0 Staked (Cometa)',
                fry_1_0_eq_of_lp_cometa: 'Fry 1.0 Eq. of LP (Cometa)',
                fry_1_0_eq_of_lp_tinyman: 'Fry 1.0 Eq. of LP (Tinyman)'
            };

            for (const key in columnMapping) {
                if (data.hasOwnProperty(key) && data[key] > 0) {
                    breakdown += `${columnMapping[key]}: ${formatNumberWithCommas(data[key], 6)} FRY 1.0\n`;
                }
            }

            eligibilityMessage = `✅ **Eligibility Check for \`${algorandAddress}\`:**\n\n` +
                `**Snapshot Details:**\n` +
                `\`\`\`\n` +
                `${breakdown}` +
                `-----------------------------------\n` +
                `**Total Available for Conversion: ${formatNumberWithCommas(data.total_fry_1_0_available || 0, 6)} FRY 1.0**\n` +
                `\`\`\``;

            const fry1Balance = await supabaseHandler.getFry1Balance(algorandAddress);
            const algoBalance = await supabaseHandler.getAlgoBalance(algorandAddress);
            const lockedAlgoBalance = await supabaseHandler.getLockedAlgoBalance(algorandAddress);
            const availableAlgoBalance = algoBalance - lockedAlgoBalance;

            eligibilityMessage += `\n**Current FRY 1.0 Balance in Wallet:** \`${formatNumberWithCommas(fry1Balance, 6)}\``;

            if (fry1Balance < data.total_fry_1_0_available) {
                const missingAmount = (data.total_fry_1_0_available - fry1Balance);
                eligibilityMessage += `\n\n⚠️ **Warning:** Your current FRY 1.0 balance is less than the amount you are eligible to convert.\n\nYou are missing **${formatNumberWithCommas(missingAmount, 6)} FRY 1.0**.\nYou will need to acquire more FRY 1.0 to convert your full eligible amount.`;
            } else {
                eligibilityMessage += `\n\n✅ Your FRY 1.0 balance is sufficient to convert your full eligible amount.`;
            }

            eligibilityMessage += `\n\n**Current ALGO Balance in Wallet:** \`${formatNumberWithCommas(algoBalance, 3)}\``;
            eligibilityMessage += `\n**Locked ALGO Balance:** \`${formatNumberWithCommas(lockedAlgoBalance, 3)}\``;
            eligibilityMessage += `\n**Available ALGO Balance for Transactions:** \`${formatNumberWithCommas(availableAlgoBalance, 3)}\``;

            if (availableAlgoBalance < config.MIN_ALGO_BALANCE_FOR_TX) {
                eligibilityMessage += `\n\n⚠️ **Warning:** Your current available ALGO balance is below the recommended minimum of ${config.MIN_ALGO_BALANCE_FOR_TX} ALGO.\nYou will need sufficient ALGO to cover transaction fees for conversion and future Proof of Connectivity (PoC) checks.`;
            } else {
                eligibilityMessage += `\n\n✅ Your available ALGO balance is sufficient for transaction fees.`;
            }

        } else {
            eligibilityMessage = `❌ **Eligibility Check for \`${algorandAddress}\`:**\n\n` +
                `Your Algorand address is **not found** in the eligible snapshot data or is not eligible for conversion. Please double-check the address or provide further details.`;
        }
        await interaction.editReply({ content: eligibilityMessage });
        await supabaseHandler.logBotActivity('info', 'fry_conversion_eligibility_manual', `Ticket ${ticketId}: Manual eligibility check for ${algorandAddress} - ${eligibility.eligible ? 'Eligible' : 'Not Eligible'}.`);
    } catch (error) {
        logger.error(`Error during manual eligibility check for ticket ${ticketId}, address ${algorandAddress}: ${error.message}`, error);
        await interaction.editReply({ content: '⚠️ An error occurred during the eligibility check. Please try again later.' });
    }
}

/**
 * Handles the 'check_burn_tx' button click.
 * Creates and shows the burn transaction check modal.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @param {string} ticketId - The ID of the ticket.
 */
async function handleCheckBurnTxButton(interaction, ticketId) {
    const modal = new ModalBuilder()
        .setCustomId(`burn_tx_check_modal:${ticketId}`)
        .setTitle('Check Burn Transactions');

    const algorandAddressInput = new TextInputBuilder()
        .setCustomId('algorand_address_input')
        .setLabel('Enter Algorand Address')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., RL6VDLXCN5G7N2GRTS7YLVDSFT4PVBBUOVTVS7T26OQ5MLXYQKRMI5ADXY');

    modal.addComponents(new ActionRowBuilder().addComponents(algorandAddressInput));
    await interaction.showModal(modal);
}

/**
 * Handles the modal submission for burn transaction check.
 * @param {import('discord.js').ModalSubmitInteraction} interaction - The modal submission interaction.
 * @param {string} ticketId - The ID of the ticket.
 */
async function handleBurnTxModalSubmit(interaction, ticketId) {
    const algorandAddress = interaction.fields.getTextInputValue('algorand_address_input');

    await interaction.deferReply({ ephemeral: false });

    try {
        // First, get the eligible amount
        const eligibility = await supabaseHandler.checkConversionEligibility(algorandAddress);
        if (!eligibility.eligible || !eligibility.data) {
            await interaction.editReply({ content: `❌ Address \`${algorandAddress}\` not found or not eligible for conversion.` });
            return;
        }
        const eligibleAmount = eligibility.data.total_fry_1_0_available;

        const burnTransactions = await supabaseHandler.checkBurnTransaction(algorandAddress, eligibleAmount);
        let burnMessage;

        if (burnTransactions.length > 0) {
            burnMessage = `🔥 **Burn Transactions Found for \`${algorandAddress}\` (matching eligible amount of ${formatNumberWithCommas(eligibleAmount, 6)}):**\n`;
            burnTransactions.forEach(tx => {
                const explorerUrl = `https://explorer.perawallet.app/tx/${tx.txID}`;
                burnMessage += `  - Amount: ${formatNumberWithCommas(tx.amount, 6)} FRY 1.0, TxID: [${tx.txID}](${explorerUrl})\n`;
            });
            burnMessage += `\nIf you sent FRY 1.0 to the burn wallet, please ensure it was done via the official Fry Dashboard.`;
        } else {
            burnMessage = `ℹ️ **No Recent Matching Burn Transactions Found for \`${algorandAddress}\`:** No FRY 1.0 burn transactions from this address to the official burn wallet were detected within the last 7 days that match the eligible conversion amount of ${formatNumberWithCommas(eligibleAmount, 6)}.`;
        }

        await interaction.editReply({ content: burnMessage });
        await supabaseHandler.logBotActivity('info', 'fry_conversion_eligibility_manual', `Ticket ${ticketId}: Manual burn tx check for ${algorandAddress}.`);
    } catch (error) {
        logger.error(`Error during manual burn tx check for ticket ${ticketId}, address ${algorandAddress}: ${error.message}`, error);
        await interaction.editReply({ content: '⚠️ An error occurred during the burn transaction check. Please try again later.' });
    }
}

module.exports = {
    handleCheckEligibilityButton,
    handleEligibilityModalSubmit,
    handleCheckBurnTxButton,
    handleBurnTxModalSubmit
};
