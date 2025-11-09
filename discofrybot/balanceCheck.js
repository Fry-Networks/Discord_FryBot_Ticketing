const axios = require('axios');
const logger = require('./logger');

const FRYBAL_ROLE_ID = process.env.FRYBAL_ROLE_ID;
const REWARD_WALLET_ADDRESS = process.env.REWARD_WALLET_ADDRESS;
const ASSET_ID_FNODE = parseInt(process.env.ASSET_ID_FNODE);
const ASSET_ID_FRY2 = parseInt(process.env.ASSET_ID_FRY2);
const ASSET_ID_TFRY = parseInt(process.env.ASSET_ID_TFRY);
const LOW_BAL_CHANNEL_ID = process.env.LOW_BAL_CHANNEL_ID;

const DISABLED_ALERT_ASSETS = [];

// Persistent thresholds storage
const notificationThresholds = {
    fNode: { 30000: false, 15000: false, 5000: false },
    Fry2: { 5000: false, 2500: false, 1000: false }, // Example thresholds, can be adjusted
    TFry: { 50000: false, 25000: false, 10000: false }
};

// Track if we have already sent a refill message
const refillSent = {
    fNode: false,
    Fry2: false,
    TFry: false
};

// Track previous balance state
const previousBalanceState = {
    fNode: null,
    Fry2: null,
    TFry: null
};

// "Critical Alert Sent" Flag
const criticalAlertSent = {
    fNode: false,
    Fry2: false,
    TFry: false
};

let lastStatusTime = 0;
const STATUS_INTERVAL = 8 * 60 * 60 * 1000; // 8 hours

let lastHourlyInfoLogTime = 0;
const HOURLY_LOG_INTERVAL = 60 * 60 * 1000; // 1 hour

// Centralized error handling
function handleError(error, context = '') {
    logger.error(`❌ Error in ${context || 'unknown'}:`, error.message || error);
}

// Fetch Algorand asset balance
async function getAlgorandAssetBalance(address, assetId, retries = 3, delay = 5000) {
    const url = `https://mainnet-idx.algonode.cloud/v2/accounts/${address}`;
    let currentDelay = delay;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            // logger.info(`Fetching balance for ${address} (Attempt ${attempt}/${retries})`);
            const response = await axios.get(url);
            const data = response.data;
            const assets = data.account.assets || [];
            const asset = assets.find(asset => asset['asset-id'] === assetId);
            // logger.info(`✅ Successfully fetched balance: ${asset ? asset.amount / 1_000_000 : 0.0} ${assetId}`);
            return asset ? asset.amount / 1_000_000 : 0.0;
        } catch (error) {
            logger.error(`❌ API ERROR: ${error.message}`);

            if (attempt === 2) {
                await sendStaffNotification(
                    null, // No client yet, handled in sendStaffNotification
                    `🚨 **API ERROR:** Failed to fetch Algorand balance for ${address}.\nError: ${error.message}\n\nThis may indicate API issues or an attack.`,
                    "🚨 SYSTEM ALERT",
                    0xff0000
                );
            }

            if (attempt < retries) {
                currentDelay *= 2;
                await new Promise(resolve => setTimeout(resolve, currentDelay));
            }
        }
    }
    logger.warn("All retry attempts failed. Returning 0 balance.");
    return 0.0;
}

