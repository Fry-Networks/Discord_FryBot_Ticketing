require('dotenv').config();
const { Client, Events, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const logger = require('./logger');
const supabaseHandler = require('./NewTicketLogic/handlers/supabaseHandler'); // Import supabaseHandler
const { extractAndValidateUrls, normalizeMessage } = require('./messageFilter'); // Import the filtering logic
const config = require('./NewTicketLogic/utils/config'); // Add this import
const { handlePrefixCommand } = require('./NewTicketLogic/commands/customCommands'); // Import the prefix command handler

// Configuration from .env
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;
const INTERN_ROLE_ID = process.env.INTERN_ROLE_ID;

// Add this code block after the variable declarations, before any event handlers

// Get excluded bot and staff IDs
let excludedBotIds = new Set();
try {
    const botMap = JSON.parse(process.env.BOT_MAP || '{}');
    excludedBotIds = new Set(Object.keys(botMap));
    logger.info(`Excluding bots with IDs: ${Array.from(excludedBotIds).join(', ')}`);
} catch (error) {
    logger.error(`Error parsing BOT_MAP environment variable: ${error.message}`);
    // excludedBotIds will remain empty in case of error
}

// Staff IDs are keys in staffCategoryMapping from the imported config
const excludedStaffIds = new Set(Object.keys(config.staffCategoryMapping));
logger.info(`Excluding staff with IDs: ${Array.from(excludedStaffIds).join(', ')}`);


// Load ticket category IDs dynamically
    const ticketCategoryIds = [];
    for (let i = 1; i <= 2; i++) {
        const envVar = process.env[`TICKET_CAT${i}`];
        if (envVar) {
            ticketCategoryIds.push(envVar);
        }
    }

// Rate limit map (5-second cooldown per user)
const cooldowns = new Map();

// Validate required environment variables
function validateConfig() {
    const requiredVars = [
        'DISCORD_TOKEN',
        'LOW_BAL_CHANNEL_ID',
        'LOG_CHANNEL_ID',
        'STAFF_ROLE_ID',
        'INTERN_ROLE_ID',
        'FRYBAL_ROLE_ID',
        'REWARD_WALLET_ADDRESS',
        'ASSET_ID_FNODE',
        'ASSET_ID_FRY1',
        'CLIENT_ID',
        'GUILD_ID',
        'CLOSED_TICKET_CAT'
    ];
    for (let i = 1; i <= 2; i++) {
        requiredVars.push(`TICKET_CAT${i}`);
    }
    for (const varName of requiredVars) {
        if (!process.env[varName]) {
            logger.error(`Missing required environment variable: ${varName}`);
            return false;
        }
    }
    return true;
}

if (!validateConfig()) process.exit(1);


// Discord client setup
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});
// Ticket system integration
//const { registerTicketCommands, setupTicketPanel } = require('./ticketSystem');
const { initializeTicketSystem } = require('./NewTicketLogic/ticketSystem');
// require('./Ticket-System/ticketClaimManager')(client);
require('./balanceCheck')(client); // Initialize balance checking

