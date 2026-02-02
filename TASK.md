# ✅ Task Tracker – Discord Ticketing Rewrite

## Active Tasks
- [x] **Enforce OP secret file permissions at container entrypoint (2026-01-31)** - Completed 2026-01-31
  <!-- Reason: docker compose ignores secret uid/gid/mode; entrypoint validates root:app 0400/0440 -->
- [x] **Restore Docker stdout logging after logger redaction change (2026-01-31)** - Completed 2026-01-31
  <!-- Reason: redaction formatter must preserve winston symbol metadata for console transport -->
- [x] **Harden logging to avoid leaking resolved secrets (2026-01-31)** - Completed 2026-01-31
  <!-- Reason: add redaction helpers and safe summaries for risky logs -->
- [x] **Investigate Docker startup failures after hardening changes (2026-01-31)** - Completed 2026-01-31
  <!-- Reason: op run exits with "expected at least 1 arguments" on container start -->
- [x] **Implement runtime-only Docker + 1Password secrets injection (2026-01-30)** - Completed 2026-01-30
  <!-- Reason: switch to docker secret file + runtime op run, remove build-time secret injection -->
- [x] **Update `scripts/df` to use plain docker compose (2026-01-30)** - Completed 2026-01-30
  <!-- Reason: prefer runtime-only op in containers; keep host command short -->
- [x] **Align container runtime UID/GID to 1001 (2026-01-30)** - Completed 2026-01-30
  <!-- Reason: keep permissions and security posture consistent across repos -->
- [x] **Add build-time placeholders for Next.js envs (2026-01-30)** - Completed 2026-01-30
  <!-- Reason: allow next build without injecting secrets -->
- [x] **Investigate fry-dashboard devices API 500 error (2026-01-26)** - Completed 2026-02-01
  <!-- Reason: /api/devices returning 500, UI shows "No devices" -->
- [x] **Investigate Docker Compose orphan container warnings for discofrybot/fry-dashboard/cloudflared (2026-01-26)** - Completed 2026-01-26
  <!-- Reason: added explicit compose project names to isolate stacks -->
- [x] **Add short compose helper scripts for discofrybot/cloudflared (2026-01-26)** - Completed 2026-01-26
  <!-- Reason: user requested shorter commands for isolated stacks -->
- [x] **Add 5-minute grace window to balance checker alerts on Algonode failures (2026-01-26)** - Completed 2026-01-26
  <!-- Reason: prevent false 0-balance alerts on transient API hiccups -->
- [x] **Share frynet across separate compose projects (2026-01-26)** - Completed 2026-01-26
  <!-- Reason: prevent network ownership warning when stacks run independently -->
- [ ] **Consolidate env vars & Docker Compose with 1Password (2025-12-19)** - Plan and execute env consolidation for bot and dashboard, remove scattered .env files, move fry-dashboard to sibling folder, and source all secrets from 1Password via Docker Compose.
- [x] **Point op-compose OP_ENV_FILE default to /root/.op-discobot.env** - Completed 2026-01-18
  - Updated script default and docs to match root-owned env file location
- [x] **Load OP service account token from .op-discobot.env in op-compose flow** - Completed 2026-01-18
  - Reads `.op-discobot.env` before falling back to `op read`
  - Documented token sourcing in `README.md` and `PLANNING.md`
  - Clarified compose secret source for `OP_SERVICE_ACCOUNT_TOKEN`
- [x] **Fix scam detection to work in forum channels and all nested channel types** - Completed 11/9/2025
  - Enhanced channel detection logic in `discofrybot.js` to properly handle forum threads and nested structures
  - Added `isChannelInMonitoredCategory()` function that checks direct parent, grandparent (for forum threads), and full parent chain
  - Fixed issue where forum thread messages were being ignored because their parentId was the forum channel, not the category
  - Now properly detects scams in: regular channels, forum threads, and any nested channel structures within the monitored category
  - Improved logging to show channel type and parent hierarchy for better debugging
- [x] **Fix balance checker 8-hour status notifications not triggering** - Completed 11/9/2025
  - Fixed logic in `balanceCheck.js` where 8-hour status reports were only sent when all balances were safe
  - Now always sends 8-hour status reports regardless of balance status
  - Differentiated messaging: green "All systems running" vs orange "Issues detected" with asset details  
  - Maintains proper separation between periodic status reports and immediate threshold alerts
- [x] **Add completion prompt to FlxTime Partners after AEM key issuance (like Node Forgo system)** - Completed 11/9/2025
  - Added "Close Ticket" vs "More Questions" prompt to FlxTime Partners workflow after AEM key issuance
  - Mirrors the Node Forgo system completion flow for consistent user experience
  - Uses existing conclude button handlers in interactionHandler.js
  - Shows completion message with appropriate buttons after successful key delivery
