# Flxtime Partners Support - Implementation Plan

## Project Overview

This document outlines the complete implementation plan for adding a new "Flxtime Partners Support" ticket category to the Discord bot. This feature will provide automated support for users who are members of both the Fry Networks server and the Flxtime Discord server with the "Flexer" role.

## Requirements Summary

### Core Features
- New ticket category: "Flxtime Partners Support"
- Auto-populate user's Discord ID in ticket
- Collect Solana wallet address with validation
- Screenshot submission requirement (Flexer role badge + username)
- 12-hour reminder system for missing screenshots
- Admin validation workflow
- Automated AEM miner key generation and storage
- Future-ready for automated role verification

### User Journey
1. User selects "Flxtime Partners Support" ticket type
2. Bot auto-fills Discord ID, user provides Solana wallet + description
3. Bot requests screenshot of Flexer role showing username
4. If no screenshot after 12hrs, bot sends reminder
5. Admin validates screenshot and confirms user is valid Flexer
6. Admin issues AEM miner key, stored in MongoDB and posted to user

## Database Schema Changes

### Supabase - api.tickets Table
Add the following new columns:

```sql
-- Flxtime-specific validation columns
ALTER TABLE api.tickets ADD COLUMN solana_wallet_address TEXT NULL;
ALTER TABLE api.tickets ADD COLUMN flxtime_validated BOOLEAN DEFAULT FALSE;
ALTER TABLE api.tickets ADD COLUMN flxtime_validated_by TEXT NULL;
ALTER TABLE api.tickets ADD COLUMN screenshot_submitted_at TIMESTAMPTZ NULL;
ALTER TABLE api.tickets ADD COLUMN screenshot_reminder_sent_at TIMESTAMPTZ NULL;

-- AEM key tracking
ALTER TABLE api.tickets ADD COLUMN aem_key_issued TEXT NULL;
ALTER TABLE api.tickets ADD COLUMN aem_key_issued_at TIMESTAMPTZ NULL;
ALTER TABLE api.tickets ADD COLUMN aem_key_issued_by TEXT NULL;
```

### MongoDB - main.devices Collection
AEM keys will be stored with this schema:
```javascript
{
  _id: ObjectId,
  miner_key: "AEM-{32-char-alphanumeric}",
  name: "$FRY AI Edge Miner",
  email: "user@email.com",
  order: "FLX{discord_display_name}", // FLX prefix + user's Discord display name
  byod: "FLXAEM{28-random-chars}", // For half rewards, must be unique
  created_at: Date,
  is_registered: false,
  registration: { amount: 0 },
  email_sent: false,
  // No parent_device fields needed
  flxtime_partner: true, // Special flag to identify these devices
  discord_user_id: "123456789", // For tracking
  solana_wallet: "SolanaAddressHere"
}
```

### BYOD Field Generation Algorithm
```javascript
function generateUniqueByodKey() {
  const prefix = 'FLXAEM';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 28; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return prefix + result;
}
```

## Environment Variables

Add to `.env`:
```env
# Flxtime Integration (for future use)
FLXTIME_VERIFICATION_ENABLED=false
FLXTIME_SERVER_ID=your_flxtime_server_id_here
FLXTIME_FLEXER_ROLE_ID=flexer_role_id_here

# Ticket Categories
TICKET_CAT_FLXTIME_PARTNERS=your_category_id_here
```

## File Modifications

### 1. discofrybot/NewTicketLogic/utils/formValidator.js

**Changes:**
- Add `flxtime_partners_support` to `ticketFields` object
- Define form fields: `['contact_info', 'solana_wallet_address', 'description']`
- Add Solana wallet validation function
- Add new validation patterns

**Key additions:**
```javascript
// Add to VALIDATION_PATTERNS
SOLANA_ADDRESS: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,

// Add to ticketFields
flxtime_partners_support: ['contact_info', 'solana_wallet_address', 'description'],

// New validation function
function sanitizeAndValidateSolanaAddress(value) {
  // Implementation for Solana address validation
}
```

### 2. discofrybot/NewTicketLogic/handlers/interactionHandler.js

**Changes:**
- Add "🤝 Flxtime Partners Support" to ticket type dropdown
- Add button handlers for new Flxtime-specific buttons
- Route interactions to flxtimePartnersHandler

