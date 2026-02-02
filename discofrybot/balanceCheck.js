const axios = require('axios');
const logger = require('./logger');

const FRYBAL_ROLE_ID = process.env.FRYBAL_ROLE_ID;
const REWARD_WALLET_ADDRESS = process.env.REWARD_WALLET_ADDRESS;
const ASSET_ID_FNODE = parseInt(process.env.ASSET_ID_FNODE);
const ASSET_ID_FRY2 = parseInt(process.env.ASSET_ID_FRY2);
const ASSET_ID_TFRY = parseInt(process.env.ASSET_ID_TFRY);
const LOW_BAL_CHANNEL_ID = process.env.LOW_BAL_CHANNEL_ID;

const DISABLED_ALERT_ASSETS = [];

// Reason: avoid false "0 balance" alerts during transient Algonode/API hiccups.
const API_FAILURE_GRACE_MS = 5 * 60 * 1000; // 5 minutes

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

const failureStartAt = {
    fNode: null,
    Fry2: null,
    TFry: null
};

const apiFailureAlertSent = {
    fNode: false,
    Fry2: false,
    TFry: false
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
async function getAlgorandAssetBalance(address, assetId, assetKey, retries = 3, delay = 5000) {
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
            return { balance: asset ? asset.amount / 1_000_000 : 0.0, success: true };
        } catch (error) {
            // Reason: include asset context to make API failures actionable in logs.
            logger.error(`❌ API ERROR (${assetKey}): ${error.message}`);

            if (attempt < retries) {
                currentDelay *= 2;
                await new Promise(resolve => setTimeout(resolve, currentDelay));
            }
        }
    }
    // Reason: returning null prevents false low-balance alerts on API failures.
    logger.warn("All retry attempts failed. Returning null balance.");
    return { balance: null, success: false };
}

// Reason: format balances safely when API results are missing.
function formatBalance(balance) {
    if (typeof balance !== 'number' || isNaN(balance)) {
        return "unknown";
    }
    return balance.toFixed(2);
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
    const balanceResults = {
        fNode: await getAlgorandAssetBalance(REWARD_WALLET_ADDRESS, ASSET_ID_FNODE, "fNode"),
        Fry2: await getAlgorandAssetBalance(REWARD_WALLET_ADDRESS, ASSET_ID_FRY2, "Fry2"),
        TFry: await getAlgorandAssetBalance(REWARD_WALLET_ADDRESS, ASSET_ID_TFRY, "TFry")
    };

    const balances = {
        fNode: balanceResults.fNode.balance,
        Fry2: balanceResults.Fry2.balance,
        TFry: balanceResults.TFry.balance
    };

    //logger.info(`📊 Balance Check: fNode: ${balances.fNode}, TFry: ${balances.TFry}`);

    let notificationMessage = '';
    let refillMessages = [];

    if (lastStatusTime === 0) {
        lastStatusTime = now; 
    }

    for (const [asset, thresholds] of Object.entries(notificationThresholds)) {
        const result = balanceResults[asset];
        const balance = balances[asset];
        const previousBalance = previousBalanceState[asset];

        if (!result.success) {
            if (!failureStartAt[asset]) {
                failureStartAt[asset] = now;
            }

            const failureDuration = now - failureStartAt[asset];
            // Reason: suppress low-balance logic during the grace window to prevent false alerts.
            if (failureDuration < API_FAILURE_GRACE_MS) {
                continue;
            }

            if (!apiFailureAlertSent[asset]) {
                await sendStaffNotification(
                    client,
                    `⚠️ **API DEGRADED:** Unable to fetch ${asset} balance for ${Math.round(failureDuration / 1000)}s. Alerts suppressed until API recovers.`,
                    "⚠️ Balance API Degraded",
                    0xff9500
                );
                apiFailureAlertSent[asset] = true;
            }

            continue;
        }

        // Reason: reset failure tracking after a successful read.
        failureStartAt[asset] = null;
        apiFailureAlertSent[asset] = false;
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
        let unknownAssets = [];
        
        for (const [asset, thresholds] of Object.entries(notificationThresholds)) {
            const balance = balances[asset];
            let assetHasIssues = false;

            // Reason: unknown balances indicate API issues; treat as not safe for status reporting.
            if (typeof balance !== 'number' || isNaN(balance)) {
                allBalancesAreSafe = false;
                unknownAssets.push(asset);
                continue;
            }

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
                `✅ All systems running. Balance checker report:\n\n🔹 fNode: ${formatBalance(balances.fNode)}\n🔹 Fry2: ${formatBalance(balances.Fry2)}\n🔹 tFRY: ${formatBalance(balances.TFry)}`,
                "✅ Bot Status Check",
                0x3498db
            );
        } else {
            // Reason: keep status report readable when no low balances are detected.
            const lowBalanceLine = lowBalanceAssets.length > 0
                ? `\n\n**Low Balance Assets:** ${lowBalanceAssets.join(', ')}`
                : "\n\n**Low Balance Assets:** none";
            const unknownLine = unknownAssets.length > 0 ? `\n\n**Unknown Assets:** ${unknownAssets.join(', ')}` : "";
            await sendStaffNotification(
                client,
                `⚠️ Balance checker status report:\n\n🔹 fNode: ${formatBalance(balances.fNode)}\n🔹 Fry2: ${formatBalance(balances.Fry2)}\n🔹 tFRY: ${formatBalance(balances.TFry)}${lowBalanceLine}${unknownLine}\n\n*This is a periodic status report - specific low balance alerts are sent separately.*`,
                "⚠️ Bot Status Check (Issues Detected)",
                0xff9500
            );
        }
    }
    const hasIssuesOrRefills = notificationMessage || refillMessages.length > 0;

    if (hasIssuesOrRefills) {
        logger.info(`📊 Balance Check (Issue/Refill): fNode: ${formatBalance(balances.fNode)}, TFry: ${formatBalance(balances.TFry)}`);
        lastHourlyInfoLogTime = now; // Reset timer if an issue/refill occurred
    } else if (now - lastHourlyInfoLogTime >= HOURLY_LOG_INTERVAL) {
        logger.info(`📊 Balance Check (Hourly Status): fNode: ${formatBalance(balances.fNode)}, TFry: ${formatBalance(balances.TFry)}`);
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
    const balanceResults = {
        fNode: await getAlgorandAssetBalance(REWARD_WALLET_ADDRESS, ASSET_ID_FNODE, "fNode"),
        Fry2: await getAlgorandAssetBalance(REWARD_WALLET_ADDRESS, ASSET_ID_FRY2, "Fry2"),
        TFry: await getAlgorandAssetBalance(REWARD_WALLET_ADDRESS, ASSET_ID_TFRY, "TFry"),
    };

    const balances = {
        fNode: balanceResults.fNode.balance,
        Fry2: balanceResults.Fry2.balance,
        TFry: balanceResults.TFry.balance,
    };

    const message = `Current Balances:\n\n🔹 fNode: ${formatBalance(balances.fNode)}\n🔹 Fry2: ${formatBalance(balances.Fry2)}\n🔹 tFRY: ${formatBalance(balances.TFry)}`;
    await sendStaffNotification(client, message, "Current Balance Report", 0x007bff); // Using a blue color for general report
}

module.exports.reportCurrentBalances = reportCurrentBalances;
