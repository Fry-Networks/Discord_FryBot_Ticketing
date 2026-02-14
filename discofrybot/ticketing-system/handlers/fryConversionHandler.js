const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const logger = require('../utils/logger');
const supabaseHandler = require('./supabaseHandler');
const { formatNumberWithCommas, parseJsonSafe } = require('../utils/ticketUtils');
const config = require('../utils/config');
const formValidator = require('../utils/formValidator'); // Import formValidator
const validationErrorManager = require('../utils/validationErrorManager'); // Import validationErrorManager
const { maskAddress } = require('../utils/logSanitizer');

/**
 * Creates stage-specific buttons based on conversion progress.
 * @param {object} stage - The conversion stage information.
 * @param {object} vestingStatus - The vesting status information.
 * @param {string} ticketId - The ticket ID.
 * @returns {Array<ActionRowBuilder>} Array of action rows with buttons.
 */
function createStageSpecificButtons(stage, vestingStatus, ticketId) {
    const buttons = [];
    
    switch(stage.stage) {
        case 0: // Not started
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`check_eligibility:${ticketId}`)
                    .setLabel('Check Eligibility')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔍'),
                new ButtonBuilder()
                    .setCustomId(`conversion_guide:${ticketId}`)
                    .setLabel('Get Started Guide')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📖')
            );
            break;
            
        case 1: // Eligibility checked
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`check_burn_tx:${ticketId}`)
                    .setLabel('Check Burn TX')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔥'),
                new ButtonBuilder()
                    .setCustomId(`conversion_guide:${ticketId}`)
                    .setLabel('Conversion Guide')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📖')
            );
            break;
            
        case 2: // Conversion initiated
        case 3: // Partially claimed
            if (vestingStatus && vestingStatus.monthsAvailableToClaim > 0) {
                buttons.push(
                    new ButtonBuilder()
                        .setCustomId(`claim_available:${ticketId}`)
                        .setLabel(`Claim ${vestingStatus.monthsAvailableToClaim} Month(s)`)
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('💰'),
                    new ButtonBuilder()
                        .setCustomId(`view_claim_status:${ticketId}`)
                        .setLabel('View Status')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📊')
                );
            } else {
                buttons.push(
                    new ButtonBuilder()
                        .setCustomId(`view_claim_status:${ticketId}`)
                        .setLabel('View Status')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📊'),
                    new ButtonBuilder()
                        .setCustomId(`next_claim_info:${ticketId}`)
                        .setLabel('Next Claim Info')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📅')
                );
            }
            break;
            
        case 4: // Fully claimed (current)
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`view_claim_history:${ticketId}`)
                    .setLabel('View Claim History')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📜'),
                new ButtonBuilder()
                    .setCustomId(`next_claim_info:${ticketId}`)
                    .setLabel('Next Claim Date')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📅')
            );
            break;
            
        case 5: // Conversion complete
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`view_claim_history:${ticketId}`)
                    .setLabel('View Complete History')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📜'),
                new ButtonBuilder()
                    .setCustomId(`conversion_summary:${ticketId}`)
                    .setLabel('Final Summary')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🏁')
            );
            break;
            
        default:
            // Default buttons for unknown stage
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`check_eligibility:${ticketId}`)
                    .setLabel('Check Eligibility')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔍'),
                new ButtonBuilder()
                    .setCustomId(`check_burn_tx:${ticketId}`)
                    .setLabel('Check Burn TX')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔥')
            );
    }
    
    // Split buttons into rows (max 5 buttons per row)
    const actionRows = [];
    for (let i = 0; i < buttons.length; i += 5) {
        const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 5));
        actionRows.push(row);
    }
    
    return actionRows;
}

/**
 * Gets the conversion status message and appropriate buttons for a given address
 * @param {string} algorandAddress - The Algorand address to check
 * @param {string} ticketId - The ticket ID for button context
 * @param {string} userId - Optional user ID to ping in status messages
 * @returns {Object} Object containing statusMessage, buttonComponents, and progressData
 */