- [x] **Add safeguard to FlxTime Partners system to prevent duplicate AEM key issuance per user** - Completed 11/9/2025
  - Implemented comprehensive duplicate key prevention system for FlxTime Partners
  - Added `checkFlxtimeKeyHistory()` function in supabaseHandler.js to query for previous AEM key issuances
  - Enhanced ticket creation flow to check for duplicates and notify users/admins
  - Updated validation and key issuance handlers with duplicate detection
  - Modified button logic to show appropriate UI for duplicate attempts
  - Added admin notifications when duplicate attempts are detected
  - System now prevents multiple AEM keys per user while maintaining clear communication
- [x] **Fix cleanup_orphaned_tickets RPC ambiguous user_id error** - Completed 11/4/2025
  - Identified PostgreSQL error 42702 "column reference user_id is ambiguous" in cleanup_orphaned_tickets function
  - Root cause: PostgreSQL couldn't distinguish between RETURNS TABLE user_id column and loop variable user_id field
  - Solution: Redesigned function to use explicit variable assignment instead of RETURN QUERY SELECT statements
  - Added proper table aliases (t.user_id, t.id, etc.) to eliminate column ambiguity
  - Fixed incorrect column reference: bot_logs table uses 'timestamp' not 'created_at' 
  - Renamed loop variable from 'ticket_record' to 'current_ticket' for clarity
  - Function now executes successfully and cleaned up 16 orphaned tickets during testing
  - Error no longer appears in bot terminal logs during 30-minute cleanup intervals
- [x] **Switch balanceCheck from Fry 1 to tFRY monitoring** - Completed 11/3/2025
  - Remove all Fry1 monitoring and notifications completely
  - Enable tFRY monitoring with asset ID 2681521901
  - Fix missing 8-hour status notifications issue
- [x] **Orphaned Tickets Bug Fix & Documentation Update** - Completed 11/3/2025
  - Fixed critical orphaned tickets issue where users got "1 ticket already open" error with no visible channel
  - Implemented transaction-safe ticket creation with "creating" → "open" status progression
  - Added enhanced checkActiveTicket() with real-time channel verification and automatic cleanup
  - Created comprehensive Supabase RPC function for automated orphaned ticket cleanup (every 30 minutes)
  - Updated README.md to reflect current advanced features and architecture (9+ ticket types, FRY conversion, Flxtime Partners)
  - Completely rewrote PLANNING.md to document actual system architecture and current capabilities
  - Created comprehensive TROUBLESHOOTING.md guide with solutions for common issues
  - Removed obsolete orphaned ticket functions and replaced with efficient RPC-based cleanup system
- [x] Added ticket category for FLXtime users and automated AEM key generation after validation complete. - Completed 11/3/2025
- [x] Enhanced messageFilter for scammer messages detection and disciplanary action. - Completed 11/3/2025
- [x] Scaffold new Discord bot structure (break out `ticketSystem.js`) - Completed 5/12/25
- [x] Rewrite ticket panel and form logic using modular commands/components - Completed 5/12/25
- [x] Enforce one-ticket-per-user rule across all categories - Completed 5/12/25
- [x] Integrate form validation via shared schema (replacing old `validation.js`) - Completed 5/12/25
- [x] Connect Supabase operations: insert `tickets`, `ticket_messages`, log to `staff_actions` - Completed 5/12/25
- [x] Rewrite claim/unclaim logic with Supabase tracking:
  - Set `claimed_by` and `claimed_by_username` in `tickets`
  - Log action in `staff_actions`
  - Prevent other staff from claiming an already claimed ticket
- [x] Add “Close Ticket Now” logic with:
  - Transcript prompt (DM/post/none)
  - Mandatory transcript generation + upload
- [x] Add “Schedule Close” logic with:
  - 1m / 12h / 24h / 48h timers
  - Transcript prompt
  - Safe cancel + re-trigger logic
