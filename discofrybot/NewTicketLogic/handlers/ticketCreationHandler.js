// NewTicketLogic/handlers/ticketCreationHandler.js
const {
    ChannelType, PermissionsBitField, ActionRowBuilder,
    EmbedBuilder, TextInputBuilder, MessageFlags, ButtonBuilder, ButtonStyle, ModalBuilder, RESTJSONErrorCodes // Added ModalBuilder
} = require('discord.js');
const config = require('../utils/config');
const logger = require('../utils/logger');
const { validateTicketSubmission, baseFields, ticketFields } = require('../utils/formValidator'); // Added baseFields, ticketFields
const supabaseHandler = require('./supabaseHandler');
const { getTicketActionRow, formatNumberWithCommas } = require('../utils/ticketUtils'); // Import getTicketActionRow and formatNumberWithCommas
const fryConversionHandler = require('./fryConversionHandler'); // Import the new conversion handler
const flxtimePartnersHandler = require('./flxtimePartnersHandler'); // Import the Flxtime Partners handler

const MAX_CHANNELS_PER_CATEGORY = 50;

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
        // 3. Check for existing active ticket (with channel verification)
        const existingTicket = await supabaseHandler.checkActiveTicket(user.id, interaction.client);
        if (existingTicket) {
            logger.info(`User ${user.id} attempted to open a new ticket while having an active one (${existingTicket.id}).`);
            return interaction.editReply({
                content: `⚠️ You already have an open ticket (Type: ${existingTicket.ticket_type}, Channel: <#${existingTicket.channel_id}>). Please close it before opening a new one.`,
                flags: MessageFlags.Ephemeral
            });
        }

        // 4. Ensure target category exists and has capacity before inserting ticket
        const categoryId = config.categoryIds[ticketType];
        if (!categoryId) {
            logger.error(`Misconfiguration: No categoryId found for ticketType ${ticketType}. Ticket creation aborted for user ${user.id}.`);
            return interaction.editReply({ content: '⚠️ Ticket system error: Category not found. Ticket could not be created. Please contact support.', flags: MessageFlags.Ephemeral });
        }

        const categoryChannel = guild.channels.cache.get(categoryId);
        if (!categoryChannel || categoryChannel.type !== ChannelType.GuildCategory) {
            logger.error(`Configured category ${categoryId} is missing or not a category. Ticket creation aborted for user ${user.id}.`);
            return interaction.editReply({ content: '⚠️ Ticket system error: Ticket category is unavailable. Please contact support.', flags: MessageFlags.Ephemeral });
        }

        const notifyCategoryFull = async (context) => {
            if (!config.logChannelId) {
                logger.error(`LOG_CHANNEL_ID is not configured; cannot notify admins about category capacity. Context: ${context}`);
                return;
            }

            try {
                const existingChannel = guild.channels.cache.get(config.logChannelId);
                const logChannel = existingChannel || await interaction.client.channels.fetch(config.logChannelId).catch(() => null);

                if (!logChannel || typeof logChannel.isTextBased !== 'function' || !logChannel.isTextBased()) {
                    logger.error(`Log channel ${config.logChannelId} is unavailable or not text-based. Context: ${context}`);
                    return;
                }

                await logChannel.send(`⚠️ <@&${config.ticketAdminRoleId}> Ticket category **${categoryChannel.name}** (${categoryId}) is full. Latest request from <@${user.id}> (${user.tag}) could not be opened.`);
            } catch (notifyError) {
                logger.error(`Failed to notify admins about full category ${categoryId}: ${notifyError.message}`, notifyError);
            }
        };

        const channelsInCategory = guild.channels.cache.filter(channel => channel.parentId === categoryId).size;
        if (channelsInCategory >= MAX_CHANNELS_PER_CATEGORY) {
            logger.warn(`Category ${categoryId} is at capacity (${channelsInCategory} channels). Cannot create ticket for user ${user.id}.`);
            await notifyCategoryFull('pre-check');
            return interaction.editReply({ content: '⚠️ Ticket queue is currently full. Please try again soon or ping a moderator — the team has been notified in logs.', flags: MessageFlags.Ephemeral });
        }

        // 5. Prepare and insert ticket into Supabase with "creating" status
        const ticketRecord = {
            user_id: user.id,
            discord_username: user.username,
            ticket_type: ticketType,
            status: 'creating', // Use 'creating' status initially
            full_name: validatedData.fullName || 'N/A',
            email: validatedData.email || 'N/A',
            description: validatedData.description || 'N/A',
            order_number: validatedData.orderNumber || 'N/A',
            algorand_address: validatedData.algorandAddress || 'N/A',
            minerkeys: validatedData.minerKeys || 'N/A',
            orders_quantities: validatedData.ordersQuantities || 'N/A', // Added new field
            solana_wallet_address: validatedData.solanaWalletAddress || 'N/A', // Added Solana wallet support
        };

        const newTicket = await supabaseHandler.insertTicket(ticketRecord);
        const ticketId = newTicket.id;
        logger.info(`Ticket ${ticketId} created in DB with 'creating' status for user ${user.id}.`);

        // 6. Upsert user info
        await supabaseHandler.upsertUser({
            id: user.id,
            username: user.username,
            discriminator: user.discriminator,
            avatar_url: user.displayAvatarURL({ extension: 'png', size: 256 }),
            last_seen: new Date().toISOString()
        });

        // 7. Create Discord channel
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

            let errorMessage = '⚠️ Failed to create ticket channel. Please try again or contact support.';
            const messageText = typeof channelError.message === 'string' ? channelError.message.toLowerCase() : '';

            if (
                channelError?.code === RESTJSONErrorCodes.MaximumNumberOfGuildChannelsReached ||
                channelError?.code === RESTJSONErrorCodes.TheChannelsForThisGuildAreTooLarge ||
                messageText.includes('maximum number of channels') ||
                messageText.includes('too many channels')
            ) {
                logger.warn(`Category ${categoryId} hit channel capacity when creating ticket ${ticketId}.`);
                errorMessage = '⚠️ Ticket queue is currently full. Please try again soon or ping a moderator — the team has been notified in logs.';
                await notifyCategoryFull('channel creation failure');
            }

            try {
                await supabaseHandler.deleteTicket(ticketId);
            } catch (cleanupError) {
                logger.error(`Failed to roll back ticket ${ticketId} after channel creation error: ${cleanupError.message}`, cleanupError);
            }

            return interaction.editReply({ content: errorMessage, flags: MessageFlags.Ephemeral });
        }

        // Update ticket with channel ID and mark as properly "open"
        await supabaseHandler.updateTicket(ticketId, {
            channel_id: ticketChannel.id,
            status: 'open'
        });
        logger.info(`Ticket ${ticketId} successfully opened with channel ${ticketChannel.id}`);

        // 8. Send initial embed and action buttons
        const embedFieldsData = [];
        if (validatedData.fullName) embedFieldsData.push({ name: 'Full Name', value: `\`\`\`\n${validatedData.fullName}\n\`\`\``, inline: false });
        if (validatedData.email) embedFieldsData.push({ name: 'Email', value: `\`\`\`\n${validatedData.email}\n\`\`\``, inline: false });
        if (validatedData.orderNumber && validatedData.orderNumber !== 'N/A') embedFieldsData.push({ name: 'Order Number', value: `\`\`\`\n${validatedData.orderNumber}\n\`\`\``, inline: false });
        if (validatedData.algorandAddress && validatedData.algorandAddress !== 'N/A') embedFieldsData.push({ name: 'Algorand Address', value: `\`\`\`\n${validatedData.algorandAddress}\n\`\`\``, inline: false });
        if (validatedData.solanaWalletAddress && validatedData.solanaWalletAddress !== 'N/A') embedFieldsData.push({ name: 'Solana Wallet Address', value: `\`\`\`\n${validatedData.solanaWalletAddress}\n\`\`\``, inline: false });
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
                .setFooter({ text: 'Fry Networks Helpdesk', iconURL: botClient.user.displayAvatarURL() })
                .setTimestamp();

            /*// Add a button for checking eligibility
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
            }*/

            ticketChannel.send({ embeds: [followupEmbed] }).catch(err => logger.error(`Failed to send followup message to ${ticketChannel.id}`, err));

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
                            `Vesting begins from August 1st, 2025. You'll unlock 1/12th of your chosen token allocation every month.\n\n` +
                            `**Important:** You must opt into the FRY 2.0 asset (ID: ${config.ASSET_ID_FRY2}) or fNode asset (ID: ${config.ASSET_ID_FNODE}) to receive your converted tokens. Only FRY 1.0 earned *before* Dec 1st, 2024, and held at the snapshot date/time is eligible. Rewards earned since Dec 1st are not included.\n\n` +
                            `For more details, please click the **FAQs** button below.`
                        )
                        .setFooter({ text: 'Fry Networks Conversion Bot', iconURL: botClient.user.displayAvatarURL() })
                        .setTimestamp();

                    // Prepare eligibility details if Algorand address is provided
                    let eligibilityDetails = '';
                    if (validatedData.algorandAddress && validatedData.algorandAddress !== 'N/A') {
                        try {
                            const eligibility = await supabaseHandler.checkConversionEligibility(validatedData.algorandAddress);
                            if (eligibility.eligible && eligibility.data) {
                                const data = eligibility.data;
                                const eligibleAmount = data.amount ?? 0;
                                const fry1Balance = await supabaseHandler.getFry1Balance(validatedData.algorandAddress);
                                const algoBalance = await supabaseHandler.getAlgoBalance(validatedData.algorandAddress);
                                const lockedAlgoBalance = await supabaseHandler.getLockedAlgoBalance(validatedData.algorandAddress);
                                const availableAlgoBalance = algoBalance - lockedAlgoBalance;

                                // Check for burn transactions over a longer window and ignore small PoC txs by minAmount
                                let hasBurned = false;
                                try {
                                    const burnTxs = await supabaseHandler.checkBurnTransaction(
                                        validatedData.algorandAddress,
                                        eligibleAmount,
                                        config.BURN_TX_LOOKBACK_DAYS || 180,
                                        config.BURN_TX_MIN_AMOUNT || 100
                                    );
                                    hasBurned = Array.isArray(burnTxs) && burnTxs.length > 0;
                                } catch (btErr) {
                                    logger.warn(`Burn transaction detection failed for ${validatedData.algorandAddress}: ${btErr.message}`);
                                }
                                // If the user has burned FRY 1.0, we don't need to check their current balance
                                // Build a snapshot + warnings block that matches the canonical output in fryConversionHandler
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

                                const snapshotContent = `✅ **Eligibility Check for \`${validatedData.algorandAddress}\`:**\n\n` +
                                    `**Snapshot Details:**\n` +
                                    `\`\`\`\n` +
                                    `${breakdown}` +
                                    `-----------------------------------\n` +
                                    `**Total Available for Conversion: ${formatNumberWithCommas(totalAvailable, 6)} FRY 1.0**\n` +
                                    `-----------------------------------\n\n` +
                                    `Current FRY 1.0 Balance in Wallet: ${formatNumberWithCommas(fry1Balance, 6)}\n` +
                                    `Current ALGO Balance in Wallet: ${formatNumberWithCommas(algoBalance, 3)}\n` +
                                    `Locked ALGO Balance: ${formatNumberWithCommas(lockedAlgoBalance, 3)}\n` +
                                    `Available ALGO Balance for Transactions: ${formatNumberWithCommas(availableAlgoBalance, 3)}\n` +
                                    `\`\`\``;

                                // Build balances block BEFORE warnings, same as fryConversionHandler
                                // const balancesBlock =
                                    

                                // Build warnings after balances
                                let warnings = '';
                                if (!hasBurned) {
                                    if (fry1Balance < totalAvailable) {
                                        const missingAmount = (totalAvailable - fry1Balance);
                                        warnings += `⚠️ **WARNING! FRY 1.0 Balance Notice:** Your current FRY 1.0 balance is less than the amount you are eligible to convert. You are missing **${formatNumberWithCommas(missingAmount, 6)} FRY 1.0**.\n`;
                                    } else {
                                        warnings += `✅ **FRY 1.0 Balance:** Your FRY 1.0 balance is sufficient to convert your full eligible amount.\n`;
                                    }
                                } else {
                                    warnings += `✅ **FRY 1.0 Sent:** FRY 1.0 was previously sent to the burn wallet (conversion initiated), so your current on-wallet FRY balance does not need to be present.\n`;
                                }

                                if (availableAlgoBalance < config.MIN_ALGO_BALANCE_FOR_TX) {
                                    warnings += `\n⚠️ **WARNING! ALGO Balance Notice:** Your available ALGO balance is below the recommended minimum of ${config.MIN_ALGO_BALANCE_FOR_TX} ALGO. You will need sufficient ALGO to cover transaction fees for conversion and future Proof of Connectivity (PoC) checks.`;
                                } else {
                                    warnings += `\n✅ **ALGO Balance:** Your available ALGO balance is sufficient for transaction fees.`;
                                }

                                eligibilityDetails = `\n\n${snapshotContent}\n`;
                                await supabaseHandler.logBotActivity('info', 'fry_conversion_auto_eligibility_details', `Ticket ${ticketId}: Auto-displayed eligibility details for ${validatedData.algorandAddress}. burned=${hasBurned}`);
                            } else {
                                eligibilityDetails = `\n\n⚠️ **Eligibility Note:** Your Algorand address \`${validatedData.algorandAddress}\` was not found in the eligible snapshot data or is not eligible for conversion.`;
                                await supabaseHandler.logBotActivity('warn', 'fry_conversion_auto_eligibility_details', `Ticket ${ticketId}: Auto-displayed eligibility details (not eligible) for ${validatedData.algorandAddress}.`);
                            }
                        } catch (error) {
                            logger.error(`Error fetching auto-eligibility details for ticket ${ticketId}: ${error.message}`, error);
                            eligibilityDetails = `\n\n⚠️ **Eligibility Note:** An error occurred while fetching your eligibility details. Please use the "Check Eligibility" button for a manual check.`;
                        }
                    } else {
                        eligibilityDetails = `\n\n⚠️ **Eligibility Note:** No Algorand address was provided in your ticket submission. Please use the "Check Eligibility" button to provide your address and view your status.`;
                    }

                    // Append eligibility details to the welcome embed description
                    conversionWelcomeEmbed.setDescription(conversionWelcomeEmbed.data.description + eligibilityDetails);
                    await ticketChannel.send({ embeds: [conversionWelcomeEmbed] }).catch(err => logger.error(`Failed to send conversion welcome message to ${ticketChannel.id}`, err));

                    let lowBalanceWarningMessage = ''; // Initialize warning message

                    // Prepare eligibility details if Algorand address is provided
                    if (validatedData.algorandAddress && validatedData.algorandAddress !== 'N/A') {
                        try {
                            const eligibility = await supabaseHandler.checkConversionEligibility(validatedData.algorandAddress);
                            if (eligibility.eligible && eligibility.data) {
                                const data = eligibility.data;
                                const eligibleAmount = data.amount ?? 0;
                                const fry1Balance = await supabaseHandler.getFry1Balance(validatedData.algorandAddress);
                                const algoBalance = await supabaseHandler.getAlgoBalance(validatedData.algorandAddress);
                                const lockedAlgoBalance = await supabaseHandler.getLockedAlgoBalance(validatedData.algorandAddress);
                                const availableAlgoBalance = algoBalance - lockedAlgoBalance;

                                let hasBurned = false;
                                try {
                                    const burnTxs = await supabaseHandler.checkBurnTransaction(
                                        validatedData.algorandAddress,
                                        eligibleAmount,
                                        config.BURN_TX_LOOKBACK_DAYS || 180,
                                        config.BURN_TX_MIN_AMOUNT || 100
                                    );
                                    hasBurned = Array.isArray(burnTxs) && burnTxs.length > 0;
                                } catch (btErr) {
                                    logger.warn(`Burn transaction detection failed for ${validatedData.algorandAddress}: ${btErr.message}`);
                                }

                                // Build warnings
                                let warnings = '';
                                if (!hasBurned) {
                                    if (fry1Balance < eligibleAmount) {
                                        const missingAmount = (eligibleAmount - fry1Balance);
                                        warnings += `⚠️ **WARNING! FRY 1.0 Balance Notice:** Your current FRY 1.0 balance is less than the amount you are eligible to convert. You are missing **${formatNumberWithCommas(missingAmount, 6)} FRY 1.0**.\n`;
                                    } else {
                                        warnings += `✅ **FRY 1.0 Balance:** Your FRY 1.0 balance is sufficient to convert your full eligible amount.\n`;
                                    }
                                } else {
                                    warnings += `✅ **FRY 1.0 Sent:** FRY 1.0 was previously sent to the burn wallet (conversion initiated), so your current on-wallet FRY balance does not need to be present.\n`;
                                }

                                if (availableAlgoBalance < config.MIN_ALGO_BALANCE_FOR_TX) {
                                    warnings += `\n⚠️ **WARNING! ALGO Balance Notice:** Your available ALGO balance is below the recommended minimum of ${config.MIN_ALGO_BALANCE_FOR_TX} ALGO. You will need sufficient ALGO to cover transaction fees for conversion and future Proof of Connectivity (PoC) checks.`;
                                } else {
                                    warnings += `\n✅ **ALGO Balance:** Your available ALGO balance is sufficient for transaction fees.`;
                                }
                                lowBalanceWarningMessage = warnings; // Store the warnings for separate message
                                await supabaseHandler.logBotActivity('info', 'fry_conversion_auto_eligibility_details', `Ticket ${ticketId}: Auto-displayed eligibility details for ${validatedData.algorandAddress}. burned=${hasBurned}`);
                            } else {
                                lowBalanceWarningMessage = `⚠️ **Eligibility Note:** Your Algorand address \`${validatedData.algorandAddress}\` was not found in the eligible snapshot data or is not eligible for conversion.`;
                                await supabaseHandler.logBotActivity('warn', 'fry_conversion_auto_eligibility_details', `Ticket ${ticketId}: Auto-displayed eligibility details (not eligible) for ${validatedData.algorandAddress}.`);
                            }
                        } catch (error) {
                            logger.error(`Error fetching auto-eligibility details for ticket ${ticketId}: ${error.message}`, error);
                            lowBalanceWarningMessage = `⚠️ **Eligibility Note:** An error occurred while fetching your eligibility details. Please use the "Check Eligibility" button for a manual check.`;
                        }
                    } else {
                        lowBalanceWarningMessage = `⚠️ **Eligibility Note:** No Algorand address was provided in your ticket submission. Please use the "Check Eligibility" button to provide your address and view your status.`;
                    }

                    // Use the new automated conversion status detection
                    if (validatedData.algorandAddress) {
                        try {
                            const { statusMessage, buttonComponents, progressData } = await fryConversionHandler.getConversionStatusAndButtons(validatedData.algorandAddress, ticketId, user.id);
                            
                            // Build an embed to match fryConversionHandler's status output
                            const formatDateObjUtc = (d) => {
                                if (!d) return 'Unknown';
                                const yyyy = d.getUTCFullYear();
                                const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
                                const dd = String(d.getUTCDate()).padStart(2, '0');
                                const HH = String(d.getUTCHours()).padStart(2, '0');
                                const MM = String(d.getUTCMinutes()).padStart(2, '0');
                                return `${yyyy}-${mm}-${dd} ${HH}:${MM} UTC`;
                            };

                            const statusEmbed = new EmbedBuilder()
                                .setColor(0x5865F2)
                                .setDescription(statusMessage);

                            if (progressData && progressData.vestingStatus && progressData.vestingStatus.nextClaimDate) {
                                const nextDate = progressData.vestingStatus.nextClaimDate;
                                const nextDateObj = nextDate instanceof Date ? nextDate : new Date(nextDate);
                                const now = new Date();
                                const msDiff = nextDateObj.getTime() - now.getTime();
                                const daysLeft = msDiff > 0 ? Math.ceil(msDiff / (1000 * 60 * 60 * 24)) : 0;
                                const nextDateStr = formatDateObjUtc(nextDateObj);

                                statusEmbed.addFields(
                                    { name: 'Next claim', value: `${nextDateStr} (${daysLeft} day${daysLeft === 1 ? '' : 's'} left)`, inline: false }
                                );
                            }

                            // Send embed for status
                            // await ticketChannel.send({ embeds: [statusEmbed] }).catch(err => logger.error(`Failed to send conversion status embed to ${ticketChannel.id}`, err));
                            
                            // Build static buttons (we'll merge these with any handler-provided buttons and dedupe by customId)
                            const eligibilityCidStatic = `check_eligibility:${ticketId}`;
                            const checkBurnCidStatic = `check_burn_tx:${ticketId}`;
                            const checkStatusCidStatic = `check_conversion_status:${ticketId}`;
                            const faqCidStatic = 'faq_conversion_specific';

                            const eligibilityButtonStatic = new ButtonBuilder()
                                .setCustomId(eligibilityCidStatic)
                                .setLabel('Check Eligibility')
                                .setStyle(ButtonStyle.Primary);

                            const checkBurnTxButtonStatic = new ButtonBuilder()
                                .setCustomId(checkBurnCidStatic)
                                .setLabel('Check Burn TX')
                                .setStyle(ButtonStyle.Secondary);

                            const checkStatusButtonStatic = new ButtonBuilder()
                                .setCustomId(checkStatusCidStatic)
                                .setLabel('Check Conversion Status')
                                .setStyle(ButtonStyle.Primary);

                            const conversionFaqButtonStatic = new ButtonBuilder()
                                .setCustomId(faqCidStatic)
                                .setLabel('Conversion FAQs')
                                .setStyle(ButtonStyle.Secondary);

                            // Merge handler-provided buttonComponents (if any) with static buttons, deduping by customId
                            const mergedComponents = [];
                            const existingIds = new Set();

                            if (buttonComponents && buttonComponents.length > 0) {
                                for (const row of buttonComponents) {
                                    try {
                                        const comps = row.components || row.data?.components || [];
                                        for (const comp of comps) {
                                            const cid = comp.customId || comp.custom_id || comp.data?.custom_id;
                                            if (cid) existingIds.add(cid);
                                        }
                                    } catch (e) {
                                        // ignore extraction errors
                                    }
                                    mergedComponents.push(row);
                                }
                            }

                            // Add static action row if any static buttons are not duplicates
                            const staticRow = new ActionRowBuilder();
                            if (!existingIds.has(eligibilityCidStatic)) staticRow.addComponents(eligibilityButtonStatic);
                            if (!existingIds.has(checkBurnCidStatic)) staticRow.addComponents(checkBurnTxButtonStatic);
                            if (!existingIds.has(checkStatusCidStatic)) staticRow.addComponents(checkStatusButtonStatic);

                            if (staticRow.components && staticRow.components.length > 0) {
                                mergedComponents.push(staticRow);
                            }

                            // Always add FAQ as its own row unless duplicate
                            if (!existingIds.has(faqCidStatic)) {
                                const faqRowStatic = new ActionRowBuilder().addComponents(conversionFaqButtonStatic);
                                mergedComponents.push(faqRowStatic);
                            }

                            // Defer sending actions/status until after staff-notify logic below.
                            // If an unregistered burn is detected, notify staff first (embed + ping), then send the user-facing plain message
                            // and finally the action buttons. If no unregistered burn, behave as before.
                            try {
                                if (progressData && progressData.hasUnregisteredBurn) {
                                    // Build staff embed with explorer links
                                    const txLines = (progressData.unregisteredBurnTxs || []).map(tx => {
                                        const txDate = tx.timestamp ? new Date(tx.timestamp * 1000) : null;
                                        const dateStr = txDate ? `${txDate.getUTCFullYear()}-${String(txDate.getUTCMonth()+1).padStart(2,'0')}-${String(txDate.getUTCDate()).padStart(2,'0')} ${String(txDate.getUTCHours()).padStart(2,'0')}:${String(txDate.getUTCMinutes()).padStart(2,'0')} UTC` : 'Unknown';
                                        return `• ${tx.txID} — ${formatNumberWithCommas(tx.amount, 6)} FRY 1.0 — ${dateStr}\n[View TX](https://explorer.perawallet.app/tx/${tx.txID})`;
                                    }).join('\n') || 'No TX details available.';

                                    const staffEmbed = new EmbedBuilder()
                                        .setTitle('🔥 Unregistered Burn Detected')
                                        .setColor(0xFF4500)
                                        .addFields(
                                            { name: 'Address', value: `\`${validatedData.algorandAddress}\``, inline: false },
                                            { name: 'Eligible Amount', value: `${progressData.mirrorData?.amount ?? 'Unknown'} FRY 1.0`, inline: true },
                                            { name: 'Database Status', value: `${progressData.mirrorData?.status ?? 'not found'} - Please reconcile the conversions database collection and update as needed.`, inline: true },
                                            { name: 'Detected TXs (links below)', value: txLines, inline: false }
                                        )
                                        .setFooter({ text: `Ticket ${ticketId}` });

                                    // Ping admins in content so role mention notifies, include embed for details
                                    await ticketChannel.send({ content: `<@&${config.ticketAdminRoleId}>`, embeds: [staffEmbed] })
                                        .catch(err => logger.error(`Failed to send staff ping to channel ${ticketChannel.id} for ticket ${ticketId}: ${err.message}`, err));

                                    await supabaseHandler.logBotActivity('warn', 'fry_conversion_unregistered_burn', `Ticket ${ticketId}: Unregistered burn detected for ${validatedData.algorandAddress}. txs=${(progressData.unregisteredBurnTxs || []).map(t => t.txID).join(',')}`);

                                  /* // Now send the user-facing message as plain content so the mention pings are noticed,
                                    // then send the action buttons underneath.
                                    try {
                                        await ticketChannel.send({ content: statusMessage }).catch(err => logger.error(`Failed to send user status message to ${ticketChannel.id} for ticket ${ticketId}: ${err.message}`, err));
                                        if (mergedComponents.length > 0) {
                                            await ticketChannel.send({
                                                content: '**Conversion Actions:**',
                                                components: mergedComponents
                                            }).catch(err => logger.error(`Failed to send conversion buttons to ${ticketChannel.id}`, err));
                                        }
                                    } catch (userSendErr) {
                                        logger.error(`Failed to send user-facing status or actions for ticket ${ticketId}: ${userSendErr.message}`, userSendErr);
                                    }
                                } else {
                                    // No unregistered burn -> send full status embed and action buttons as before
                                    await ticketChannel.send({ embeds: [statusEmbed] }).catch(err => logger.error(`Failed to send conversion status embed to ${ticketChannel.id}`, err));
                                    if (mergedComponents.length > 0) {
                                        await ticketChannel.send({
                                            content: '**Conversion Actions:**',
                                            components: mergedComponents
                                        }).catch(err => logger.error(`Failed to send conversion buttons to ${ticketChannel.id}`, err));
                                    }
                                }*/
                                    // Send user-facing message as plain content (for ping)
                                    await ticketChannel.send({ content: statusMessage }).catch(err => logger.error(`Failed to send user status message to ${ticketChannel.id} for ticket ${ticketId}: ${err.message}`, err));
                                } else {
                                    // Send user-facing message as embed
                                    await ticketChannel.send({ embeds: [statusEmbed] }).catch(err => logger.error(`Failed to send conversion status embed to ${ticketChannel.id}`, err));
                                }

                                // Send conversion actions if there are any merged components
                                if (mergedComponents.length > 0) {
                                    await ticketChannel.send({
                                        content: '**Conversion Actions:**',
                                        components: mergedComponents
                                    }).catch(err => logger.error(`Failed to send conversion buttons to ${ticketChannel.id}`, err));
                                }                               
                                //***************************//
                            } catch (notifyErr) {
                                logger.error(`Failed to handle staff/user notification for ticket ${ticketId}, address ${validatedData.algorandAddress}: ${notifyErr.message}`, notifyErr);
                            }
                                                                                    
                            await supabaseHandler.logBotActivity('info', 'fry_conversion_auto_status', `Ticket ${ticketId}: Automated conversion status check for ${validatedData.algorandAddress}.`);
                        } catch (error) {
                            logger.error(`Error during automated conversion status check for ticket ${ticketId}: ${error.message}`, error);
                            await ticketChannel.send({ content: '⚠️ **Error:** Unable to automatically check conversion status. Please use the manual check buttons above.' }).catch(err => logger.error(`Failed to send error message to ${ticketChannel.id}`, err));
                        }
                    } else {
                        // No address provided: send static conversion buttons once
                        const eligibilityCidStatic = `check_eligibility:${ticketId}`;
                        const checkBurnCidStatic = `check_burn_tx:${ticketId}`;
                        const checkStatusCidStatic = `check_conversion_status:${ticketId}`;
                        const faqCidStatic = 'faq_conversion_specific';

                        const eligibilityButtonStatic = new ButtonBuilder()
                            .setCustomId(eligibilityCidStatic)
                            .setLabel('Check Eligibility')
                            .setStyle(ButtonStyle.Primary);

                        const checkBurnTxButtonStatic = new ButtonBuilder()
                            .setCustomId(checkBurnCidStatic)
                            .setLabel('Check Burn TX')
                            .setStyle(ButtonStyle.Secondary);

                        const checkStatusButtonStatic = new ButtonBuilder()
                            .setCustomId(checkStatusCidStatic)
                            .setLabel('Check Conversion Status')
                            .setStyle(ButtonStyle.Primary);

                        const conversionFaqButtonStatic = new ButtonBuilder()
                            .setCustomId(faqCidStatic)
                            .setLabel('Conversion FAQs')
                            .setStyle(ButtonStyle.Secondary);

                        const staticRow = new ActionRowBuilder().addComponents(eligibilityButtonStatic, checkBurnTxButtonStatic, checkStatusButtonStatic);
                        const faqRowStatic = new ActionRowBuilder().addComponents(conversionFaqButtonStatic);

                        await ticketChannel.send({
                            content: '**Conversion Actions:**',
                            components: [staticRow, faqRowStatic]
                        }).catch(err => logger.error(`Failed to send conversion buttons (no address) to ${ticketChannel.id}`, err));

                        await supabaseHandler.logBotActivity('warn', 'fry_conversion_auto_status', `Ticket ${ticketId}: No Algorand address provided for automated status check.`);
                    }

                    // Send the low balance warning as a separate message if it contains a warning
                    if (lowBalanceWarningMessage.includes('⚠️')) {
                        await ticketChannel.send({ content: `<@${user.id}> ${lowBalanceWarningMessage}` }).catch(err => logger.error(`Failed to send low balance warning to ${ticketChannel.id}`, err));
                    }

                }, 3000); // 3 seconds after the welcome message
            } else if (ticketType === 'flxtime_partners_support') {
                setTimeout(async () => {
                    try {
                        await flxtimePartnersHandler.sendFlxtimePartnersWelcomeMessage(ticketChannel, user, validatedData);
                        logger.info(`Flxtime Partners welcome message sent for ticket ${ticketId}`);

                        // Check for duplicate AEM key issuance
                        const keyHistory = await supabaseHandler.checkFlxtimeKeyHistory(user.id);
                        if (keyHistory.hasKey) {
                            logger.warn(`Duplicate AEM key attempt detected for user ${user.id}: already has key from ticket ${keyHistory.previousTicket.id}`);
                            
                            // Update current ticket to mark validation as false for duplicate attempt
                            await supabaseHandler.updateTicket(ticketId, {
                                flxtime_validated: false // Ensure validation is false
                            });

                            // Format previous issuance date
                            const issuedDate = new Date(keyHistory.previousTicket.issuedAt);
                            const formattedDate = issuedDate.toLocaleDateString() + ' ' + issuedDate.toLocaleTimeString();
                            
                            // Send duplicate detection message to user
                            const duplicateEmbed = new EmbedBuilder()
                                .setTitle('🚫 Duplicate AEM Key Request Detected')
                                .setDescription('Our system has detected that you have already received an AEM key from a previous Flxtime Partners ticket.')
                                .addFields(
                                    {
                                        name: '📋 Previous Key Details',
                                        value: `**Ticket ID:** ${keyHistory.previousTicket.id}\n**AEM Key:** \`${keyHistory.previousTicket.keyIssued}\`\n**Issued Date:** ${formattedDate}\n**Issued By:** ${keyHistory.previousTicket.issuedBy}`,
                                        inline: false
                                    },
                                    {
                                        name: '⚠️ Important Notice',
                                        value: 'Each user is only eligible for **one AEM key** through the Flxtime Partners program. This ticket will be reviewed by our admin team, but no additional key will be issued.',
                                        inline: false
                                    },
                                    {
                                        name: '💡 If You Have Questions',
                                        value: 'If you believe this is an error or have questions about your existing key, please explain your situation in this ticket and our admin team will review it.',
                                        inline: false
                                    }
                                )
                                .setColor(0xFF6B6B) // Red color for error/warning
                                .setFooter({ text: 'Fry Networks × Flxtime Partnership - Duplicate Prevention System' })
                                .setTimestamp();

                            await ticketChannel.send({ embeds: [duplicateEmbed] });

                            // Ping ticket admin role with details
                            const adminPingEmbed = new EmbedBuilder()
                                .setTitle('🔒 Duplicate AEM Key Attempt - Admin Review Required')
                                .setDescription(`<@&${config.ticketAdminRoleId}> - User ${user.tag} (${user.id}) attempted to request a second AEM key.`)
                                .addFields(
                                    {
                                        name: '🎫 Current Ticket',
                                        value: `**ID:** ${ticketId}\n**Channel:** <#${ticketChannel.id}>\n**User:** <@${user.id}>`,
                                        inline: true
                                    },
                                    {
                                        name: '📊 Previous Key Issuance',
                                        value: `**Previous Ticket:** ${keyHistory.previousTicket.id}\n**Key:** \`${keyHistory.previousTicket.keyIssued}\`\n**Issued:** ${formattedDate}\n**By:** ${keyHistory.previousTicket.issuedBy}`,
                                        inline: true
                                    },
                                    {
                                        name: '⚠️ Action Required',
                                        value: 'Please review this ticket. The **Validate Flxtime Partner** and **Issue AEM Key** buttons are disabled for this ticket to prevent duplicate issuance.',
                                        inline: false
                                    }
                                )
                                .setColor(0xFF6B6B)
                                .setFooter({ text: 'Duplicate Prevention System' })
                                .setTimestamp();

                            await ticketChannel.send({ embeds: [adminPingEmbed] });

                            // Log the duplicate attempt
                            await supabaseHandler.logBotActivity('warn', 'flxtime_duplicate_key', `User ${user.id} attempted duplicate AEM key request. Previous key issued in ticket ${keyHistory.previousTicket.id}.`);
                            
                            // Update staff action buttons to reflect duplicate detection
                            const currentTicket = await supabaseHandler.getTicketById(ticketId);
                            if (currentTicket?.original_message_id) {
                                try {
                                    const actionRows = getTicketActionRow(currentTicket);
                                    const originalMessage = await ticketChannel.messages.fetch(currentTicket.original_message_id);
                                    await originalMessage.edit({
                                        content: 'Staff Actions:',
                                        components: actionRows
                                    });
                                    logger.info(`Updated staff action buttons for duplicate key ticket ${ticketId}`);
                                } catch (buttonError) {
                                    logger.error(`Failed to update action buttons for duplicate key ticket ${ticketId}: ${buttonError.message}`, buttonError);
                                }
                            }
                        }
                    } catch (error) {
                        logger.error(`Failed to send Flxtime Partners welcome message for ticket ${ticketId}: ${error.message}`, error);
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