async function getConversionStatusAndButtons(algorandAddress, ticketId, userId = null) {
    try {
        const progressData = await supabaseHandler.getConversionProgress(algorandAddress);

        // If we detected an on-chain burn that is not yet registered in the mirror,
        // return a special user-facing message and a reduced set of buttons that do NOT
        // instruct the user to send FRY again. Do NOT modify any DB records here.
        if (progressData && progressData.hasUnregisteredBurn) {
            const userMessage = `✅ We detected FRY 1.0 burn transaction(s) for wallet \`${algorandAddress}\`. Our system hasn't yet registered this transaction in our database (internal sync issue). Do NOT send more FRY — staff have been notified and will reconcile this. We'll follow up here once resolved.`;
            const statusMessage = userId ? `<@${userId}> ${userMessage}` : userMessage;

            // Provide only informational buttons: Conversion Guide and Check Conversion Status (no send/burn prompts)
            const infoButtons = [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`conversion_guide:${ticketId}`)
                        .setLabel('Conversion Guide')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📖'),
                    new ButtonBuilder()
                        .setCustomId(`check_conversion_status:${ticketId}`)
                        .setLabel('Check Conversion Status')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('📊')
                )
            ];

            return {
                statusMessage,
                buttonComponents: infoButtons,
                progressData
            };
        }

        // Normal behavior when no unregistered burn detected        
        let statusMessage = supabaseHandler.generateConversionStatusMessage(algorandAddress, progressData);
        
        // Add user ping to the status message if userId is provided
        if (userId) {
            statusMessage = `<@${userId}> ${statusMessage}`;
        }
        
        let buttonComponents = [];
        if (progressData.found && progressData.stage) {
            buttonComponents = createStageSpecificButtons(progressData.stage, progressData.vestingStatus, ticketId);
        } else {
            // Default buttons if no progress found
            buttonComponents = [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`check_eligibility:${ticketId}`)
                        .setLabel('Check Eligibility')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🔍')
                )
            ];
        }
        
        return {
            statusMessage,
            buttonComponents,
            progressData
        };
    } catch (error) {
        logger.error(`Error getting conversion status for ${maskAddress(algorandAddress)}: ${error.message}`, error);
        const errorMessage = userId ? 
            `<@${userId}> ❌ **Error checking conversion status for \`${algorandAddress}\`**\n\nThere was an error retrieving your conversion information. Please try again or contact support.` :
            `❌ **Error checking conversion status for \`${algorandAddress}\`**\n\nThere was an error retrieving your conversion information. Please try again or contact support.`;
        
        return {
            statusMessage: errorMessage,
            buttonComponents: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`check_eligibility:${ticketId}`)
                        .setLabel('Check Eligibility')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🔍')
                )
            ],
            progressData: null
        };
    }
}

/**
 * Handles the 'check_eligibility' button click.
 * Creates and shows the eligibility check modal.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @param {string} ticketId - The ID of the ticket.
 */
async function handleCheckEligibilityButton(interaction, ticketId) {
    const ticket = await supabaseHandler.getTicketById(ticketId);
    const modal = new ModalBuilder()
        .setCustomId(`eligibility_check_modal:${ticketId}`)
        .setTitle('Check Conversion Eligibility');

    const algorandAddressInput = new TextInputBuilder()
        .setCustomId('algorand_address_input')
        .setLabel('Enter Algorand Address')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., RL6VDLXCN5G7N2GRTS7YLVDSFT4PVBBUOVTVS7T26OQ5MLXYQKRMI5ADXY');

    if (ticket && ticket.algorand_address && ticket.algorand_address !== 'N/A') {
        algorandAddressInput.setValue(ticket.algorand_address);
    }

    modal.addComponents(new ActionRowBuilder().addComponents(algorandAddressInput));
    await interaction.showModal(modal);
}

/**
 * Handles the modal submission for conversion eligibility check.
 * @param {import('discord.js').ModalSubmitInteraction} interaction - The modal submission interaction.
 * @param {string} ticketId - The ID of the ticket.
 */