// Send notification to staff mod channel
async function sendStaffNotification(client, message, title = "Balance Alert", color = 0xff0000) {
    if (!client) {
        logger.error("❌ No client provided for sendStaffNotification.");
        return;
    }
    const channel = client.channels.cache.get(LOW_BAL_CHANNEL_ID);
    if (channel && channel.isTextBased()) {
        logger.info(`✅ Found channel with ID: ${LOW_BAL_CHANNEL_ID}`);
        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(message)
            .setColor(color);

        let pingMessage = "";
        if (title.includes("⚠️ Low Balance Warning") || title.includes("🚨 CRITICAL LOW BALANCE ALERT")) {
            pingMessage = `<@&${FRYBAL_ROLE_ID}>`;
        }
        if (title.includes("✅ Balance Refilled") || title.includes("✅ Bot Status Check")) {
            pingMessage = "";
        }

        try {
            await channel.send({ content: pingMessage, embeds: [embed] });
            logger.info(`✅ Message sent to channel: ${LOW_BAL_CHANNEL_ID}`);
        } catch (sendError) {
            logger.error(`❌ Failed to send message to channel ${LOW_BAL_CHANNEL_ID}: ${sendError.message}`);
        }
    } else {
        logger.error(`❌ Failed to find the staff mod channel with ID: ${LOW_BAL_CHANNEL_ID}. Channel object: ${JSON.stringify(channel)}`);
    }
}

// Check balances and send notifications
async function checkBalances(client) {
    const now = Date.now(); 
    const balances = {
        fNode: await getAlgorandAssetBalance(REWARD_WALLET_ADDRESS, ASSET_ID_FNODE),
        Fry2: await getAlgorandAssetBalance(REWARD_WALLET_ADDRESS, ASSET_ID_FRY2),
        TFry: await getAlgorandAssetBalance(REWARD_WALLET_ADDRESS, ASSET_ID_TFRY)
    };

    //logger.info(`📊 Balance Check: fNode: ${balances.fNode}, TFry: ${balances.TFry}`);

    let notificationMessage = '';
    let refillMessages = [];

    if (lastStatusTime === 0) {
        lastStatusTime = now; 
    }

    for (const [asset, thresholds] of Object.entries(notificationThresholds)) {
        const balance = balances[asset];
        const previousBalance = previousBalanceState[asset];

        // Defensive check for invalid balance values
        if (typeof balance !== 'number' || isNaN(balance)) {
            logger.error(`❌ Invalid balance value for ${asset}: ${balance}. Skipping alert checks.`);
            continue; // Skip this asset if balance is not a valid number
        }

        if (DISABLED_ALERT_ASSETS.includes(asset)) {
            // Still update previousBalanceState, but skip all alert logic for this asset
            previousBalanceState[asset] = balance;
            continue; // Skip to the next asset
        }
        
        let breachedAnyThreshold = false;
        let allThresholdsCleared = true;

        for (const thresholdStr of Object.keys(thresholds)) {
            const threshold = Number(thresholdStr);

            if (balance <= threshold && !thresholds[threshold]) {
                notificationMessage += `⚠️ ${asset} balance is ${balance.toFixed(2)} ${asset}, Threshold ${threshold} breached!\n⚠️ Action required. Please refill ${asset} asap.\n`;
                notificationThresholds[asset][threshold] = true;
                breachedAnyThreshold = true;
                refillSent[asset] = false;
            }

            if (balance <= threshold) {
                allThresholdsCleared = false;
            }

            if (balance > threshold && previousBalance !== null && previousBalance <= threshold) {
                notificationThresholds[asset][threshold] = false;
            }
        }

        if (allThresholdsCleared && previousBalance !== null && !refillSent[asset]) {
            const wasBelowAnyThreshold = Object.keys(thresholds).some(threshold => previousBalance <= Number(threshold));
            if (wasBelowAnyThreshold) {
                refillMessages.push(`✅ ${asset} has been refilled above all thresholds!\n Balance is now : ${balance.toFixed(2)}`);
                refillSent[asset] = true;
            }
        }

        if (balance <= 1000 && !criticalAlertSent[asset]) {
            await sendStaffNotification(
                client,
                `🚨 **ALERT:** ${asset} balance is ${balance.toFixed(2)} ${asset}!\n⚠️ Immediate action required!`,
                "🚨 CRITICAL LOW BALANCE ALERT 🚨",
                0xff0000
            );
            criticalAlertSent[asset] = true;
        }

        if (balance > 1000 && criticalAlertSent[asset]) {
            criticalAlertSent[asset] = false;
        }

        previousBalanceState[asset] = balance;
    }

    if (notificationMessage) {
        await sendStaffNotification(client, notificationMessage.trim(), "⚠️ Low Balance Warning", 0xff0000);
    }

    if (refillMessages.length > 0) {
        await sendStaffNotification(client, refillMessages.join("\n"), "✅ Balance Refilled", 0x00ff00);
    }

    if (now - lastStatusTime >= STATUS_INTERVAL) {
        lastStatusTime = now;

        let allBalancesAreSafe = true;
        let lowBalanceAssets = [];
        
        for (const [asset, thresholds] of Object.entries(notificationThresholds)) {
            const balance = balances[asset];
            let assetHasIssues = false;

            for (const threshold of Object.keys(thresholds)) {
                if (balance <= Number(threshold)) {
                    allBalancesAreSafe = false;
                    assetHasIssues = true;
                    break;
                }
            }
            
            if (assetHasIssues) {
                lowBalanceAssets.push(`${asset}: ${balance.toFixed(2)}`);
            }
        }

        // Always send 8-hour status report, but adjust message based on balance status
        if (allBalancesAreSafe) {
            await sendStaffNotification(
                client,
                `✅ All systems running. Balance checker report:\n\n🔹 fNode: ${balances.fNode.toFixed(2)}\n🔹 Fry2: ${balances.Fry2.toFixed(2)}\n🔹 tFRY: ${balances.TFry.toFixed(2)}`,
                "✅ Bot Status Check",
                0x3498db
            );
        } else {
            await sendStaffNotification(
                client,
                `⚠️ Balance checker status report:\n\n🔹 fNode: ${balances.fNode.toFixed(2)}\n🔹 Fry2: ${balances.Fry2.toFixed(2)}\n🔹 tFRY: ${balances.TFry.toFixed(2)}\n\n**Low Balance Assets:** ${lowBalanceAssets.join(', ')}\n\n*This is a periodic status report - specific low balance alerts are sent separately.*`,
                "⚠️ Bot Status Check (Issues Detected)",
                0xff9500
            );
        }
    }
    const hasIssuesOrRefills = notificationMessage || refillMessages.length > 0;

    if (hasIssuesOrRefills) {
        logger.info(`📊 Balance Check (Issue/Refill): fNode: ${balances.fNode.toFixed(2)}, TFry: ${balances.TFry.toFixed(2)}`);
        lastHourlyInfoLogTime = now; // Reset timer if an issue/refill occurred
    } else if (now - lastHourlyInfoLogTime >= HOURLY_LOG_INTERVAL) {
        logger.info(`📊 Balance Check (Hourly Status): fNode: ${balances.fNode.toFixed(2)}, TFry: ${balances.TFry.toFixed(2)}`);
        lastHourlyInfoLogTime = now;
    }
}

