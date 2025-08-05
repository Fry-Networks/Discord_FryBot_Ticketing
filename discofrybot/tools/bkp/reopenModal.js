const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

async function reopenModalWithErrors(interaction, formData, errors) {
    const modal = new ModalBuilder()
        .setCustomId('ticket_modal')
        .setTitle(Object.keys(errors).length ? '⚠ Fix Errors & Resubmit' : 'Submit a Ticket');

    const emailField = new TextInputBuilder()
        .setCustomId('contact_info')
        .setLabel(errors.contact_info ? `❌ ${errors.contact_info}` : 'E-MAIL ADDRESS')
        .setStyle(TextInputStyle.Short)
        .setValue(formData.contact_info || '')
        .setRequired(true);

    const orderField = new TextInputBuilder()
        .setCustomId('order_number')
        .setLabel(errors.order_number ? `❌ ${errors.order_number}` : 'ORDER NUMBER/BYOD LICENSE')
        .setStyle(TextInputStyle.Short)
        .setValue(formData.order_number || '')
        .setRequired(true);

    const walletField = new TextInputBuilder()
        .setCustomId('algorand_address')
        .setLabel(errors.algorand_address ? `❌ ${errors.algorand_address}` : 'ALGORAND WALLET ADDRESS')
        .setStyle(TextInputStyle.Short)
        .setValue(formData.algorand_address || '')
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(emailField),
        new ActionRowBuilder().addComponents(orderField),
        new ActionRowBuilder().addComponents(walletField)
    );

    return await interaction.showModal(modal);
}

module.exports = { reopenModalWithErrors };