async function handleEligibilityModalSubmit(interaction, ticketId) {
    let algorandAddress = interaction.fields.getTextInputValue('algorand_address_input');
    const { error: validationError, value: sanitizedAddress } = formValidator.sanitizeAndValidateAlgorandAddress(algorandAddress);

    if (validationError) {
        await validationErrorManager.handleValidationError(interaction, validationError);
        return;
    }
    algorandAddress = sanitizedAddress;

    //await interaction.deferReply({ flags: MessageFlags.Ephemeral }); // Make reply visible to everyone
    await interaction.deferReply();

    try {
        const eligibility = await supabaseHandler.checkConversionEligibility(algorandAddress);
        let eligibilityMessage;

        const checkStatusButton = new ButtonBuilder()
            .setCustomId(`check_conversion_status:${ticketId}`) // Updated customId
            .setLabel('Check Conversion Status for this Wallet')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📊');

        const row = new ActionRowBuilder().addComponents(checkStatusButton);

        if (eligibility.eligible && eligibility.data) {
            const data = eligibility.data;
            const totalAvailable = data.amount ?? 0;
            let breakdown = '';
            const columnMapping = {
                held: 'Fry 1.0 Held',
                verification: 'Fry 1.0 Staked (Verification)',
                cometastaking: 'Fry 1.0 Staked (Cometa)',
                cometalp: 'Fry 1.0 Eq. of LP (Cometa)',
                tinymanlp: 'Fry 1.0 Eq. of LP (Tinyman)'
            };

            for (const key in columnMapping) {
                const val = Number(data[key] || 0);
                if (val > 0) {
                    breakdown += `${columnMapping[key]}: ${formatNumberWithCommas(val, 6)} FRY 1.0\n`;
                }
            }
            
            // Build snapshot content as plain text (code block). We intentionally keep snapshot details OUTSIDE the embed.
            const snapshotContent = `✅ **Eligibility Check for \`${algorandAddress}\`:**\n\n` +
                `**Snapshot Details:**\n` +
                `\`\`\`\n` +
                `${breakdown}` +
                `-----------------------------------\n` +
                `**Total Available for Conversion: ${formatNumberWithCommas(totalAvailable, 6)} FRY 1.0**\n` +
                `\`\`\``;

            // Fetch balances
            const fry1Balance = await supabaseHandler.getFry1Balance(algorandAddress);
            const algoBalance = await supabaseHandler.getAlgoBalance(algorandAddress);
            const lockedAlgoBalance = await supabaseHandler.getLockedAlgoBalance(algorandAddress);
            const availableAlgoBalance = algoBalance - lockedAlgoBalance;

            // Prepare embed that starts at "Current FRY 1.0 Balance in Wallet:" and lists balances first,
            // then shows warnings (moved underneath the ALGO balances as requested).
            const embed = new EmbedBuilder()
                .setTitle('✅ Eligibility Check Results')
                .setColor(0x007BFF) // Info blue
                .setDescription(
                    `Current FRY 1.0 Balance in Wallet: \`${formatNumberWithCommas(fry1Balance, 6)}\`\n\n` +
                    `Current ALGO Balance in Wallet: \`${formatNumberWithCommas(algoBalance, 3)}\`\n` +
                    `Locked ALGO Balance: \`${formatNumberWithCommas(lockedAlgoBalance, 3)}\`\n` +
                    `Available ALGO Balance for Transactions: \`${formatNumberWithCommas(availableAlgoBalance, 3)}\`\n\n`
                );

            // Build warnings after balances.
            // Only warn about missing FRY 1.0 if the user has NOT already sent FRY 1.0 to the burn wallet.
            // Check for any matching burn transaction (look back up to 365 days).
            let warnings = '';

            let hasBurned = false;
            try {
                const burnTxsForEligibility = await supabaseHandler.checkBurnTransaction(algorandAddress, totalAvailable, 365);
                hasBurned = Array.isArray(burnTxsForEligibility) && burnTxsForEligibility.length > 0;
            } catch (btErr) {
                // If the burn tx check fails, log but do not block; fall back to showing warnings based on balance.
                logger.warn(`Failed to check historical burn transactions for ${maskAddress(algorandAddress)}: ${btErr.message}`);
                hasBurned = false;
            }

            if (!hasBurned) {
                // Only consider FRY balance warning if the user has not burned their FRY 1.0 yet.
                if (fry1Balance < totalAvailable) {
                    const missingAmount = (totalAvailable - fry1Balance);
                    warnings += `⚠️ **WARNING! FRY 1.0 Balance Notice:** Your current FRY 1.0 balance is less than the amount you are eligible to convert. You are missing **${formatNumberWithCommas(missingAmount, 6)} FRY 1.0**.\n`;
                } else {
                    warnings += `✅ **FRY 1.0 Balance:** Your FRY 1.0 balance is sufficient to convert your full eligible amount.\n`;
                }
            } else {
                // User has already sent FRY to the burn wallet; no FRY low warning required.
                warnings += `✅ **FRY 1.0 Sent:** FRY 1.0 was previously sent to the burn wallet (conversion initiated), so your current on-wallet FRY balance does not need to be present.\n`;
            }

            if (availableAlgoBalance < config.MIN_ALGO_BALANCE_FOR_TX) {
                warnings += `\n⚠️ **WARNING! ALGO Balance Notice:** Your available ALGO balance is below the recommended minimum of ${config.MIN_ALGO_BALANCE_FOR_TX} ALGO. You will need sufficient ALGO to cover transaction fees for conversion and future Proof of Connectivity (PoC) checks.`;
            } else {
                warnings += `\n✅ **ALGO Balance:** Your available ALGO balance is sufficient for transaction fees.`;
            }

            // Add warnings to embed as a field to keep formatting clean
            embed.addFields({ name: 'Balance Summary & Warnings', value: warnings, inline: false });

            // Use the snapshotContent as the message content (plain text code block) and include the embed and button row
            await interaction.editReply({ content: snapshotContent, embeds: [embed], components: [row] });
            return;

        } else {
            eligibilityMessage = `❌ **Eligibility Check for \`${algorandAddress}\`:**\n\n` +
                `Your Algorand address is **not found** in the eligible snapshot data or is not eligible for conversion. Please double-check the address or provide further details.`;
        }

        await interaction.editReply({ content: eligibilityMessage, components: [row] });
        // Reason: persist masked wallet identifiers only in bot activity logs.
        await supabaseHandler.logBotActivity('info', 'fry_conversion_eligibility_manual', `Ticket ${ticketId}: Manual eligibility check for ${maskAddress(algorandAddress)} - ${eligibility.eligible ? 'Eligible' : 'Not Eligible'}.`);
    } catch (error) {
        logger.error(`Error during manual eligibility check for ticket ${ticketId}, address ${maskAddress(algorandAddress)}: ${error.message}`, error);
        await interaction.editReply({ content: '⚠️ An error occurred during the eligibility check. Please try again later.' });
    }
}

