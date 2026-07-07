// ticketing-system/utils/categoryOverflow.js
// Shared category-overflow resolution: used by ticket creation and ticket closing
// so that a full mapped category auto-creates the next numbered overflow category
// instead of failing outright. Extracted from the create-path logic added in
// commit 79d9ebb ("fix: add dynamic overflow category support for ticket creation").
const { ChannelType } = require('discord.js');
const logger = require('./logger');

const MAX_CHANNELS_PER_CATEGORY = 50;

// Was called but never defined anywhere in the codebase (git blame: e9827bd,
// 2025-11-03, unrelated to the overflow feature added later) -- a dangling
// reference that would throw ReferenceError if ever reached. Defined here,
// log-only, no new dependencies.
async function notifyCategoryFull(reason) {
    logger.warn(`[Overflow] notifyCategoryFull: ${reason}`);
}

/**
 * Resolves the category a new channel should be created under, auto-creating
 * a numbered overflow category (name: "<primary name> <N>", permissions cloned
 * from the primary) if the primary and all existing numbered overflow
 * categories are full.
 * @param {import('discord.js').Guild} guild
 * @param {string} primaryCategoryId
 * @param {string} label - used only in log messages (e.g. ticket type, or a
 *   descriptive name for non-ticket-type callers like the close path)
 * @returns {Promise<import('discord.js').CategoryChannel>} the resolved category
 * @throws if the primary category can't be found, or if creating a new
 *   overflow category fails (callers should catch and handle both cases in
 *   whatever way fits their context -- see ticketCreationHandler.js and
 *   closeHandler.js for two different call-site error-handling approaches).
 */
async function resolveCategoryWithOverflow(guild, primaryCategoryId, label) {
    const primaryCategory = guild.channels.cache.get(primaryCategoryId);
    if (!primaryCategory || primaryCategory.type !== ChannelType.GuildCategory) {
        throw new Error(`Primary category ${primaryCategoryId} not found or is not a category for ${label}`);
    }

    let categoryId = null;
    let categoryChannel = null;
    const primaryName = primaryCategory.name;

    // Build list: primary + existing overflow categories (by name pattern)
    const categoriesToCheck = [primaryCategory];
    const overflowCategories = guild.channels.cache.filter(
        ch => ch.type === ChannelType.GuildCategory
            && ch.name.startsWith(primaryName + ' ')
            && /^\d+$/.test(ch.name.slice(primaryName.length + 1))
    ).sort((a, b) => {
        const numA = parseInt(a.name.slice(primaryName.length + 1), 10);
        const numB = parseInt(b.name.slice(primaryName.length + 1), 10);
        return numA - numB;
    });
    overflowCategories.forEach(cat => categoriesToCheck.push(cat));

    // Check each category for capacity
    for (const candidateCategory of categoriesToCheck) {
        const channelsInCategory = guild.channels.cache.filter(
            channel => channel.parentId === candidateCategory.id
        ).size;
        if (channelsInCategory < MAX_CHANNELS_PER_CATEGORY) {
            categoryId = candidateCategory.id;
            categoryChannel = candidateCategory;
            logger.info(`[Overflow] Using category "${candidateCategory.name}" (${candidateCategory.id}) — ${channelsInCategory}/${MAX_CHANNELS_PER_CATEGORY} channels — for ${label}.`);
            break;
        } else {
            logger.info(`[Overflow] Category "${candidateCategory.name}" (${candidateCategory.id}) is full (${channelsInCategory}/${MAX_CHANNELS_PER_CATEGORY} channels).`);
        }
    }

    // If all full, create new overflow category
    if (!categoryId || !categoryChannel) {
        const nextNumber = categoriesToCheck.length + 1;
        const newCategoryName = `${primaryName} ${nextNumber}`;
        logger.info(`[Overflow] All ${categoriesToCheck.length} categories for ${label} are full. Creating overflow category "${newCategoryName}"...`);

        try {
            const newCategory = await guild.channels.create({
                name: newCategoryName,
                type: ChannelType.GuildCategory,
                permissionOverwrites: primaryCategory.permissionOverwrites.cache.map(overwrite => ({
                    id: overwrite.id,
                    allow: overwrite.allow,
                    deny: overwrite.deny,
                    type: overwrite.type,
                })),
                position: primaryCategory.position + 1,
                reason: `Auto-created overflow category for ${label} (primary category full)`,
            });
            categoryId = newCategory.id;
            categoryChannel = newCategory;
            logger.info(`[Overflow] Created overflow category "${newCategoryName}" (${newCategory.id}) for ${label}.`);
        } catch (err) {
            logger.error(`[Overflow] Failed to create overflow category "${newCategoryName}": ${err.message}`);
            await notifyCategoryFull(`overflow category creation failed for ${label}: ${err.message}`);
            throw err;
        }
    }

    logger.info(`[Overflow] Resolved category for ${label}: "${categoryChannel.name}" (${categoryId})`);
    return categoryChannel;
}

module.exports = { resolveCategoryWithOverflow, notifyCategoryFull, MAX_CHANNELS_PER_CATEGORY };
