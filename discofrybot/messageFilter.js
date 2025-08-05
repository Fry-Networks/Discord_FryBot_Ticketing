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
        return { isSuspicious: false }; // No URL-like patterns found
    }

    const allowedDomain = 'frynetworks.com';
    const discordInviteRegex = /(?:discord(?:app)?\.com\/invite|\.gg)[\/\w-]{1,}/gi; // Specific regex for Discord invites

    // Add allowed GIF domains
    const allowedGifDomains = ['giphy.com', 'tenor.com'];

    for (const potentialMatch of potentialMatches) {
        // Check specifically for Discord invites first (still high-risk)
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

    return { isSuspicious: false }; // All found URL-like patterns are either valid frynetworks.com domains, new allowed domains, or were handled
}

// Export the main function needed by discofrybot.js
module.exports = {
    extractAndValidateUrls,
    // You could also export normalizeMessage if needed elsewhere:
    normalizeMessage
};