/**
 * Handles the 'check_conversion_status' button click.
 * Always prompts a modal pre-filled with the ticket's Algorand address (if present).
 * Allows the user to change the address before submitting the check.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @param {string} ticketId - The ID of the ticket.
 */
async function handleCheckConversionStatusButton(interaction, ticketId) {
    const ticket = await supabaseHandler.getTicketById(ticketId);

    const modal = new ModalBuilder()
        .setCustomId(`conversion_status_modal_submit:${ticketId}`)
        .setTitle('Check Conversion Status');

    const algorandAddressInput = new TextInputBuilder()
        .setCustomId('algorand_address_input')
        .setLabel('Enter Algorand Address')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., RL6VDLXCN5G7N2GRTS7YLVDSFT4PVBBUOVTVS7T26OQ5MLXYQKRMI5ADXY');

    // Pre-fill with the ticket's Algorand address if available (mirror check_burn_tx / check_eligibility behavior)
    if (ticket && ticket.algorand_address && ticket.algorand_address !== 'N/A') {
        try {
            algorandAddressInput.setValue(ticket.algorand_address);
        } catch (err) {
            // setValue can throw if the value length exceeds the input limits; fail gracefully without blocking the modal
            logger.warn(`Failed to prefill algorand address for modal on ticket ${ticketId}: ${err.message}`);
        }
    }

    modal.addComponents(new ActionRowBuilder().addComponents(algorandAddressInput));
    await interaction.showModal(modal);
}

/**
 * Handles the modal submission for conversion status check.
 * @param {import('discord.js').ModalSubmitInteraction} interaction - The modal submission interaction.
 * @param {string} ticketId - The ID of the ticket.
 */
