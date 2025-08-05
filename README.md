# DiscoFryBot – Discord Ticketing System

This is a personal Discord bot for handling support tickets using Supabase, Google Drive, and Discord.js. It is containerized via Docker and integrates with Cline + MCP for code assistance and task automation.

---

## Features
- 5-category ticket panel system (Order, Tech Support, Miner Keys, Rewards, Registration)
- Supabase-backed ticket storage
- One active ticket per user (any category)
- Claim/unclaim logic with permission checks
- Immediate and scheduled ticket closure with transcript options
- Transcript generation and Drive upload
- Daily log rotation and archival system

---

## Key Files
- `NewTicketLogic/ticketSystem.js` – Entry point for ticket creation logic
- `NewTicketLogic/modules/claimHandler.js` – Staff claim/unclaim handling
- `NewTicketLogic/modules/transcriptHandler.js` – Generates ticket transcripts
- `NewTicketLogic/modules/driveUploader.js` – Uploads transcripts to Google Drive
- `NewTicketLogic/utils/logger.js` – Writes to Supabase and `cron.log`

---

## Environment Variables

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE=
GOOGLE_REFRESH_TOKEN=
GOOGLE_DRIVE_FOLDER_ID=
DISCORD_TOKEN=
CLIENT_ID=
DISCORD_CLIENT_SECRET=
CLOSED_TICKET_CAT=
STAFF_ROLE_ID=
TICKET_CAT_ORDER=
TICKET_CAT_REGISTRATION=
TICKET_CAT_MINER_KEYS=
TICKET_CAT_REWARDS=
TICKET_CAT_TECH_SUPPORT=
```

# Dev Notes

    - Cline and MCP tools are enabled.
    - Follow rules in general-guidelines.md, PLANNING.md, and TASK.md.
    - All ticketing logic lives in discofrybot/NewTicketLogic
    - Dashboard is located separately in fry-dashboard/ and not part of this rewrite phase.