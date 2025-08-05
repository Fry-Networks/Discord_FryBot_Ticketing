require('dotenv').config();
const { Client, Events, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');

// Configuration from .env
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const STAFF_MOD_CHANNEL_ID = process.env.STAFF_MOD_CHANNEL_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;
const REWARD_WALLET_ADDRESS = process.env.REWARD_WALLET_ADDRESS;
const ASSET_ID_FNODE = parseInt(process.env.ASSET_ID_FNODE);
const ASSET_ID_FRY1 = parseInt(process.env.ASSET_ID_FRY1);

// Load ticket category IDs dynamically
    const ticketCategoryIds = [];
    for (let i = 1; i <= 2; i++) {
        const envVar = process.env[`TICKET_CAT${i}`];
        if (envVar) {
            ticketCategoryIds.push(envVar);
        }
    }

// Persistent thresholds storage
const notificationThresholds = {
    fNode: { 25000: false, 12500: false, 1000: false },
    Fry1: { 100000: false, 30000: false, 1000: false }
};

// Track if we have already sent a refill message
const refillSent = {
    fNode: false,
    Fry1: false
};

// Track previous balance state
const previousBalanceState = {
    fNode: null,
    Fry1: null
};
// "Critical Alert Sent" Flag
const criticalAlertSent = {
    fNode: false,
    Fry1: false
};

let lastStatusTime = 0;
const STATUS_INTERVAL = 8 * 60 * 60 * 1000; // 8 hours

// Centralized error handling
function handleError(error, context = '') {
    console.error(`❌ Error in ${context || 'unknown'}:`, error.message || error);
}

// Validate required environment variables
function validateConfig() {
    const requiredVars = [
        'DISCORD_TOKEN',
        'STAFF_MOD_CHANNEL_ID',
        'STAFF_ROLE_ID',
        'REWARD_WALLET_ADDRESS',
        'ASSET_ID_FNODE',
        'ASSET_ID_FRY1',
        'CLIENT_ID',
        'GUILD_ID'
    ];

    // Add ticket categories dynamically to requiredVars
    for (let i = 1; i <= 2; i++) {
        requiredVars.push(`TICKET_CAT${i}`);
    }
    
    for (const varName of requiredVars) {
        if (!process.env[varName]) {
            console.error(`Missing required environment variable: ${varName}`);
            process.exit(1);
        }
    }
}

validateConfig();

// Discord client setup
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Rate limit map (5-second cooldown per user)
const cooldowns = new Map();

// Fetch Algorand asset balance
async function getAlgorandAssetBalance(address, assetId, retries = 3, delay = 5000) {
    const url = `https://mainnet-idx.algonode.cloud/v2/accounts/${address}`;
    let currentDelay = delay;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`Fetching balance for ${address} (Attempt ${attempt}/${retries})`);
            const response = await axios.get(url);
            const data = response.data;
            const assets = data.account.assets || [];
            const asset = assets.find(asset => asset['asset-id'] === assetId);
            console.log(`✅ Successfully fetched balance: ${asset ? asset.amount / 1_000_000 : 0.0} ${assetId}`);
            return asset ? asset.amount / 1_000_000 : 0.0;
        } catch (error) {
            console.error(`❌ API ERROR: ${error.message}`);

            if (attempt === 2) {
                await sendStaffNotification(
                    `🚨 **API ERROR:** Failed to fetch Algorand balance for ${address}.\nError: ${error.message}\n\nThis may indicate API issues or an attack.`,
                    "🚨 SYSTEM ALERT",
                    0xff0000 // Red color for alert
                );
            }

            if (attempt < retries) {
                currentDelay *= 2;
                await new Promise(resolve => setTimeout(resolve, currentDelay));
            }
        }
    }
    console.warn("All retry attempts failed. Returning 0 balance.");
    return 0.0;
}