// Initialize balance checking
module.exports = (client) => {
    // Reset critical alert flags on bot startup
    criticalAlertSent.fNode = false;
    criticalAlertSent.Fry2 = false;
    criticalAlertSent.TFry = false;

    // Start periodic balance checking every 120 seconds
    setInterval(async () => {
        try {
            await checkBalances(client);
        } catch (error) {
            handleError(error, 'Periodic Balance Check');
        }
    }, 120 * 1000);
};


async function reportCurrentBalances(client) {
    const balances = {
        fNode: await getAlgorandAssetBalance(REWARD_WALLET_ADDRESS, ASSET_ID_FNODE),
        Fry2: await getAlgorandAssetBalance(REWARD_WALLET_ADDRESS, ASSET_ID_FRY2),
        TFry: await getAlgorandAssetBalance(REWARD_WALLET_ADDRESS, ASSET_ID_TFRY),
    };

    const message = `Current Balances:\n\n🔹 fNode: ${balances.fNode.toFixed(2)}\n🔹 Fry2: ${balances.Fry2.toFixed(2)}\n🔹 tFRY: ${balances.TFry.toFixed(2)}`;
    await sendStaffNotification(client, message, "Current Balance Report", 0x007bff); // Using a blue color for general report
}

module.exports.reportCurrentBalances = reportCurrentBalances;
