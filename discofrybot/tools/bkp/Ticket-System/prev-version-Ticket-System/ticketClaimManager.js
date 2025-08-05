const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Events,
    MessageFlags,
    AttachmentBuilder
} = require('discord.js');
const { supabase } = require('./supabase');
const { generateTranscriptHTML } = require('./transcriptGenerator');
const { uploadTranscriptToDrive } = require('./driveUploader');
const logger = require('../logger');

logger.info('✅ Ticket Claim Manager loaded');
const { scheduledClosures, recentInteractions, ticketCloseCooldown } = require('./shared');

const INTERACTION_SPAM_INTERVAL_MS = 5000; // Increased to 5 seconds

module.exports = (client) => {
    /*client.on(Events.InteractionCreate, async (interaction) => {
        try {
            if (!interaction.isButton()) return;

            // Handle only claim-related buttons
            const handledCustomIds = ['claim_ticket', 'unclaim_ticket'];

            if (!handledCustomIds.includes(interaction.customId)) return;

            const ticketChannel = interaction.channel;
            const key = `${interaction.user.id}_${interaction.customId}`;
            const now = Date.now();
            const lastUsed = recentInteractions.get(key);

            if (lastUsed && now - lastUsed < INTERACTION_SPAM_INTERVAL_MS) {
                const warningMessage = '⚠️ You just clicked this — give it a second.';
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: warningMessage,
                        flags: MessageFlags.Ephemeral
                    });
                } else {
                    await interaction.followUp({
                        content: warningMessage,
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                }

                const logMessage = `[interaction_repeat] ${interaction.user.tag} (${interaction.user.id}) clicked ${interaction.customId} too fast.`;
                logger.warn(logMessage);

                await supabase.from('bot_logs').insert({
                    timestamp: new Date().toISOString(),
                    level: 'warn',
                    scope: 'interaction_repeat',
                    message: logMessage
                });

                return;
            }

            recentInteractions.set(key, now);

            // --- CLAIM TICKET ---
            if (interaction.customId === 'claim_ticket') {
                const staffRoleId = process.env.TICKET_MOD_ROLE;
                if (!interaction.member.roles.cache.has(staffRoleId)) {
                    if (!interaction.replied && !interaction.deferred) {
                        return await interaction.reply({
                            content: '❌ Only staff can claim tickets.',
                            flags: MessageFlags.Ephemeral
                        });
                    } else {
                        return await interaction.followUp({
                            content: '❌ Only staff can claim tickets.',
                            flags: MessageFlags.Ephemeral
                        }).catch(() => {});
                    }
                }

                const { data: ticketData } = await supabase
                    .from('tickets')
                    .select('id, claimed_by')
                    .eq('channel_id', ticketChannel.id)
                    .single();

                if (ticketData?.claimed_by) {
                    if (!interaction.replied && !interaction.deferred) {
                        return await interaction.reply({
                            content: `⚠️ This ticket is already claimed by <@${ticketData.claimed_by}>.`,
                            flags: MessageFlags.Ephemeral
                        });
                    } else {
                        return await interaction.followUp({
                            content: `⚠️ This ticket is already claimed by <@${ticketData.claimed_by}>.`,
                            flags: MessageFlags.Ephemeral
                        }).catch(() => {});
                    }
                }

                await supabase
                    .from('tickets')
                    .update({ claimed_by: interaction.user.id })
                    .eq('channel_id', ticketChannel.id);

                await supabase.from('staff_actions').insert({
                    ticket_id: ticketData?.id,
                    staff_id: interaction.user.id,
                    action: 'claim'
                });

                const unclaimRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('unclaim_ticket')
                        .setLabel('❌ Unclaim Ticket')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('close_ticket')
                        .setLabel('🔒 Close Ticket')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('request_close')
                        .setLabel('⏳ Schedule Close')
                        .setStyle(ButtonStyle.Secondary)
                );

                await interaction.update({
                    content: `🛠️ Ticket claimed by <@${interaction.user.id}>`,
                    components: [unclaimRow]
                });
            }

            // --- UNCLAIM TICKET ---
            if (interaction.customId === 'unclaim_ticket') {
                const { data: ticketData } = await supabase
                    .from('tickets')
                    .select('claimed_by')
                    .eq('channel_id', ticketChannel.id)
                    .single();

                if (!ticketData?.claimed_by) {
                    return await interaction.reply({
                        content: '⚠️ This ticket hasn’t been claimed yet.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (ticketData.claimed_by !== interaction.user.id) {
                    return await interaction.reply({
                        content: `❌ Only <@${ticketData.claimed_by}> can unclaim this ticket.`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                await supabase
                    .from('tickets')
                    .update({ claimed_by: null })
                    .eq('channel_id', ticketChannel.id);

                await supabase.from('staff_actions').insert({
                    ticket_id: ticketData?.id,
                    staff_id: interaction.user.id,
                    action: 'unclaim'
                });

                const claimRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('claim_ticket')
                        .setLabel('🛠️ Claim Ticket')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('close_ticket')
                        .setLabel('🔒 Close Ticket')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('request_close')
                        .setLabel('⏳ Schedule Close')
                        .setStyle(ButtonStyle.Secondary)
                );

                await interaction.update({
                    content: `Ticket is now unclaimed.`,
                    components: [claimRow]
                });
            }
        } catch (err) {
            logger.error(`❌ Unhandled error in ticketClaimManager InteractionCreate (interaction ${interaction.id}):`, err);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '⚠️ An error occurred. Please try again later.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
        }
    });*/
};