const { 
    ChannelType, PermissionsBitField, ActionRowBuilder, StringSelectMenuBuilder, 
    ModalBuilder, TextInputBuilder, MessageFlags, TextInputStyle, ButtonBuilder, 
    ButtonStyle, Events, EmbedBuilder 
} = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Supabase connection
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

const CATEGORY_ID = process.env.TICKET_CATEGORY_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;

if (!CATEGORY_ID || !STAFF_ROLE_ID) {
    console.error("❌ Missing required environment variables: TICKET_CATEGORY_ID or STAFF_ROLE_ID");
    process.exit(1); // Exit the process if critical variables are missing
}

module.exports = (client) => {
    client.on(Events.InteractionCreate, async (interaction) => {
            if (!interaction.isChatInputCommand()) return;
    
            if (interaction.commandName === 'setup-ticket-panel') {
                // Restrict command to staff members
                if (!interaction.member.roles.cache.has(process.env.STAFF_ROLE_ID)) {
                    return interaction.reply({ content: "❌ You don't have permission to use this command.", flags: MessageFlags.Ephemeral });
                }
    
                const channel = interaction.options.getChannel('channel');
                if (!channel) {
                    return interaction.reply({ content: "Please specify a valid channel.", flags: MessageFlags.Ephemeral });
                }
    
                const embed = new EmbedBuilder()
                    .setTitle("📩 Need Help? Open a Ticket!")
                    .setDescription("Select a category from the dropdown below to create a ticket.")
                    .setColor(0x5865F2);
    
            const row = new ActionRowBuilder()
                .addComponents(
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
            await interaction.reply({ content: `✅ Ticket panel posted in ${channel}`, flags: MessageFlags.Ephemeral });
        }
    });

    client.on(Events.InteractionCreate, async (interaction) => {
        if (!interaction.isStringSelectMenu()) return;

        if (interaction.customId === 'ticket_type') {
            const ticketType = interaction.values[0];

            const modal = new ModalBuilder()
                .setCustomId(`ticket_form_${ticketType}`)
                .setTitle("📩 Submit a Ticket");

            const warningEmbed = new EmbedBuilder()
                .setDescription("⚠ **This form will be submitted to Fry Networks Support. Do not share passwords or other sensitive information.**")
                .setColor(0xFF0000);

     // Define fields based on ticket type
     let fields = [];
switch (ticketType) {
    case 'order_tracking':
        fields = [
            new TextInputBuilder()
                .setCustomId("contact_info")
                .setLabel("Contact Information (Full Name+Email)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder("Enter your full name and email (e.g John Smith johnsmith@email.com)"),
            new TextInputBuilder()
                .setCustomId("order_number")
                .setLabel("Order Number")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder("Enter your 5-digit order number"),
            new TextInputBuilder()
                .setCustomId("description")
                .setLabel("Describe your issue")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setPlaceholder("Provide a brief description of your issue")
        ];
        break;

    case 'registration':
        fields = [
            new TextInputBuilder()
                .setCustomId("contact_info")
                .setLabel("Contact Information (Full Name+Email)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder("Enter your full name and email (e.g John Smith johnsmith@email.com)"),
            new TextInputBuilder()
                .setCustomId("minerkeys")
                .setLabel("Miner Keys")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder("Enter your miner keys"),
            new TextInputBuilder()
                .setCustomId("order_number")
                .setLabel("Order Number")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder("Enter your 5-digit order number"),
            new TextInputBuilder()
                .setCustomId("algorand_address")
                .setLabel("Algorand Address")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder("Enter your Algorand address"),
            new TextInputBuilder()
                .setCustomId("description")
                .setLabel("Describe your issue")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setPlaceholder("Provide a brief description of your issue")
        ];
        break;

    case 'miner_keys':
        fields = [
            new TextInputBuilder()
                .setCustomId("contact_info")
                .setLabel("Contact Information (Full Name+Email)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder("Enter your full name and email (e.g John Smith johnsmith@email.com)"),
            new TextInputBuilder()
                .setCustomId("order_number")
                .setLabel("Order Number")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder("Enter your 5-digit order number"),
            new TextInputBuilder()
                .setCustomId("algorand_address")
                .setLabel("Algorand Address")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder("Enter your Algorand address"),
            new TextInputBuilder()
                .setCustomId("description")
                .setLabel("Describe your issue")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setPlaceholder("Provide a brief description of your issue")
        ];
        break;

    case 'rewards':
        fields = [
            new TextInputBuilder()
                .setCustomId("contact_info")
                .setLabel("Contact Information (Full Name+Email)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder("Enter your full name and email (e.g John Smith johnsmith@email.com)"),
            new TextInputBuilder()
                .setCustomId("minerkeys")
                .setLabel("Miner Keys")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder("Enter your miner keys"),
            new TextInputBuilder()
                .setCustomId("order_number")
                .setLabel("Order Number")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder("Enter your 5-digit order number"),
            new TextInputBuilder()
                .setCustomId("algorand_address")
                .setLabel("Algorand Address")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder("Enter your Algorand address"),
            new TextInputBuilder()
                .setCustomId("description")
                .setLabel("Describe your issue")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setPlaceholder("Provide a brief description of your issue")
        ];
        break;

    case 'tech_support':
        fields = [
            new TextInputBuilder()
                .setCustomId("contact_info")
                .setLabel("Contact Information (Full Name+Email)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder("Enter your full name and email (e.g John Smith johnsmith@email.com)"),
            new TextInputBuilder()
                .setCustomId("minerkeys")
                .setLabel("Miner Keys")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder("Enter your miner keys"),
            new TextInputBuilder()
                .setCustomId("order_number")
                .setLabel("Order Number")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder("Enter your 5-digit order number"),
            new TextInputBuilder()
                .setCustomId("algorand_address")
                .setLabel("Algorand Address")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder("Enter your Algorand address"),
            new TextInputBuilder()
                .setCustomId("description")
                .setLabel("Describe your issue")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setPlaceholder("Provide a brief description of your issue")
        ];
        break;

             default:
                 return interaction.reply({ content: "⚠️ Invalid ticket type.", flags: MessageFlags.Ephemeral });
            }

            // Add fields to the modal
            fields.forEach(field => modal.addComponents(new ActionRowBuilder().addComponents(field)));

            // Show the modal
            await interaction.showModal(modal);
        }
    });

    client.on(Events.InteractionCreate, async (interaction) => {
        if (!interaction.isModalSubmit()) return;

        if (interaction.customId.startsWith("ticket_form_")) {
            const ticketType = interaction.customId.replace("ticket_form_", "");
            const guild = interaction.guild;
            const user = interaction.user;
            console.log(`🆔 Capturing ticket from ${user.username} (${user.id})`);

            const contactInfo = interaction.fields.getTextInputValue("contact_info");
            const description = interaction.fields.getTextInputValue("description") || "No description provided.";
            const orderNumber = interaction.fields.fields.has("order_number") 
                ? interaction.fields.getTextInputValue("order_number") 
                : "N/A";
            const algorandAddress = interaction.fields.fields.has("algorand_address") 
                ? interaction.fields.getTextInputValue("algorand_address") 
                : "N/A";            
            const minerKeys = interaction.fields.fields.has("minerkeys") 
                ? interaction.fields.getTextInputValue("minerkeys") 
                : "N/A";
            const socialAccounts = interaction.fields.fields.has("social_accounts") 
                ? interaction.fields.getTextInputValue("social_accounts") 
                : "N/A";
        
            // Split contact_info into full_name and email
            const contactRegex = /^(.+?)\s+([\w.-]+@[\w.-]+\.\w+)$/;
            const match = contactInfo.match(contactRegex);

            if (!match) {
                return interaction.reply({ 
                    content: "⚠️ Invalid contact information format. Please use 'Full Name email', e.g., 'John Doe john.doe@example.com'.",
                    flags: MessageFlags.Ephemeral 
                });
            }

            const fullName = match[1].trim();
            const email = match[2].trim();

            // Validate email
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return interaction.reply({ content: "⚠️ Invalid email address. Please try again.", flags: MessageFlags.Ephemeral });
            }

            const category = guild.channels.cache.get(CATEGORY_ID);
            if (!category) {
                return interaction.reply({ content: "⚠️ Ticket system error: Category not found.", flags: MessageFlags.Ephemeral });
            }

// Prevent Ticket Duplication 
const { data: existingTicket } = await supabase
    .from('tickets')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'open')
    .maybeSingle();

if (existingTicket) {
    return interaction.reply({ content: "⚠️ You already have an open ticket. Please close it before opening a new one.", flags: MessageFlags.Ephemeral });
}
            
// Generate a new ticket ID using Supabase (auto-increment handled by the database)
const { data, error } = await supabase
    .from('tickets')
    .insert([{
        user_id: user.id,
        discord_username: user.username,
        ticket_type: ticketType,
        full_name: fullName,
        email: email,
        description: description,
        algorand_address: algorandAddress,
        minerkeys: minerKeys,
        order_number: orderNumber,
        social_accounts: socialAccounts,
        status: 'open'
    }])
    .select()
    .single();

if (error) {
    console.error("❌ Error saving ticket to database:", error.message);
    return interaction.reply({ content: "⚠️ Something went wrong while creating the ticket. Please try again.", flags: MessageFlags.Ephemeral });
}

// Use the newly generated ticket ID from Supabase
const ticketId = data.id;

let ticketChannel;
try {
    ticketChannel = await guild.channels.create({
    name: `${ticketId}-${user.username}`,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        { id: STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
    ]
});
} catch (error) {
    console.error("❌ Error creating ticket channel:", error.message);
    await interaction.reply({ content: "⚠️ Failed to create the ticket channel. Please contact support.", flags: MessageFlags.Ephemeral });
    return;
}

const { error: updateError } = await supabase
    .from('tickets')
    .update({ channel_id: ticketChannel.id })
    .eq('id', ticketId);

if (updateError) {
    console.error("❌ Error updating ticket channel ID in database:", updateError.message);
}

await interaction.reply({ content: `✅ Ticket created: ${ticketChannel}`, flags: MessageFlags.Ephemeral });


            const closeButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_ticket')
                        .setLabel('Close Ticket')
                        .setStyle(ButtonStyle.Danger)
                );

            const ticketEmbed = new EmbedBuilder()
                .setTitle("New Ticket Created")
                .setDescription(`Hello <@${user.id}>, a staff member will assist you shortly.`)
                .addFields(
                    { name: "Ticket Type", value: ticketType.replace(/_/g, ' ').toUpperCase(), inline: true },
                    { name: "Full Name", value: fullName, inline: true },
                    { name: "Email", value: email, inline: true },
                    { name: "Description", value: description, inline: true },
                    { name: "Algorand Address", value: algorandAddress, inline: true },
                    { name: "Miner Keys", value: minerKeys, inline: true },
                    { name: "Order Number", value: orderNumber, inline: true },
                    { name: "Social Accounts", value: socialAccounts, inline: true }
                )
                .setColor(0x5865F2);

            await ticketChannel.send({
                embeds: [ticketEmbed],
                components: [closeButton]
            });

            await interaction.reply({ content: `✅ Ticket created: ${ticketChannel}`, flags: MessageFlags.Ephemeral });
        }
    });

    client.on(Events.InteractionCreate, async (interaction) => {
        if (!interaction.isButton()) return;
        const ticketChannel = interaction.channel;

        // Step 1: Ask for Confirmation
        if (interaction.customId === 'close_ticket') {
            const confirmButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('confirm_close_ticket')
                    .setLabel('✅ Confirm Close')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('cancel_close_ticket')
                    .setLabel('❌ Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );
        
            await interaction.reply({
                content: "⚠️ Are you sure you want to close this ticket?",
                components: [confirmButtons]
            });
        }

        // Step 2: Handle Confirm Close
        if (interaction.customId === 'confirm_close_ticket') {
            const { error: closeError } = await supabase
            .from('tickets')
            .update({ status: 'closed', closed_at: new Date().toISOString() })
            .eq('channel_id', ticketChannel.id);
        
            if (closeError) {
                console.error("❌ Error updating ticket status in database:", closeError.message);
                return interaction.reply({ content: "⚠️ Failed to close the ticket. Please try again later.", flags: MessageFlags.Ephemeral });
            }

            await interaction.update({
                content: "✅ Ticket closed. This channel will be deleted in 5 seconds.",
                components: [] // Removes the buttons
            });

            if (ticketChannel.permissionsFor(client.user).has(PermissionsBitField.Flags.ManageChannels)) {
                setTimeout(() => {
                    ticketChannel.delete().catch(console.error);
                }, 5000);
            } else {
                console.error("❌ Missing 'Manage Channels' permission. Cannot delete ticket channel.");
            }
        }

        // Step 3: Handle Cancel Close
        if (interaction.customId === 'cancel_close_ticket') {
            await interaction.update({
                content: "❌ Ticket closure canceled.",
                components: [] // Removes the buttons
            });
        }
    });

// ✅ Message Logging for Tickets
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!message.channel.name.startsWith("ticket-")) return;

    console.log(`📩 Message detected: "${message.content}" from ${message.author.username} in ${message.channel.name}`);

    const ticketId = parseInt(message.channel.name.split('-')[0]);
    if (isNaN(ticketId)) {
        console.error(`⚠️ Invalid ticket ID extracted from channel: ${message.channel.name}`);
        return;
    }
    
    const { error: logError } = await supabase
        .from('ticket_messages')
        .insert([{ 
            ticket_id: ticketId, 
            user_id: message.author.id, 
            message: message.content,
            discord_message_id: message.id
        }]);

    if (logError) {
        console.error("❌ Error saving message to database:", logError.message);
    }
});
};