**Key additions:**
```javascript
// In ticket type select menu options
{ 
  label: '🤝 Flxtime Partners Support', 
  value: 'flxtime_partners_support', 
  description: 'Support for verified Flxtime Flexer members.' 
},

// In handleButton function
else if (action === 'validate_flxtime_partner') {
  await flxtimePartnersHandler.handleValidateFlxtimeButton(interaction, ticketId);
} else if (action === 'issue_aem_key') {
  await flxtimePartnersHandler.handleIssueAemKeyButton(interaction, ticketId);
}
```

### 3. discofrybot/NewTicketLogic/handlers/ticketCreationHandler.js

**Changes:**
- Add custom welcome message for Flxtime tickets
- Auto-populate Discord ID in welcome message
- Request screenshot with specific requirements

**Key additions:**
```javascript
// In handleTicketModalSubmit function
if (ticketType === 'flxtime_partners_support') {
  await sendFlxtimePartnersWelcomeMessage(ticketChannel, interaction.user, validatedData);
}
```

### 4. discofrybot/NewTicketLogic/utils/config.js

**Changes:**
- Add Flxtime category configuration
- Add Flxtime server settings

**Key additions:**
```javascript
flxtime_partners_support: process.env.TICKET_CAT_FLXTIME_PARTNERS,
flxtimeVerificationEnabled: process.env.FLXTIME_VERIFICATION_ENABLED === 'true',
flxtimeServerId: process.env.FLXTIME_SERVER_ID,
flxtimeFlexerRoleId: process.env.FLXTIME_FLEXER_ROLE_ID,
```

### 5. discofrybot/NewTicketLogic/ticketSystem.js

**Changes:**
- Integrate 12-hour screenshot reminder system
- Add Flxtime ticket monitoring to existing intervals

**Key additions:**
```javascript
// Add to existing inactivity check interval
const flxtimeTicketsNeedingReminder = await supabaseHandler.getFlxtimeTicketsNeedingReminderRpc();
if (flxtimeTicketsNeedingReminder && flxtimeTicketsNeedingReminder.length > 0) {
  for (const ticket of flxtimeTicketsNeedingReminder) {
    await flxtimePartnersHandler.sendScreenshotReminder(client, ticket);
  }
}
```

## New Files to Create

### 1. discofrybot/NewTicketLogic/handlers/flxtimePartnersHandler.js

**Primary functions:**
- `sendFlxtimePartnersWelcomeMessage(channel, user, ticketData)` - Custom welcome message
- `handleValidateFlxtimeButton(interaction, ticketId)` - Admin validation workflow
- `handleIssueAemKeyButton(interaction, ticketId)` - AEM key generation and issuance
- `sendScreenshotReminder(client, ticket)` - 12-hour reminder system
- `generateUniqueAemKey()` - Generate unique AEM miner key
- `generateUniqueByodKey()` - Generate unique BYOD license for half rewards
- `storeAemKeyInMongoDB(keyData)` - Store key in MongoDB
- `trackScreenshotSubmission(ticketId)` - Mark when screenshot received
- `validateFlxtimeRole(userId, serverId)` - Future role validation (stub for now)

### 2. discofrybot/NewTicketLogic/utils/solanaValidator.js

**Primary functions:**
- `validateSolanaAddress(address)` - Comprehensive Solana address validation
- `checkSolanaAddressExists(address)` - Optional Solscan integration
- `normalizeSolanaAddress(address)` - Address formatting

### 3. Supabase RPC Functions

