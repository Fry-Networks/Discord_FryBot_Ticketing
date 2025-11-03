// NewTicketLogic/handlers/interactionHandler.js
const { Events, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder, ModalBuilder, MessageFlags, TextInputBuilder, TextInputStyle } = require('discord.js'); // Added TextInputBuilder, TextInputStyle
const config = require('../utils/config');
const logger = require('../utils/logger');
const { baseFields, ticketFields } = require('../utils/formValidator');
const { handleTicketModalSubmit, handleResumeTicketButton } = require('./ticketCreationHandler');
const supabase = require('../supabaseClient');
const { getTicketActionRow, formatNumberWithCommas } = require('../utils/ticketUtils'); // Import from utility file
const supabaseHandler = require('../handlers/supabaseHandler'); // To be imported
const { handleFaqInteraction } = require('../modules/faqHandler');
const slashCommands = require('../commands/slashCommands'); // Import the new slash commands
const fryConversionHandler = require('./fryConversionHandler'); // Import the new fry conversion handler

// Placeholder for claim, close, schedule handlers - to be imported when ready
const claimHandler = require('../modules/claimHandler');
const closeHandler = require('../modules/closeHandler');
const scheduleHandler = require('../modules/scheduleHandler');
const { handleDeleteNowButton } = require('../modules/closeHandler'); // Import the new handler
const { handleValidateButton } = require('./validateHandler'); // Import the new validate handler
const { handleUnvalidateButton } = require('./validateHandler'); // Import the new unvalidate handler
const { handleWaiveRegistrationButton, handleWaiveRegistrationConfirmation } = require('./waiveRegistrationHandler'); // Import the new handler
const issueCouponHandler = require('./issueCouponHandler'); // Import the new issue coupon handler
const { handleConfirmSnPicture, handleConfirmFactoryResetPicture } = require('./confirmPicturesReturn'); // Import the new picture confirmation handler
const {sendNodeForgoReturnInstructions} = require('./nodeForgoReturnHandler'); // Import the new node forgo/return handler
const flxtimePartnersHandler = require('./flxtimePartnersHandler'); // Import the new Flxtime Partners handler
let discordClient; // Declare module-level variable to store the client

// Define approved and disallowed regions for returns
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
 * Initializes all interaction handlers for the Discord client.
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
function initializeInteractionHandlers(client) {
    discordClient = client; // Store the client

    client.on(Events.InteractionCreate, async (interaction) => {
        try {
            if (interaction.isChatInputCommand()) {
                await handleSlashCommand(interaction);
            } else if (interaction.isStringSelectMenu()) {
                await handleSelectMenu(interaction);
            } else if (interaction.isModalSubmit()) {
                await handleModalSubmit(interaction);
            } else if (interaction.isButton()) {
                await handleButton(interaction); // No longer passing client here
            }
            // Other interaction types (e.g., UserContextMenuCommand, MessageContextMenuCommand) can be added here
        } catch (error) {
            logger.error(`Unhandled error in interaction handler for ${interaction.type} (${interaction.customId || interaction.commandName}): ${error.message}`, error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: '⚠️ An unexpected error occurred. Please try again later.', flags: MessageFlags.Ephemeral }).catch(e => logger.error('Failed to send followup error message', e));
            } else {
                await interaction.reply({ content: '⚠️ An unexpected error occurred. Please try again later.', flags: MessageFlags.Ephemeral }).catch(e => logger.error('Failed to send reply error message', e));
            }
        }
    });
    logger.info('Interaction handlers initialized.');
}