// === UPDATED CODE: Notify Tickets Command with Debugging ===
client.on('messageCreate', async (message) => {
    // Ignore messages from excluded bots
    if (excludedBotIds.has(message.author.id)) {
        logger.info(`Ignoring message from excluded bot ${message.author.tag} (ID: ${message.author.id}).`);
        return;
    }

    // Check if the author is a staff member (either STAFF_ROLE_ID or INTERN_ROLE_ID)
    const isStaff = message.member && (message.member.roles.cache.has(STAFF_ROLE_ID) || message.member.roles.cache.has(INTERN_ROLE_ID));

    // --- Category and Command Check ---
    const monitoredCategoryId = '1085875820750458952'; // Your specified category ID
    const prefix = '!'; // Define the command prefix
    const isCommand = message.content.startsWith(prefix);

    /**
     * Check if a channel belongs to the monitored category, including forum threads
     * @param {import('discord.js').GuildChannel} channel - The Discord channel to check
     * @param {string} targetCategoryId - The category ID to search for
     * @returns {boolean} - True if channel belongs to monitored category
     */
    function isChannelInMonitoredCategory(channel, targetCategoryId) {
        if (!channel) return false;
        
        // Direct parent check (regular channels)
        if (channel.parentId === targetCategoryId) {
            return true;
        }
        
        // Forum thread check (grandparent is category)
        if (channel.parent && channel.parent.parentId === targetCategoryId) {
            return true;
        }
        
        // Additional safety: walk up the full parent chain
        let currentChannel = channel;
        let depth = 0;
        while (currentChannel && depth < 5) { // Prevent infinite loops
            if (currentChannel.parentId === targetCategoryId) {
                return true;
            }
            currentChannel = currentChannel.parent;
            depth++;
        }
        
        return false;
    }

    // If the message is NOT a command OR (it IS a command AND not from staff)
    // AND the channel is NOT in the monitored category, ignore it.
    const isInMonitoredCategory = isChannelInMonitoredCategory(message.channel, monitoredCategoryId);
    if ((!isCommand || (isCommand && !isStaff)) && !isInMonitoredCategory) {
        logger.info(`Ignoring message "${message.content}" from ${message.author.tag} in channel ${message.channel.name} (Parent ID: ${message.channel.parentId}, Type: ${message.channel.type}) because it's not a staff command and not in the monitored category.`);
        return;
    }
    // ----------------------------------

    // --- Existing logging line (keep this) ---
    logger.info(`[RAW MESSAGE CONTENT] from ${message.author.tag} (ID: ${message.author.id}): "${message.content}"`);
    // -----------------------------------------

    // Ignore messages from bots (if you commented this out, it will process bot messages)
    // if (message.author.bot) return;

    // Ignore messages containing @everyone or @here mentions
    if (message.mentions.everyone) {
        logger.info(`🚫 Ignoring message from ${message.author.tag} because it contains @everyone or @here`);
        return;
    }

    // --- Start of updated filtering logic with tiered actions ---
    if (!isCommand && !isStaff) {
    // Normalize the message content

    const rawContent = message.content;
    // Use the imported normalizeMessage function
    const normalizedContent = normalizeMessage(rawContent);

    logger.info(`Received message from ${message.author.tag}: "${rawContent}"`);
    logger.info(`Normalized message: "${normalizedContent}"`);

    // Use the imported extractAndValidateUrls function and pass the guild ID
    const detectionResult = extractAndValidateUrls(normalizedContent, message.guild.id); // Pass guild ID

    if (detectionResult.isSuspicious) {
        logger.warn(`🚨 Suspicious pattern detected from ${message.author.tag} (ID: ${message.author.id}) in channel ${message.channel.name} (ID: ${message.channel.id}). Type: ${detectionResult.type}`);
        logger.warn(`Original message: "${rawContent}"`);
        logger.warn(`Normalized message: "${normalizedContent}"`);
        if (detectionResult.pattern) logger.warn(`Detected pattern: "${detectionResult.pattern}"`);
        if (detectionResult.domain) logger.warn(`Detected domain: "${detectionResult.domain}"`);


        // --- Tiered Actions based on suspicion type ---

        // Immediate action for high-risk patterns like Discord invites
        if (detectionResult.type === 'discord_invite' || detectionResult.type === 'high_risk_domain') {
             const highRiskLabel = detectionResult.type === 'discord_invite' ? 'Discord invite' : 'High-risk domain';
             logger.warn(`⚡ ${highRiskLabel} detected. Taking immediate action.`);
             try {
                // Delete the message
                await message.delete();
                logger.info(`✅ Deleted suspicious message from ${message.author.tag}.`);

                // Ban the user
                const member = message.guild.members.cache.get(message.author.id);
                if (member) {
                    const banReasonDetails = detectionResult.domain ? `${detectionResult.type}:${detectionResult.domain}` : detectionResult.type;
                    await member.ban({ reason: `Posting high-risk disallowed link (${banReasonDetails}).` });
                    logger.info(`✅ Banned user ${message.author.tag}.`);
                } else {
                    logger.error(`❌ Could not find guild member for user ID ${message.author.id} to ban.`);
                }

                // Send high-priority alert to mod channel
                const modAlertChannelId = process.env.LOG_CHANNEL_ID;
                if (modAlertChannelId) {
                    const modAlertChannel = message.guild.channels.cache.get(modAlertChannelId);
                    if (modAlertChannel) {
                        const alertEmbed = new EmbedBuilder()
                            .setColor(0xFF0000) // Red for high-risk
                            .setTitle('🚨 High-Risk Disallowed Link Detected & User Banned 🚨')
                             .addFields(
                                { name: 'User', value: `<@${message.author.id}>`, inline: true },
                                { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
                                { name: 'Suspicion Type', value: detectionResult.type, inline: true },
                                { name: 'Original Message', value: `\`\`\`${rawContent.substring(0, 1000)}${rawContent.length > 1000 ? '...' : ''}\`\`\`` },
                                { name: 'Normalized Message', value: `\`\`\`${normalizedContent.substring(0, 1000)}${normalizedContent.length > 1000 ? '...' : ''}\`\`\`` },
                                { name: 'Detected Pattern', value: `\`\`\`${detectionResult.pattern}\`\`\`` }
                            )
                            .addFields(
                                ...(detectionResult.domain ? [{ name: 'Domain', value: detectionResult.domain, inline: true }] : []),
                                ...(detectionResult.reason ? [{ name: 'Reason', value: detectionResult.reason, inline: true }] : [])
                            )
                            .setTimestamp();
                        await modAlertChannel.send({ embeds: [alertEmbed] });
                        logger.info(`✅ Sent high-risk alert to mod channel.`);
                    } else {
                        logger.error(`❌ Mod alert channel with ID ${modAlertChannelId} not found.`);
                    }
                } else {
                    logger.error('❌ LOG_CHANNEL_ID environment variable is not set.');
                }

            } catch (error) {
                logger.error(`❌ Error during high-risk action for user ${message.author.tag}: ${error.message}`);
                 // Attempt to send a message to the mod channel even if banning/deleting failed
                 const modAlertChannelId = process.env.LOG_CHANNEL_ID;
                 if (modAlertChannelId) {
                     const modAlertChannel = message.guild.channels.cache.get(modAlertChannelId);
                     if (modAlertChannel) {
                          const errorEmbed = new EmbedBuilder()
                             .setColor(0xFFFF00) // Yellow for errors
                             .setTitle('⚠️ High-Risk Action Failed ⚠️')
                             .setDescription(`Attempted immediate action for user ${message.author.tag} but an error occurred.`)
                             .addFields(
                                 { name: 'User', value: `<@${message.author.id}>`, inline: true },
                                 { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
                                 { name: 'Suspicion Type', value: detectionResult.type, inline: true },
                                 { name: 'Original Message', value: `\`\`\`${rawContent.substring(0, 1000)}${rawContent.length > 1000 ? '...' : ''}\`\`\`` },
                                 { name: 'Error', value: `\`\`\`${error.message}\`\`\`` }
                             )
                             .setTimestamp();
                         modAlertChannel.send({ embeds: [errorEmbed] }).catch(err => logger.error(`Failed to send error alert to mod channel: ${err.message}`));
                     }
                 }
            }

        } else {
            // Only alert for other suspicious patterns (disallowed domain, unparseable)
            logger.warn(`🔶 Potential suspicious pattern detected. Alerting mods for review.`);
             const modAlertChannelId = process.env.LOG_CHANNEL_ID;
             if (modAlertChannelId) {
                 const modAlertChannel = message.guild.channels.cache.get(modAlertChannelId);
                 if (modAlertChannel) {
                      const reviewEmbed = new EmbedBuilder()
                         .setColor(0xFFA500) // Orange for review
                         .setTitle('🔶 Potential Suspicious Link Detected (Review Needed) 🔶')
                         .setDescription('A message contained a pattern that might be a disallowed link. Manual review is recommended.')
                         .addFields(
                             { name: 'User', value: `<@${message.author.id}>`, inline: true },
                             { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
                             { name: 'Suspicion Type', value: detectionResult.type, inline: true },
                             { name: 'Original Message', value: `\`\`\`${rawContent.substring(0, 1000)}${rawContent.length > 1000 ? '...' : ''}\`\`\`` },
                             { name: 'Normalized Message', value: `\`\`\`${normalizedContent.substring(0, 1000)}${normalizedContent.length > 1000 ? '...' : ''}\`\`\`` },
                             { name: 'Detected Pattern', value: `\`\`\`${detectionResult.pattern}\`\`\`` },
                             { name: 'Detected Domain', value: detectionResult.domain || 'N/A', inline: true }
                         )
                         .setTimestamp();
                     modAlertChannel.send({ embeds: [reviewEmbed] }).catch(err => logger.error(`Failed to send review alert to mod channel: ${err.message}`));
                     logger.info(`✅ Sent review alert to mod channel.`);
                 } else {
                     logger.error(`❌ Mod alert channel with ID ${modAlertChannelId} not found.`);
                 }
             } else {
                 logger.error('❌ LOG_CHANNEL_ID environment variable is not set.');
             }
        }

        return; // Stop further processing for this message
    }

        return; // Stop further processing for this message
    }
    // --- End of Scam Detection Logic ---

/*
    // Handle !closeall command
    if (message.content.startsWith('!closeall')) {
        // Check if the user has the required role
        if (!message.member || !message.member.roles.cache.has(STAFF_ROLE_ID)) {
            return message.reply("❌ You don't have permission to use this command.");
        }

        // Extract category ID from the command
        const args = message.content.split(' ');
        if (args.length < 2) {
            return message.reply("❌ Please provide the category ID.\nUsage: `!closeall <category_id>`");
        }

        const categoryId = args[1];

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
    }


    // Handle !notifyTickets Command
    if (message.content === '!notifyTickets') {

        // Use the guild with pre-fetched data
        const guild = message.guild;
        await guild.channels.fetch();
        const channels = message.guild.channels.cache;

        logger.info(`🔍 Total channels in guild: ${channels.size}`);
        logger.info(`🔍 Total members in cache: ${guild.members.cache.size}`);
        logger.info(`🔍 Looking for channels in categories: ${ticketCategoryIds.join(', ')}`);

        const ticketChannels = channels.filter(channel => {
            const isInCategory = ticketCategoryIds.includes(channel.parentId);
            if (isInCategory) {
                logger.info(`✅ Found channel in category: ${channel.name} (ID: ${channel.id}, Type: ${channel.type}, Parent ID: ${channel.parentId})`);
            }
            return isInCategory;
        });

        logger.info(`✅ Found ${ticketChannels.size} ticket channels`);

        if (ticketChannels.size === 0) {
            return message.reply("⚠️ No active ticket channels found in the specified categories.");
        }
        
        let sentCount = 0;
        let delay = 0;
        const delayIncrement = 10000; // 10 seconds

        for (const [channelId, channel] of ticketChannels) {
            setTimeout(async () => {
                try {
                    logger.info(`📢 Processing channel: ${channel.name}`);
                    const ticketNameParts = channel.name.split('-');
                    logger.info(`📢 Split parts: ${JSON.stringify(ticketNameParts)}`);
                    const username = ticketNameParts.length > 1 ? ticketNameParts[1].trim() : null;
                    let mention = username ? `Hey ${username}` : 'Hey there';

                    if (username) {
                        logger.info(`🔍 Searching for member with username: "${username}"`);
                        const member = guild.members.cache.find(m => {
                            const usernameMatch = m.user.username.toLowerCase() === username.toLowerCase();
                            const nicknameMatch = m.nickname && m.nickname.toLowerCase() === username.toLowerCase();
                            if (usernameMatch || nicknameMatch) {
                                logger.info(`✅ Found member: ${m.user.tag} (ID: ${m.id}) for username "${username}"`);
                            }
                            return usernameMatch || nicknameMatch;
                        });

                        if (member) {
                            mention = `<@${member.id}>`;
                        } else {
                            logger.info(`❌ No member found for username: "${username}"`);
                        }
                    }

                    const announcement = `${mention},\n\n**We sincerely apologize for the unexpected delays on our end regarding shipping orders. We understand how frustrating this can be, and we truly appreciate your patience.\nPlease rest assured that we have **not forgotten about your order**. Due to the current backlog, we typically process orders on a first-in, first-out basis, but we will be prioritizing your order to ensure it gets completed before the rest.\nWe are actively working to get everything fulfilled as soon as possible, and we will soon start to provide updates again as we make progress. If you have any further concerns, feel free to reply here, and we'll do our best to assist you.\nThank you for your understanding and support!`;
                    await channel.send(announcement);
                    logger.info(`✅ Sent notification to ${channel.name} with delay ${delay / 1000}s`);
                    sentCount++;
                } catch (error) {
                    logger.error(`❌ Failed to send message to ${channel.name}: ${error.message}`);
                }
            }, delay);
            delay += delayIncrement;
        }

        await message.reply(`✅ Scheduled notification for ${ticketChannels.size} ticket channels with a 10-second delay between each!`);
        return; // Exit the function so it doesn't process further

*/
    // Handle prefix commands using the customCommands handler
    if (isCommand) {
        const commandHandled = await handlePrefixCommand(message, prefix);
        if (commandHandled) {
            return; // Stop further processing if a prefix command was handled
        }
    }
// Handle Bot Mentions (@bot)
if (message.mentions.has(client.user)) {
    // Extract the message content (excluding the mention)
    const userMessage = message.content.replace(/<@!?(\d+)>/, '').trim();

    if (!userMessage) return;

    // Send message to n8n webhook
        try {
            const webhookUrl = process.env.N8N_HOOK;
            // Start typing and keep it active
            const typingInterval = setInterval(() => {
                message.channel.sendTyping();
            }, 4000); // Refresh typing every 4 seconds

            const response = await axios.post(webhookUrl, {
                user: message.author.username,
                nickname: message.member?.nickname || message.author.username, // Use nickname if available
                message: userMessage,
                channelId: message.channel.id
            }, { responseType: 'json' });
            logger.info("🔍 Debug: Received response from n8n:", response.data); // Debugging line

            clearInterval(typingInterval); // Stop typing indicator

            if (response.data && response.data.reply) {
                // Send reply back to Discord
                let replyMessage = response.data.reply;

                // Simulate natural typing delay (1s per 75 characters)
                const typingDelay = Math.min(3000, (replyMessage.length / 75) * 1000);
                await new Promise(resolve => setTimeout(resolve, typingDelay));
                
            // Truncate message if it exceeds Discord's 2000 character limit
            if (replyMessage.length > 2000) {
                replyMessage = replyMessage.substring(0, 1997) + "..."; // Cut off long messages
            }

            // Send reply back to Discord
            await message.reply(replyMessage);
            } else {
                await message.reply("🤖 I didn't get a response from my AI brain. Please try again!");
            }
        } catch (error) {
            clearInterval(typingInterval); // Ensure typing stops even if there's an error
            logger.error("❌ Error calling n8n webhook:", error.message);
                   // Handle Discord rate limits (429 error)
            if (error.response && error.response.status === 429) {
                await message.reply("⚠️ I'm being rate-limited. Please wait a moment.");
            } else {
            await message.reply("🚨 Oops! There was an issue processing your request.");
            }
        }
    }  
});

// Auto-refresh slash commands on bot startup
client.once(Events.ClientReady, async () => {
    logger.info(`✅ Logged in as ${client.user.tag}!`);

    /*await registerTicketCommands();
    setupTicketPanel(client);*/

    // Initialize the ticket system
    const prefix = '!'; // Define the command prefix
    initializeTicketSystem(client, prefix);
    logger.info('🔧 Ticket system initialized.');
        
    // Start Flxtime reminder system (check every 6 hours)
    setInterval(async () => {
        try {
            await checkFlxtimeReminders(client);
        } catch (error) {
            logger.error(`Error in Flxtime reminder check: ${error.message}`, error);
        }
    }, 6 * 60 * 60 * 1000); // 6 hours in milliseconds
    
    logger.info('⏰ Flxtime reminder system started (checking every 6 hours).');
    
    // Fetch guild data
    const guild = client.guilds.cache.first();
    try {
        await guild.channels.fetch();
        await guild.members.fetch({ time: 120000 });
        logger.info(`✅ Guild fully fetched: ${guild.name} (Channels: ${guild.channels.cache.size}, Members: ${guild.members.cache.size})`);
    } catch (error) {
        logger.error(`❌ Failed to fully fetch guild: ${error.message}`);
    }
});

// Graceful shutdown
process.on('SIGINT', () => {
    logger.info('Shutting down...');
    client.destroy();
    process.exit(0);
});

// Run the bot
client.login(DISCORD_TOKEN);
