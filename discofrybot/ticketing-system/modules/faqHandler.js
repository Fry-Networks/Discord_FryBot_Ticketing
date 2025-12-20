const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const logger = require('../utils/logger');

// (Optional) Emoji per category for even more style. Add to FAQ_CATEGORIES as needed!
const CATEGORY_EMOJIS = {
  faq_general: '🧠',
  faq_tokenomics: '💸',
  faq_nodes: '🛠️',
  faq_dashboard: '🖥️',
  faq_verified: '✅',
  faq_rewards: '🎁',
  faq_byod: '📦',
  faq_policies: '📜',
  faq_conversion: '♻️'
};

const FAQ_CATEGORIES = [
  { id: 'faq_general', label: 'General Overview', file: 'general.json' },
  { id: 'faq_tokenomics', label: 'Tokenomics & Rewards', file: 'tokenomics.json' },
  { id: 'faq_nodes', label: 'Node Setup & Monitoring', file: 'nodes.json' },
  { id: 'faq_dashboard', label: 'Dashboard Registration', file: 'dashboard.json' },
  { id: 'faq_verified', label: 'Miner/Node not verified', file: 'verified.json' },
  { id: 'faq_rewards', label: 'Unable to claim rewards', file: 'rewards.json' },
  { id: 'faq_byod', label: 'BYOD', file: 'byod.json' },
  { id: 'faq_policies', label: 'Policies & Support', file: 'policies.json' },
  { id: 'faq_conversion', label: 'Fry Conversion', file: 'conversion.json' },
];

function getCategoryRow() {
  // Discord allows 5 buttons per row max, so split into two rows if needed
  const rows = [];
  for (let i = 0; i < FAQ_CATEGORIES.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(
      FAQ_CATEGORIES.slice(i, i + 5).map(cat =>
        new ButtonBuilder()
          .setCustomId(cat.id)
          .setLabel(cat.label)
          .setStyle(ButtonStyle.Secondary)
      )
    ));
  }
  return rows;
}

// Now pass botClient as a parameter
async function handleFaqInteraction(interaction, botClient) {
  logger.info("FAQ handler called!", interaction.customId);
  const { customId } = interaction;

  if (customId.startsWith('show_faq_categories')) {
    await interaction.reply({
      content: 'Choose an FAQ category:',
      components: getCategoryRow(),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (customId === 'faq_conversion_specific') {
    const cat = FAQ_CATEGORIES.find(c => c.id === 'faq_conversion');
    const faqPath = path.join(__dirname, '../faq', cat.file);
    let faqContent;
    try {
      faqContent = JSON.parse(fs.readFileSync(faqPath, 'utf-8'));
    } catch (err) {
      await interaction.reply({
        content: 'FAQ data not found or invalid.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const emoji = CATEGORY_EMOJIS[cat.id] || '';

    const embed = new EmbedBuilder()
      .setTitle(`${emoji} ${faqContent.title || cat.label}`)
      .setColor(0x4651f6)
      .setFooter({
        text: 'Fry Networks Ticketing System',
        iconURL: botClient.user.displayAvatarURL()
      });

    faqContent.questions.forEach(q => {
      embed.addFields({ name: `❓ ${q.q}`, value: `${q.a}` });
    });

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Match against category IDs
  const cat = FAQ_CATEGORIES.find(cat => cat.id === customId);
  if (cat) {
    // Load the relevant FAQ JSON
    const faqPath = path.join(__dirname, '../faq', cat.file);
    let faqContent;
    try {
      faqContent = JSON.parse(fs.readFileSync(faqPath, 'utf-8'));
    } catch (err) {
      await interaction.reply({
        content: 'FAQ data not found or invalid.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Category emoji if you want extra style (or comment this out)
    const emoji = CATEGORY_EMOJIS[cat.id] || '';

    // Build the embed with fields
    const embed = new EmbedBuilder()
      .setTitle(`${emoji} ${faqContent.title || cat.label}`)
      .setColor(0x4651f6)
      .setFooter({
        text: 'Fry Networks Ticketing System',
        iconURL: botClient.user.displayAvatarURL()
      });

    faqContent.questions.forEach(q => {
      embed.addFields({ name: `❓ ${q.q}`, value: `${q.a}` });
    });

    await interaction.update({
      embeds: [embed],
      components: getCategoryRow(), // Let them pick another!
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
}

module.exports = { handleFaqInteraction };
