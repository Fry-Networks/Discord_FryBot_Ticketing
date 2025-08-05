const {
    ChannelType, PermissionsBitField, ActionRowBuilder, Events, EmbedBuilder, MessageFlags, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder
} = require('discord.js');
const { supabase } = require('./supabase');
const { validateTicketSubmission, baseFields, ticketFields } = require('./validation');
const logger = require('../logger');

const resumeCache = new Map();
const categoryIds = {
    order_tracking: process.env.TICKET_CAT_ORDER,
    registration: process.env.TICKET_CAT_REGISTRATION,
    miner_keys: process.env.TICKET_CAT_MINER_KEYS,
    rewards: process.env.TICKET_CAT_REWARDS,
    tech_support: process.env.TICKET_CAT_TECH_SUPPORT
};

module.exports = (client) => {
    client.on(Events.InteractionCreate, async (interaction) => {
        // Handle modal submission
        if (!interaction.isModalSubmit() || !interaction.customId.startsWith('ticket_form_')) return;

        const ticketType = interaction.customId.replace('ticket_form_', '');
        const categoryId = categoryIds[ticketType];
        if (!categoryId) {
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({ content: '⚠️ Ticket system error: Category not found.', flags: MessageFlags.Ephemeral });
            } else {
                return interaction.followUp({ content: '⚠️ Ticket system error: Category not found.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }

        // Gather field values
        const fields = {
            contact_info: interaction.fields.getTextInputValue('contact_info'),
            order_number: interaction.fields.fields.has('order_number') ? interaction.fields.getTextInputValue('order_number') : '',
            algorand_address: interaction.fields.fields.has('algorand_address') ? interaction.fields.getTextInputValue('algorand_address') : '',
            minerkeys: interaction.fields.fields.has('minerkeys') ? interaction.fields.getTextInputValue('minerkeys') : '',
            description: interaction.fields.getTextInputValue('description') || ''
        };

        // Validate submission
        const { errors, validatedData } = validateTicketSubmission(ticketType, fields);

        if (Object.keys(errors).length > 0) {
            const cacheKey = `${interaction.user.id}_${ticketType}`;
            resumeCache.set(cacheKey, fields);
            await interaction.reply({
                content: `⚠️ Errors in your submission:\n\n${Object.values(errors).map(e => `- ${e}`).join('\n')}\n\nPlease correct them and click the button below to resume.`,
                flags: MessageFlags.Ephemeral
            });
            const resumeButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`resume_ticket_${ticketType}`)
                    .setLabel('Resume Form')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.followUp({
                content: 'Click below to resume and fix your submission:',
                components: [resumeButton],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Handle resume ticket button (placed here for better readability)
        if (interaction.isButton() && interaction.customId.startsWith('resume_ticket_')) {
            const ticketType = interaction.customId.replace('resume_ticket_', '');
        
            const fields = ticketFields[ticketType];
            if (!fields) {
                return await interaction.reply({ content: '⚠️ Ticket type not recognized.', flags: MessageFlags.Ephemeral });
            }

            const cacheKey = `${interaction.user.id}_${ticketType}`;
            const cachedFields = resumeCache.get(cacheKey) || {};
        
            // You should ideally cache user input earlier – for now, reopen a blank form
            const modal = new ModalBuilder()
                .setCustomId(`ticket_form_${ticketType}`)
                .setTitle('📩 Resume Ticket Submission');
                            
            fields.forEach(fieldKey => {
                const field = TextInputBuilder.from(baseFields[fieldKey]);
                field.setValue(cachedFields[fieldKey] || '');
                modal.addComponents(new ActionRowBuilder().addComponents(field));
            });
        
            return await interaction.showModal(modal);
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Proceed with ticket creation
        const user = interaction.user;
        const guild = interaction.guild;

        const { data: existingTicket } = await supabase
            .from('tickets')
            .select('id')
            .eq('user_id', user.id)
            .eq('status', 'open')
            .maybeSingle();

        if (existingTicket) {
            return interaction.editReply({ content: '⚠️ You already have an open ticket. Please close it before opening a new one.', flags: MessageFlags.Ephemeral });
        }

        const { data, error } = await supabase
            .from('tickets')
            .insert([{
                user_id: user.id,
                discord_username: user.username,
                ticket_type: ticketType,
                full_name: validatedData.fullName,
                email: validatedData.email,
                description: validatedData.description,
                algorand_address: validatedData.algorandAddress || 'N/A',
                minerkeys: validatedData.minerKeys || 'N/A',
                order_number: validatedData.orderNumber || 'N/A',
                status: 'open',
                channel_id: null
            }])
            .select()
            .single();

        if (error) {
            logger.error('❌ Detailed Insert Error:', JSON.stringify(error, null, 2));
            return interaction.editReply({ content: '⚠️ Something went wrong while creating the ticket. Please try again.', flags: MessageFlags.Ephemeral });
        }

        const ticketId = data.id;
        await supabase.from('users').upsert({
            id: user.id,
            username: user.username,
            discriminator: user.discriminator,
            avatar_url: user.displayAvatarURL({ extension: 'png', size: 256 }),
            last_seen: new Date().toISOString()
        });

        let ticketChannel;
        const userPerms = [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.AddReactions,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.EmbedLinks
        ];
        try {
            ticketChannel = await guild.channels.create({
                name: `${ticketId}-${user.username}`,
                type: ChannelType.GuildText,
                parent: categoryId,
                permissionOverwrites: [
                    { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: user.id, allow: userPerms },
                    { id: process.env.TICKET_MOD_ROLE, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
                ]
            });
        } catch (error) {
            logger.error('❌ Error creating ticket channel:', error.message);
            return interaction.editReply({ content: '⚠️ Failed to create the ticket channel. Please contact support.', flags: MessageFlags.Ephemeral });
        }

        const { error: updateError } = await supabase
            .from('tickets')
            .update({ channel_id: ticketChannel.id })
            .eq('id', ticketId);

        if (updateError) {
            logger.error('❌ Error updating channel ID:', JSON.stringify(updateError, null, 2));
            return interaction.editReply({ content: '⚠️ Failed to update ticket with channel info.', flags: MessageFlags.Ephemeral });
        }

        // Build ticket embed
        const embedFields = [];

        if (validatedData.fullName) embedFields.push({ name: 'Full Name', value: `\`\`\`\n${validatedData.fullName}\n\`\`\``, inline: false });
        if (validatedData.email) embedFields.push({ name: 'Email', value: `\`\`\`\n${validatedData.email}\n\`\`\``, inline: false });
        if (validatedData.orderNumber && validatedData.orderNumber !== 'N/A') embedFields.push({ name: 'Order Number', value: `\`\`\`\n${validatedData.orderNumber}\n\`\`\``, inline: false });
        if (validatedData.algorandAddress && validatedData.algorandAddress !== 'N/A') embedFields.push({ name: 'Algorand Address', value: `\`\`\`\n${validatedData.algorandAddress}\n\`\`\``, inline: false });
        if (validatedData.minerKeys && validatedData.minerKeys !== 'N/A') embedFields.push({ name: 'Miner Keys', value: `\`\`\`\n${validatedData.minerKeys}\n\`\`\``, inline: false });
        if (validatedData.description) embedFields.push({ name: 'Description', value: `\`\`\`\n${validatedData.description}\n\`\`\``, inline: false });

        const ticketEmbed = new EmbedBuilder()
            .setTitle('# Submitted Ticket Form')
            .setColor(0x5865F2)
            .addFields(embedFields);

        // Send ticket embed
        const embedMessage = await ticketChannel.send({ embeds: [ticketEmbed] });

        // Send claim + close buttons
        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('claim_ticket')
                .setLabel('🛠️ Claim Ticket')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('close_ticket')
                .setLabel('🔒 Close Ticket Now')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('request_close')
                .setLabel('⏳ Schedule Close')
                .setStyle(ButtonStyle.Secondary)
        );

        await ticketChannel.send({
            content: 'Ticket Actions:',
            components: [actionRow]
        });

        setTimeout(() => {
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('📨 Ticket Received')
                .setDescription(`Thank you for reaching out <@${user.id}>!\n\nOur team will review your ticket as soon as possible. **We NEVER reply by DM!**\nPlease allow up to **48 hours** for a response.\n\n⚠️ Do **not** share sensitive info (passwords, payment details, etc).\n\nIf you have any questions or updates, just reply in this ticket.\n\nThank you for your patience — we’ll get to you as soon as possible.`)
                .setFooter({ text: 'Fry Networks', iconURL: client.user.displayAvatarURL() })
                .setTimestamp();

            ticketChannel.send({ embeds: [embed] }).catch(err => logger.error(err));
        }, 10000);
        await supabase
            .from('ticket_messages')
            .insert([{
                ticket_id: ticketId,
                user_id: interaction.client.user.id,
                message: JSON.stringify(ticketEmbed.toJSON()),
                discord_message_id: embedMessage.id
            }]);
        await interaction.editReply({ content: `✅ Ticket created: ${ticketChannel}`, flags: MessageFlags.Ephemeral });
    });
};