- [x] Use Supabase `close_ticket` RPC when executing manual or scheduled ticket closures
- [x] Handle category moves on schedule/cancel/close
- [x] Auto-clean up UI buttons after use (cancel disappears, etc.)
- [ ] **Implement Inactivity System:**
    - **Database Schema:**
        - [x] Add `last_message_at` column to `api.tickets` table.
        - [x] Add `last_message_from_role` column to `api.tickets` table.
        - [x] Add `inactivity_ping_count` column to `api.tickets` table.
        - [x] Add `last_inactivity_ping_at` column to `api.tickets` table.
        - [x] Add `staff_ping_count` column to `api.tickets` table.
        - [x] Add `last_staff_ping_at` column to `api.tickets` table.
    - **Configuration:**
        - [x] Add `ticketAdminRoleId` to `config.js` and load from `.env`.
    - **Data Backfill:**
        - [x] Create and execute Supabase SQL script to backfill `last_message_at` and `last_message_from_role` for existing open tickets.
    - **Code Modifications:**
        - [x] Update `logTicketMessage` in `supabaseHandler.js` to update `last_message_at` and `last_message_from_role`.
        - [x] Update `logTicketMessage` in `supabaseHandler.js` to reset inactivity counters.
        - [x] Update `logTicketMessage` in `supabaseHandler.js` to reset staff inactivity counters.
        - [x] Update `logTicketMessage` in `supabaseHandler.js` to conditionally update `last_message_at` and `last_message_from_role` based on sender role, and to not reset counters for bot messages.
        - [x] Create `discofrybot/ticketing-system/modules/inactivityPinger.js` for ping logic.
        - [x] Update `discofrybot/ticketing-system/modules/inactivityPinger.js` to include `pingUserForInactivity`, `pingModeratorForInactivity`, and `autoCloseInactiveTicket` functions.
        - [x] Update `discofrybot/ticketing-system/modules/inactivityPinger.js` to handle two-stage staff pings.
        - [x] Update `ticketSystem.js` to call the new `inactivityPinger` module and the `get_inactive_tickets` RPC.
        - [x] Update `ticketSystem.js` to handle multi-stage pings and auto-closure logic.
        - [x] Update `ticketSystem.js` to handle two-stage staff pings.
        - [x] Update `ticketSystem.js` to treat 'bot' as `last_message_from_role` as 'user' for staff pinging.
    - **Supabase RPC:**
        - [x] Create `get_inactive_tickets` Supabase RPC function.
    - **Inactivity System Features:**
        - [ ] Implement configurable inactivity thresholds.
        - [x] Implement multi-stage escalation for pings.
        - [ ] Add customizable ping messages.
        - [ ] Implement snooze/pause functionality for inactivity checks.
        - [ ] Integrate inactivity status display into Fry Dashboard.
        - [ ] Implement reporting for inactivity metrics.
        - [ ] Introduce "On-Hold" ticket status.
        - [x] Add user communication about inactivity policy.
- [x] **Ticket Node Reward System:**
    - **Database Schema:**
        - [x] Create `fnode_rewards` table.
        - [x] Create `reward_settings` table.
        - [x] Enable RLS on `fnode_rewards` and `reward_settings` tables.
        - [x] Create policies for `fnode_rewards` and `reward_settings` tables.
        - [x] Add `UNIQUE` constraint on `staff_id` to `api.fnode_rewards` table.
        - [x] Add `discord_user_id` column to `api.user_tokens` table.
        - [x] Create `performance_thresholds` table with RLS.
    - **Supabase RPC:**
        - [x] Create `calculate_and_distribute_fnode_rewards` Supabase RPC function.
        - [x] Create `api.trigger_calculate_fnode_rewards_edge_function` SQL function to call Edge Function.
        - [x] Schedule `api.trigger_calculate_fnode_rewards_edge_function` to run daily via Supabase cron.
        - [x] Create `api.set_performance_threshold` Supabase RPC function.
        - [x] Create `api.get_performance_thresholds` Supabase RPC function.
    - **Frontend:**
        - [x] Create `get-fnode-rewards` API route.
        - [x] Create `RewardsClient` component.
        - [x] Add "Rewards" link to `NavBar` component.
        - [x] Update `get-fnode-rewards` API route to use `serviceSupabase` and accept `user_id` query param.
        - [x] Update `RewardsClient` to fetch `discord_user_id` from `user_tokens` and use it for `get-fnode-rewards` API call.
        - [x] Update `store-discord-tokens` API route to store `discord_user_id` in `user_tokens`.
        - [x] Implement authentication and staff role checks for `rewards/page.tsx`.
        - [x] Implement authentication and staff role checks for `admin/rewards/page.tsx`.
        - [x] Create `get-performance-thresholds` API route.
        - [x] Create `set-performance-threshold` API route.
        - [x] Integrate performance thresholds UI into `AdminRewardsClient.tsx`.
    - **Admin Interface:**
        - [x] Create admin interface to manage performance thresholds.
        - [ ] Create admin interface to monitor helpdesk efficiency.
        - [ ] Create admin interface to manually adjust rewards.
        - [ ] Create admin interface to generate reports.
    - **Notification System:**
        - [ ] Create notification system to inform technicians of rewards.

## Completed
- [x] Supabase MCP server configured (read/write to `tickets`, `staff_actions`, etc.)
- [x] `transcriptGenerator.js` and `driveUploader.js` functional and tested

## Discovered During Work
- Consider adding rate limiting for ticket creation attempts
- Add logging for failed validation attempts

## API Security Audit and Refactor - 7/30/2025

