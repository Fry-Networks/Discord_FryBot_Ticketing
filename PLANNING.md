# 🧠 Project Planning – Discord Ticketing System Rewrite (DiscoFryBot)

## Objective
Fully rewrite the Discord ticketing system logic from scratch using clean, modular code — preserving all core features and rules currently spread across `ticketCreation.js`, `ticketPanel.js`, `validation.js`, and `validationErrorManager.js`.

This rewrite will focus solely on the **Discord bot side**, not the web dashboard.

---

## Features & Requirements

### 🎫 Ticket Panel System
- Channel panel with 5 category buttons:
  - Order Issues
  - Technical Support
  - Miner Keys
  - Rewards
  - Registration
- Each user can only have **one active ticket at a time**, across **any category**.

### 📝 Ticket Creation Flow
- Category selection opens a form (per `validation.js`) — all fields must be validated.
- Store tickets in Supabase (`tickets`, `ticket_types`, `ticket_messages`, `staff_actions`).
- Ticket naming convention: `ticketID-username` (e.g., `9501-bob_34`)

---

## 🧑‍💼 Staff Claim System
- Only **one staff member** can claim a ticket.
- Claimed tickets can **only be unclaimed by the same staff member**.
- Claim and unclaim actions must be logged in Supabase (`staff_actions`).
- Staff can claim a ticket by clicking a button.
- Claimed tickets:
  - Are recorded in Supabase:
    - `claimed_by`: Discord user ID
    - `claimed_by_username`: Username#Discriminator
  - Can only be unclaimed by the same staff member.
- Claim/unclaim actions are also inserted into `staff_actions` for logging.

---

## ❌ Ticket Closure Logic

### Immediate Close
- “Close Ticket Now” button prompts user to choose:
  - DM transcript
  - Post transcript in channel
  - No transcript
- Use existing `transcriptGenerator.js` and `driveUploader.js`
  - Must **always** generate + upload transcript to Google Drive.
  - Skip posting/DM only if "no transcript" selected.

- Use the existing Supabase RPC function `close_ticket` to handle the actual closure (marking the ticket closed and timestamping it).
- Transcript generation, Drive upload, and category move logic still happen in the bot before or after the RPC is called, depending on flow.

### Scheduled Close
- “Schedule Close” button prompts for:
  - Close in 1m (test mode), 12h, 24h, 48h
- Must also prompt for transcript preference (same as above).
- On **cancel**, restore ticket to original category and ensure:
  - Cancel button disappears
  - Schedule sub-buttons disappear
- Logic must support safe transitions like:
    - Schedule → Cancel → Close now → Cancel → Schedule again with no duplicate uploads or closure conflicts.
---

## 📦 Storage & Categorization
- Closed tickets must be moved to `CLOSED_TICKETS_CATEGORY_ID` (from `.env`).
- When canceling a scheduled close, move back to original category.

---

## 🔒 Integrity Notes
- Prevent multiple transcripts from being uploaded on cancel/retry.
- Ensure cancel buttons **self-destruct** after use.
- All user interactions must result in clear, safe state transitions.

---

## Tech Stack
- Node.js (Discord.js)
- Supabase JS Client (using `service_role`)
- Google Drive API (OAuth2)
- Environment config via `.env`
- Dockerized runtime

---

## Out of Scope
- No dashboard/frontend logic changes in this phase
- No GitHub, CI/CD, or contributor flow