async function handleSlashCommand(interaction) {
    const { commandName } = interaction;

    // Find the command in the imported slashCommands array
    const command = slashCommands.find(cmd => cmd.data.name === commandName);

    if (!command) {
        logger.warn(`Unknown slash command received: ${commandName}`);
        return interaction.reply({ content: '⚠️ Unknown command.', flags: MessageFlags.Ephemeral });
    }

    // Execute the command's logic
    try {
        // Special handling for 'setup-ticket-panel' command's execute logic
        if (commandName === config.ticketPanelCommand) {
            if (!interaction.member.roles.cache.has(config.ticketModRoleId)) { // Use ticketModRoleId from config
                return interaction.reply({
                    content: '❌ You do not have permission to use this command.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const channel = interaction.options.getChannel('channel');
            if (!channel || channel.type !== ChannelType.GuildText) {
                return interaction.reply({
                    content: '❌ Please specify a valid text channel.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const panelEmbed = new EmbedBuilder()
                .setTitle('📩 Need Assistance? Create a Ticket! 📩')
                .setDescription('Please select the category that best fits your issue from the dropdown menu below. This will help us route your request to the correct team efficiently.')
                .setColor(0x5865F2) // Discord Blue
                .setFooter({ text: `${interaction.guild.name} Ticketing System` });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('ticket_type_select') // Changed from 'ticket_type' to be more specific
                .setPlaceholder('Select a ticket category...')
                .addOptions([
                    { label: '🚚 Order Issues', value: 'order_tracking', description: 'For issues related to orders, shipping, etc.' },
                    { label: '🔄 Node Forgo/Return', value: 'node_forgo_return', description: 'For issues related to forgoing or returning nodes.' },
                    { label: '♻️ Fry Conversion Issues', value: 'fry_conversion_issues', description: 'Issues related to the FRY 1.0 conversion.' },
                    { label: '🤝 Flxtime Partners Support', value: 'flxtime_partners_support', description: 'Support for verified Flxtime Flexer members.' },
                    { label: '✍️ Registration', value: 'registration', description: 'Problems with account registration or setup.' },
                    { label: '🔑 Miner Keys', value: 'miner_keys', description: 'Issues with miner keys or access.' },
                    { label: '💰 Rewards', value: 'rewards', description: 'Questions or problems regarding rewards.' },
                    { label: '🛠️ Tech Support', value: 'tech_support', description: 'General technical assistance.' }
                ]);
            
            const row = new ActionRowBuilder().addComponents(selectMenu);
            
            try {
                await channel.send({ embeds: [panelEmbed], components: [row] });
                await interaction.reply({ content: `✅ Ticket panel successfully posted in ${channel}.`, flags: MessageFlags.Ephemeral });
            } catch (error) {
                logger.error(`Failed to send ticket panel to channel ${channel.id}: ${error.message}`, error);
                await interaction.reply({ content: '⚠️ Could not post the ticket panel. Please check bot permissions for that channel.', flags: MessageFlags.Ephemeral });
            }
        } else {
            // For other commands, execute their defined execute function
            await command.execute(interaction);
        }
    } catch (error) {
        logger.error(`Error executing slash command ${commandName}: ${error.message}`, error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: '⚠️ An unexpected error occurred while executing this command.', flags: MessageFlags.Ephemeral }).catch(e => logger.error('Failed to send followup error message', e));
        } else {
            await interaction.reply({ content: '⚠️ An unexpected error occurred while executing this command.', flags: MessageFlags.Ephemeral }).catch(e => logger.error('Failed to send reply error message', e));
        }
    }
}

async function handleSelectMenu(interaction) {
    if (interaction.customId === 'ticket_type_select') {
        const ticketType = interaction.values[0];
        const fieldsForType = ticketFields[ticketType];

        if (!fieldsForType) {
            logger.warn(`Invalid ticket type "${ticketType}" selected by user ${interaction.user.id}.`);
            return interaction.reply({ content: '⚠️ Invalid ticket type selected. Please try again.', flags: MessageFlags.Ephemeral });
        }

        const modal = new ModalBuilder()
            .setCustomId(`ticket_form_${ticketType}`)
            .setTitle(`📝 Submit Ticket: ${ticketType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`);

        fieldsForType.forEach(fieldKey => {
            const fieldConfig = baseFields[fieldKey];
            if (fieldConfig) {
                const textInput = new TextInputBuilder(fieldConfig.toJSON());

                // Special handling for minerkeys in fry_conversion_issues
                if (ticketType === 'fry_conversion_issues' && fieldKey === 'minerkeys') {
                    textInput.setRequired(false);
                    textInput.setPlaceholder('e.g., IRM-A1BJD26E2FSO2F337SQ3BEF4DRAAWPE3 (Optional)');
                }
                modal.addComponents(new ActionRowBuilder().addComponents(textInput));
            } else {
                logger.warn(`Field key "${fieldKey}" for ticket type "${ticketType}" not found in baseFields during modal creation.`);
            }
        });
        
        try {
            await interaction.showModal(modal);
        } catch (modalError) {
            logger.error(`Error showing modal for ${interaction.user.id}, type ${ticketType}: ${modalError.message}`, modalError);
            // interaction.reply might fail if showModal already did something to the interaction state
             if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '⚠️ Could not display the form. Please try selecting the ticket type again.', flags: MessageFlags.Ephemeral });
            } else {
                // If already replied/deferred (e.g. showModal failed late), try followup
                await interaction.followUp({ content: '⚠️ Could not display the form. Please try selecting the ticket type again.', flags: MessageFlags.Ephemeral }).catch(()=>{});
            }
        }
    } else if (interaction.customId.startsWith('schedule_close_timer_select_')) {
        await scheduleHandler.handleScheduleTimerSelect(interaction);
    } else if (interaction.customId.startsWith('select_region_return:')) {
        const [_, ticketId] = interaction.customId.split(':');
        const selectedRegion = interaction.values[0];

        try {
            // Save the selected region to the database
            await supabaseHandler.updateTicket(ticketId, { selected_region: selectedRegion });
            logger.info(`Ticket ${ticketId} selected region set to ${selectedRegion} by user ${interaction.user.id}`);

            // Fetch ticket data to get the channel ID
            const ticket = await supabaseHandler.getTicketById(ticketId);
            if (!ticket || !ticket.channel_id) {
                logger.error(`Ticket ${ticketId} not found or missing channel_id during region select.`);
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

            await interaction.update({ components: [] }); // Remove the region select menu

            const docSignedButton = new ButtonBuilder()
                .setCustomId(`doc_signed:${ticketId}`)
                .setLabel('✍️  I have signed the form')
                .setStyle(ButtonStyle.Success);

            const docSignedRow = new ActionRowBuilder().addComponents(docSignedButton);

            let sentMessageIds = []; // Array to store message IDs sent in this flow

            if (APPROVED_RETURN_REGIONS.includes(selectedRegion)) {
                // Region is approved, proceed with return instructions
                const boldSignEmbed = new EmbedBuilder()
                    .setTitle(`✍️ BoldSign Form for Node Return Request`)
                    .setDescription(`Thank you for confirming your region as **${selectedRegion}**. Your region is approved for returns.\n\nPlease complete the required form via the link below.`)
                    .addFields(
                        { name: 'Form Link', value: '[BoldSign Form](https://app.boldsign.com/document/sign-bulk-links/?documentId=f1699863-c9ac-411b-9369-70f48e7dcc53s_rbVc2)' },
                        { name: 'Important: BoldSign Form', value: 'For the BoldSign form, it\'s very important that you include first AND last name as you have it on the order(s) you placed with us.' }
                    )
                    .setColor(0x0099FF) // Blue color
                    .setFooter({ text: 'Fry Networks Ticketing System', iconURL: interaction.client.user.displayAvatarURL() })
                    .setTimestamp();

                const msg1 = await ticketChannel.send({
                    embeds: [boldSignEmbed]
                });
                sentMessageIds.push(msg1.id); // Store the message ID

                // Send factory reset instructions for returns
                const factoryResetEmbed = new EmbedBuilder()
                    .setTitle('🖥️ How to Factory Reset a Windows 10/11 Mini PC (OOBE/“Out-of-Box Experience”)')
                    .setColor(0x0099FF) // Blue color
                    .setDescription('For users returning hardware, please factory reset (wipe) your device so they return to the "Out-of-Box Experience" (OOBE) state.')
                    .addFields(
                        { name: 'Quick Steps:', value: '1. **Back up your important files** (resetting wipes everything!).\n2. Click the **Start Menu** → select **Settings** (⚙️ gear icon).\n3. Go to **Update & Security** (Windows 10) or **System** (Windows 11).\n4. Click **Recovery** on the sidebar.\n5. Under “Reset this PC,” click **Get started**.\n6. Choose **Remove everything** (for full factory reset).\n7. Follow the prompts:\n   * If asked, pick “Remove files and clean the drive” for a full wipe.”\n8. Click **Next** and then **Reset**.\n9. The PC will restart and reset itself. This can take up to an hour.\n10. When done, you’ll see the Windows setup (“Out-of-Box Experience”) as if the PC is brand new -- at this point, your device is fully reset and ready to return!' },
                            { name: '📎 Official & Trusted Links for Reference', value: '**Windows 10 & 11:**\n🪟 Microsoft Official Guides\n[Recovery options in Windows (Windows 10 & 11)](https://support.microsoft.com/en-us/windows/recovery-options-in-windows-31ce2444-7de3-818c-d626-e3b5a3024da5)\n[Reset your PC](https://support.microsoft.com/en-us/windows/reset-your-pc-0ef73740-b927-549b-b7c9-e6f2b48d275e)\n\n📰 Digital Trends Guides\n[How to factory reset Windows 10 or Windows 11](https://www.digitaltrends.com/computing/how-to-factory-reset-windows/)\n\n🎥 YouTube Tutorials\n[Windows 11 Factory Reset Tutorial](https://www.youtube.com/watch?v=N4h_W4uuGOo)\n[Windows 10 Factory Reset Tutorial](https://www.youtube.com/watch?v=I26uYeFvhnE)' }
                    )
                    .setFooter({ text: 'Fry Networks Ticketing System', iconURL: interaction.client.user.displayAvatarURL() })
                    .setTimestamp();

                const msg2 = await ticketChannel.send({ embeds: [factoryResetEmbed] });
                sentMessageIds.push(msg2.id);
                const msg3 = await ticketChannel.send({ content: 'Please submit **pictures of the S/N label under the mini PC and the Windows 10/11 factory reset (OOBE) screen** in this ticket channel.' });
                sentMessageIds.push(msg3.id);

                 // Send manual distribution announcement
                const msg4 = await ticketChannel.send({
                    content: '**Please note**: To return your already received node hardware, our staff will need to manually send you a prepaid return shipping label.\n\nPlease confirm your address below! This process may take some time, so we appreciate your patience while we handle your request.\n\nOnce you receive your return label and tracking confirms your node is in transit, we will manually generate and send you your one-time-use, 50% off coupon code for the Fry hardware store. Your ticket will be closed at this stage.\n\nFor the high APR NFT reward: we’re already collecting your Algorand wallet address now, so there’s no need to open a new ticket later. Once the NFTs are ready (towards the end of Q3), we’ll distribute them automatically and announce it to everyone.\n\n**You can still install the node software on your own device to continue earning rewards.**\n\nThank you for your cooperation and understanding!'
                });
                sentMessageIds.push(msg4.id);

                // Send the "Doc Signed" button
                const msg5 = await ticketChannel.send({
                    content: 'Click the button below once you have signed the BoldSign form:',
                    components: [docSignedRow]
                });
                sentMessageIds.push(msg5.id);

                // Log the approved region
                await supabaseHandler.logBotActivity('info', 'node_forgo_return', `Ticket ${ticketId}: User selected approved return region: ${selectedRegion}.`);

                // Update the ticket in Supabase with the new message IDs
                const currentTicket = await supabaseHandler.getTicketById(ticketId);
                const existingMessageIds = currentTicket?.forgo_return_message_ids || [];
                const updatedMessageIds = [...existingMessageIds, ...sentMessageIds];
                await supabaseHandler.updateTicket(ticketId, { forgo_return_message_ids: updatedMessageIds });
                logger.info(`Ticket ${ticketId} updated with forgo_return_message_ids for region select: ${updatedMessageIds.join(', ')}`);

            } else {
                // Region is not approved
                const msg1 = await ticketChannel.send({
                    content: `⚠️ Returns are not accepted from your region (**${selectedRegion}**). We cannot proceed with a return. If you intended to forgo your nodes, please clarify in this ticket.`
                });
                sentMessageIds.push(msg1.id);
                 // Log the disallowed region
                await supabaseHandler.logBotActivity('warn', 'node_forgo_return', `Ticket ${ticketId}: User selected disallowed return region: ${selectedRegion}.`);
                // Optionally, guide them towards the forgo process or close the ticket.

                // Update the ticket in Supabase with the new message IDs
                const currentTicket = await supabaseHandler.getTicketById(ticketId);
                const existingMessageIds = currentTicket?.forgo_return_message_ids || [];
                const updatedMessageIds = [...existingMessageIds, ...sentMessageIds];
                await supabaseHandler.updateTicket(ticketId, { forgo_return_message_ids: updatedMessageIds });
                logger.info(`Ticket ${ticketId} updated with forgo_return_message_ids for disallowed region: ${updatedMessageIds.join(', ')}`);
            }

        } catch (error) {
            logger.error(`Error handling region select for ticket ${ticketId}: ${error.message}`, error);
            await interaction.followUp({
                content: '⚠️ An error occurred while processing your region selection. Please try again later.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
    // Other select menus can be handled here
}

async function handleModalSubmit(interaction) {
    if (interaction.customId.startsWith('ticket_form_')) {
        const ticketType = interaction.customId.replace('ticket_form_', '');
        await handleTicketModalSubmit(interaction, ticketType);
    } else if (interaction.customId.startsWith('close_ticket_modal_')) {
        await closeHandler.handleCloseTicketModalSubmit(interaction);
    } else if (interaction.customId.startsWith('schedule_close_transcript_modal_')) {
        await scheduleHandler.handleScheduleTranscriptModalSubmit(interaction);
    } else if (interaction.customId.startsWith('issue_coupon_modal:')) { // Handle Issue Coupon modal submission
        await issueCouponHandler.handleIssueCouponModalSubmit(interaction);        
    } else if (interaction.customId.startsWith('eligibility_check_modal:')) {
        const [_, ticketId] = interaction.customId.split(':');
        await fryConversionHandler.handleEligibilityModalSubmit(interaction, ticketId); // Use new handler
    } else if (interaction.customId.startsWith('burn_tx_check_modal:')) {
        const [_, ticketId] = interaction.customId.split(':');
        await fryConversionHandler.handleBurnTxModalSubmit(interaction, ticketId); // Use new handler        
    } else if (interaction.customId.startsWith('conversion_status_check_modal:') || interaction.customId.startsWith('conversion_status_modal_submit:')) {
        const [_, ticketId] = interaction.customId.split(':');
        await fryConversionHandler.handleConversionStatusModalSubmit(interaction, ticketId); // Use new handler
    }
    // Other modal submissions can be handled here
}

async function handleButton(interaction) { // No longer receiving client here
    discordClient = interaction.client; // Use the client from the interaction
    logger.info(`[DEBUG] handleButton received customId: ${interaction.customId}`);    
    const [action, context] = interaction.customId.split(':'); // e.g. resume_ticket:order_tracking or claim_ticket:123
    logger.info(`[DEBUG] Button clicked: action=${action}, context=${context}, customId=${interaction.customId}`);

    // Handle "Resume Ticket" button specifically before attempting to determine ticketId
    if (action.startsWith('resume_ticket_')) { // e.g. resume_ticket_order_tracking
        const ticketType = action.replace('resume_ticket_', '');
        try {
            // First show the modal
            await handleResumeTicketButton(interaction, ticketType);            
            // After modal is shown, update the message in a delayed manner
            setTimeout(async () => {
                try {
                    await interaction.editReply({
                        content: '📝 Form has been resumed. Please complete the modal that appeared.',
                        components: []
                    });
                } catch (updateError) {
                    logger.warn(`Could not update message after showing resume modal: ${updateError.message}`);
                }
            }, 100);
        } catch (error) {
            logger.error(`Error in resume ticket flow for ${interaction.user.id}, type ${ticketType}: ${error.message}`, error);
            if (!interaction.replied) {
                await interaction.reply({ 
                    content: '⚠️ Could not display the form. Please try again.',
                    flags: MessageFlags.Ephemeral 
                });
            }
        }
        return; // Stop processing after handling resume button
    }
    let ticketId = context; // Start with context from customId

    // Fallback: If ticketId is missing or not a valid number, try to get it from the channel name
    if (!ticketId || isNaN(ticketId)) {
        const channelName = interaction.channel?.name;
        if (channelName) {
            const match = channelName.match(/^(?:ticket-|closed-)?(\d+)-/);
            if (match && match[1]) {
                ticketId = match[1];
                logger.info(`Parsed ticketId ${ticketId} from channel name ${channelName} for button action ${action}.`);
            } else {
                logger.warn(`Could not parse ticketId from channel name ${channelName} for button action ${action}.`);
                // If ticketId cannot be determined from either source, reply with an error and return
                 await interaction.reply({
                    content: '⚠️ Could not determine the ticket ID from the button or channel name. This button may be from an older ticket format. Please try again or create a new ticket if needed.',
                    flags: MessageFlags.Ephemeral
                });
                return; // Stop processing if ticketId is not found
            }
        } else {
             logger.warn(`Channel name not available to parse ticketId for button action ${action}.`);
             // If ticketId cannot be determined from either source, reply with an error and return
              await interaction.reply({
                 content: '⚠️ Could not determine the ticket ID from the button or channel name. This button may be from an older ticket format. Please try again or create a new ticket if needed.',
                 flags: MessageFlags.Ephemeral
             });
             return; // Stop processing if ticketId is not found
        }
    } else {
        logger.info(`Extracted ticketId ${ticketId} from button customId for action ${action}.`);
    }

    // Now use the determined ticketId for all subsequent handler calls
 
    /*if (action === 'claim_ticket') {
        // 🚫 Role restriction check
        if (!interaction.member.roles.cache.has(config.staffRoleId) && !interaction.member.roles.cache.has(config.internRoleId)) {
            return interaction.reply({
                content: '❌ You do not have permission to claim tickets.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Call the updated claimTicket function which handles join/leave, DB updates, and message updates
        const result = await claimHandler.claimTicket(interaction, ticketId);

        if (!result.success) {
            logger.warn(`Failed to handle claim/leave for ticket ${ticketId} by ${interaction.user.id}: ${result.error}`);
            // If claimHandler failed, send an ephemeral error reply
            if (!interaction.replied && !interaction.deferred) {
                 await interaction.reply({
                    content: `❌ Failed to process your request: ${result.error}`,
                    flags: MessageFlags.Ephemeral
                });
            } else {
                 await interaction.followUp({
                    content: `❌ Failed to process your request: ${result.error}`,
                    flags: MessageFlags.Ephemeral
                });
            }
        } else {
             // claimHandler already updated the message and sent ephemeral reply, just log
             logger.info(`Staff ${interaction.user.username} (${interaction.user.id}) ${result.action} ticket ${ticketId}`);
        }
    } else */
     if (action === 'validate_ticket') {
        // 🚫 Role restriction check
        if (!interaction.member.roles.cache.has(config.ticketModRoleId)) {
            return interaction.reply({
                content: '❌ You do not have permission to validate tickets.',
                flags: MessageFlags.Ephemeral
            });
        }
        await handleValidateButton(interaction, ticketId);
    } else if (action === 'unvalidate_ticket') { // Add case for unvalidate button
        // 🚫 Role restriction check
        if (!interaction.member.roles.cache.has(config.ticketModRoleId)) {
            return interaction.reply({
                content: '❌ You do not have permission to unvalidate tickets.',
                flags: MessageFlags.Ephemeral
            });
        }
        // Call the new unvalidate handler (will create this next)
        await handleUnvalidateButton(interaction, ticketId);
    } else if (action === 'forgo_return_select') {
        await interaction.deferUpdate(); // Defer the interaction immediately
        const [_, requestType] = interaction.customId.split(':'); // Extract type and ticketId
        await sendNodeForgoReturnInstructions(interaction, ticketId, requestType, discordClient);
    } else if (action === 'switch_request_type') { // New action for the !switch command buttons
        await interaction.deferUpdate(); // Defer the interaction immediately
        const [_, newRequestType, switchTicketId] = interaction.customId.split(':');
        // The ephemeral message from the !switch command is deleted by the command itself.
        // Now, call the shared function to send the new instructions.
        await sendNodeForgoReturnInstructions(interaction, switchTicketId, newRequestType, discordClient);
    }
    /*else if (action === 'forgo_return_select') {
        const [_, requestType] = interaction.customId.split(':'); // Extract type and ticketId

        try {
            // Fetch ticket data to get the channel ID
            const ticket = await supabaseHandler.getTicketById(ticketId);
            if (!ticket || !ticket.channel_id) {
                logger.error(`Ticket ${ticketId} not found or missing channel_id during forgo/return select.`);
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

            await interaction.update({ components: [] }); // Remove the ephemeral buttons

            const docSignedButton = new ButtonBuilder()
                .setCustomId(`doc_signed:${ticketId}`)
                .setLabel('✍️  I have signed the form')
                .setStyle(ButtonStyle.Success);

            const docSignedRow = new ActionRowBuilder().addComponents(docSignedButton);

        /*  // Send BoldSign link and instructions to the ticket channel
            await ticketChannel.send({
                content: `Thank you for selecting **${requestType.toUpperCase()}**.\n\nPlease complete the required form via this link: https://app.boldsign.com/document/sign-bulk-links/?documentId=f1699863-c9ac-411b-9369-70f48e7dcc53s_rbVc2\n\nOnce you have completed and submitted the form, please click the button below to confirm.`
            });
        *//*

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

                await ticketChannel.send({
                    content: 'Please select your region from the dropdown below to proceed with your return request:',
                    components: [regionSelectRow]
                });

                // Do NOT send the BoldSign link or other instructions yet.
                // These will be sent after the region is selected and approved in handleSelectMenu.

            } else { // requestType is 'forgo'
                 // Send BoldSign link and instructions to the ticket channel for forgo
                await ticketChannel.send({
                    content: `Thank you for selecting **${requestType.toUpperCase()}**.\n\nPlease complete the required form via this link: https://app.boldsign.com/document/sign-bulk-links/?documentId=f1699863-c9ac-411b-9369-70f48e7dcc53s_rbVc2\n\nOnce you have completed and submitted the form, please click the button below to confirm.`
                });

                // Send manual distribution announcement to the ticket channel for forgo
                await ticketChannel.send({
                    content: '**Please note**: You have chosen to forgo receiving your node hardware. This means you will not receive a physical node device.\n\nThis process may take some time, so we appreciate your patience while we handle your request.\n\nOnce your forgo request is processed, we will manually generate and send you your one-time-use, 50% off coupon code for the Fry hardware store. Your ticket will be closed at this stage.\n\nFor the high APR NFT reward: we’re already collecting your Algorand wallet address now, so there’s no need to open a new ticket later. Once the NFTs are ready (towards the end of Q3), we’ll distribute them automatically and announce it to everyone.\n\n**You can still install the node software on your own device to start earning rewards. If your node order is over 1 year old, you can ask us for the miner keys to register and install the node software on your own device.**\n\nThank you for your cooperation and understanding!'
                });

                // Send the "Doc Signed" button to the ticket channel for forgo
                const docSignedButton = new ButtonBuilder()
                    .setCustomId(`doc_signed:${ticketId}`)
                    .setLabel('✍️  I have signed the form')
                    .setStyle(ButtonStyle.Success);

                const docSignedRow = new ActionRowBuilder().addComponents(docSignedButton);

                await ticketChannel.send({
                    content: 'Click the button below once you have signed the BoldSign form:',
                    components: [docSignedRow]
                });
            }

        } catch (error) {
            logger.error(`Error handling forgo/return select for ticket ${ticketId}: ${error.message}`, error);
            await interaction.followUp({
                content: '⚠️ An error occurred while processing your request. Please try again later.',
                flags: MessageFlags.Ephemeral
            });
        }
    } */
    else if (action === 'doc_signed') {
        
        try {
            // Update ticket in Supabase to mark BoldSign as signed
            await supabaseHandler.updateTicket(ticketId, { bold_sign_signed: true });
            logger.info(`Ticket ${ticketId} marked as BoldSign signed by user ${interaction.user.id}`);

            await interaction.update({ components: [] }); // Remove the "Doc Signed" button

            const ticket = await supabaseHandler.getTicketById(ticketId); // Fetch ticket to check request type
            if (!ticket || !ticket.channel_id) {
                logger.error(`Ticket ${ticketId} not found or missing channel_id during doc signed.`);
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

            let confirmationMessage = '✅ Thank you for confirming you have signed the form. We will review your submission shortly.';

            if (ticket && ticket.request_type === 'return') {
                confirmationMessage += '\n\nRemember to submit pictures of the S/N label and the factory reset screen in this ticket channel if you haven\'t already.';
            }

            await ticketChannel.send({
                content: confirmationMessage
            });
            // Send final results message
            if (ticket && ticket.request_type === 'return') {
                await ticketChannel.send({
                    content: 'Your return request has been received. Our team will review it and close your ticket once all steps are complete. We’ll update you here if we need anything.'
                });
            } else { // request_type is 'forgo'
                await ticketChannel.send({
                    content: 'Your Node Forgo request has been received. Our team will now manually review your BoldSign form, waive registration if applicable, and issue your coupon. You’ll get an update here once it’s done.'
                });
            }

            // Log the action
            await supabaseHandler.logBotActivity('info', 'node_forgo_return', `Ticket ${ticketId}: User confirmed BoldSign form signed.`);

        } catch (error) {
            logger.error(`Error handling Doc Signed button for ticket ${ticketId}: ${error.message}`, error);
            await interaction.followUp({
                content: '⚠️ An error occurred while processing your confirmation. Please try again later.',
                flags: MessageFlags.Ephemeral
            });
        }
    }

    else if (action.startsWith('faq_') || action.startsWith ('show_faq_categories')) {
            await handleFaqInteraction(interaction, discordClient);
            return;
          }
    else if (action === 'check_eligibility') {
        await fryConversionHandler.handleCheckEligibilityButton(interaction, ticketId); 

    } else if (action === 'check_burn_tx') {
        await fryConversionHandler.handleCheckBurnTxButton(interaction, ticketId); 
    } else if (action === 'check_conversion_status') {
        // This button now handles both direct check and modal prompt
        await fryConversionHandler.handleCheckConversionStatusButton(interaction, ticketId);
    } else if (action === 'conversion_guide') {
        await fryConversionHandler.handleConversionGuideButton(interaction, ticketId);
    } else if (action === 'claim_available') {
        await fryConversionHandler.handleClaimAvailableButton(interaction, ticketId);
    } else if (action === 'view_claim_status') {
        await fryConversionHandler.handleViewClaimStatusButton(interaction, ticketId);
    } else if (action === 'next_claim_info') {
        await fryConversionHandler.handleNextClaimInfoButton(interaction, ticketId);
    } else if (action === 'view_claim_history') {
        await fryConversionHandler.handleViewClaimHistoryButton(interaction, ticketId);
    } else if (action === 'conversion_summary') {
        await fryConversionHandler.handleConversionSummaryButton(interaction, ticketId);
    }  
    else if (action === 'close_ticket_now') {
        // ticketId is already determined by the fallback logic at the beginning of the function
        await closeHandler.handleCloseNowButton(interaction, ticketId);
    } else if (action.startsWith('transcript_pref_')) { // Handle transcript preference buttons for immediate close
        const transcriptPreference = action.replace('transcript_pref_', ''); // Extract preference (dm, post, none)
        const channelId = interaction.channelId;
        const userId = interaction.user.id;
        const username = interaction.user.username;
        // Use the module-level discordClient
        await closeHandler.processTranscriptPreference(discordClient, ticketId, channelId, userId, username, transcriptPreference, interaction); // Pass discordClient
    } else if (action.startsWith('schedule_transcript_pref_')) { // Handle transcript preference buttons for scheduled close
        // Custom ID format: schedule_transcript_pref_[preference]:[ticketId]:[selectedTime]
        const customIdParts = interaction.customId.split(':');
        const transcriptPreference = customIdParts[0].replace('schedule_transcript_pref_', ''); // Extract preference
        const selectedTime = customIdParts[2]; // Extract selectedTime
        await scheduleHandler.handleScheduledTranscriptPreferenceButton(interaction, transcriptPreference, ticketId, selectedTime);
    } else if (action === 'schedule_close_ticket') {
        await scheduleHandler.handleScheduleCloseButton(interaction, ticketId);
    } else if (action === 'cancel_schedule_ticket') {
        await scheduleHandler.handleCancelScheduleButton(interaction, ticketId);
    } else if (action === 'reschedule_ticket') {
        await scheduleHandler.handleRescheduleButton(interaction, ticketId);
    } else if (action.startsWith('delete_ticket_now_')) { // Handle the new delete button
        await closeHandler.handleDeleteNowButton(interaction); // Corrected handler call
    } else if (action === 'waive_registration') {
        await handleWaiveRegistrationButton(interaction, ticketId);
    } else if (action === 'confirm_waive_registration') {
        const [_, confirmation] = interaction.customId.split(':'); // Extract confirmation (yes/no)
        // ticketId is already determined by the fallback logic at the beginning of the function
        await handleWaiveRegistrationConfirmation(interaction, ticketId, confirmation);
    } else if (action === 'issue_coupon') { // Handle Issue Coupon button
        await issueCouponHandler.handleIssueCouponButton(interaction, ticketId);
    } else if (action.startsWith('conclude_')) { // Handle conclusion prompt buttons
        await closeHandler.handleConclusionPromptButtons(interaction, ticketId);
    } else if (action === 'confirm_sn_picture') {
        await handleConfirmSnPicture(interaction, ticketId);
    } else if (action === 'confirm_factory_reset_picture') {
        await handleConfirmFactoryResetPicture(interaction, ticketId);
    } else if (action === 'validate_flxtime_partner') {
        // 🚫 Role restriction check
        if (!interaction.member.roles.cache.has(config.ticketModRoleId)) {
            return interaction.reply({
                content: '❌ You do not have permission to validate Flxtime partners.',
                flags: MessageFlags.Ephemeral
            });
        }
        await flxtimePartnersHandler.handleValidateFlxtimeButton(interaction, ticketId);
    } else if (action === 'issue_aem_key') {
        // 🚫 Role restriction check
        if (!interaction.member.roles.cache.has(config.ticketModRoleId)) {
            return interaction.reply({
                content: '❌ You do not have permission to issue AEM keys.',
                flags: MessageFlags.Ephemeral
            });
        }
        await flxtimePartnersHandler.handleIssueAemKeyButton(interaction, ticketId);
    } else if (action === 'confirm_flxtime_validation') {
        // 🚫 Role restriction check
        if (!interaction.member.roles.cache.has(config.ticketModRoleId)) {
            return interaction.reply({
                content: '❌ You do not have permission to validate Flxtime partners.',
                flags: MessageFlags.Ephemeral
            });
        }
        const [_, confirmTicketId, confirmation] = interaction.customId.split(':');
        await flxtimePartnersHandler.handleValidationConfirmation(interaction, confirmTicketId, confirmation);
    }
    // Other button interactions can be handled here
}

module.exports = {
    initializeInteractionHandlers
};
// Export the function to initialize interaction handlers