async function handleConversionStatusModalSubmit(interaction, ticketId) {
    let algorandAddress = interaction.fields.getTextInputValue('algorand_address_input');
    const { error: validationError, value: sanitizedAddress } = formValidator.sanitizeAndValidateAlgorandAddress(algorandAddress);

    if (validationError) {
        await validationErrorManager.handleValidationError(interaction, validationError);
        return;
    }
    algorandAddress = sanitizedAddress;

    await interaction.deferReply();

    try {
        const ticket = await supabaseHandler.getTicketById(ticketId);
        const targetUserId = ticket?.user_id || interaction.user.id;
        const { statusMessage, buttonComponents, progressData } = await getConversionStatusAndButtons(algorandAddress, ticketId, targetUserId);

        // Helper to format JS Date to "YYYY-MM-DD HH:MM UTC"
        const formatDateObjUtc = (d) => {
            if (!d) return 'Unknown';
            const yyyy = d.getUTCFullYear();
            const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(d.getUTCDate()).padStart(2, '0');
            const HH = String(d.getUTCHours()).padStart(2, '0');
            const MM = String(d.getUTCMinutes()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd} ${HH}:${MM} UTC`;
        };

        const embed = new EmbedBuilder()
            .setColor(0x5865F2) // Discord blurple / info
            .setDescription(statusMessage);

        // If a next claim date exists in vestingStatus, compute days left and show it
        if (progressData && progressData.vestingStatus && progressData.vestingStatus.nextClaimDate) {
            const nextDate = progressData.vestingStatus.nextClaimDate;
            // Ensure nextDate is a Date object
            const nextDateObj = nextDate instanceof Date ? nextDate : new Date(nextDate);
            const now = new Date();
            const msDiff = nextDateObj.getTime() - now.getTime();
            const daysLeft = msDiff > 0 ? Math.ceil(msDiff / (1000 * 60 * 60 * 24)) : 0;
            const nextDateStr = formatDateObjUtc(nextDateObj);

            embed.addFields(
                { name: 'Next claim', value: `${nextDateStr} (${daysLeft} day${daysLeft === 1 ? '' : 's'} left)`, inline: false }
            );
        }

        // If we detected on-chain burn(s) that the mirror hasn't registered, act specially:
        // - send a staff embed (with a role ping in content) into the ticket channel
        // - send the user-facing status message as plain content (so the mention pings) and include buttons
        try {
            if (progressData && progressData.hasUnregisteredBurn && ticketId) {
                // Fetch ticket to obtain channel id
                const ticket = await supabaseHandler.getTicketById(ticketId);
                const channelId = ticket?.channel_id;
                if (channelId) {
                    try {
                        const channel = await interaction.client.channels.fetch(channelId);
                        if (channel) {
                            // Build staff embed with explorer links (embed for clarity) and ping in content
                            const txLines = (progressData.unregisteredBurnTxs || []).map(tx => {
                                const txDate = tx.timestamp ? new Date(tx.timestamp * 1000) : null;
                                const dateStr = txDate ? `${txDate.getUTCFullYear()}-${String(txDate.getUTCMonth()+1).padStart(2,'0')}-${String(txDate.getUTCDate()).padStart(2,'0')} ${String(txDate.getUTCHours()).padStart(2,'0')}:${String(txDate.getUTCMinutes()).padStart(2,'0')} UTC` : 'Unknown';
                                return `• ${tx.txID} — ${formatNumberWithCommas(tx.amount, 6)} FRY 1.0 — ${dateStr}\n[View TX](https://explorer.perawallet.app/tx/${tx.txID})`;
                            }).join('\n') || 'No TX details available.';

                            const staffEmbed = new EmbedBuilder()
                                .setTitle('🔥 Unregistered Burn Detected')
                                .setColor(0xFF4500)
                                .addFields(
                                    { name: 'Address', value: `\`${algorandAddress}\``, inline: false },
                                    { name: 'Eligible Amount', value: `${progressData.mirrorData?.amount ?? 'Unknown'} FRY 1.0`, inline: true },
                                    { name: 'Database Status', value: `${progressData.mirrorData?.status ?? 'not found'} Please reconcile the conversions database collection and update as needed.`, inline: true },
                                    { name: 'Detected TXs (links below)', value: txLines, inline: false }
                                )
                                .setFooter({ text: `Ticket ${ticketId}` });

                            // Ping admins in content so role mention notifies, include embed for details
                            await channel.send({ content: `<@&${config.ticketAdminRoleId}>`, embeds: [staffEmbed] })
                                .catch(err => logger.error(`Failed to send staff ping to channel ${channelId} for ticket ${ticketId}: ${err.message}`, err));

                            // Reason: keep unregistered-burn telemetry without storing full tx IDs in persisted logs.
                            await supabaseHandler.logBotActivity('warn', 'fry_conversion_unregistered_burn', `Ticket ${ticketId}: Unregistered burn detected for ${maskAddress(algorandAddress)}. txCount=${(progressData.unregisteredBurnTxs || []).length}`);
                        }
                    } catch (chErr) {
                        logger.error(`Error fetching channel ${channelId} to notify staff for ticket ${ticketId}: ${chErr.message}`, chErr);
                    }
                } else {
                    // If no channel found, just log the event
                    // Reason: keep unregistered-burn telemetry without storing full tx IDs in persisted logs.
                    await supabaseHandler.logBotActivity('warn', 'fry_conversion_unregistered_burn', `Ticket ${ticketId}: Unregistered burn detected for ${maskAddress(algorandAddress)} but no ticket channel found. txCount=${(progressData.unregisteredBurnTxs || []).length}`);
                }

                // Send the user-facing message as plain content (so the mention pings), with the same buttons
                await interaction.editReply({ content: statusMessage, components: buttonComponents });
            } else {
                // No unregistered burn -> send full embed as before
                await interaction.editReply({ embeds: [embed], components: buttonComponents });
            }
        } catch (notifyErr) {
            logger.error(`Failed to notify staff about unregistered burn for ticket ${ticketId}, address ${maskAddress(algorandAddress)}: ${notifyErr.message}`, notifyErr);
        }

        // Reason: persist masked wallet identifiers only in bot activity logs.
        await supabaseHandler.logBotActivity('info', 'fry_conversion_status_modal_submit', `Ticket ${ticketId}: Conversion status checked via modal for ${maskAddress(algorandAddress)}.`);
        } catch (error) {
        logger.error(`Error checking conversion status via modal for ticket ${ticketId}, address ${maskAddress(algorandAddress)}: ${error.message}`, error);
        await interaction.editReply({ content: '⚠️ An error occurred while checking conversion status. Please try again later.' });
    }
}

/**
 * Handles the 'check_burn_tx' button click.
 * Creates and shows the burn transaction check modal.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @param {string} ticketId - The ID of the ticket.
 */
