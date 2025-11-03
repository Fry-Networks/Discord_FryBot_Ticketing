// transcriptGenerator.js
const fs = require('fs');
const path = require('path');
const supabase = require('../supabaseClient'); // Correctly import the supabase client
require('dotenv').config();
const logger = require('./logger');

function escapeHTML(str) {
    return str?.replace(/[<>"']/g, s => ({
        '<': '&lt;', 
        '>': '&gt;', 
        '"': '&quot;', 
        "'": '&#39;'
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
            <strong>${escapeHTML(f.name)}:</strong> ${escapeHTML(f.value)}
        </div>
    `).join('') || '';

    return `
        <div class="embed">
            ${embed.title ? `<div class="embed-title">${escapeHTML(embed.title)}</div>` : ''}
            ${embed.description ? `<div class="embed-description">${escapeHTML(embed.description)}</div>` : ''}
            ${fields}
            ${embed.footer?.text ? `<div class="embed-footer">${escapeHTML(embed.footer.text)}</div>` : ''}
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
        node_forgo_return: "Node(s) Forgo / Return",
        miner_keys: "Miner Keys",
        registration: "Registration",
        rewards: "Rewards",
        fry_conversion_issues: "FRY Conversion Issues"
    };
    
    const ticketType = ticketData ? (ticketTypeMap[ticketData.ticket_type] || "Unknown") : "Unknown";
    const htmlMessages = messages.map(entry => {
        const msg = JSON.parse(entry.message);

        const user = msg.discordData || {
            username: "Fry Networks Assistant",
            avatar: "https://depinscan-prod.s3.us-east-1.amazonaws.com/next-s3-uploads/13081854-e369-42e3-8c48-57030f9e1e2f/icon-image.jpg",
            created: Date.now()
        };
        const timestamp = user.created && !isNaN(user.created)
            ? formatTimestamp(user.created)
            : "Time Unknown";

        // Extract fields from either embed or root
        const embedObj = (msg.embeds && msg.embeds[0]) || msg;

        let content = "";

        if (embedObj.fields && embedObj.fields.length > 0) {
            content = `
                <div class="form-embed">
                    ${embedObj.fields.map(field => `
                        <div class="form-field">
                            <strong>${escapeHTML(field.name)}:</strong>
                            <span>${escapeHTML(
                                field.value
                                    .replace(/```/g, '')
                                    .replace(/\n/g, '')
                                    .trim()
                            )}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        } else if (embedObj.description) {
            content = `
                <div class="form-embed">
                    <div class="form-field">
                        <span>${escapeHTML(embedObj.description)}</span>
                    </div>
                </div>
            `;
        } else if (embedObj.title) {
            content = `
                <div class="form-embed">
                    <div class="embed-title"><strong>${escapeHTML(embedObj.title)}</strong></div>
                    ${embedObj.fields?.map(f => `
                        <div class="form-field">
                            <strong>${escapeHTML(f.name)}:</strong>
                            <span>${escapeHTML(f.value)}</span>
                        </div>
                    `).join('') || ''}
                </div>
            `;
        }
        // Add logic to handle regular content, including code blocks, AFTER form-embed checks
        else if ((user.content && user.content.trim() !== "") || (msg.content && msg.content.trim() !== "")) {
            const messageContent = user.content || msg.content;
            // Simple check for code blocks (lines starting and ending with triple backticks)
            if (messageContent.startsWith('```') && messageContent.endsWith('```')) {
                // Extract content within code blocks and format as preformatted text
                const codeContent = messageContent.substring(3, messageContent.length - 3).trim();
                content = `<pre><code>${escapeHTML(codeContent)}</code></pre>`;
            } else {
                // Otherwise, just escape and wrap in a div
                content = `<div>${escapeHTML(messageContent)}</div>`;
            }
        }
        // Keep the fallback for no content
        else {
            content = `<div style="color: #bbb; font-style: italic;">(no content)</div>`;
        }

        return `
            <div class="message">
                <img class="avatar" src="${user.avatar}" alt="avatar" />
                <div style="width:100%">
                    <div class="meta">
                        <span class="username">${escapeHTML(user.username)}</span>
                        <span class="timestamp">${timestamp}</span>
                    </div>
                    <div class="content">
                        ${content}
                    </div>
                </div>
            </div>
        `;
    }).join('\n');

// Generate the HTML template with the messages and ticket info
const fryBgUrl = 'https://i.imgur.com/eNg5IlI.jpeg'; // Change to your actual public URL

const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Fry Networks Transcripts</title>
  <style>
    body {
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      background: url('${fryBgUrl}') center/cover no-repeat fixed, #2c2f33; /* Discord-like dark background */
      color: #dcddde; /* Light grey text */
      padding: 20px;
      margin: 0;
      min-height: 100vh;
      line-height: 1.5; /* Improved readability */
    }
    .transcript-container {
      max-width: 800px; /* Increased max width */
      margin: 40px auto;
      background: rgba(102, 24, 24, 0.5); /* Semi-transparent reddish background */
      border-radius: 12px; /* Slightly smaller border radius */
      box-shadow: 0 8px 24px rgba(0,0,0,0.3); /* Stronger shadow */
      padding: 30px; /* Adjusted padding */
      backdrop-filter: blur(5px); /* Increased blur */
      border: 1px solid #4f545c; /* Subtle border */
    }
    h2, h3 {
      color: #ffffff; /* White headings */
      text-align: center;
      margin-bottom: 1em; /* Increased margin */
      font-weight: 700; /* Bolder headings */
      letter-spacing: 0.05em; /* Increased letter spacing */
      text-shadow: 0 2px 8px rgba(0,0,0,0.5); /* Adjusted shadow */
      border-bottom: 1px solid #4f545c; /* Subtle separator */
      padding-bottom: 10px;
    }
    .message {
      display: flex;
      align-items: flex-start;
      gap: 15px; /* Increased gap */
      background: rgba(102, 24, 24, 0.4); /* Semi-transparent reddish background */
      border-radius: 8px; /* Slightly larger border radius */
      max-width: 100%; /* Allow messages to take full width of container */
      margin: 15px 0; /* Adjusted margin */
      box-shadow: 0 2px 8px rgba(0,0,0,0.1); /* Adjusted shadow */
      padding: 15px; /* Increased padding */
      border-left: 4px solid #7289da; /* Discord-like blue border */
    }
    .avatar {
      width: 48px; /* Slightly larger avatar */
      height: 48px;
      border-radius: 50%;
      border: 2px solid #7289da; /* Blue border */
      background: #fff;
      object-fit: cover;
      flex-shrink: 0; /* Prevent avatar from shrinking */
    }
    .meta {
      font-size: 1em; /* Adjusted font size */
      margin-bottom: 5px; /* Adjusted margin */
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .username {
      font-weight: bold;
      color: #7289da; /* Discord-like blue for username */
      font-size: 1.1em; /* Slightly larger username font */
      letter-spacing: 0.02em;
    }
    .timestamp {
      color: #99aab5; /* Muted timestamp color */
      font-size: 0.9em; /* Smaller timestamp font */
      opacity: 1; /* Full opacity */
    }
    .content {
      white-space: pre-wrap;
      word-break: break-word; /* Prevent long words from overflowing */
      margin-top: 5px; /* Adjusted margin */
      font-size: 1em; /* Adjusted font size */
      flex-grow: 1; /* Allow content to take up remaining space */
    }
    .form-embed {
      display: flex;
      flex-direction: column;
      gap: 0.5em; /* Increased gap */
      background: rgba(102, 24, 24, 0.35); /* Slightly different semi-transparent reddish background */
      padding: 15px; /* Increased padding */
      border-radius: 8px;
      margin: 10px 0 0 0; /* Adjusted margin */
      border-left: 4px solid #7289da; /* Blue border */
      max-width: 100%; /* Allow form embed to take full width */
      margin-left: 0;
      box-shadow: 0 1px 6px rgba(0,0,0,0.1); /* Adjusted shadow */
    }

    .form-field {
      display: flex;
      gap: 1em; /* Increased gap */
      align-items: baseline;
      border-bottom: 1px solid #4f545c; /* Separator color */
      padding: 8px 0; /* Increased padding */
    }

    .form-field:last-child {
      border-bottom: none;
    }

    .form-field strong {
      color: #ffffff; /* White field names */
      min-width: 150px; /* Increased min-width for labels */
      text-align: right;
      font-size: 1em; /* Adjusted font size */
      letter-spacing: 0.01em;
      font-weight: 600;
      flex-shrink: 0; /* Prevent label from shrinking */
    }
    .form-field span {
        flex-grow: 1; /* Allow value to take up remaining space */
        word-break: break-word; /* Ensure long values wrap */
    }
  </style>
</head>
<body>
  <div class="transcript-container">
    <h2>Fry Networks Transcripts - Ticket ${ticketId} (${username})</h2>
    <h3>Ticket Type: ${ticketType}</h3>
    ${htmlMessages}
  </div>
</body>
</html>
`;

    const filename = `transcript-${ticketId}-${username}.html`;
    const filePath = path.join('/tmp', filename);
    fs.writeFileSync(filePath, htmlTemplate, 'utf-8');
    return filePath;
}

module.exports = { generateTranscriptHTML };
