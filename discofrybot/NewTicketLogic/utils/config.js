// NewTicketLogic/utils/config.js
require('dotenv').config({ path: '../../.env' }); // Load .env from the project root

// Parse STAFF_MAP environment variable to create staffCategoryMapping
let staffCategoryMapping = {};
try {
    const staffMap = JSON.parse(process.env.STAFF_MAP || '{}');
    for (const userId in staffMap) {
        if (Object.hasOwnProperty.call(staffMap, userId)) {
            const identifier = staffMap[userId];
            const categoryEnvVarName = `${identifier.toUpperCase()}_CAT`;
            if (process.env[categoryEnvVarName]) {
                staffCategoryMapping[userId] = process.env[categoryEnvVarName];
            } else {
                console.warn(`⚠️ Missing environment variable for staff category: ${categoryEnvVarName}`);
            }
        }
    }
} catch (error) {
    console.error(`❌ Error parsing STAFF_MAP environment variable: ${error.message}`);
    // staffCategoryMapping will remain empty in case of error
}


const config = {
    discordToken: process.env.DISCORD_TOKEN,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE,

    categoryIds: {
        order_tracking: process.env.TICKET_CAT_ORDER,
        registration: process.env.TICKET_CAT_REGISTRATION,
        miner_keys: process.env.TICKET_CAT_MINER_KEYS,
        rewards: process.env.TICKET_CAT_REWARDS,
        tech_support: process.env.TICKET_CAT_TECH_SUPPORT,
        node_forgo_return: process.env.TICKET_CAT_NODE_FORGO_RETURN,
        fry_conversion_issues: process.env.TICKET_CAT_FRY_CONVERSION,
        flxtime_partners_support: process.env.TICKET_CAT_FLXTIME_PARTNERS,
    },
    closedTicketsCategoryId: process.env.CLOSED_TICKET_CAT,
    guildId: process.env.GUILD_ID, // Discord server ID where the bot operates
    staffRoleId: process.env.STAFF_ROLE_ID, // For general staff permissions
    internRoleId: process.env.INTERN_ROLE_ID, // For intern staff permissions
    ticketModRoleId: process.env.TICKET_MOD_ROLE, // For ticket-specific moderation, like channel view
    ticketAdminRoleId: process.env.TICKET_ADMIN_ROLE, // For ticket administration role

    // Feature toggles
    inactivityMonitoringEnabled: process.env.INACTIVITY_MONITORING_ENABLED === 'true',

    // Logging
    logChannelId: process.env.LOG_CHANNEL_ID || null,

    // Panel setup command name (can be configured if needed)
    ticketPanelCommand: 'setup-ticket-panel',
    // Command name for manual balance check
    checkBalCommand: 'check-balance',

    // Mapping of staff user IDs to their dedicated category IDs for ticket claiming
    staffCategoryMapping: staffCategoryMapping, // Use the dynamically created map

    // Asset IDs
    ASSET_ID_FNODE: parseInt(process.env.ASSET_ID_FNODE),
    ASSET_ID_FRY1: parseInt(process.env.ASSET_ID_FRY1),
    ASSET_ID_FRY2: parseInt(process.env.ASSET_ID_FRY2),

    // Minimum ALGO balance required for transactions (in Algos)
    MIN_ALGO_BALANCE_FOR_TX: 5, // Advised minimum for future PoC transactions

    // Burn Wallet Address
    BURN_WALLET_ADDRESS: process.env.BURN_WALLET_ADDRESS,

    // Burn transaction detection settings (defaults can be overridden via .env)
    BURN_TX_LOOKBACK_DAYS: 180, // How many days back to search for burn TXs
    BURN_TX_MIN_AMOUNT: 100, // Minimum FRY amount to consider (helps ignore PoC 0.x transfers)

    // Algod URL for Algorand network calls
    ALGOD_API_URL: process.env.ALGOD_API_URL,

    // Flxtime Integration (future-ready configuration)
    flxtimeVerificationEnabled: process.env.FLXTIME_VERIFICATION_ENABLED === 'true',
    flxtimeServerId: process.env.FLXTIME_SERVER_ID,
    flxtimeFlexerRoleId: process.env.FLXTIME_FLEXER_ROLE_ID,
};

// Validate essential configurations
const essentialConfigs = [
    'discordToken',
    'supabaseUrl',
    'supabaseServiceRoleKey',
    'categoryIds.order_tracking', // Check one to ensure object structure is there
    'closedTicketsCategoryId',
    'ticketModRoleId',
    'staffRoleId',
    'internRoleId',
    'ticketAdminRoleId', // Added for validation
    'checkBalCommand' // Added for validation
];

let missingConfig = false;
essentialConfigs.forEach(key => {
    const keys = key.split('.');
    let value = config;
    for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
            value = value[k];
        } else {
            value = undefined;
            break;
        }
    }

    if (value === undefined || value === null || value === '') {
        console.error(`❌ Missing critical configuration: ${key}`);
        missingConfig = true;
    }
});

if (missingConfig) {
    console.error("🚨 Halting bot startup due to missing critical configurations. Please check your .env file and NewTicketLogic/utils/config.js");
    process.exit(1);
}

module.exports = config;