async function handleCheckBurnTxButton(interaction, ticketId) {
    const ticket = await supabaseHandler.getTicketById(ticketId);
    const modal = new ModalBuilder()
        .setCustomId(`burn_tx_check_modal:${ticketId}`)
        .setTitle('Check Burn Transactions');

    const algorandAddressInput = new TextInputBuilder()
        .setCustomId('algorand_address_input')
        .setLabel('Enter Algorand Address')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., RL6VDLXCN5G7N2GRTS7YLVDSFT4PVBBUOVTVS7T26OQ5MLXYQKRMI5ADXY');

    if (ticket && ticket.algorand_address && ticket.algorand_address !== 'N/A') {
        algorandAddressInput.setValue(ticket.algorand_address);
    }

    modal.addComponents(new ActionRowBuilder().addComponents(algorandAddressInput));
    await interaction.showModal(modal);
}

/**
 * Handles the modal submission for burn transaction check.
 * @param {import('discord.js').ModalSubmitInteraction} interaction - The modal submission interaction.
 * @param {string} ticketId - The ID of the ticket.
 */
async function handleBurnTxModalSubmit(interaction, ticketId) {
    let algorandAddress = interaction.fields.getTextInputValue('algorand_address_input');
    const { error: validationError, value: sanitizedAddress } = formValidator.sanitizeAndValidateAlgorandAddress(algorandAddress);

    if (validationError) {
        await validationErrorManager.handleValidationError(interaction, validationError);
        return;
    }
    algorandAddress = sanitizedAddress;

    await interaction.deferReply();

    try {
        // First, get the eligible amount
        const eligibility = await supabaseHandler.checkConversionEligibility(algorandAddress);
        if (!eligibility.eligible || !eligibility.data) {
            await interaction.editReply({ content: `❌ Address \`${algorandAddress}\` not found or not eligible for conversion.` });
            return;
        }
        const eligibleAmount = eligibility.data.amount ?? 0;

        const burnTransactions = await supabaseHandler.checkBurnTransaction(algorandAddress, eligibleAmount);

        // Helper to format unix-seconds timestamp to a friendly UTC string: "YYYY-MM-DD HH:MM UTC"
        const formatTxDateUtc = (unixSeconds) => {
            if (!unixSeconds) return 'Unknown';
            const d = new Date(unixSeconds * 1000);
            const yyyy = d.getUTCFullYear();
            const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(d.getUTCDate()).padStart(2, '0');
            const HH = String(d.getUTCHours()).padStart(2, '0');
            const MM = String(d.getUTCMinutes()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd} ${HH}:${MM} UTC`;
        };

        if (burnTransactions.length > 0) {
            // Use the first matching transaction (expected single match)
            const tx = burnTransactions[0];
            const explorerUrl = `https://explorer.perawallet.app/tx/${tx.txID}`;
            const dateUtc = formatTxDateUtc(tx.timestamp);

            const embed = new EmbedBuilder()
                .setTitle('🔥 Burn Transaction Found')
                .setColor(0xFF4500)
                .setDescription(`Matching eligible amount: ${formatNumberWithCommas(eligibleAmount, 6)} FRY 1.0`)
                .addFields(
                    { name: 'Amount', value: `${formatNumberWithCommas(tx.amount, 6)} FRY 1.0`, inline: true },
                    { name: 'Date (UTC)', value: dateUtc, inline: true },
                    { name: 'Explorer', value: `[View TX](${explorerUrl})`, inline: false },
                    { name: 'TxID', value: `\`${tx.txID}\``, inline: false }
                )
                .setFooter({ text: 'Detected sending to official burn wallet' });

            // Reason: avoid logging full transaction identifiers in runtime logs.
            logger.debug(`Attempting to editReply with burn tx embed for txID=${maskAddress(tx.txID)}`);
            await interaction.editReply({ embeds: [embed] });
        } else {
            const embed = new EmbedBuilder()
                .setTitle('ℹ️ No Matching Burn Transaction Found')
                .setColor(0x5865F2)
                .setDescription(`No FRY 1.0 burn transactions from \`${algorandAddress}\` to the official burn wallet were detected within the last 7 days that match the eligible conversion amount of ${formatNumberWithCommas(eligibleAmount, 6)}.`);
            logger.debug(`Attempting to editReply with no-burn-tx embed for address=${maskAddress(algorandAddress)}`);
            await interaction.editReply({ embeds: [embed] });
        }
        // Reason: persist masked wallet identifiers only in bot activity logs.
        await supabaseHandler.logBotActivity('info', 'fry_conversion_eligibility_manual', `Ticket ${ticketId}: Manual burn tx check for ${maskAddress(algorandAddress)}.`);
    } catch (error) {
        logger.error(`Error during manual burn tx check for ticket ${ticketId}, address ${maskAddress(algorandAddress)}: ${error.message}`, error);
        // Ensure the error reply also has content
        await interaction.editReply({ content: '⚠️ An error occurred during the burn transaction check. Please try again later.' });
    }
}

/**
 * Handles the 'conversion_guide' button click.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @param {string} ticketId - The ID of the ticket.
 */
