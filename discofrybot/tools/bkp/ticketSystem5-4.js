const { registerTicketCommands } = require('./Ticket-System/ticketCommands');
const ticketPanel = require('./Ticket-System/ticketPanel');
const ticketCreation = require('./Ticket-System/ticketCreation');
const ticketMessageLogger = require('./Ticket-System/ticketMessagelogger');
const { handleTicketButton, restoreScheduledClosures } = require('./Ticket-System/buttonHandler');


module.exports = {
    registerTicketCommands,
    setupTicketPanel: (client) => {
        ticketPanel(client);
        ticketCreation(client);
        ticketMessageLogger(client);
        
        // Initialize buttonHandler by restoring scheduled closures
        restoreScheduledClosures(client); 
        
        // Set up event handlers for buttons if needed
        client.on('interactionCreate', async (interaction) => {
            if (interaction.isButton() && interaction.customId.includes(':')) {
                const [buttonId, ticketId] = interaction.customId.split(':');
                await handleTicketButton(interaction, buttonId, ticketId);
            }
        });
    }
};