**Functions to create:**
```sql
-- Get Flxtime tickets needing screenshot reminders
CREATE OR REPLACE FUNCTION api.get_flxtime_tickets_needing_reminder()
RETURNS TABLE(...) AS $$
-- Implementation
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Implementation Phases

### Phase 1: Database Setup ✅
1. Create Supabase migration for new columns
2. Test column additions
3. Update TypeScript types if needed

### Phase 2: Form and Validation ✅
1. Update formValidator.js with new ticket type
2. Implement Solana address validation
3. Add form fields configuration
4. Test form submission workflow

### Phase 3: User Interface ✅
1. Add ticket type to dropdown menu
2. Update interactionHandler routing
3. Test ticket creation flow
4. Implement Discord ID auto-population

### Phase 4: Welcome Message and Screenshot Request ✅
1. Create flxtimePartnersHandler.js
2. Implement custom welcome message
3. Add screenshot request with specific requirements
4. Test welcome flow

### Phase 5: Reminder System ✅
1. Implement 12-hour reminder logic
2. Integrate with existing ticket monitoring
3. Add screenshot tracking functionality
4. Test reminder system

### Phase 6: Admin Validation ✅
1. Create admin validation button
2. Implement confirmation dialog
3. Add validation state tracking
4. Update button states based on validation

### Phase 7: AEM Key Generation ✅
1. Implement AEM key generation algorithm
2. Create MongoDB integration
3. Add key storage and tracking
4. Implement key issuance workflow

### Phase 8: Integration and Testing ✅
1. End-to-end testing of complete workflow
2. Error handling and edge cases
3. Performance testing
4. Documentation updates

## Technical Specifications

### AEM Key Generation Algorithm
```javascript
function generateUniqueAemKey() {
  const prefix = 'AEM-';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return prefix + result;
}
```

### BYOD Key Generation Algorithm
```javascript
function generateUniqueByodKey() {
  const prefix = 'FLXAEM';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 28; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return prefix + result;
}
```

### Order Field Generation
- Format: `FLX{discord_display_name}`
- Uses Discord display name (not username)
- Example: `FLXJohnSmith` for a user with display name "JohnSmith"

### Solana Address Validation
- Check Base58 encoding
- Verify 32-44 character length (typically 44)
- Validate checksum if possible
- Optional: Verify account exists via API

### Button State Management
- "Validate Flxtime Partner": Always available to admins
- "Issue AEM Key": Disabled until `flxtime_validated = true`
- Both buttons disappear after completion

### Error Handling
- Invalid Solana addresses: Clear error message with format example
- Missing screenshots: Gentle reminder with instructions
- Duplicate AEM keys: Regenerate automatically
- Database errors: Graceful fallbacks with admin notifications

## Testing Checklist

### Unit Tests
- [ ] Solana address validation function
- [ ] AEM key generation uniqueness
- [ ] Form validation logic
- [ ] Button state management

### Integration Tests
- [ ] Complete ticket creation flow
- [ ] Screenshot reminder system
- [ ] Admin validation workflow
- [ ] AEM key generation and storage
- [ ] MongoDB integration
- [ ] Supabase column updates

### User Acceptance Tests
- [ ] User can create Flxtime ticket
- [ ] Discord ID auto-populates correctly
- [ ] Screenshot reminder sent after 12 hours
- [ ] Admin can validate successfully
- [ ] AEM key generates and stores correctly
- [ ] User receives key in ticket channel

### Edge Case Tests
- [ ] Invalid Solana address handling
- [ ] No screenshot submitted
- [ ] Multiple validation attempts
- [ ] Duplicate AEM key prevention
- [ ] Database connection failures

## Future Enhancements

### Automated Role Verification
Once bot is added to Flxtime server:
1. Enable FLXTIME_VERIFICATION_ENABLED
2. Implement actual role checking in validateFlxtimeRole()
3. Remove manual screenshot requirement
4. Add fallback to manual verification if API fails

### Analytics and Reporting
- Track Flxtime partner conversion rates
- Monitor AEM key usage
- Dashboard integration for admin oversight

### Additional Validations
- Cross-reference with existing user database
- Prevent duplicate requests from same user
- Integration with Solscan for wallet verification

## Risk Mitigation

### Security Considerations
- Admin-only buttons properly restricted
- Input validation for all user data
- Secure MongoDB key generation
- Rate limiting on ticket creation

### Operational Risks
- Backup plan if MongoDB unavailable
- Clear error messages for users
- Admin notification system for failures
- Graceful degradation if Flxtime server unavailable

### Data Privacy
- Minimal data collection (only necessary fields)
- Secure storage of wallet addresses
- Clear data retention policies

---

**Created:** November 3, 2025  
**Status:** Ready for Implementation  
**Estimated Timeline:** 5-7 days  
**Priority:** High