async function handleConversionGuideButton(interaction, ticketId) {
    const embed = new EmbedBuilder()
        .setTitle('📖 Fry Conversion Guide')
        .setColor(0x007BFF) // A nice blue color
        .setDescription(
            '**Step 1:** Check your eligibility using the "Check Eligibility" button\n' +
            '**Step 2:** Visit the [Fry Dashboard](https://dashboard.frynetworks.com) to initiate conversion\n' +
            '**Step 3:** Click on the "FRY 1.0 Conversion" button to send your FRY 1.0 to the burn wallet as instructed\n' +
            '**Step 4:** Return to the dashboard and click on the "FRY 1.0 Conversion" button again to claim your converted tokens\n\n' +
            '**Important:** Vesting begins August 1st, 2025. You receive 1/12th of your allocation each month.'
        )
        .addFields(
            { name: 'Detailed Instructions', value: 'Visit: [Fry Networks Docs](https://docs.frynetworks.com/docs/dashboard/fry-1.0-conversion-guide)' }
        );

    await interaction.reply({
        embeds: [embed]
       // flags: MessageFlags.Ephemeral
    });
}

/**
 * Handles the 'claim_available' button click.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @param {string} ticketId - The ID of the ticket.
 */
async function handleClaimAvailableButton(interaction, ticketId) {
    const embed = new EmbedBuilder()
        .setTitle('💰 Claim Available Tokens')
        .setColor(0x28A745) // Green color for success/claim
        .setDescription(
            'You have tokens available to claim! Please visit the [Fry Dashboard](https://dashboard.frynetworks.com) to claim your vested tokens.\n\n' +
            '**Note:** You can only claim tokens that have vested according to the monthly schedule.'
        );

    await interaction.reply({
        embeds: [embed]
        // flags: MessageFlags.Ephemeral
    });
}

/**
 * Handles the 'view_claim_status' button click.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @param {string} ticketId - The ID of the ticket.
 */
