// ticketing-system/utils/logSanitizer.js

// Reason: centralize masking rules so every logger/callsite applies the same redaction behavior.
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const AEM_KEY_REGEX = /\bAEM-[A-Z0-9]{32}\b/g;
const BYOD_LICENSE_REGEX = /\bFLXAEM[A-Z0-9]{28}\b/g;
const ALGORAND_ADDRESS_REGEX = /\b[A-Z2-7]{58}\b/g;
const SOLANA_ADDRESS_REGEX = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;

function maskToken(value, options = {}) {
    const { keepStart = 4, keepEnd = 4, label = 'REDACTED' } = options;
    if (!value || typeof value !== 'string') return value;
    if (value.length <= keepStart + keepEnd + 2) {
        return `[${label}]`;
    }
    return `${value.slice(0, keepStart)}...[${label}]...${value.slice(-keepEnd)}`;
}

function sanitizeSecretsInText(text) {
    if (typeof text !== 'string' || text.length === 0) return text;

    // Reason: apply deterministic masking in priority order for known sensitive token formats.
    return text
        .replace(AEM_KEY_REGEX, match => maskToken(match, { keepStart: 4, keepEnd: 4, label: 'AEM' }))
        .replace(BYOD_LICENSE_REGEX, match => maskToken(match, { keepStart: 6, keepEnd: 4, label: 'BYOD' }))
        .replace(EMAIL_REGEX, '[EMAIL_REDACTED]')
        .replace(ALGORAND_ADDRESS_REGEX, match => maskToken(match, { keepStart: 6, keepEnd: 4, label: 'ALGO' }))
        .replace(SOLANA_ADDRESS_REGEX, match => maskToken(match, { keepStart: 6, keepEnd: 4, label: 'SOL' }));
}

function maskAddress(address) {
    if (!address || address === 'N/A') return address;
    return maskToken(String(address), { keepStart: 6, keepEnd: 4, label: 'ADDR' });
}

function summarizeTicketForLog(ticket) {
    if (!ticket || typeof ticket !== 'object') {
        return { found: false };
    }

    return {
        found: true,
        id: ticket.id,
        ticketType: ticket.ticket_type,
        status: ticket.status,
        channelId: ticket.channel_id,
        userId: ticket.user_id,
        claimedBy: ticket.claimed_by || null,
        validated: Boolean(ticket.validated),
        flxtimeValidated: Boolean(ticket.flxtime_validated),
        hasDescription: Boolean(ticket.description && ticket.description !== 'N/A'),
        hasEmail: Boolean(ticket.email && ticket.email !== 'N/A'),
        hasAlgorandAddress: Boolean(ticket.algorand_address && ticket.algorand_address !== 'N/A'),
        hasSolanaWallet: Boolean(ticket.solana_wallet_address && ticket.solana_wallet_address !== 'N/A'),
        hasAemKey: Boolean(ticket.aem_key_issued)
    };
}

function summarizeTicketUpdates(updates) {
    if (!updates || typeof updates !== 'object') {
        return { keyCount: 0, keys: [] };
    }

    const keys = Object.keys(updates);
    return {
        keyCount: keys.length,
        keys,
        containsPotentialSensitiveFields: keys.some(key =>
            ['email', 'description', 'aem_key_issued', 'solana_wallet_address', 'algorand_address', 'minerkeys'].includes(key)
        )
    };
}

function summarizeMessageContent(content) {
    const text = typeof content === 'string' ? content : '';
    return {
        length: text.length,
        hasContent: text.length > 0,
        hasMention: text.includes('@')
    };
}

module.exports = {
    sanitizeSecretsInText,
    maskAddress,
    summarizeTicketForLog,
    summarizeTicketUpdates,
    summarizeMessageContent
};
