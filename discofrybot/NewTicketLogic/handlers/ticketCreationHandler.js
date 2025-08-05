// NewTicketLogic/handlers/ticketCreationHandler.js
const {
    ChannelType, PermissionsBitField, ActionRowBuilder,
    EmbedBuilder, TextInputBuilder, MessageFlags, ButtonBuilder, ButtonStyle, ModalBuilder // Added ModalBuilder
} = require('discord.js');
const config = require('../utils/config');
const logger = require('../utils/logger');
const { validateTicketSubmission, baseFields, ticketFields } = require('../utils/formValidator'); // Added baseFields, ticketFields
const supabaseHandler = require('./supabaseHandler');
const { getTicketActionRow, formatNumberWithCommas } = require('../utils/ticketUtils'); // Import getTicketActionRow and formatNumberWithCommas

// Cache for resuming form submissions
const resumeCache = new Map();

/**
 * Handles the submission of a ticket creation modal.
 * @param {import('discord.js').ModalSubmitInteraction} interaction - The modal submission interaction.
 * @param {string} ticketType - The type of ticket being created (e.g., 'order_tracking').
 */
async function handleTicketModalSubmit(interaction, ticketType) {
    const guild = interaction.guild;
    const user = interaction.user;

    // Defer reply to prevent interaction timeout for longer operations
    // We will reply or editReply based on validation outcome.
    // await interaction.deferReply({ flags: MessageFlags.Ephemeral }); // Deferring later, only if validation passes.

    // 1. Gather field values from modal
    const submittedFields = {};
    interaction.fields.fields.forEach((field, customId) => {
        submittedFields[customId] = field.value;
    });
    
    // 2. Validate submission
    const { errors, validatedData } = validateTicketSubmission(ticketType, submittedFields);

    if (errors.length > 0) {
        logger.warn(`Validation errors for user ${user.id} submitting ${ticketType} ticket: ${errors.join(', ')}`);
        
        // Store submitted data in cache for resume
        const cacheKey = `${user.id}_${ticketType}`;
        resumeCache.set(cacheKey, submittedFields);
        logger.info(`Cached submission for ${user.id} / ${ticketType} due to validation errors.`);

        const resumeButton = new ButtonBuilder()
            .setCustomId(`resume_ticket_${ticketType}`)
            .setLabel('📝 Resume & Correct Form')
            .setStyle(ButtonStyle.Primary);
        
        const row = new ActionRowBuilder().addComponents(resumeButton);

        await interaction.reply({
            content: `⚠️ Errors in your submission:\n\n${errors.map(e => `- ${e}`).join('\n')}\n\nPlease click the button below to resume and correct your information.`,
            components: [row],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // If validation passes, now we defer for the longer operations.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    logger.info(`Validation successful for ${ticketType} ticket by ${user.id}. Proceeding with creation.`);

    try {
        // 3. Check for existing active ticket
        const existingTicket = await supabaseHandler.checkActiveTicket(user.id);
        if (existingTicket) {
            logger.info(`User ${user.id} attempted to open a new ticket while having an active one (${existingTicket.id}).`);
            return interaction.editReply({
                content: `⚠️ You already have an open ticket (Type: ${existingTicket.ticket_type}, Channel: <#${existingTicket.channel_id}>). Please close it before opening a new one.`,
                flags: MessageFlags.Ephemeral
            });
        }

        // 4. Prepare and insert ticket into Supabase
        const ticketRecord = {
            user_id: user.id,
            discord_username: user.username,
            ticket_type: ticketType,
            status: 'open',
            full_name: validatedData.fullName || 'N/A',
            email: validatedData.email || 'N/A',
            description: validatedData.description || 'N/A',
            order_number: validatedData.orderNumber || 'N/A',
            algorand_address: validatedData.algorandAddress || 'N/A',
            minerkeys: validatedData.minerKeys || 'N/A',
            orders_quantities: validatedData.ordersQuantities || 'N/A', // Added new field
        };

        const newTicket = await supabaseHandler.insertTicket(ticketRecord);
        const ticketId = newTicket.id;
        logger.info(`Ticket ${ticketId} created in DB for user ${user.id}.`);

        // 5. Upsert user info
        await supabaseHandler.upsertUser({
            id: user.id,
            username: user.username,
            discriminator: user.discriminator,
            avatar_url: user.displayAvatarURL({ extension: 'png', size: 256 }),
            last_seen: new Date().toISOString()
        });

        // 6. Create Discord channel
        const categoryId = config.categoryIds[ticketType];
        if (!categoryId) {
            logger.error(`Misconfiguration: No categoryId found for ticketType ${ticketType}. Ticket ${ticketId} created but channel cannot be.`);
            return interaction.editReply({ content: '⚠️ Ticket system error: Category not found. Ticket logged but channel creation failed. Contact support.', flags: MessageFlags.Ephemeral });
        }
        
        let ticketChannel;
        try {
            const channelName = `${ticketId}-${user.username.substring(0, 20).replace(/[^a-zA-Z0-9_-]/g, '')}`;
            ticketChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: categoryId,
                permissionOverwrites: [
                    { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: user.id, allow: [
                        PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.AddReactions,
                        PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.EmbedLinks
                    ]},
                    { id: config.ticketModRoleId, allow: [
                        PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages,
                        // Add other perms staff might need, e.g., ManageMessages, EmbedLinks
                        PermissionsBitField.Flags.EmbedLinks, PermissionsBitField.Flags.AttachFiles,
                        PermissionsBitField.Flags.ReadMessageHistory
                    ]},
                    {
                        id: config.internRoleId,
                        allow: (ticketType === 'tech_support' ||
                               ticketType === 'miner_keys' ||
                               ticketType === 'registration' ||
                               ticketType === 'rewards' ||
                               ticketType === 'fry_conversion_issues')
                               ? [PermissionsBitField.Flags.ViewChannel]
                               : [],
                        deny: !(ticketType === 'tech_support' ||
                                ticketType === 'miner_keys' ||
                                ticketType === 'registration' ||
                                ticketType === 'rewards' ||
                                ticketType === 'fry_conversion_issues')
                               ? [PermissionsBitField.Flags.ViewChannel]
                               : []
                    },                    
                    { id: interaction.client.user.id, allow: [ // Add permissions for the bot itself
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.EmbedLinks,
                        PermissionsBitField.Flags.AttachFiles,
                        PermissionsBitField.Flags.ReadMessageHistory,
                        PermissionsBitField.Flags.ManageMessages // If bot needs to delete messages or pins
                    ]}
                ],
                topic: `Ticket ${ticketId} for ${user.tag} (${user.id}). Type: ${ticketType}. Opened: ${new Date().toISOString()}`
            });
            logger.info(`Ticket channel ${ticketChannel.id} (${ticketChannel.name}) created for ticket ${ticketId}.`);
        } catch (channelError) {
            logger.error(`Failed to create ticket channel for ticket ${ticketId}: ${channelError.message}`, channelError);
            return interaction.editReply({ content: '⚠️ Failed to create ticket channel. Please try again or contact support.', flags: MessageFlags.Ephemeral });
        }

        await supabaseHandler.updateTicketChannelId(ticketId, ticketChannel.id);

        // 8. Send initial embed and action buttons
        const embedFieldsData = [];
        if (validatedData.fullName) embedFieldsData.push({ name: 'Full Name', value: `\`\`\`\n${validatedData.fullName}\n\`\`\``, inline: false });
        if (validatedData.email) embedFieldsData.push({ name: 'Email', value: `\`\`\`\n${validatedData.email}\n\`\`\``, inline: false });
        if (validatedData.orderNumber && validatedData.orderNumber !== 'N/A') embedFieldsData.push({ name: 'Order Number', value: `\`\`\`\n${validatedData.orderNumber}\n\`\`\``, inline: false });
        if (validatedData.algorandAddress && validatedData.algorandAddress !== 'N/A') embedFieldsData.push({ name: 'Algorand Address', value: `\`\`\`\n${validatedData.algorandAddress}\n\`\`\``, inline: false });
        if (validatedData.minerKeys && validatedData.minerKeys !== 'N/A') embedFieldsData.push({ name: 'Miner Keys', value: `\`\`\`\n${validatedData.minerKeys}\n\`\`\``, inline: false });
        // Add orders_quantities to embed if it exists and is an array, formatting it for display
        if (Array.isArray(validatedData.ordersQuantities) && validatedData.ordersQuantities.length > 0) {
            const formattedOrders = validatedData.ordersQuantities.map(item => `Order ${item.order}: ${item.quantity} nodes`).join('\n');
            embedFieldsData.push({ name: 'Orders and Quantities', value: `\`\`\`\n${formattedOrders}\n\`\`\``, inline: false });
        } else if (validatedData.ordersQuantities && validatedData.ordersQuantities !== 'N/A') {
             // Ensure the value is a string, even if it's an unexpected object format
             embedFieldsData.push({ name: 'Orders and Quantities', value: `\`\`\`\n${JSON.stringify(validatedData.ordersQuantities, null, 2)}\n\`\`\``, inline: false });

        }
        if (validatedData.description) embedFieldsData.push({ name: 'Description', value: `\`\`\`\n${validatedData.description}\n\`\`\``, inline: false });

        const ticketInfoEmbed = new EmbedBuilder()
            .setTitle(`📝 Ticket #${ticketId} - ${ticketType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`)
            .setColor(0x5865F2)
            .addFields(embedFieldsData)
            .setFooter({ text: `User ID: ${user.id}` })
            .setTimestamp();
        
        const initialMessage = await ticketChannel.send({ embeds: [ticketInfoEmbed] });

        // REMOVE THIS BLOCK:
        /*
        await supabaseHandler.logTicketMessage({
            ticket_id: ticketId,
            user_id: interaction.client.user.id,
            message: JSON.stringify(ticketInfoEmbed.toJSON()),
            discord_message_id: initialMessage.id
        });
        */
        
        // Use getTicketActionRow to build the action rows (now returns an array)
        const actionRows = getTicketActionRow(newTicket);
        const actionRowMessage = await ticketChannel.send({ content: 'Staff Actions:', components: actionRows }); // Pass the array directly

        // Store the ID of the message containing the action row
        await supabaseHandler.updateTicket(ticketId, { original_message_id: actionRowMessage.id });
        logger.info(`Stored original message ID ${actionRowMessage.id} for ticket ${ticketId}.`);

        // Capture client reference before setTimeout
        const botClient = interaction.client;

        setTimeout(() => {
            const followupEmbed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('📨 Ticket Received & Logged')
                .setDescription(`Thank you for reaching out, <@${user.id}>! Your ticket **#${ticketId}** has been successfully created.\n\nOur team will review your ticket as soon as possible.\nFeel free to click the FAQs button to see if you can find an answer for your question or issue.\n\n**We NEVER reply by DM!**\nPlease allow up to **48 hours** for a response.\n\n⚠️ Do **not** share sensitive info (passwords, payment details, etc).\n\nIf you have any questions or updates, just reply in this ticket.\n\nTo ensure efficient support, please note that tickets inactive for 24 hours will receive a reminder. If there's no response after two reminders, the ticket will be automatically closed. You can always open a new ticket if you need further assistance.\n\nThank you for your patience — we’ll get to you as soon as possible.`)
                .setFooter({ text: 'Fry Networks Ticketing System', iconURL: botClient.user.displayAvatarURL() })
                .setTimestamp();

            // Add a button for checking eligibility
            const eligibilityButton = new ButtonBuilder()
                .setCustomId(`check_eligibility:${ticketId}`)
                .setLabel('♻️ Check My Conversion Eligibility')
                .setStyle(ButtonStyle.Primary);
                
            // Add a button for checking burn transactions
            const checkBurnTxButton = new ButtonBuilder()
                .setCustomId(`check_burn_tx:${ticketId}`)
                .setLabel('Check Burn TX')
                .setStyle(ButtonStyle.Secondary);

            const components = [];
            if (ticketType === 'fry_conversion_issues') {
                const row = new ActionRowBuilder().addComponents(eligibilityButton, checkBurnTxButton);
                components.push(row);
            }


            ticketChannel.send({ embeds: [followupEmbed], components }).catch(err => logger.error(`Failed to send followup message to ${ticketChannel.id}`, err));

            // If it's a node forgo/return ticket, send buttons after another 3 seconds
            if (ticketType === 'node_forgo_return') {
                setTimeout(async() => {
                    const forgoReturnRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`forgo_return_select:forgo:${ticketId}`)
                            .setLabel('Forgo Node(s)')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId(`forgo_return_select:return:${ticketId}`)
                            .setLabel('Return Node(s)')
                            .setStyle(ButtonStyle.Secondary)
                    );
                    const forgoReturnPromptMsg = await ticketChannel.send({
                        content: `<@${user.id}> Please specify if you are forgoing (deciding not to receive the node(s) anymore) or returning node(s) you already received:`,
                        components: [forgoReturnRow]
                    }).catch(err => logger.error(`Failed to send forgo/return buttons to ${ticketChannel.id}`, err));

                    // Store this message ID in Supabase
                    if (forgoReturnPromptMsg) {
                        const currentTicket = await supabaseHandler.getTicketById(ticketId);
                        const existingMessageIds = currentTicket?.forgo_return_message_ids || [];
                        const updatedMessageIds = [...existingMessageIds, forgoReturnPromptMsg.id];
                        await supabaseHandler.updateTicket(ticketId, { forgo_return_message_ids: updatedMessageIds });
                        logger.info(`Ticket ${ticketId} updated with initial forgo/return prompt message ID: ${forgoReturnPromptMsg.id}`);
                    }                    
                }, 3000); // 3 seconds after the welcome message
            } else if (ticketType === 'fry_conversion_issues') {
                setTimeout(async () => {
                    const conversionWelcomeEmbed = new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setTitle('🪙 Fry Conversion Issues - Important Information')
                        .setDescription(
                            `<@${user.id}>, thank you for opening a ticket regarding Fry Conversion issues. Please review the following important details:\n\n` +
                            `**Snapshot Details:**\n` +
                            `🗓️ **Date:** December 1st, 2024 at 00:00 UTC\n` +
                            `🔢 **Algorand Block:** #44866969\n` +
                            `🪙 **Asset:** FRY 1.0 (ASA ID: ${config.ASSET_ID_FRY1})\n\n` +
                            `**Conversion Options:**\n` +
                            `1️⃣ Convert to FRY 2.0 (ASA ID: ${config.ASSET_ID_FRY2}) at **80:1**\n` +
                            `2️⃣ Convert to fNode (ASA ID: ${config.ASSET_ID_FNODE}) at **40:1**\n\n` +
                            `**Vesting Schedule:**\n` +
                            `Vesting begins from August 1st, 2025. You’ll unlock 1/12th of your chosen token allocation every month.\n\n` +
                            `**Important:** You must opt into the FRY 2.0 asset (ID: ${config.ASSET_ID_FRY2}) or fNode asset (ID: ${config.ASSET_ID_FNODE}) to receive your converted tokens. Only FRY 1.0 earned *before* Dec 1st, 2024, and held at the snapshot date/time is eligible. Rewards earned since Dec 1st are not included.\n\n` +
                            `For more details, please click the **FAQs** button below.`
                        )
                        .setFooter({ text: 'Fry Networks Ticketing System', iconURL: botClient.user.displayAvatarURL() })
                        .setTimestamp();

                    const conversionFaqButton = new ButtonBuilder()
                        .setCustomId('faq_conversion_specific')
                        .setLabel('Conversion FAQs')
                        .setStyle(ButtonStyle.Secondary);

                    const faqRow = new ActionRowBuilder().addComponents(conversionFaqButton);

                    await ticketChannel.send({ embeds: [conversionWelcomeEmbed], components: [faqRow] }).catch(err => logger.error(`Failed to send conversion welcome message to ${ticketChannel.id}`, err));

                    // Perform eligibility check
                    if (validatedData.algorandAddress) {
                        const eligibility = await supabaseHandler.checkConversionEligibility(validatedData.algorandAddress);
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

                            eligibilityMessage = `✅ **Eligibility Check:** Your Algorand address \`${validatedData.algorandAddress}\` is **eligible** for conversion.\n\n` +
                                `**Snapshot Details for this Address:**\n` +
                                `\`\`\`\n` +
                                `${breakdown}` +
                                `-----------------------------------\n` +
                                `**Total Available for Conversion: ${formatNumberWithCommas(data.total_fry_1_0_available || 0, 6)} FRY 1.0**\n` +
                                `\`\`\``;

                            const fry1Balance = await supabaseHandler.getFry1Balance(validatedData.algorandAddress);
                            const algoBalance = await supabaseHandler.getAlgoBalance(validatedData.algorandAddress);
                            const lockedAlgoBalance = await supabaseHandler.getLockedAlgoBalance(validatedData.algorandAddress);
                            const availableAlgoBalance = algoBalance - lockedAlgoBalance;

                            eligibilityMessage += `\n**Current FRY 1.0 Balance in Wallet:** \`${formatNumberWithCommas(fry1Balance, 6)}\``;

                            if (fry1Balance < data.total_fry_1_0_available) {
                                const missingAmount = (data.total_fry_1_0_available - fry1Balance);
                                eligibilityMessage += `\n\n⚠️ **Warning:** Your current FRY 1.0 balance is less than the amount you are eligible to convert.\n\nYou are missing **${formatNumberWithCommas(missingAmount, 6)} FRY 1.0**. You will need to acquire more FRY 1.0 to convert your full eligible amount.`;
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

                            /*// Check for burn transactions
                            const burnTransactions = await supabaseHandler.checkBurnTransaction(algorandAddress, data.total_fry_1_0_available);
                            if (burnTransactions.length > 0) {
                                eligibilityMessage += `\n\n🔥 **Burn Transactions Found (matching eligible amount):**\n`;
                                burnTransactions.forEach(tx => {
                                    const explorerUrl = `https://explorer.perawallet.app/tx/${tx.txID}`;
                                    eligibilityMessage += `  - Amount: ${formatNumberWithCommas(tx.amount, 6)} FRY 1.0, Pera Explorer Tx ID: [${tx.txID}](${explorerUrl})\n`;
                                });
                                eligibilityMessage += `\nIf you sent FRY 1.0 to the burn wallet, please ensure it was done via the official Fry Dashboard.`;
                            } else {
                                eligibilityMessage += `\n\nℹ️ **No Recent Matching Burn Transactions Found:** No FRY 1.0 burn transactions from this address to the official burn wallet were detected within the last 4 days that match your eligible conversion amount.`;
                            }*/

                        } else {
                            eligibilityMessage = `❌ **Eligibility Check:** Your Algorand address \`${validatedData.algorandAddress}\` is **not found** in the eligible snapshot data and is unfortunately not eligible for conversion. Please double-check your address, check if you had other wallets or provide further details below.`;
                        }
                        await ticketChannel.send({ content: eligibilityMessage }).catch(err => logger.error(`Failed to send eligibility message to ${ticketChannel.id}`, err));
                        await supabaseHandler.logBotActivity('info', 'fry_conversion_eligibility', `Ticket ${ticketId}: Eligibility check for ${validatedData.algorandAddress} - ${eligibility.eligible ? 'Eligible' : 'Not Eligible'}.`);
                    } else {
                        await ticketChannel.send({ content: '⚠️ **Eligibility Check:** No Algorand address provided. Please provide your Algorand address for an eligibility check.' }).catch(err => logger.error(`Failed to send no address message to ${ticketChannel.id}`, err));
                        await supabaseHandler.logBotActivity('warn', 'fry_conversion_eligibility', `Ticket ${ticketId}: No Algorand address provided for eligibility check.`);
                    }

                }, 3000); // 3 seconds after the welcome message
            }

        }, 5000); // 5 seconds after ticket creation

        await interaction.editReply({
            content: `✅ Your ticket **#${ticketId}** has been created! Please check <#${ticketChannel.id}>.`,
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        logger.error(`Critical error during ticket creation for ${user.id}, type ${ticketType}: ${error.message}`, error);
        await interaction.editReply({
            content: '⚠️ A critical error occurred. Please try again later or contact support.',
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * Handles the click of a "Resume Form" button.
 * This function will be called by the interactionHandler when a 'resume_ticket_' button is clicked.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @param {string} ticketType - The type of ticket to resume.
 */
async function handleResumeTicketButton(interaction, ticketType) {
    const user = interaction.user;
    const cacheKey = `${user.id}_${ticketType}`;
    const cachedFields = resumeCache.get(cacheKey);

    // Build the modal
    const modal = new ModalBuilder()
        .setCustomId(`ticket_form_${ticketType}`)
        .setTitle(`📝 Resume Ticket: ${ticketType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`);

    const fieldsForType = ticketFields[ticketType];
    if (!fieldsForType) {
        logger.error(`Cannot build resume modal: Invalid ticketType "${ticketType}"`);
        throw new Error('Invalid ticket type');
    }
    
    // Add fields to modal
    fieldsForType.forEach(fieldKey => {
        const fieldConfig = baseFields[fieldKey];
        if (fieldConfig) {
            const textInput = new TextInputBuilder(fieldConfig.toJSON());
            
            // If we have cached data, pre-fill the field
            if (cachedFields && cachedFields[fieldKey]) {
                textInput.setValue(cachedFields[fieldKey]);
            }
            
            modal.addComponents(new ActionRowBuilder().addComponents(textInput));
        } else {
            logger.warn(`Field key "${fieldKey}" for ticket type "${ticketType}" not found in baseFields.`);
        }
    });

    // Show the modal
    await interaction.showModal(modal);
    
    // Clean up cache after showing modal
    if (cachedFields) {
        resumeCache.delete(cacheKey);
        logger.info(`Cleared cache for user ${user.id} after resuming ${ticketType} ticket form`);
    }
}


module.exports = {
    handleTicketModalSubmit,
    handleResumeTicketButton, // Exporting this for interactionHandler
    resumeCache // Exporting for potential direct access or clearing by interactionHandler
};