### Summary
Conducted a security audit and refactor of the API routes to address authentication and authorization vulnerabilities. The primary issue was the incorrect use of the Supabase server client in API routes, which prevented proper session handling and exposed several endpoints.

### Changes Made
1.  **Centralized Supabase Server Client:**
    -   Updated `utils/supabase/server.ts` to export a single, correctly configured `async` function `createClient()` for server-side Supabase interactions.
    -   This new client properly handles cookies for authentication in Next.js Server Components, API Routes, and other server-side contexts.

2.  **API Route Refactoring:**
    -   Refactored the following API routes to use the new centralized `createClient` function and a consistent authorization pattern:
        -   `admin/performance-thresholds/route.ts`
        -   `get-all-fnode-rewards/route.ts`
        -   `get-reward-settings/route.ts`
        -   `get-fnode-rewards/route.ts`
        -   `analytics/route.ts`
    -   Implemented a centralized `authorize` function in each of these routes to check for a valid user session and staff role before allowing access.
    -   Added specific checks for the `admin_users` table in the `performance-thresholds` route to ensure only authorized admins can access it.

3.  **Page Component Updates:**
    -   Updated `(dashboard)/rewards/page.tsx` and `(dashboard)/admin/rewards/page.tsx` to correctly `await` the `createClient` function, resolving errors caused by the new `async` implementation.

4.  **TypeScript and Type Safety:**
    -   Corrected `SupabaseClient` type annotations in the refactored API routes to use the `Database` type from `types/supabase.ts`, improving type safety.
    -   Resolved a TypeScript error in `store-discord-tokens/route.ts` related to the `createClient` function's generic type.

### Outcome
-   All relevant API routes are now protected by authentication and authorization checks.
-   The Supabase server client is now used correctly and consistently across the application.
-   The codebase is cleaner, more maintainable, and more secure.

## Fry Conversion Issues Ticket Type Integration - 8/1/2025

### Summary
Implemented a new ticket type "Fry Conversion Issues" with an automated workflow to assist users with FRY 1.0 to FRY 2.0/fNode conversion problems. This includes a custom welcome message and an eligibility check based on Algorand address.

### Changes Made
1.  **`discofrybot/ticketing-system/utils/config.js`**:
    *   Added `fry_conversion_issues` to the `categoryIds` object, linking it to the `TICKET_CAT_FRY_CONVERSION` environment variable.
2.  **`discofrybot/ticketing-system/utils/formValidator.js`**:
    *   Defined the form fields for `fry_conversion_issues` to include `contact_info`, `algorand_address`, `minerkeys`, and `description`.
3.  **`discofrybot/ticketing-system/handlers/interactionHandler.js`**:
    *   Added "Fry Conversion Issues" as a new option in the ticket creation panel's dropdown menu.
    *   Implemented a user-facing "Check Eligibility" button that appears in all ticket types. When clicked, it prompts the user for an Algorand address via a modal.
    *   The modal submission triggers an eligibility check, and the detailed results are posted publicly in the ticket channel.
4.  **Supabase Table `api.conversion_eligibility`**:
    *   Created a new table with columns `address`, `fry_1_0_held`, `fry_1_0_staked_verification`, `fry_1_0_staked_cometa`, `fry_1_0_eq_of_lp_cometa`, `fry_1_0_eq_of_lp_tinyman`, and `total_fry_1_0_available` to store detailed eligibility data.
    *   Enabled Row Level Security (RLS) and added a service role policy for secure access.
5.  **`discofrybot/ticketing-system/handlers/supabaseHandler.js`**:
    *   Updated the `checkConversionEligibility` function to query the new `api.conversion_eligibility` table and return detailed eligibility information.
6.  **`discofrybot/ticketing-system/faq/conversion.json`**:
    *   Created an empty JSON file to serve as the base for "Fry Conversion" FAQ content. This content will be populated in a separate task.
7.  **`discofrybot/ticketing-system/modules/faqHandler.js`**:
    *   Updated to include the new "Fry Conversion" FAQ category in the FAQ selection menu.
8.  **`discofrybot/ticketing-system/handlers/ticketCreationHandler.js`**:
    *   Implemented a custom welcome message for `fry_conversion_issues` tickets. This message pings the user, provides key conversion details (snapshot date, conversion options, vesting schedule), and directs them to the FAQs.
    *   Integrated the automated eligibility check, which calls `supabaseHandler.checkConversionEligibility` and posts the detailed eligibility result in the ticket channel.
    *   Added the "Check My Eligibility" button to the initial welcome message for all ticket types.

The system is now fully updated to handle "Fry Conversion Issues" tickets with the specified automated workflow, detailed eligibility checks, and a user-facing eligibility check button.

I have also updated the `TASK.md` file with a detailed summary of all the changes made during this task.
