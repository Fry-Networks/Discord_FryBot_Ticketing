// ticketing-system/handlers/flxtimePartnersHandler.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const config = require('../utils/config');
const logger = require('../utils/logger');
const supabaseHandler = require('./supabaseHandler');
const { getTicketActionRow } = require('../utils/ticketUtils');

// MongoDB connection for device storage
const { MongoClient } = require('mongodb');

/**
 * Sends a custom welcome message for Flxtime Partners Support tickets
 * @param {import('discord.js').TextChannel} channel - The ticket channel
 * @param {import('discord.js').User} user - The Discord user who created the ticket
 * @param {Object} ticketData - Validated ticket data
 */
async function sendFlxtimePartnersWelcomeMessage(channel, user, ticketData) {
    try {
        logger.info(`Sending Flxtime Partners welcome message to channel ${channel.id} for user ${user.id}`);

        const welcomeEmbed = new EmbedBuilder()
            .setTitle('🤝 Flxtime Partners Support - Welcome!')
            .setDescription(`Hello ${user.displayName}! Thank you for creating a Flxtime Partners Support ticket.`)
            .addFields(
                {
                    name: '📋 Your Information',
                    value: `**Discord ID:** \`${user.id}\`\n**Solana Wallet:** \`${ticketData.solanaWalletAddress}\`\n**Issue:** ${ticketData.description}`,
                    inline: false
                },
                {
                    name: '📸 Screenshot Required',
                    value: 'To proceed with your request, please submit a screenshot showing:\n\n' +
                           '• Your **yellow "Flexer" role/badge** in the Flxtime Discord server\n' +
                           '• Your **Discord username and display name** visible in the screenshot\n' +
                           '• The screenshot must clearly show both the role and your username together',
                    inline: false
                },
                {
                    name: '⏰ Important Notes',
                    value: '• You have **24 hours** to submit the screenshot\n' +
                           '• If no screenshot is received, we\'ll send you a reminder\n' +
                           '• Only verified Flxtime Flexer members are eligible for this support\n' +
                           '• Once validated, you\'ll receive a free AI Edge Miner key',
                    inline: false
                }
            )
            .setColor(0x9B59B6) // Purple color for Flxtime
            .setFooter({ text: 'Fry Networks × Flxtime Partnership', iconURL: channel.client.user.displayAvatarURL() })
            .setTimestamp();

        await channel.send({
            content: `${user}, your Flxtime Partners Support ticket has been created!`,
            embeds: [welcomeEmbed]
        });

        // Mark the time when welcome message was sent (for tracking 12-hour reminder)
        const ticketId = channel.name.match(/(\d+)/)?.[1];
        if (ticketId) {
            await supabaseHandler.updateTicket(ticketId, {
                created_at: new Date().toISOString() // This will be used for calculating 12-hour reminder
            });
        }

        logger.info(`Flxtime Partners welcome message sent successfully to channel ${channel.id}`);
    } catch (error) {
        logger.error(`Error sending Flxtime Partners welcome message: ${error.message}`, error);
        throw error;
    }
}

/**
 * Handles the admin validation of a Flxtime partner
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction
 * @param {string} ticketId - The ticket ID
 */