// Check balances and send notifications
async function checkBalances() {
    const balances = {
        fNode: await getAlgorandAssetBalance(REWARD_WALLET_ADDRESS, ASSET_ID_FNODE),
        Fry1: await getAlgorandAssetBalance(REWARD_WALLET_ADDRESS, ASSET_ID_FRY1)
    };

    console.log(`📊 Balance Check: fNode: ${balances.fNode}, Fry1: ${balances.Fry1}`);

    let notificationMessage = '';
    let refillMessages = [];

    if (lastStatusTime === 0) {
        lastStatusTime = Date.now();
    }

    for (const [asset, thresholds] of Object.entries(notificationThresholds)) {
        const balance = balances[asset];
        const previousBalance = previousBalanceState[asset];

        let breachedAnyThreshold = false; // Track if balance is below any threshold
        let allThresholdsCleared = true;  // Track if balance is above ALL thresholds

        for (const thresholdStr of Object.keys(thresholds)) {
            const threshold = Number(thresholdStr);

            if (balance <= threshold && !thresholds[threshold]) {
                // If balance just breached this threshold
                notificationMessage += `⚠️ ${asset} balance is ${balance.toFixed(2)} ${asset}, Threshold ${threshold} breached!\n⚠️ Action required. Please refill ${asset} asap.\n`;
                notificationThresholds[asset][threshold] = true;
                breachedAnyThreshold = true;
                refillSent[asset] = false; // Reset refill flag
            }

            if (balance <= threshold) {
                allThresholdsCleared = false; // Balance is still below some threshold
            }

            if (balance > threshold && previousBalance !== null && previousBalance <= threshold) {
                // Reset notification state only if the balance has risen above this threshold
                notificationThresholds[asset][threshold] = false;
            }
        }

        // ✅ Send a refill message only if balance transitions from below a threshold to above all thresholds
        if (allThresholdsCleared && previousBalance !== null && !refillSent[asset]) {
            const wasBelowAnyThreshold = Object.keys(thresholds).some(threshold => previousBalance <= Number(threshold));
            if (wasBelowAnyThreshold) {
                refillMessages.push(`✅ ${asset} has been refilled above all thresholds!\n Balance is now : ${balance.toFixed(2)}`);
                refillSent[asset] = true; // Mark refill message as sent
            }
        }

        // 🚨 Send a critical alert if balance is below 1000
        if (balance <= 1000 && !criticalAlertSent[asset]) {
            await sendStaffNotification(
                `🚨 **ALERT:** ${asset} balance is ${balance.toFixed(2)} ${asset}!\n⚠️ Immediate action required!`,
                "🚨 CRITICAL LOW BALANCE ALERT 🚨",
                0xff0000 // Red color for alert
            );
            criticalAlertSent[asset] = true;
        }
        // Reset critical alert flag if balance is above 1000
        if (balance > 1000 && criticalAlertSent[asset]) {
            criticalAlertSent[asset] = false;
        }

        // Store last known balance
        previousBalanceState[asset] = balance;
    }

    // Send low balance notifications
    if (notificationMessage) {
        await sendStaffNotification(notificationMessage.trim(), "⚠️ Low Balance Warning", 0xff0000); // Red color for warning
    }

    if (refillMessages.length > 0) {
        await sendStaffNotification(refillMessages.join("\n"), "✅ Balance Refilled", 0x00ff00); // Green color for refill
    }

    // ⏳ Send a casual status update every X hours (ONLY if balance is above thresholds)
    const now = Date.now();
    if (now - lastStatusTime >= STATUS_INTERVAL) {
        lastStatusTime = now;

        let allBalancesAreSafe = true;
        for (const [asset, thresholds] of Object.entries(notificationThresholds)) {
            const balance = balances[asset];

            for (const threshold of Object.keys(thresholds)) {
                if (balance <= Number(threshold)) {
                    allBalancesAreSafe = false;
                    break;
                }
            }

            if (!allBalancesAreSafe) break;
        }

        if (allBalancesAreSafe) {
            await sendStaffNotification(
                `✅ All systems running.\n\n🔹 fNode: ${balances.fNode.toFixed(2)}\n🔹 Fry1: ${balances.Fry1.toFixed(2)}`,
                "Bot Status Check",
                0x3498db
            );
        }
    }
}

