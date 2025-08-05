// transcriptGenerator.js
const fs = require('fs');
const path = require('path');
const { supabase } = require('./supabase');
require('dotenv').config();
const logger = require('../logger');

function escapeHTML(str) {
    return str?.replace(/[<>"']/g, s => ({
        '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[s])) || '';
}
function formatTimestamp(ts) {
    const date = new Date(ts);
    return date.toLocaleString(undefined, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function renderEmbed(embed) {
    const fields = embed.fields?.map(f => `
        <div class="embed-field">
            <strong>${f.name}:</strong> ${f.value}
        </div>
    `).join('') || '';

    return `
        <div class="embed">
            ${embed.title ? `<div class="embed-title">${escapeHTML(embed.title)}</div>` : ''}
            ${embed.description ? `<div class="embed-description">${escapeHTML(embed.description)}</div>` : ''}
            ${fields}
            ${embed.footer?.text ? `<div class="embed-footer">${embed.footer.text}</div>` : ''}
        </div>
    `;
}

async function generateTranscriptHTML(ticketId, username) {
    const { data: messages, error } = await supabase
        .from('ticket_messages')
        .select('message')
        .eq('ticket_id', ticketId)
        .order('discord_message_id', { ascending: true });

    if (error) {
        logger.error('❌ Failed to fetch messages for transcript:', error);
        return null;
    }
    // Fetch ticket type from the tickets table
    const { data: ticketData, error: ticketError } = await supabase
        .from('tickets')
        .select('ticket_type')
        .eq('id', ticketId)
        .single();

    if (ticketError) {
        logger.error('❌ Failed to fetch ticket type:', ticketError);
    }
    const ticketTypeMap = {
        order_tracking: "Order Tracking and Issues",
        tech_support: "Technical Support",
        miner_keys: "Miner Keys",
        registration: "Registration",
        rewards: "Rewards"
    };
    
    const ticketType = ticketData ? (ticketTypeMap[ticketData.ticket_type] || "Unknown") : "Unknown";

    const htmlMessages = messages.map(entry => {
        const msg = JSON.parse(entry.message);
        // If it's an embed-only row (no discordData), fake basic info
        if (!msg.discordData && msg.title && msg.fields) {
            msg.discordData = {
                username: "Fry Networks Assistant",
                avatar: "https://depinscan-prod.s3.us-east-1.amazonaws.com/next-s3-uploads/13081854-e369-42e3-8c48-57030f9e1e2f/icon-image.jpg",
                created: Date.now(),
                content: ''
            };
            msg.embeds = [msg]; // Wrap it in an array for rendering
        }
        const user = msg.discordData || {
            username: "Fry Networks Assistant",
            avatar: "https://depinscan-prod.s3.us-east-1.amazonaws.com/next-s3-uploads/13081854-e369-42e3-8c48-57030f9e1e2f/icon-image.jpg",
            created: Date.now()
        };
        const timestamp = user.created && !isNaN(user.created) ? formatTimestamp(user.created) : "Time Unknown";
        let content = '';

        if (user.content) {
            content = user.content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        if ((!user.content || content === '') && msg.embeds?.length > 0) {
            const embed = msg.embeds[0];
            if (embed.fields?.length > 0) {
                // Use this block as the actual transcript content
                content = `
                <div class="form-embed">
                    ${embed.fields.map(field => {
                        const cleanValue = field.value
                            .replace(/```/g, '')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;')
                            .replace(/"/g, '&quot;')
                            .replace(/'/g, '&#39;')
                            .trim();

                        return `
                            <div class="form-field">
                                <strong>${escapeHTML(field.name)}:</strong>
                                <div>${cleanValue}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;                
            } else {
                // fallback: show title/description at least
                content = `
                    ${embed.title ? `<div class="embed-title">${escapeHTML(embed.title)}</div>` : ''}
                    ${embed.description ? `<div class="embed-description">${escapeHTML(embed.description)}</div>` : ''}                
                `;
            }
        }
                return `
                <div class="message">
                    <img class="avatar" src="${user.avatar}" alt="avatar" />
                    <div class="meta">
                        <span class="username">${user.username}</span>
                        <span class="timestamp">${timestamp}</span>
                    </div>
                    <div class="content">${content}</div>
                </div>
            `;
    }).join('\n');

    const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Fry Networks Transcripts</title>
  <style>
    body { font-family: "Segoe UI", sans-serif; background: #3a0e0e; color: #eee; padding: 20px; }
    h2 { color: #fff; }
    .message { background: #4d1a1a; border: 1px solid #6e2e2e; padding: 12px; margin: 12px 0; border-radius: 6px; display: flex; gap: 10px; }
    .avatar { width: 40px; height: 40px; border-radius: 50%; }
    .meta { font-size: 0.9em; margin-bottom: 6px; }
    .username { font-weight: bold; color: #f99; }
    .timestamp { color: #bbb; margin-left: 10px; }
    .content { white-space: pre-wrap; margin-bottom: 6px; }
    .embed { background: #5c1a1a; padding: 10px; border-left: 4px solid #f99; margin-top: 8px; border-radius: 4px; }
    .embed-title { font-weight: bold; color: #fdd; margin-bottom: 4px; }
    .embed-description { margin: 6px 0; }
    .embed-field { margin: 4px 0; }
    .embed-footer { font-size: 0.85em; color: #bbb; margin-top: 6px; }
    .form-embed {
        background: #5c1a1a;
        border: 1px solid #f99;
        padding: 10px;
        border-radius: 6px;
        margin-top: 10px;
    }

    .form-field {
        padding: 6px 0;
        border-bottom: 1px solid #f99;
    }

    .form-field:last-child {
        border-bottom: none;
    }
  </style>
</head>
<body>
  <h2>Fry Networks Transcripts - Ticket ${ticketId} (${username})</h2>
  <h3>Ticket Type: ${ticketType}</h3>
  ${htmlMessages}
</body>
</html>
`;

    const filename = `transcript-${ticketId}-${username}.html`;
    const filePath = path.join('/tmp', filename);
    fs.writeFileSync(filePath, htmlTemplate, 'utf-8');
    return filePath;
}

module.exports = { generateTranscriptHTML };