async function handleViewClaimStatusButton(interaction, ticketId) {
    try {
        const ticket = await supabaseHandler.getTicketById(ticketId);
        if (ticket && ticket.algorand_address) {
            const { statusMessage, progressData } = await getConversionStatusAndButtons(ticket.algorand_address, ticketId, ticket.user_id || interaction.user.id);

            // Helper to format JS Date to "YYYY-MM-DD HH:MM UTC"
            const formatDateObjUtc = (d) => {
                if (!d) return 'Unknown';
                const yyyy = d.getUTCFullYear();
                const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
                const dd = String(d.getUTCDate()).padStart(2, '0');
                const HH = String(d.getUTCHours()).padStart(2, '0');
                const MM = String(d.getUTCMinutes()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd} ${HH}:${MM} UTC`;
            };

            const embed = new EmbedBuilder()
                .setDescription(statusMessage) // Use the generated status message as description
                .setColor(0x5865F2); // Discord's blurple

            // If a next claim date exists in vestingStatus, compute days left and show it
            if (progressData && progressData.vestingStatus && progressData.vestingStatus.nextClaimDate) {
                const nextDate = progressData.vestingStatus.nextClaimDate;
                const nextDateObj = nextDate instanceof Date ? nextDate : new Date(nextDate);
                const now = new Date();
                const msDiff = nextDateObj.getTime() - now.getTime();
                const daysLeft = msDiff > 0 ? Math.ceil(msDiff / (1000 * 60 * 60 * 24)) : 0;
                const nextDateStr = formatDateObjUtc(nextDateObj);

                embed.addFields(
                    { name: 'Next claim', value: `${nextDateStr} (${daysLeft} day${daysLeft === 1 ? '' : 's'} left)`, inline: false }
                );
            }

            await interaction.reply({
                embeds: [embed]
            });
        } else {
            const embed = new EmbedBuilder()
                .setTitle('⚠️ No Algorand Address Found')
                .setColor(0xFFC107) // Warning color
                .setDescription('No Algorand address found for this ticket. Please provide your address using the check eligibility button.');
            await interaction.reply({
                embeds: [embed]
            });
        }
    } catch (error) {
        logger.error(`Error getting claim status for ticket ${ticketId}: ${error.message}`, error);
        const embed = new EmbedBuilder()
            .setTitle('⚠️ Error Retrieving Claim Status')
            .setColor(0xDC3545) // Error color
            .setDescription('An error occurred while retrieving claim status. Please try again later.');
        await interaction.reply({
            embeds: [embed]
        });
    }
}

/**
 * Handles the 'next_claim_info' button click.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @param {string} ticketId - The ID of the ticket.
 */
async function handleNextClaimInfoButton(interaction, ticketId) {
    const embed = new EmbedBuilder()
        .setTitle('📅 Next Claim Information')
        .setColor(0x17A2B8) // Info color
        .setDescription(
            'Tokens vest monthly starting August 1st, 2025. Each month on the 1st, you can claim 1/12th of your total allocation.\n\n' +
            '**Next claim date:** 1st of next month\n' +
            '**Claim window:** Available anytime after the 1st of each month\n\n' +
            'Visit the [Fry Dashboard](https://dashboard.frynetworks.com) when your next allocation is available.'
        );

    await interaction.reply({
        embeds: [embed]
        // flags: MessageFlags.Ephemeral
    });
}

/**
 * Handles the 'view_claim_history' button click.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @param {string} ticketId - The ID of the ticket.
 */
async function handleViewClaimHistoryButton(interaction, ticketId) {
    try {
        const ticket = await supabaseHandler.getTicketById(ticketId);
        if (ticket && ticket.algorand_address) {
            const progressData = await supabaseHandler.getConversionProgress(ticket.algorand_address);
            const embed = new EmbedBuilder()
                .setTitle('📜 Claim History')
                .setColor(0x6C757D); // Grey color for history

            if (progressData.found && progressData.mirrorData && progressData.mirrorData.history) {
                const history = parseJsonSafe(progressData.mirrorData.history, []) || [];
                let historyDescription = '';

                // Helper to format date strings to "YYYY-MM-DD HH:MM UTC"
                const formatDateStrUtc = (dateInput) => {
                    if (!dateInput) return 'Unknown';
                    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
                    if (isNaN(d.getTime())) return 'Unknown';
                    const yyyy = d.getUTCFullYear();
                    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
                    const dd = String(d.getUTCDate()).padStart(2, '0');
                    const HH = String(d.getUTCHours()).padStart(2, '0');
                    const MM = String(d.getUTCMinutes()).padStart(2, '0');
                    return `${yyyy}-${mm}-${dd} ${HH}:${MM} UTC`;
                };

                if (Array.isArray(history) && history.length > 0) {
                    history.forEach((claim, index) => {
                        const tokenName = claim.token || claim.tokenType || claim.tokenName || 'Unknown';
                        const amountStr = formatNumberWithCommas(claim.amount || 0, 6);
                        const dateStr = formatDateStrUtc(claim.date || claim.timestamp);

                        historyDescription += `**Claim ${index + 1}:**\n`;
                        historyDescription += `• Token: ${tokenName}\n`;
                        historyDescription += `• Amount: ${amountStr}\n`;
                        historyDescription += `• Date: ${dateStr}\n\n`;
                    });
                    embed.setDescription(historyDescription);
                } else {
                    embed.setDescription('No claims found in history.');
                }
            } else {
                embed.setDescription('No claim history found for this address.');
            }
            await interaction.reply({
                embeds: [embed]
                // flags: MessageFlags.Ephemeral
            });
        } else {
            const embed = new EmbedBuilder()
                .setTitle('⚠️ No Algorand Address Found')
                .setColor(0xFFC107) // Warning color
                .setDescription('No Algorand address found for this ticket.');
            await interaction.reply({
                embeds: [embed]
               // flags: MessageFlags.Ephemeral
            });
        }
    } catch (error) {
        logger.error(`Error getting claim history for ticket ${ticketId}: ${error.message}`, error);
        const embed = new EmbedBuilder()
            .setTitle('⚠️ Error Retrieving Claim History')
            .setColor(0xDC3545) // Error color
            .setDescription('An error occurred while retrieving claim history. Please try again later.');
        await interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * Handles the 'conversion_summary' button click.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @param {string} ticketId - The ID of the ticket.
 */
async function handleConversionSummaryButton(interaction, ticketId) {
    const embed = new EmbedBuilder()
        .setTitle('🏁 Conversion Complete!')
        .setColor(0x28A745) // Green for completion
        .setDescription(
            'Congratulations! You have successfully completed the FRY 1.0 conversion process.\n\n' +
            '**What\'s Next:**\n' +
            '• Continue earning rewards with your new tokens\n' +
            '• Monitor your wallet for future distributions\n' +
            '• Stay updated with Fry Networks announcements\n\n' +
            'Thank you for being part of the Fry Networks ecosystem!'
        );

    await interaction.reply({
        embeds: [embed]
        // flags: MessageFlags.Ephemeral
    });
}

module.exports = {
    handleCheckEligibilityButton,
    handleEligibilityModalSubmit,
    handleCheckBurnTxButton,
    handleBurnTxModalSubmit,
    createStageSpecificButtons,
    getConversionStatusAndButtons,
    handleConversionGuideButton,
    handleClaimAvailableButton,
    handleViewClaimStatusButton,
    handleNextClaimInfoButton,
    handleViewClaimHistoryButton,
    handleConversionSummaryButton,
    handleCheckConversionStatusButton,
    handleConversionStatusModalSubmit
};