// Send notification to staff mod channel
async function sendStaffNotification(message, title = "Balance Alert", color = 0xff0000) {
    const channel = client.channels.cache.get(STAFF_MOD_CHANNEL_ID);
    if (channel && channel.isTextBased()) {
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(message)
            .setColor(color);

        let pingMessage = "";
        if (title.includes("⚠️ Low Balance Warning") || title.includes("🚨 CRITICAL LOW BALANCE ALERT")) {
            pingMessage = `<@&${STAFF_ROLE_ID}>`;
        }
        if (title.includes("✅ Balance Refilled")) {
            pingMessage = "";
        }
        if (title.includes("✅ Bot Status Check")) {
            pingMessage = "";
        }

        await channel.send({ content: pingMessage, embeds: [embed] });
    } else {
        console.error("❌ Failed to find the staff mod channel.");
    }
}

// === UPDATED CODE: Notify Tickets Command with Debugging ===
client.on('messageCreate', async (message) => {
    // Ignore messages from bots
    if (message.author.bot) return;

    // Ignore messages containing @everyone or @here mentions
    if (message.mentions.everyone) {
        console.log(`🚫 Ignoring message from ${message.author.tag} because it contains @everyone or @here`);
        return;
    }
    // Handle !closeall command
    if (message.content.startsWith('!closeall')) {
        // Check if the user has the required role
        if (!message.member.roles.cache.has(STAFF_ROLE_ID)) {
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
            console.error(`❌ Error deleting channels in category ${categoryId}:`, error);
            await message.reply("⚠️ An error occurred while deleting channels. Some may not have been removed.");
        }
    }


    // Handle !notifyTickets Command
    if (message.content === '!notifyTickets') {
        // Define the 2 category IDs for testing (replace these with your actual IDs)
        const ticketCategoryIds = [];
        for (let i = 1; i <= 2; i++) {
            const envVar = process.env[`TICKET_CAT${i}`];
            if (envVar) {
                ticketCategoryIds.push(envVar);
            }
        }


        // Use the guild with pre-fetched data
        const guild = message.guild;
        await guild.channels.fetch();
        const channels = guild.channels.cache;

        console.log(`🔍 Total channels in guild: ${channels.size}`);
        console.log(`🔍 Total members in cache: ${guild.members.cache.size}`);
        console.log(`🔍 Looking for channels in categories: ${ticketCategoryIds.join(', ')}`);

        const ticketChannels = channels.filter(channel => {
            const isInCategory = ticketCategoryIds.includes(channel.parentId);
            if (isInCategory) {
                console.log(`✅ Found channel in category: ${channel.name} (ID: ${channel.id}, Type: ${channel.type}, Parent ID: ${channel.parentId})`);
            }
            return isInCategory;
        });

        console.log(`🔍 Found ${ticketChannels.size} ticket channels`);

        let sentCount = 0;
        let delay = 0;
        const delayIncrement = 10000; // 10 seconds

        for (const [channelId, channel] of ticketChannels) {
            setTimeout(async () => {
                try {
                    console.log(`📢 Processing channel: ${channel.name}`);
                    const ticketNameParts = channel.name.split('-');
                    console.log(`📢 Split parts: ${JSON.stringify(ticketNameParts)}`);
                    const username = ticketNameParts.length > 1 ? ticketNameParts[1].trim() : null;
                    let mention = username ? `Hey ${username}` : 'Hey there';

                    if (username) {
                        console.log(`🔍 Searching for member with username: "${username}"`);
                        const member = guild.members.cache.find(m => {
                            const usernameMatch = m.user.username.toLowerCase() === username.toLowerCase();
                            const nicknameMatch = m.nickname && m.nickname.toLowerCase() === username.toLowerCase();
                            if (usernameMatch || nicknameMatch) {
                                console.log(`✅ Found member: ${m.user.tag} (ID: ${m.id}) for username "${username}"`);
                            }
                            return usernameMatch || nicknameMatch;
                        });

                        if (member) {
                            mention = `<@${member.id}>`;
                        } else {
                            console.log(`❌ No member found for username: "${username}"`);
                        }
                    }

                    const announcement = `${mention},\n\n**We sincerely apologize for the unexpected delays on our end regarding shipping orders. We understand how frustrating this can be, and we truly appreciate your patience.\nPlease rest assured that we have **not forgotten about your order**. Due to the current backlog, we typically process orders on a first-in, first-out basis, but we will be prioritizing your order to ensure it gets completed before the rest.\nWe are actively working to get everything fulfilled as soon as possible, and we will soon start to provide updates again as we make progress. If you have any further concerns, feel free to reply here, and we'll do our best to assist you.\nThank you for your understanding and support!`;
                    await channel.send(announcement);
                    console.log(`✅ Sent notification to ${channel.name} with delay ${delay / 1000}s`);
                    sentCount++;
                } catch (error) {
                    console.error(`❌ Failed to send message to ${channel.name}: ${error.message}`);
                }
            }, delay);
            delay += delayIncrement;
        }

        await message.reply(`✅ Scheduled notification for ${ticketChannels.size} ticket channels with a 10-second delay between each!`);
        return; // Exit the function so it doesn't process further
}

// Handle Bot Mentions (@bot)
if (message.mentions.has(client.user)) {
    // Extract the message content (excluding the mention)
    const userMessage = message.content.replace(/<@!?(\d+)>/, '').trim();

    if (!userMessage) return;

    // Send message to n8n webhook
        try {
            const webhookUrl = process.env.N8N_HOOK;
            const response = await axios.post(webhookUrl, {
                user: message.author.username,
                nickname: message.member?.nickname || message.author.username, // Use nickname if available
                message: userMessage,
                channelId: message.channel.id
            }, { responseType: 'json' });
            console.log("🔍 Debug: Received response from n8n:", response.data); // Debugging line


            if (response.data && response.data.reply) {
                // Send reply back to Discord
                let replyMessage = response.data.reply;

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
           console.error("❌ Error calling n8n webhook:", error.message);
                   // Handle Discord rate limits (429 error)
            if (error.response && error.response.status === 429) {
                await message.reply("⚠️ I'm being rate-limited. Please wait a moment.");
            } else {
            await message.reply("🚨 Oops! There was an issue processing your request.");
            }
        }
    }  
});


// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down...');
    client.destroy();
    process.exit(0);
});

// Bot initialization
client.once(Events.ClientReady, async () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);

    // Reset critical alert flags on bot startup
    criticalAlertSent.fNode = false;
    criticalAlertSent.Fry1 = false;

    // Fetch guild data (channels and members)
    const guild = client.guilds.cache.first(); // Assuming bot is in one guild; adjust if multi-guild
    try {
        await guild.channels.fetch();
        await guild.members.fetch({ time: 120000 }); // Set timeout to 60 seconds
        console.log(`✅ Guild fully fetched: ${guild.name} (Channels: ${guild.channels.cache.size}, Members: ${guild.members.cache.size})`);
    } catch (error) {
        console.error(`❌ Failed to fully fetch guild: ${error.message}`);
    }

    // Start periodic balance checking every 60 seconds
    setInterval(async () => {
        try {
            await checkBalances();
        } catch (error) {
            handleError(error, 'Periodic Balance Check');
        }
    }, 120 * 1000); // Every 60 seconds
});

// Run the bot
client.login(DISCORD_TOKEN);
