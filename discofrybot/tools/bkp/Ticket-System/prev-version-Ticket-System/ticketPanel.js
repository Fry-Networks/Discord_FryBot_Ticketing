const { ChannelType, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, Events, EmbedBuilder, MessageFlags } = require('discord.js');
const { baseFields, ticketFields } = require('./validation');
const logger = require('../logger');

const STAFF_ROLE_ID = process.env.TICKET_MOD_ROLE;

module.exports = (client) => {
    client.on(Events.InteractionCreate, async (interaction) => {
        if (!interaction.isChatInputCommand() || interaction.commandName !== 'setup-ticket-panel') return;

        if (!interaction.member.roles.cache.has(STAFF_ROLE_ID)) {
            return interaction.reply({
                content: '❌ You don’t have permission to use this command.',
                flags: MessageFlags.Ephemeral
            });
        }

        const channel = interaction.options.getChannel('channel');
        if (!channel || channel.type !== ChannelType.GuildText) {
            return interaction.reply({
                content: '❌ Please specify a valid text channel.',
                flags: MessageFlags.Ephemeral
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('📩 Need assistance? 📩')
            .setDescription('Click on the dropdown below and choose the correct ticket type for faster assistance!')
            .setColor(0x5865F2);

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('ticket_type')
                .setPlaceholder('Select a ticket type')
                .addOptions([
                    { label: '🚚 Order Issues', value: 'order_tracking' },
                    { label: '✍️ Registration', value: 'registration' },
                    { label: '🔑 Miner Keys', value: 'miner_keys' },
                    { label: '💰 Rewards', value: 'rewards' },
                    { label: '🛠️ Tech Support', value: 'tech_support' }
                ])
        );
        await channel.send({ embeds: [embed], components: [row] });
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: `✅ Ticket panel posted in ${channel}`, flags: MessageFlags.Ephemeral });
        } else {
            await interaction.followUp({ content: `✅ Ticket panel posted in ${channel}`, flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    });

    // Handle ticket type selection
    client.on(Events.InteractionCreate, async (interaction) => {
        if (!interaction.isStringSelectMenu() || interaction.customId !== 'ticket_type') return;

        const ticketType = interaction.values[0];
        const fields = ticketFields[ticketType];
        if (!fields) {
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({ content: '⚠️ Invalid ticket type.', flags: MessageFlags.Ephemeral });
            } else {
                return interaction.followUp({ content: '⚠️ Invalid ticket type.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }

        const modal = new ModalBuilder()
            .setCustomId(`ticket_form_${ticketType}`)
            .setTitle('📩 Submit a Ticket');

        fields.forEach(fieldKey => {
            modal.addComponents(new ActionRowBuilder().addComponents(baseFields[fieldKey]));
        });

        await interaction.showModal(modal);
    });
};