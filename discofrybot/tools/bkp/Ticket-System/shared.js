// shared.js
const scheduledClosures = new Map(); // channel_id -> timeout object
const recentInteractions = new Map(); // userId_customId -> timestamp
const ticketCloseCooldown = new Map(); // userId -> last close timestamp
const ticketClosePrompted = new Set(); // Set to track users who have been prompted to close tickets
const closingTickets = new Set(); // Set to track tickets that are currently being closed
const cancelMessages = new Map(); 
const canceledTickets = new Set();

module.exports = {
    scheduledClosures,
    recentInteractions,
    ticketCloseCooldown,
    ticketClosePrompted,
    cancelMessages,
    closingTickets,
    canceledTickets
};