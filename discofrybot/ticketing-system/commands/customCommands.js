const { ChannelType, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonStyle, PermissionsBitField, ButtonBuilder } = require('discord.js');
const supabase = require('../supabaseClient'); // Import supabase client
const supabaseHandler = require('../handlers/supabaseHandler');
const inactivityPinger = require('../modules/inactivityPinger');
const { getTicketActionRow } = require('../utils/ticketUtils');
const logger = require('../utils/logger');
const config = require('../utils/config');
const { maskAddress, summarizeMessageContent } = require('../utils/logSanitizer');

// Define prefix commands
const customCommands = [
    {
        name: 'validate',
        description: 'Adds the validate button to a Node Forgo/Return ticket in the current channel.',
        execute: async (message, args) => {
            // Check if the user is staff (assuming STAFF_ROLE_ID is available via config or env)
            // Need to ensure STAFF_ROLE_ID is accessible here.
            // For now, assume it's accessible via config or passed.
            // TODO: Make STAFF_ROLE_ID accessible.
            const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || config.STAFF_ROLE_ID; // Assuming it's in config or env

            if (!message.member || !message.member.roles.cache.has(STAFF_ROLE_ID)) {
                // Send ephemeral-like reply if possible, otherwise a regular reply
                try {
                    await message.reply({ content: "❌ You don't have permission to use this command.", flags: MessageFlags.Ephemeral });
                } catch {
                    await message.reply("❌ You don't have permission to use this command.");
                }
                return;
            }

            const channel = message.channel;
            const channelName = channel?.name;

            if (!channelName) {
                 try {
                    await message.reply({ content: '⚠️ Could not determine channel name.', flags: MessageFlags.Ephemeral });
                } catch {
                    await message.reply('⚠️ Could not determine channel name.');
                }
                return;
            }

            const ticketMatch = channelName.match(/^(?:ticket|closed)-(\d+)-|^(\d+)-/); // Updated regex to match both formats
            const ticketId = ticketMatch ? (ticketMatch[1] || ticketMatch[2]) : null; // Extract from either group 1 or 2

            if (!ticketId) {
                 try {
                    await message.reply({ content: '⚠️ This command can only be used in a ticket channel.', flags: MessageFlags.Ephemeral });
                } catch {
                    await message.reply({ content: '⚠️ This command can only be used in a ticket channel.', flags: MessageFlags.Ephemeral });
                }
                return;
            }

            try {
                // Fetch ticket data from Supabase
                const { data: ticket, error: fetchError } = await supabase
                    .from('tickets')
                    .select('*')
                    .eq('id', ticketId)
                    .single();

                if (fetchError || !ticket) {
                    logger.error(`Failed to fetch ticket ${ticketId}: ${fetchError?.message}`);
                     try {
                        await message.reply({ content: `⚠️ Could not find ticket with ID \`${ticketId}\`.`, flags: MessageFlags.Ephemeral });
                    } catch {
                        await message.reply({ content: `⚠️ Could not find ticket with ID \`${ticketId}\`.`, flags: MessageFlags.Ephemeral });
                    }
                    return;
                }

                if (ticket.ticket_type !== 'node_forgo_return') {
                     try {
                        await message.reply({ content: `⚠️ Ticket \`${ticketId}\` is not a Node Forgo/Return ticket.`, flags: MessageFlags.Ephemeral });
                    } catch {
                        await message.reply({ content: `⚠️ Ticket \`${ticketId}\` is not a Node Forgo/Return ticket.`, flags: MessageFlags.Ephemeral });
                    }
                    return;
                }

                if (ticket.validated) {
                     try {
                        await message.reply({ content: `⚠️ Ticket \`${ticketId}\` is already validated.`, flags: MessageFlags.Ephemeral });
                    } catch {
                        await message.reply({ content: `⚠️ Ticket \`${ticketId}\` is already validated.`, flags: MessageFlags.Ephemeral });
                    }
                    return;
                }

                // Fetch the original message
                if (!ticket.original_message_id) {
                     try {
                        await message.reply({ content: `⚠️ Could not find original message ID for ticket \`${ticketId}\`.`, flags: MessageFlags.Ephemeral });
                    } catch {
                        await message.reply({ content: `⚠️ Could not find original message ID for ticket \`${ticketId}\`.`, flags: MessageFlags.Ephemeral });
                    }
                    return;
                }

                const originalMessage = await channel.messages.fetch(ticket.original_message_id);

                // Generate the action row with the validate button
                const updatedActionRow = getTicketActionRow(ticket);

                // Edit the original message to add the button
                await originalMessage.edit({ components: updatedActionRow });

                logger.info(`Added validate button to ticket ${ticketId} in channel ${channelName}.`);
                 try {
                    await message.reply({ content: `✅ Added validate button to ticket \`${ticketId}\`.`, flags: MessageFlags.Ephemeral });
                } catch {
                    await message.reply({ content: `✅ Added validate button to ticket \`${ticketId}\`.`, flags: MessageFlags.Ephemeral });                    
                }

            } catch (error) {
                logger.error(`Error executing validate command for ticket ${ticketId}: ${error.message}`, error);
                 try {
                    await message.reply({ content: '⚠️ An unexpected error occurred while adding the validate button.', flags: MessageFlags.Ephemeral });
                } catch {
                    await message.reply({ content: '⚠️ An unexpected error occurred while adding the validate button.', flags: MessageFlags.Ephemeral });
                }
            }
        },
    },
    {
        name: 'waive',
        description: 'Adds the "Waive Registration" button to the original message in the current ticket channel.',
        execute: async (message, args) => {
            const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js'); // Import here to ensure availability
            const STAFF_ROLE_ID = config.staffRoleId;

            if (!message.member || !message.member.roles.cache.has(STAFF_ROLE_ID)) {
                try {
                    await message.reply({ content: "❌ You don't have permission to use this command.", flags: MessageFlags.Ephemeral });
                } catch {
                    await message.reply("❌ You don't have permission to use this command.");
                }
                return;
            }

            const channel = message.channel;
            const channelName = channel?.name;

            if (!channelName) {
                 try {
                    await message.reply({ content: '⚠️ Could not determine channel name.', flags: MessageFlags.Ephemeral });
                } catch {
                    await message.reply('⚠️ Could not determine channel name.');
                }
                return;
            }

            const ticketMatch = channelName.match(/^(?:ticket|closed)-(\d+)-|^(\d+)-/);
            const ticketId = ticketMatch ? (ticketMatch[1] || ticketMatch[2]) : null;

            if (!ticketId) {
                 try {
                    await message.reply({ content: '⚠️ This command can only be used in a ticket channel.', flags: MessageFlags.Ephemeral });
                } catch {
                    await message.reply({ content: '⚠️ This command can only be used in a ticket channel.', flags: MessageFlags.Ephemeral });
                }
                return;
            }

            try {
                // Fetch only original_message_id from Supabase
                const { data: ticket, error: fetchError } = await supabase
                    .from('tickets')
                    .select('original_message_id')
                    .eq('id', ticketId)
                    .single();

                if (fetchError || !ticket || !ticket.original_message_id) {
                    logger.error(`Failed to fetch original_message_id for ticket ${ticketId}: ${fetchError?.message}`);
                     try {
                        await message.reply({ content: `⚠️ Could not find original message ID for ticket \`${ticketId}\`.`, flags: MessageFlags.Ephemeral });
                    } catch {
                        await message.reply({ content: `⚠️ Could not find original message ID for ticket \`${ticketId}\`.`, flags: MessageFlags.Ephemeral });
                    }
                    return;
                }

                const originalMessage = await channel.messages.fetch(ticket.original_message_id);

                // Construct the "Waive Registration" button
                const waiveButton = new ButtonBuilder()
                    .setCustomId(`waive_registration:${ticketId}`)
                    .setLabel('✋ Waive Registration')
                    .setStyle(ButtonStyle.Primary);

                let updatedComponents = [...originalMessage.components];
                let buttonAlreadyPresent = false;

                // Check if the button is already present
                for (const row of updatedComponents) {
                    if (row instanceof ActionRowBuilder) {
                        for (const component of row.components) {
                            if (component.customId === waiveButton.customId) {
                                buttonAlreadyPresent = true;
                                break;
                            }
                        }
                    }
                    if (buttonAlreadyPresent) break;
                }

                if (buttonAlreadyPresent) {
                     try {
                        await message.reply({ content: `⚠️ The "Waive Registration" button is already present on ticket \`${ticketId}\`.`, flags: MessageFlags.Ephemeral });
                    } catch {
                        await message.reply({ content: `⚠️ The "Waive Registration" button is already present on ticket \`${ticketId}\`.`, flags: MessageFlags.Ephemeral });
                    }
                    return;
                }

                // Add the button to the first action row
                if (updatedComponents.length === 0) {
                    // If no action rows exist, create a new one
                    const newRow = new ActionRowBuilder().addComponents(waiveButton);
                    updatedComponents.push(newRow);
                } else {
                    // Add to the first existing action row
                    const firstRow = updatedComponents[0];
                    if (firstRow instanceof ActionRowBuilder) {
                        // Check if adding the button exceeds the 5-button limit
                        if (firstRow.components.length < 5) {
                            firstRow.addComponents(waiveButton);
                        } else {
                            // If the first row is full, create a new row for the button
                            const newRow = new ActionRowBuilder().addComponents(waiveButton);
                            updatedComponents.push(newRow);
                        }
                    } else {
                        // Fallback if first component is not an ActionRowBuilder (shouldn't happen with Discord.js)
                        const newRow = new ActionRowBuilder().addComponents(waiveButton);
                        updatedComponents.push(newRow);
                    }
                }
                
                await originalMessage.edit({ components: updatedComponents });

                logger.info(`Added "Waive Registration" button to ticket ${ticketId} in channel ${channelName}.`);
                 try {
                    await message.reply({ content: `✅ Added "Waive Registration" button to ticket \`${ticketId}\`.`, flags: MessageFlags.Ephemeral });
                } catch {
                    await message.reply({ content: `✅ Added "Waive Registration" button to ticket \`${ticketId}\`.`, flags: MessageFlags.Ephemeral });                    
                }

            } catch (error) {
                logger.error(`Error executing waive command for ticket ${ticketId}: ${error.message}`, error);
                 try {
                    await message.reply({ content: '⚠️ An unexpected error occurred while adding the "Waive Registration" button.', flags: MessageFlags.Ephemeral });
                } catch {
                    await message.reply({ content: '⚠️ An unexpected error occurred while adding the "Waive Registration" button.', flags: MessageFlags.Ephemeral });
                }
            }
        },
    },
    {
        name: 'switch',
        description: 'Allows staff to switch the request type of a Node Forgo/Return ticket and restart the process.',
        execute: async (message, args) => {
            const STAFF_ROLE_ID = config.staffRoleId; // Use config.staffRoleId

            if (!message.member || !message.member.roles.cache.has(STAFF_ROLE_ID)) {
                try {
                    await message.reply({ content: "❌ You don't have permission to use this command.", flags: MessageFlags.Ephemeral });
                } catch {
                    await message.reply("❌ You don't have permission to use this command.");
                }
                return;
            }

            const channel = message.channel;
            const channelName = channel?.name;

            if (!channelName) {
                 try {
                    await message.reply({ content: '⚠️ Could not determine channel name.', flags: MessageFlags.Ephemeral });
                } catch {
                    await message.reply('⚠️ Could not determine channel name.');
                }
                return;
            }

            const ticketMatch = channelName.match(/^(?:ticket|closed)-(\d+)-|^(\d+)-/);
            const ticketId = ticketMatch ? (ticketMatch[1] || ticketMatch[2]) : null;

            if (!ticketId) {
                 try {
                    await message.reply({ content: '⚠️ This command can only be used in a ticket channel.', flags: MessageFlags.Ephemeral });
                } catch {
                    await message.reply({ content: '⚠️ This command can only be used in a ticket channel.', flags: MessageFlags.Ephemeral });
                }
                return;
            }

            try {
                const ticket = await supabaseHandler.getTicketById(ticketId);

                if (!ticket) {
                    logger.error(`Failed to fetch ticket ${ticketId}: Ticket not found.`);
                     try {
                        await message.reply({ content: `⚠️ Could not find ticket with ID \`${ticketId}\`.`, flags: MessageFlags.Ephemeral });
                    } catch {
                        await message.reply({ content: `⚠️ Could not find ticket with ID \`${ticketId}\`.`, flags: MessageFlags.Ephemeral });
                    }
                    return;
                }

                if (ticket.ticket_type !== 'node_forgo_return') {
                     try {
                        await message.reply({ content: `⚠️ Ticket \`${ticketId}\` is not a Node Forgo/Return ticket.`, flags: MessageFlags.Ephemeral });
                    } catch {
                        await message.reply({ content: `⚠️ Ticket \`${ticketId}\` is not a Node Forgo/Return ticket.`, flags: MessageFlags.Ephemeral });
                    }
                    return;
                }

                // Delete previous forgo/return messages
                if (ticket.forgo_return_message_ids && ticket.forgo_return_message_ids.length > 0) {
                    for (const msgId of ticket.forgo_return_message_ids) {
                        try {
                            const msgToDelete = await channel.messages.fetch(msgId);
                            await msgToDelete.delete();
                            logger.info(`Deleted message ${msgId} for ticket ${ticketId}.`);
                        } catch (deleteError) {
                            logger.warn(`Failed to delete message ${msgId} for ticket ${ticketId}: ${deleteError.message}`);
                        }
                    }
                    // Clear message IDs in Supabase after deletion attempts
                    await supabaseHandler.updateTicket(ticketId, { forgo_return_message_ids: [] });
                    logger.info(`Cleared forgo_return_message_ids for ticket ${ticketId}.`);
                }

                // Send ephemeral message with "Forgo" and "Return" buttons
                const forgoButton = new ButtonBuilder()
                    .setCustomId(`forgo_return_select:forgo:${ticketId}`) // Reusing existing customId structure
                    .setLabel('Forgo')
                    .setStyle(ButtonStyle.Primary);

                const returnButton = new ButtonBuilder()
                    .setCustomId(`forgo_return_select:return:${ticketId}`) // Reusing existing customId structure
                    .setLabel('Return')
                    .setStyle(ButtonStyle.Primary);

                const actionRow = new ActionRowBuilder().addComponents(forgoButton, returnButton);

                await message.reply({
                    content: 'Please select the new request type:',
                    components: [actionRow],
                    flags: MessageFlags.Ephemeral
                });

                logger.info(`Sent switch request type prompt for ticket ${ticketId}.`);

            } catch (error) {
                logger.error(`Error executing switch command for ticket ${ticketId}: ${error.message}`, error);
                 try {
                    await message.reply({ content: '⚠️ An unexpected error occurred while executing the switch command.', flags: MessageFlags.Ephemeral });
                } catch {
                    await message.reply({ content: '⚠️ An unexpected error occurred while executing the switch command.', flags: MessageFlags.Ephemeral });
                }
            }
        },
    },
    {
        name: 'ignoreinactivity',
        description: 'Toggles inactivity tracking for a specific ticket. Usage: `!ignoreinactivity [ticketId/channelId]`',
        execute: async (message, args) => {
            const STAFF_ROLE_ID = config.staffRoleId;
            const INTERN_ROLE_ID = config.internRoleId;

            if (!message.member || (!message.member.roles.cache.has(STAFF_ROLE_ID) && !message.member.roles.cache.has(INTERN_ROLE_ID))) {
                try {
                    await message.reply({ content: "❌ You don't have permission to use this command.", flags: MessageFlags.Ephemeral });
                } catch {
                    await message.reply("❌ You don't have permission to use this command.");
                }
                return;
            }

            let ticketId = args[0];
            let ticket;

            try {
                if (ticketId) {
                    // Try to fetch by ticketId first
                    ticket = await supabaseHandler.getTicketById(ticketId);
                    if (!ticket) {
                        // If not found by ticketId, try to fetch by channelId
                        ticket = await supabaseHandler.getTicketByChannelId(ticketId);
                    }
                } else {
                    // If no argument, assume current channel
                    ticket = await supabaseHandler.getTicketByChannelId(message.channelId);
                }

                if (!ticket) {
                    try {
                        await message.reply({ content: '⚠️ Could not find a ticket with the provided ID/channel or in this channel.', flags: MessageFlags.Ephemeral });
                    } catch {
                        await message.reply('⚠️ Could not find a ticket with the provided ID/channel or in this channel.');
                    }
                    return;
                }

                const newIgnoreStatus = !ticket.ignore_inactivity; // Toggle the status
                await supabaseHandler.updateTicket(ticket.id, { ignore_inactivity: newIgnoreStatus });

                const statusMessage = newIgnoreStatus ? 'now ignoring' : 'no longer ignoring';
                try {
                    await message.reply({ content: `✅ Ticket \`${ticket.id}\` is ${statusMessage} inactivity.`, flags: MessageFlags.Ephemeral });
                } catch {
                    await message.reply(`✅ Ticket \`${ticket.id}\` is ${statusMessage} inactivity.`);
                }
                logger.info(`Toggled inactivity ignore for ticket ${ticket.id} to ${newIgnoreStatus}.`);

            } catch (error) {
                logger.error(`Error executing ignoreinactivity command for ticket ${ticketId || message.channelId}: ${error.message}`, error);
                try {
                    await message.reply({ content: '⚠️ An unexpected error occurred while toggling inactivity ignore.', flags: MessageFlags.Ephemeral });
                } catch {
                    await message.reply('⚠️ An unexpected error occurred while toggling inactivity ignore.');
                }
            }
        },
    },
    {
        name: 'addconversion',
        description: 'Adds the "Check My Conversion Eligibility" button to a ticket.',
        execute: async (message, args) => {
            const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
            const STAFF_ROLE_ID = config.staffRoleId;
            const INTERN_ROLE_ID = config.internRoleId;

            if (!message.member || (!message.member.roles.cache.has(STAFF_ROLE_ID) && !message.member.roles.cache.has(INTERN_ROLE_ID))) {
                try {
                    await message.reply({ content: "❌ You don't have permission to use this command.", flags: MessageFlags.Ephemeral });
                } catch {
                    await message.reply("❌ You don't have permission to use this command.");
                }
                return;
            }

            const channel = message.channel;
            const channelName = channel?.name;

            if (!channelName) {
                try {
                    await message.reply({ content: '⚠️ Could not determine channel name.', flags: MessageFlags.Ephemeral });
                } catch {
                    await message.reply('⚠️ Could not determine channel name.');
                }
                return;
            }

            const ticketMatch = channelName.match(/^(?:ticket|closed)-(\d+)-|^(\d+)-/);
            const ticketId = ticketMatch ? (ticketMatch[1] || ticketMatch[2]) : null;

            if (!ticketId) {
                try {
                    await message.reply({ content: '⚠️ This command can only be used in a ticket channel.', flags: MessageFlags.Ephemeral });
                } catch {
                    await message.reply({ content: '⚠️ This command can only be used in a ticket channel.' });
                }
                return;
            }

            try {
                const eligibilityButton = new ButtonBuilder()
                    .setCustomId(`check_eligibility:${ticketId}`)
                    .setLabel('Check My Conversion Eligibility')
                    .setStyle(ButtonStyle.Primary);

                // Add the "Check Burn TX" button
                const burnTxButton = new ButtonBuilder()
                    .setCustomId(`check_burn_tx:${ticketId}`)
                    .setLabel('Check Burn TX')
                    .setStyle(ButtonStyle.Secondary);

                // Create a new action row with both buttons
                const row = new ActionRowBuilder().addComponents(eligibilityButton, burnTxButton);

                await channel.send({
                    content: 'Staff has added the conversion eligibility and burn transaction check buttons for you:',
                    components: [row]
                });

                logger.info(`Added conversion eligibility and burn tx buttons to ticket ${ticketId} in channel ${channelName}.`);
                try {
                    await message.reply({ content: `✅ Added conversion eligibility and burn transaction buttons to ticket \`${ticketId}\`.`, flags: MessageFlags.Ephemeral });
                } catch {
                    await message.reply({ content: `✅ Added conversion eligibility and burn transaction buttons to ticket \`${ticketId}\`.` });
                }

            } catch (error) {
                logger.error(`Error executing addconversion command for ticket ${ticketId}: ${error.message}`, error);
                try {
                    await message.reply({ content: '⚠️ An unexpected error occurred while adding the buttons.', flags: MessageFlags.Ephemeral });
                } catch {
                    await message.reply({ content: '⚠️ An unexpected error occurred while adding the buttons.' });
                }
            }
        },
    },
    {
        name: 'conversionstatus',
        description: 'Automatically detects conversion status and adds appropriate stage-specific buttons to a ticket.',
        execute: async (message, args) => {
            const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
            const fryConversionHandler = require('../handlers/fryConversionHandler');
            const STAFF_ROLE_ID = config.staffRoleId;
            const INTERN_ROLE_ID = config.internRoleId;

            if (!message.member || (!message.member.roles.cache.has(STAFF_ROLE_ID) && !message.member.roles.cache.has(INTERN_ROLE_ID))) {
                try {
                    await message.reply({ content: "❌ You don't have permission to use this command.", flags: MessageFlags.Ephemeral });
                } catch {
                    await message.reply("❌ You don't have permission to use this command.");
                }
                return;
            }

            const channel = message.channel;
            const channelName = channel?.name;

            if (!channelName) {
                try {
                    await message.reply({ content: '⚠️ Could not determine channel name.', flags: MessageFlags.Ephemeral });
                } catch {
                    await message.reply('⚠️ Could not determine channel name.');
                }
                return;
            }

            const ticketMatch = channelName.match(/^(?:ticket|closed)-(\d+)-|^(\d+)-/);
            const ticketId = ticketMatch ? (ticketMatch[1] || ticketMatch[2]) : null;

            if (!ticketId) {
                try {
                    await message.reply({ content: '⚠️ This command can only be used in a ticket channel.', flags: MessageFlags.Ephemeral });
                } catch {
                    await message.reply({ content: '⚠️ This command can only be used in a ticket channel.' });
                }
                return;
            }

            try {
                // Get the ticket to find the Algorand address
                const ticket = await supabaseHandler.getTicketById(ticketId);
                if (!ticket) {
                    try {
                        await message.reply({ content: `⚠️ Could not find ticket with ID \`${ticketId}\`.`, flags: MessageFlags.Ephemeral });
                    } catch {
                        await message.reply({ content: `⚠️ Could not find ticket with ID \`${ticketId}\`.` });
                    }
                    return;
                }

                let algorandAddress = ticket.algorand_address;
                
                // If no address in ticket, check if one was provided as an argument
                if (!algorandAddress || algorandAddress === 'N/A') {
                    if (args.length > 0) {
                        algorandAddress = args[0];
                    } else {
                        try {
                            await message.reply({ content: '⚠️ No Algorand address found in ticket. Please provide one as an argument: `!conversionstatus <algorand_address>`', flags: MessageFlags.Ephemeral });
                        } catch {
                            await message.reply({ content: '⚠️ No Algorand address found in ticket. Please provide one as an argument: `!conversionstatus <algorand_address>`' });
                        }
                        return;
                    }
                }

                // Use the new automated conversion status detection
                const { statusMessage, buttonComponents, progressData } = await fryConversionHandler.getConversionStatusAndButtons(algorandAddress, ticketId, ticket.user_id);
                
                // Send the status message
                await channel.send({ content: statusMessage });
                
                // Send the stage-specific buttons if any
                if (buttonComponents && buttonComponents.length > 0) {
                    await channel.send({ 
                        content: '**Conversion Actions:**', 
                        components: buttonComponents 
                    });
                }

                // Update ticket with the address if it was provided as argument
                if (args.length > 0 && algorandAddress !== ticket.algorand_address) {
                    await supabaseHandler.updateTicket(ticketId, { algorand_address: algorandAddress });
                    // Reason: log masked addresses only to avoid leaking wallet identifiers in runtime logs.
                    logger.info(`Updated ticket ${ticketId} with Algorand address (masked): ${maskAddress(algorandAddress)}`);
                }

                logger.info(`Added automated conversion status and buttons to ticket ${ticketId} for address (masked): ${maskAddress(algorandAddress)}.`);
                try {
                    await message.reply({ content: `✅ Added automated conversion status and stage-specific buttons for \`${algorandAddress}\` to ticket \`${ticketId}\`.`, flags: MessageFlags.Ephemeral });
                } catch {
                    await message.reply({ content: `✅ Added automated conversion status and stage-specific buttons for \`${algorandAddress}\` to ticket \`${ticketId}\`.` });
                }

            } catch (error) {
                logger.error(`Error executing conversionstatus command for ticket ${ticketId}: ${error.message}`, error);
                try {
                    await message.reply({ content: '⚠️ An unexpected error occurred while checking conversion status and adding buttons.', flags: MessageFlags.Ephemeral });
                } catch {
                    await message.reply({ content: '⚠️ An unexpected error occurred while checking conversion status and adding buttons.' });
                }
            }
        },
    },
    {
        name: 'inactivity',
        description: 'Run or preview the inactivity check. Usage: !inactivity scan|run|ticket <id> [--force]',
        execute: async (message, args) => {
            // Reason: restrict inactivity tooling to ticket admins only.
            const TICKET_ADMIN_ROLE_ID = config.ticketAdminRoleId;
            const client = message.client;
            const isTicketAdmin = message.member && message.member.roles.cache.has(TICKET_ADMIN_ROLE_ID);
            const replyEphemeral = async (text) => {
                try { await message.reply({ content: text, flags: MessageFlags.Ephemeral }); } catch { await message.reply(text); }
            };

            if (!isTicketAdmin) {
                return replyEphemeral('❌ Only ticket admins can run inactivity commands.');
            }

            const sub = (args[0] || 'scan').toLowerCase();
            const force = args.includes('--force') || args.includes('-f');

            try {
                if (sub === 'scan') {
                    const inactiveTickets = await supabaseHandler.getInactiveTicketsRpc();
                    const filtered = (inactiveTickets || []).filter(t => !t.ignore_inactivity);
                    const summaryLines = filtered.slice(0, 25).map(t => {
                        const role = t.last_message_from_role || 'unknown';
                        const lastMsg = t.last_message_at || 'N/A';
                        const pings = `user:${t.inactivity_ping_count||0} staff:${t.staff_ping_count||0}`;
                        return `• id:${t.id} channel:${t.channel_id} role:${role} last:${lastMsg} pings:${pings}`;
                    });
                    await replyEphemeral(`✅ Inactivity scan found ${filtered.length} tickets (showing up to 25):\n${summaryLines.join('\n')}`);
                    return;
                }

                if (sub === 'run') {
                    if (!force) return replyEphemeral('⚠️ This will send pings and may auto-close tickets. Re-run with `--force` to confirm.');
                    const inactiveTickets = await supabaseHandler.getInactiveTicketsRpc();
                    const filtered = (inactiveTickets || []).filter(t => !t.ignore_inactivity);
                    await replyEphemeral(`✅ Executing inactivity run on ${filtered.length} ticket(s). Processing sequentially...`);
                    for (const t of filtered) {
                        await new Promise(r => setTimeout(r, 1000));
                        try {
                            const now = Date.now();
                            const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
                            if (t.last_message_from_role === 'staff') {
                                const pingCount = t.inactivity_ping_count || 0;
                                const lastUserPingAt = t.last_inactivity_ping_at ? new Date(t.last_inactivity_ping_at).getTime() : 0;
                                const timeSinceLastUserPing = now - lastUserPingAt;
                                if (pingCount === 0 && (now - new Date(t.last_message_at).getTime()) >= TWENTY_FOUR_HOURS_MS) {
                                    await inactivityPinger.pingUserForInactivity(client, t);
                                } else if (pingCount === 1 && timeSinceLastUserPing >= TWENTY_FOUR_HOURS_MS) {
                                    await inactivityPinger.pingUserForInactivity(client, t);
                                } else if (pingCount >= 2 && timeSinceLastUserPing >= TWENTY_FOUR_HOURS_MS) {
                                    await inactivityPinger.autoCloseInactiveTicket(client, t);
                                }
                            } else if (t.last_message_from_role === 'user') {
                                const staffPingCount = t.staff_ping_count || 0;
                                const lastStaffPingAt = t.last_staff_ping_at ? new Date(t.last_staff_ping_at).getTime() : 0;
                                const timeSinceLastStaffPing = now - lastStaffPingAt;
                                if (staffPingCount === 0 && (now - new Date(t.last_message_at).getTime()) >= TWENTY_FOUR_HOURS_MS) {
                                    await inactivityPinger.pingModeratorForInactivity(client, t);
                                } else if (staffPingCount === 1 && timeSinceLastStaffPing >= TWENTY_FOUR_HOURS_MS) {
                                    await inactivityPinger.pingModeratorForInactivity(client, t);
                                }
                            } else {
                                logger.info(`Skipping ticket ${t.id} due to unknown last_message_from_role: ${t.last_message_from_role}`);
                            }
                        } catch (ticketErr) {
                            logger.error(`Failed to process ticket ${t.id} in manual run: ${ticketErr.message}`, ticketErr);
                        }
                    }
                    await replyEphemeral('✅ Inactivity run finished. Check logs for details.');
                    return;
                }

                if (sub === 'ticket') {
                    const target = args[1];
                    if (!target) return replyEphemeral('⚠️ Please provide a ticket id or channel id. Usage: `!inactivity ticket <ticketId|channelId> [--force]`');
                    let ticket = await supabaseHandler.getTicketById(target);
                    if (!ticket) ticket = await supabaseHandler.getTicketByChannelId(target);
                    if (!ticket) return replyEphemeral(`⚠️ Could not find ticket for "${target}".`);
                    const willAutoClose = ticket.last_message_from_role === 'staff' && (ticket.inactivity_ping_count || 0) >= 2;
                    if (willAutoClose && !force) {
                        return replyEphemeral('⚠️ This ticket would be auto-closed by this action. Re-run with `--force` (ticket admins only).');
                    }
                    if (ticket.last_message_from_role === 'staff') {
                        await inactivityPinger.pingUserForInactivity(client, ticket);
                    } else if (ticket.last_message_from_role === 'user') {
                        await inactivityPinger.pingModeratorForInactivity(client, ticket);
                    } else {
                        return replyEphemeral('⚠️ Ticket role status unknown; nothing to do.');
                    }
                    await replyEphemeral(`✅ Performed inactivity action for ticket ${ticket.id}.`);
                    return;
                }

                await replyEphemeral('⚠️ Unknown subcommand. Usage: `!inactivity scan|run|ticket <id> [--force]`');
            } catch (err) {
                logger.error('Error executing inactivity command:', err);
                await replyEphemeral('⚠️ Error while executing inactivity command. Check logs.');
            }
        },
    },
    {
        name: 'closeall',
        description: 'Deletes all channels within a specified category.',
        execute: async (message, args) => {
            // Check if the user has the required role (assuming STAFF_ROLE_ID is available)
            const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || config.STAFF_ROLE_ID; // Assuming it's in config or env
            if (!message.member || !message.member.roles.cache.has(STAFF_ROLE_ID)) {
                return message.reply("❌ You don't have permission to use this command.");
            }

            // Extract category ID from the command
            if (args.length < 1) {
                return message.reply("❌ Please provide the category ID.\nUsage: `!closeall <category_id>`");
            }

            const categoryId = args[0]; // Args are split by space, category ID is the first arg

            // Fetch all channels in the guild
            await message.guild.channels.fetch();

            // Filter channels belonging to the given category
            const channelsToDelete = message.guild.channels.cache.filter(channel => channel.parentId === categoryId);

            if (channelsToDelete.size === 0) {
                return message.reply("⚠️ No channels found under this category.");
            }

            // Delete channels properly using Promise.all()
            try {
                await Promise.all(channelsToDelete.map(channel => channel.delete()));
                await message.reply(`✅ Successfully deleted **${channelsToDelete.size}** channels in category **${categoryId}**.`);
            } catch (error) {
                logger.error(`❌ Error deleting channels in category ${categoryId}:`, error);
                await message.reply("⚠️ An error occurred while deleting channels. Some may not have been removed.");
            }
        },
    },
    {
        name: 'notifytickets',
        description: 'Sends a notification message to all active ticket channels.',
        execute: async (message, args) => {
             // Check if the user is staff (assuming STAFF_ROLE_ID is available)
            const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || config.STAFF_ROLE_ID; // Assuming it's in config or env
            if (!message.member || !message.member.roles.cache.has(STAFF_ROLE_ID)) {
                return message.reply("❌ You don't have permission to use this command.");
            }

            // Use the guild with pre-fetched data
            const guild = message.guild;
            await guild.channels.fetch();
            const channels = message.guild.channels.cache;

            // Assuming ticketCategoryIds is available via config or another import
            // Need to ensure ticketCategoryIds is accessible here.
            // Let's add it to config or pass it. For now, assume it's accessible.
            // It's defined in discofrybot.js, need to move it or make it accessible.
            // Let's add it to config.js.

            // For now, I will hardcode the category IDs based on the discofrybot.js content.
            // TODO: Make ticketCategoryIds accessible via config or parameter.
            const ticketCategoryIds = [process.env.TICKET_CAT1, process.env.TICKET_CAT2].filter(id => id); // Get from env

            if (ticketCategoryIds.length === 0) {
                 await message.reply('⚠️ Ticket category IDs are not configured.');
                 return;
            }


            const ticketChannels = channels.filter(channel => {
                return ticketCategoryIds.includes(channel.parentId);
            });

            if (ticketChannels.size === 0) {
                return message.reply("⚠️ No active ticket channels found in the specified categories.");
            }

            await message.channel.send(`✅ Scheduling notification for ${ticketChannels.size} ticket channels with a 10-second delay between each!`);

            let sentCount = 0;
            let delay = 0;
            const delayIncrement = 10000; // 10 seconds

            for (const [channelId, channel] of ticketChannels) {
                setTimeout(async () => {
                    try {
                        const ticketNameParts = channel.name.split('-');
                        const username = ticketNameParts.length > 1 ? ticketNameParts[1].trim() : null;
                        let mention = username ? `Hey ${username}` : 'Hey there';

                        if (username) {
                            const member = guild.members.cache.find(m => {
                                const usernameMatch = m.user.username.toLowerCase() === username.toLowerCase();
                                const nicknameMatch = m.nickname && m.nickname.toLowerCase() === username.toLowerCase();
                                return usernameMatch || nicknameMatch;
                            });

                            if (member) {
                                mention = `<@${member.id}>`;
                            }
                        }

                        const announcement = `${mention},\n\n**We sincerely apologize for the unexpected delays on our end regarding shipping orders. We understand how frustrating this can be, and we truly appreciate your patience.\nPlease rest assured that we have **not forgotten about your order**. Due to the current backlog, we typically process orders on a first-in, first-out basis, but we will be prioritizing your order to ensure it gets completed before the rest.\nWe are actively working to get everything fulfilled as soon as possible, and we will soon start to provide updates again as we make progress. If you have any further concerns, feel free to reply here, and we'll do our best to assist you.\nThank you for your understanding and support!`;
                        await channel.send(announcement);
                        sentCount++;
                    } catch (error) {
                        logger.error(`❌ Failed to send message to ${channel.name}: ${error.message}`);
                    }
                }, delay);
                delay += delayIncrement;
            }
        },
    },
];

/**
 * Handles incoming prefix command messages and routes them to the appropriate custom command.
 * @param {import('discord.js').Message} message - The message object.
 * @param {string} prefix - The command prefix used.
 * @returns {Promise<boolean>} True if a command was handled, false otherwise.
 */
async function handlePrefixCommand(message, prefix) {
    // Extract command name and arguments
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = customCommands.find(cmd => cmd.name === commandName);

    if (command) {
        try {
            // Execute the command logic
            await command.execute(message, args);
            try {
                await message.delete(); // Delete the command message
            } catch (deleteError) {
                // Reason: avoid logging raw command content in failure paths.
                const messageSummary = summarizeMessageContent(message.content);
                logger.warn(`Failed to delete command message from ${message.author.tag} (length: ${messageSummary.length}): ${deleteError.message}`);
            }
            return true; // Command was found and executed
        } catch (error) {
            logger.error(`Error executing prefix command ${commandName}: ${error.message}`, error);
            await message.reply('⚠️ An unexpected error occurred while executing the command.');
            return true; // Command was found but an error occurred during execution
        }
    }

    // If command is not found in customCommands
    return false;
}

module.exports = {
    handlePrefixCommand,
    customCommands // Export the array if needed elsewhere (e.g., for documentation)
};
