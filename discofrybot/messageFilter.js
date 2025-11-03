const logger = require('./logger'); // Assuming logger is available via require

/**
 * Normalizes a message string by decoding, normalizing Unicode,
 * and removing/collapsing common obfuscation characters.
 * @param {string} messageContent The raw message content.
 * @returns {string} The normalized message content in lowercase.
 */
function normalizeMessage(messageContent) {
    let normalized = messageContent;

    // 1. Decode percent-encoding by replacing each %xx sequence
    normalized = normalized.replace(/%([0-9a-f]{2})/gi, (match, hex) => {
        try {
            return String.fromCharCode(parseInt(hex, 16));
        } catch (e) {
            logger.error(`Error decoding percent sequence ${match}: ${e}`);
            return match; // Return original sequence if decoding fails
        }
    });


    // 2. Decode HTML entities
    // Recursively decode HTML entities
     while (/&#x([0-9a-f]+);|&#([0-9]+);/gi.test(normalized)) {
        normalized = normalized.replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
        normalized = normalized.replace(/&#([0-9]+);/gi, (match, dec) => String.fromCharCode(parseInt(dec, 10)));
     }


    // 3. Normalize Unicode (removes zero-width spaces, etc.)
    normalized = normalized.normalize('NFKC');

    // 4. Remove or collapse obfuscation characters
    // Remove backslashes and zero-width spaces
    normalized = normalized.replace(/[\u200B-\u200D\uFEFF\\]/g, '');
    // Collapse multiple spaces, dots, underscores, dashes, slashes into a single character (e.g., a...b -> a.b, a///b -> a/b)
    normalized = normalized.replace(/[\s._\-\/]+/g, (match) => {
        // Keep one dot if dots were present, otherwise keep one slash if slashes were present, otherwise keep one space
        if (match.includes('.')) return '.';
        if (match.includes('/')) return '/';
        return ' ';
    });
     // Remove spaces around dots and slashes
    normalized = normalized.replace(/\s*\.\s*/g, '.');
    normalized = normalized.replace(/\s*\/\s*/g, '/');


    return normalized.toLowerCase(); // Convert to lowercase for case-insensitive matching
}

/**
 * Escapes regex special characters in a string.
 * @param {string} str
 * @returns {string}
 */
function escapeForRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a regex that tolerates common obfuscation characters between letters.
 * Example: buildLoosePattern('vercel') will match v e r c e l, v.e.r.c.e.l, etc.
 * @param {string} keyword
 * @returns {RegExp}
 */
function buildLoosePattern(keyword) {
    const escaped = escapeForRegex(keyword.toLowerCase());
    const characters = escaped.split('').filter(Boolean);
    if (!characters.length) {
        return /$^/; // Matches nothing
    }
    const body = characters.map(char => `${char}[^a-z0-9]{0,3}`).join('');
    return new RegExp(`(?:^|[^a-z0-9])${body}(?:[^a-z0-9]|$)`, 'i');
}

/**
 * Extracts potential URLs from a normalized message and validates if they are
 * frynetworks.com or a subdomain, returning details about any suspicious findings.
 * Adds exceptions for internal Discord links and allowed GIF domains.
 * @param {string} normalizedMessage The normalized message content.
 * @param {string} guildId The ID of the Discord server (guild).
 * @returns {{isSuspicious: boolean, type?: string, domain?: string, pattern?: string}} An object detailing any suspicious findings.
 */
function extractAndValidateUrls(normalizedMessage, guildId) { // Added guildId parameter
    // Regex to find potential URL-like strings:
    // Looks for optional scheme (http/https), optional www., followed by a domain-like structure
    // (sequence of letters, numbers, dots, hyphens, with at least one dot and a common TLD),
    // followed by optional path, query, fragment.
    // Added common TLDs to reduce false positives.
    const potentialUrlPattern = /(?:https?:\/\/|www\.)?[a-z0-9.\-]+[.](?:com|org|net|gg|io|co|us|uk|ca|xyz|online|site|app|dev|tech)[\/\w.\-?=#%&]*/gi; // Added more common TLDs
    const potentialMatches = normalizedMessage.match(potentialUrlPattern);

    if (!potentialMatches) {
        const obfuscatedInvite = detectObfuscatedDiscordInvite(normalizedMessage);
        if (obfuscatedInvite) {
            return obfuscatedInvite;
        }
        const keywordOnlyHit = detectSuspiciousKeywords(normalizedMessage);
        if (keywordOnlyHit) {
            return keywordOnlyHit;
        }
        return { isSuspicious: false }; // No URL-like patterns found
    }

    const allowedDomain = 'frynetworks.com';
    const discordInviteRegex = /(?:discord(?:app)?\.com\/invite|\.gg)[\/\w-]{1,}/gi; // Specific regex for Discord invites

    // Add allowed GIF domains
    const allowedGifDomains = ['giphy.com', 'tenor.com'];

    for (const potentialMatch of potentialMatches) {
        // Check specifically for Discord invites first (still high-risk)
        discordInviteRegex.lastIndex = 0;
        if (discordInviteRegex.test(potentialMatch)) {
             logger.warn(`Discord invite pattern found: "${potentialMatch}"`);
             return { isSuspicious: true, type: 'discord_invite', pattern: potentialMatch };
        }

        let urlString = potentialMatch;

        // Attempt to prepend a protocol if missing, to help URL parsing
        if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
             urlString = 'http://' + urlString;
        }

        try {
            const url = new URL(urlString);
            const hostname = url.hostname;

            // --- Add checks for new allowed URLs ---

            // Check for internal Discord links
            if (hostname === 'discord.com' && url.pathname.startsWith(`/channels/${guildId}/`)) {
                 logger.info(`Allowed internal Discord link found: "${potentialMatch}"`);
                 continue; // This URL is allowed, check the next potential match
            }

            // Check for allowed GIF domains
            if (allowedGifDomains.includes(hostname)) {
                 logger.info(`Allowed GIF domain link found: "${potentialMatch}"`);
                 continue; // This URL is allowed, check the next potential match
            }

            // --- End of new allowed URL checks ---


            // Check if the hostname is exactly the allowed domain or ends with .allowedDomain
            if (hostname !== allowedDomain && !hostname.endsWith('.' + allowedDomain)) {
                logger.warn(`Disallowed domain found: ${hostname} from potential match "${potentialMatch}"`);
                return { isSuspicious: true, type: 'disallowed_domain', domain: hostname, pattern: potentialMatch }; // Found a disallowed domain
            }
             logger.info(`Allowed domain found: ${hostname} from potential match "${potentialMatch}"`);

        } catch (e) {
            // If URL parsing fails even after prepending a scheme,
            // it's likely a highly malformed or intentionally obfuscated attempt.
            // We should treat this as suspicious.
                logger.warn(`Could not parse potential URL: "${potentialMatch}" - Flagging for review. Error: ${e.message}`);
                return { isSuspicious: true, type: 'unparseable_url', pattern: potentialMatch }; // Flag unparseable URL-like strings
        }
    }

    // Run a secondary pass for highly obfuscated Discord invites if nothing else matched
    const obfuscatedInviteFallback = detectObfuscatedDiscordInvite(normalizedMessage);
    if (obfuscatedInviteFallback) {
        return obfuscatedInviteFallback;
    }

    // Finally, check for suspicious keywords commonly used in scam campaigns
    const suspiciousKeywordHit = detectSuspiciousKeywords(normalizedMessage);
    if (suspiciousKeywordHit) {
        return suspiciousKeywordHit;
    }

    return { isSuspicious: false }; // All found URL-like patterns are either valid frynetworks.com domains, new allowed domains, or were handled
}

/**
 * Attempts to detect Discord invite links that have been obfuscated with spacer characters.
 * This guards against patterns like "di > sco > rd . gg" that slip past simpler regexes.
 * @param {string} normalizedMessage
 * @returns {{isSuspicious: boolean, type: string, domain: string, pattern: string}|null}
 */
function detectObfuscatedDiscordInvite(normalizedMessage) {
    if (!normalizedMessage) return null;

    const patterns = [
        {
            regex: /d[\W_]*i[\W_]*s[\W_]*c[\W_]*o[\W_]*r[\W_]*d[\W_]*\.[\W_]*g[\W_]*g[\W_]*\/[\W_]*([a-z0-9][a-z0-9\-]{3,})/gi,
            domain: 'discord.gg'
        },
        {
            regex: /d[\W_]*i[\W_]*s[\W_]*c[\W_]*o[\W_]*r[\W_]*d[\W_]*(?:[\W_]*app)?[\W_]*\.[\W_]*c[\W_]*o[\W_]*m[\W_]*\/[\W_]*invite[\W_]*\/[\W_]*([a-z0-9][a-z0-9\-]{3,})/gi,
            domain: 'discord.com'
        }
    ];

    for (const { regex, domain } of patterns) {
        const match = regex.exec(normalizedMessage);
        if (match && match[0]) {
            const cleanedPattern = match[0]
                .replace(/[^a-z0-9/.:_-]+/gi, '')
                .replace(/\/{2,}/g, '/')
                .replace(/\.{2,}/g, '.')
                .toLowerCase();

            if (!cleanedPattern.includes('discord.gg') &&
                !cleanedPattern.includes('discord.com') &&
                !cleanedPattern.includes('discordapp.com')) {
                continue;
            }

            let detectedDomain = domain;
            if (cleanedPattern.includes('discordapp.com')) {
                detectedDomain = 'discordapp.com';
            } else if (cleanedPattern.includes('discord.com')) {
                detectedDomain = 'discord.com';
            } else if (cleanedPattern.includes('discord.gg')) {
                detectedDomain = 'discord.gg';
            }

            return {
                isSuspicious: true,
                type: 'discord_invite',
                domain: detectedDomain,
                pattern: cleanedPattern
            };
        }
    }

    return null;
}

/**
 * Detects high-risk keywords that often accompany scam campaigns, even when no URL is present.
 * @param {string} normalizedMessage
 * @returns {{isSuspicious: boolean, type: string, keyword: string, pattern: string}|null}
 */
function detectSuspiciousKeywords(normalizedMessage) {
    if (!normalizedMessage) return null;

    const compactMessage = normalizedMessage.replace(/[^a-z0-9]/g, '');

    const keywordRules = [
        { keyword: 'vercel', regexes: [buildLoosePattern('vercel'), /vercel\.app/i] },
        { keyword: 'opensea', regexes: [buildLoosePattern('opensea')] },
        { keyword: 'solana', regexes: [buildLoosePattern('solana')] },
        {
            keyword: 'sol',
            regexes: [/\bsol\b/i],
            contextRegex: /(wallet|airdrop|mint|claim|token|address|link|support|help|issue|fix|team|verify)/
        },
        {
            keyword: 'airdrop',
            regexes: [/(?:claim|join|participate|mint)[^a-z0-9]{0,3}airdrop|airdrop[^a-z0-9]{0,3}(?:now|here|today|live|claim)/i]
        },
        { keyword: 'free_mint', regexes: [/free[^a-z0-9]{0,3}mint/i] },
        { keyword: 'mint_now', regexes: [/mint[^a-z0-9]{0,3}(?:now|today|asap)/i] },
        { keyword: 'claim_reward', regexes: [/claim[^a-z0-9]{0,3}(?:your)?[^a-z0-9]{0,3}(?:reward|prize|compensation)/i] },
        { keyword: 'phantom_wallet', regexes: [buildLoosePattern('phantom')] },
        { keyword: 'metamask_wallet', regexes: [buildLoosePattern('metamask')] },
        { keyword: 'walletconnect', regexes: [buildLoosePattern('walletconnect')] }
    ];

    for (const rule of keywordRules) {
        for (const regex of rule.regexes) {
            const match = normalizedMessage.match(regex);
            if (match) {
                if (rule.contextRegex && !rule.contextRegex.test(normalizedMessage)) {
                    continue;
                }
                return {
                    isSuspicious: true,
                    type: 'suspicious_keyword',
                    keyword: rule.keyword,
                    pattern: match[0]
                };
            }
        }

        if (rule.compactIncludes) {
            for (const fragment of rule.compactIncludes) {
                if (compactMessage.includes(fragment)) {
                    return {
                        isSuspicious: true,
                        type: 'suspicious_keyword',
                        keyword: rule.keyword,
                        pattern: fragment
                    };
                }
            }
        }
    }

    return null;
}

// Export the main function needed by discofrybot.js
module.exports = {
    extractAndValidateUrls,
    // You could also export normalizeMessage if needed elsewhere:
    normalizeMessage
};