async function handleValidateFlxtimeButton(interaction, ticketId) {
    try {
        const staffId = interaction.user.id;
        const staffUsername = interaction.user.username;

        logger.info(`Admin ${staffUsername} (${staffId}) attempting to validate Flxtime partner for ticket ${ticketId}`);

        // Get ticket information first
        const ticket = await supabaseHandler.getTicketById(ticketId);
        if (!ticket) {
            return await interaction.reply({
                content: '❌ Ticket not found.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Check for duplicate key request with database lookup
        const keyHistory = await supabaseHandler.checkFlxtimeKeyHistory(ticket.user_id);
        if (keyHistory.hasKey) {
            logger.warn(`Validation blocked for ticket ${ticketId}: User ${ticket.user_id} already has AEM key from ticket ${keyHistory.previousTicket.id}`);
            
            const issuedDate = new Date(keyHistory.previousTicket.issuedAt);
            const formattedDate = issuedDate.toLocaleDateString() + ' ' + issuedDate.toLocaleTimeString();
            
            return await interaction.reply({ 
                content: `🚫 **Validation Blocked - Duplicate Key Request**\n\nThis user has already received an AEM key:\n**Previous Ticket:** ${keyHistory.previousTicket.id}\n**AEM Key:** \`${keyHistory.previousTicket.keyIssued}\`\n**Issued Date:** ${formattedDate}\n**Issued By:** ${keyHistory.previousTicket.issuedBy}\n\nValidation is disabled to prevent duplicate key issuance.`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Show confirmation dialog for valid requests
        await interaction.reply({
            content: '❓ **Confirm Flxtime Partner Validation**\n\nAre you sure you have confirmed that this user is a valid Flexer with the required role in the Flxtime Discord server?',
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`confirm_flxtime_validation:${ticketId}:yes`)
                        .setLabel('✅ Yes, Validate')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`confirm_flxtime_validation:${ticketId}:no`)
                        .setLabel('❌ Cancel')
                        .setStyle(ButtonStyle.Secondary)
                )
            ],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        logger.error(`Error in handleValidateFlxtimeButton for ticket ${ticketId}: ${error.message}`, error);
        if (!interaction.replied) {
            await interaction.reply({
                content: '⚠️ An error occurred while processing the validation request.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
}

/**
 * Handles the confirmation of Flxtime partner validation
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction  
 * @param {string} ticketId - The ticket ID
 * @param {string} confirmation - 'yes' or 'no'
 */
async function handleValidationConfirmation(interaction, ticketId, confirmation) {
    try {
        if (confirmation !== 'yes') {
            await interaction.update({
                content: '❌ Validation cancelled.',
                components: []
            });
            return;
        }

        const staffId = interaction.user.id;
        const staffUsername = interaction.user.username;

        // Update Supabase with validation
        await supabaseHandler.updateTicket(ticketId, {
            flxtime_validated: true,
            flxtime_validated_by: staffUsername
        });

        // Log the action
        await supabaseHandler.logStaffAction(ticketId, staffId, `${staffUsername} validated Flxtime partner.`);

        await interaction.update({
            content: '✅ **Flxtime Partner Validated!**\n\nThe user has been marked as a validated Flxtime Flexer. The "Issue AEM Key" button is now available.',
            components: []
        });

        // Send confirmation to ticket channel and update staff action buttons
        const ticket = await supabaseHandler.getTicketById(ticketId);
        if (ticket?.channel_id) {
            const channel = await interaction.client.channels.fetch(ticket.channel_id);
            if (channel) {
                const validationEmbed = new EmbedBuilder()
                    .setTitle('✅ Validation Successful!')
                    .setDescription('Your Flxtime Flexer status has been validated by our team.')
                    .addFields({
                        name: 'Next Steps',
                        value: 'Our admin will now generate and issue your free AI Edge Miner key. Please wait for the key to be posted in this channel.',
                        inline: false
                    })
                    .setColor(0x00FF00) // Green color
                    .setFooter({ text: 'Fry Networks × Flxtime Partnership' })
                    .setTimestamp();

                await channel.send({ embeds: [validationEmbed] });

                // Update the original staff action buttons to show "Issue AEM Key" button
                if (ticket.original_message_id) {
                    try {
                        const updatedTicket = await supabaseHandler.getTicketById(ticketId); // Get fresh ticket data with validation status
                        const actionRows = getTicketActionRow(updatedTicket);
                        
                        const originalMessage = await channel.messages.fetch(ticket.original_message_id);
                        await originalMessage.edit({
                            content: 'Staff Actions:',
                            components: actionRows
                        });
                        logger.info(`Updated staff action buttons for ticket ${ticketId} after Flxtime validation`);
                    } catch (updateError) {
                        logger.error(`Failed to update staff action buttons for ticket ${ticketId}: ${updateError.message}`, updateError);
                    }
                }
            }
        }

        logger.info(`Flxtime partner validated successfully for ticket ${ticketId} by ${staffUsername}`);
    } catch (error) {
        logger.error(`Error confirming Flxtime validation for ticket ${ticketId}: ${error.message}`, error);
        const errorResponse = {
            content: '⚠️ An error occurred while confirming the validation.',
            flags: MessageFlags.Ephemeral
        };

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorResponse);
            } else {
                await interaction.reply(errorResponse);
            }
        } catch (responseError) {
            logger.error(`Failed to notify user about validation error for ticket ${ticketId}: ${responseError.message}`, responseError);
        }
    }
}

/**
 * Handles the issuance of an AEM miner key
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction
 * @param {string} ticketId - The ticket ID
 */
async function handleIssueAemKeyButton(interaction, ticketId) {
    try {
        const staffId = interaction.user.id;
        const staffUsername = interaction.user.username;

        logger.info(`Admin ${staffUsername} (${staffId}) attempting to issue AEM key for ticket ${ticketId}`);

        // Check if ticket is validated
        const ticket = await supabaseHandler.getTicketById(ticketId);
        if (!ticket) {
            return await interaction.reply({
                content: '❌ Ticket not found.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Check for duplicate key request with database lookup
        const keyHistory = await supabaseHandler.checkFlxtimeKeyHistory(ticket.user_id);
        if (keyHistory.hasKey) {
            logger.warn(`AEM key issuance blocked for ticket ${ticketId}: User ${ticket.user_id} already has AEM key from ticket ${keyHistory.previousTicket.id}`);
            
            const issuedDate = new Date(keyHistory.previousTicket.issuedAt);
            const formattedDate = issuedDate.toLocaleDateString() + ' ' + issuedDate.toLocaleTimeString();
            
            return await interaction.reply({ 
                content: `🚫 **AEM Key Issuance Blocked - Duplicate Request**\n\nThis user has already received an AEM key:\n**Previous Ticket:** ${keyHistory.previousTicket.id}\n**AEM Key:** \`${keyHistory.previousTicket.keyIssued}\`\n**Issued Date:** ${formattedDate}\n**Issued By:** ${keyHistory.previousTicket.issuedBy}\n\nKey issuance is disabled to prevent duplicate keys.`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (!ticket.flxtime_validated) {
            return await interaction.reply({
                content: '❌ This Flxtime partner has not been validated yet. Please validate them first.',
                flags: MessageFlags.Ephemeral
            });
        }

        if (ticket.aem_key_issued) {
            return await interaction.reply({
                content: `❌ An AEM key has already been issued for this ticket: \`${ticket.aem_key_issued}\``,
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Generate unique AEM key and BYOD license
        const aemKey = await generateUniqueAemKey();
        const byodLicense = await generateUniqueByodKey();

        // Get user information for MongoDB storage
        const user = await interaction.client.users.fetch(ticket.user_id);
        
        // Store in MongoDB
        const deviceData = {
            miner_key: aemKey,
            name: "$FRY AI Edge Miner",
            email: ticket.email,
            order: `FLX${user.displayName}`, // FLX + Discord display name
            byod: byodLicense, // For half rewards
            created_at: new Date(),
            is_registered: false,
            registration: { amount: 0 },
            email_sent: false,
            flxtime_partner: true,
            discord_user_id: ticket.user_id,
            solana_wallet: ticket.solana_wallet_address
        };

        await storeAemKeyInMongoDB(deviceData);

        // Update Supabase ticket
        await supabaseHandler.updateTicket(ticketId, {
            aem_key_issued: aemKey,
            aem_key_issued_at: new Date().toISOString(),
            aem_key_issued_by: staffUsername
        });

        // Log the action
        await supabaseHandler.logStaffAction(ticketId, staffId, `${staffUsername} issued AEM key: ${aemKey}`);

        // Send key to ticket channel
        const channel = await interaction.client.channels.fetch(ticket.channel_id);
        if (channel) {
            const keyEmbed = new EmbedBuilder()
                .setTitle('🎉 Your Free AI Edge Miner Key!')
                .setDescription('Congratulations! Your Flxtime Flexer status has been verified and your free AEM key has been generated.')
                .addFields(
                    {
                        name: '🔑 Your AEM Miner Key',
                        value: `\`\`\`${aemKey}\`\`\``,
                        inline: false
                    },
                    {
                        name: '📝 Important Information',
                        value: '• **License Type:** BYOD (Bring Your Own Device)\n• **Rewards:** 50% of standard rate\n• **Device Type:** AI Edge Miner\n• **Partnership:** Qualified through Flxtime Flexer status',
                        inline: false
                    },
                    {
                        name: '🚀 Next Steps',
                        value: '1. Save your AEM key in a secure location\n2. Register your device following our [Dashboard Registration Guide](https://docs.frynetworks.com/dashboard/registration)\n3. Open a new ticket if you need help with setup',
                        inline: false
                    }
                )
                .setColor(0x9B59B6) // Purple color
                .setFooter({ text: 'Thank you for being a valued Flxtime partner!' })
                .setTimestamp();

            await channel.send({
                content: `${user}, your free AI Edge Miner key is ready! 🎉`,
                embeds: [keyEmbed]
            });

            // Add completion prompt similar to Node Forgo system
            const completionMessage = `Your Flxtime Partners request is now complete! We have validated your Flexer status and issued your free AI Edge Miner key. 

If you have no further questions, you can close the ticket using the button below. If you still need assistance, click "More Questions".`;

            const closeButton = new ButtonBuilder()
                .setCustomId(`conclude_close_ticket:${ticketId}`)
                .setLabel('🔒 Close Ticket')
                .setStyle(ButtonStyle.Success);

            const moreQuestionsButton = new ButtonBuilder()
                .setCustomId(`conclude_more_questions:${ticketId}`)
                .setLabel('❓ More Questions')
                .setStyle(ButtonStyle.Primary);

            const actionRow = new ActionRowBuilder().addComponents(closeButton, moreQuestionsButton);

            await channel.send({
                content: completionMessage,
                components: [actionRow]
            });
        }

        // Refresh staff action buttons to show disabled "AEM Key Issued" label
        try {
            const refreshedTicket = await supabaseHandler.getTicketById(ticketId);
            if (refreshedTicket?.channel_id && refreshedTicket.original_message_id) {
                const ticketChannel = await interaction.client.channels.fetch(refreshedTicket.channel_id);
                if (ticketChannel) {
                    const originalMessage = await ticketChannel.messages.fetch(refreshedTicket.original_message_id);
                    const actionRows = getTicketActionRow(refreshedTicket);
                    await originalMessage.edit({
                        content: 'Staff Actions:',
                        components: actionRows
                    });
                    logger.info(`Updated staff action buttons for ticket ${ticketId} after issuing AEM key.`);
                }
            }
        } catch (buttonUpdateError) {
            logger.error(`Failed to update staff action buttons after issuing AEM key for ticket ${ticketId}: ${buttonUpdateError.message}`, buttonUpdateError);
        }

        await interaction.editReply({
            content: `✅ **AEM Key Issued Successfully!**\n\n**Key:** \`${aemKey}\`\n\nThe key has been posted to the ticket channel and stored in the database with all necessary internal details.`
        });

        logger.info(`AEM key ${aemKey} issued successfully for ticket ${ticketId} by ${staffUsername}`);
    } catch (error) {
        logger.error(`Error issuing AEM key for ticket ${ticketId}: ${error.message}`, error);
        if (interaction.deferred) {
            await interaction.editReply({
                content: '⚠️ An error occurred while generating the AEM key. Please try again later.'
            });
        } else if (!interaction.replied) {
            await interaction.reply({
                content: '⚠️ An error occurred while generating the AEM key. Please try again later.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
}

/**
 * Generates a unique AEM miner key
 * @returns {Promise<string>} The generated AEM key
 */
async function generateUniqueAemKey() {
    const prefix = 'AEM-';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
        let result = '';
        for (let i = 0; i < 32; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const key = prefix + result;
        
        // Check if key already exists in MongoDB
        const exists = await checkAemKeyExists(key);
        if (!exists) {
            logger.info(`Generated unique AEM key: ${key}`);
            return key;
        }
        
        attempts++;
        logger.warn(`AEM key collision detected: ${key}. Attempt ${attempts}/${maxAttempts}`);
    }
    
    throw new Error('Failed to generate unique AEM key after maximum attempts');
}

/**
 * Generates a unique BYOD license key
 * @returns {Promise<string>} The generated BYOD license
 */
async function generateUniqueByodKey() {
    const prefix = 'FLXAEM';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
        let result = '';
        for (let i = 0; i < 28; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const license = prefix + result;
        
        // Check if license already exists in MongoDB
        const exists = await checkByodLicenseExists(license);
        if (!exists) {
            logger.info(`Generated unique BYOD license: ${license}`);
            return license;
        }
        
        attempts++;
        logger.warn(`BYOD license collision detected: ${license}. Attempt ${attempts}/${maxAttempts}`);
    }
    
    throw new Error('Failed to generate unique BYOD license after maximum attempts');
}

/**
 * Checks if an AEM key already exists in MongoDB
 * @param {string} key - The AEM key to check
 * @returns {Promise<boolean>} Whether the key exists
 */
async function checkAemKeyExists(key) {
    let client;
    try {
        const mongoUri = process.env.MONGO_FLX_URI;
        if (!mongoUri) {
            throw new Error('MONGO_FLX_URI environment variable not set');
        }

        client = new MongoClient(mongoUri);
        await client.connect();
        
        const db = client.db('main');
        const collection = db.collection('devices');
        
        const existing = await collection.findOne({ miner_key: key });
        return !!existing;
    } catch (error) {
        logger.error(`Error checking AEM key existence: ${error.message}`, error);
        return false;
    } finally {
        if (client) {
            await client.close();
        }
    }
}

/**
 * Checks if a BYOD license already exists in MongoDB
 * @param {string} license - The BYOD license to check
 * @returns {Promise<boolean>} Whether the license exists
 */
async function checkByodLicenseExists(license) {
    let client;
    try {
        const mongoUri = process.env.MONGO_FLX_URI;
        if (!mongoUri) {
            throw new Error('MONGO_FLX_URI environment variable not set');
        }

        client = new MongoClient(mongoUri);
        await client.connect();
        
        const db = client.db('main');
        const collection = db.collection('devices');
        
        const existing = await collection.findOne({ byod: license });
        return !!existing;
    } catch (error) {
        logger.error(`Error checking BYOD license existence: ${error.message}`, error);
        return false;
    } finally {
        if (client) {
            await client.close();
        }
    }
}

/**
 * Stores an AEM key and device data in MongoDB
 * @param {Object} deviceData - The device data to store
 */
async function storeAemKeyInMongoDB(deviceData) {
    let client;
    try {
        const mongoUri = process.env.MONGO_FLX_URI;
        if (!mongoUri) {
            throw new Error('MONGO_FLX_URI environment variable not set');
        }

        client = new MongoClient(mongoUri);
        await client.connect();
        
        const db = client.db('main');
        const collection = db.collection('devices');
        
        const result = await collection.insertOne(deviceData);
        logger.info(`AEM device data stored in MongoDB with ID: ${result.insertedId}`);
        
        return result.insertedId;
    } catch (error) {
        logger.error(`Error storing AEM device data in MongoDB: ${error.message}`, error);
        throw error;
    } finally {
        if (client) {
            await client.close();
        }
    }
}

/**
 * Sends a screenshot reminder to users who haven't submitted one
 * @param {import('discord.js').Client} client - The Discord client
 * @param {Object} ticket - The ticket data
 */
async function sendScreenshotReminder(client, ticket) {
    try {
        logger.info(`Sending screenshot reminder for ticket ${ticket.id}`);
        
        const channel = await client.channels.fetch(ticket.channel_id);
        if (!channel) {
            logger.warn(`Channel ${ticket.channel_id} not found for reminder`);
            return;
        }

        const user = await client.users.fetch(ticket.user_id);
        
        const reminderEmbed = new EmbedBuilder()
            .setTitle('⏰ Screenshot Reminder')
            .setDescription(`${user}, you created a Flxtime Partners Support ticket **12 hours ago** but haven't submitted the required screenshot yet.`)
            .addFields({
                name: '📸 Required Screenshot',
                value: 'Please submit a screenshot showing:\n\n' +
                       '• Your **yellow "Flexer" role/badge** in the Flxtime Discord server\n' +
                       '• Your **Discord username and display name** clearly visible\n' +
                       '• Both the role and username must be in the same screenshot',
                inline: false
            })
            .setColor(0xFF9900) // Orange color for warning
            .setFooter({ text: 'This is a friendly reminder - no action is taken on your ticket.' })
            .setTimestamp();

        await channel.send({
            content: `${user} 👆 Screenshot reminder`,
            embeds: [reminderEmbed]
        });

        // Update the ticket to mark reminder as sent
        await supabaseHandler.updateTicket(ticket.id, {
            screenshot_reminder_sent_at: new Date().toISOString()
        });

        logger.info(`Screenshot reminder sent successfully for ticket ${ticket.id}`);
    } catch (error) {
        logger.error(`Error sending screenshot reminder for ticket ${ticket.id}: ${error.message}`, error);
    }
}

/**
 * Tracks when a screenshot is submitted by the user
 * @param {string} ticketId - The ticket ID
 */
async function trackScreenshotSubmission(ticketId) {
    try {
        await supabaseHandler.updateTicket(ticketId, {
            screenshot_submitted_at: new Date().toISOString()
        });
        logger.info(`Screenshot submission tracked for ticket ${ticketId}`);
    } catch (error) {
        logger.error(`Error tracking screenshot submission for ticket ${ticketId}: ${error.message}`, error);
    }
}

/**
 * Validates a Flxtime role (future implementation when bot has access to Flxtime server)
 * @param {string} userId - Discord user ID
 * @param {import('discord.js').Client} client - Discord client instance
 * @returns {Promise<boolean>} Whether the user has the Flexer role
 */
async function validateFlxtimeRole(userId, client) {
    try {
        // Check if automated verification is enabled
        if (!config.flxtimeVerificationEnabled) {
            logger.info(`Flxtime automated verification is disabled - manual validation required for user ${userId}`);
            return false;
        }

        // Check if we have the required configuration
        if (!config.flxtimeServerId || !config.flxtimeFlexerRoleId) {
            logger.warn(`Flxtime server configuration missing - manual validation required for user ${userId}`);
            return false;
        }

        logger.info(`Attempting automated Flxtime role verification for user ${userId}`);

        // Try to fetch the Flxtime server
        const flxtimeServer = await client.guilds.fetch(config.flxtimeServerId).catch(() => null);
        if (!flxtimeServer) {
            logger.warn(`Cannot access Flxtime server (${config.flxtimeServerId}) - bot may not be added to server yet`);
            return false;
        }

        // Try to fetch the member from Flxtime server
        const member = await flxtimeServer.members.fetch(userId).catch(() => null);
        if (!member) {
            logger.info(`User ${userId} is not a member of Flxtime server`);
            return false;
        }

        // Check if user has the Flexer role
        const hasFlexerRole = member.roles.cache.has(config.flxtimeFlexerRoleId);
        
        if (hasFlexerRole) {
            logger.info(`✅ Automated verification successful: User ${userId} has Flexer role in Flxtime server`);
            return true;
        } else {
            logger.info(`❌ User ${userId} exists in Flxtime server but does not have Flexer role`);
            return false;
        }

    } catch (error) {
        logger.error(`Error during automated Flxtime role verification for user ${userId}: ${error.message}`, error);
        return false;
    }
}

module.exports = {
    sendFlxtimePartnersWelcomeMessage,
    handleValidateFlxtimeButton,
    handleValidationConfirmation,
    handleIssueAemKeyButton,
    sendScreenshotReminder,
    trackScreenshotSubmission,
    validateFlxtimeRole,
    generateUniqueAemKey,
    generateUniqueByodKey,
    storeAemKeyInMongoDB
};
