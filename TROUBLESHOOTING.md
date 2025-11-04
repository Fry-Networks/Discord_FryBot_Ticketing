# 🛠 DiscoFryBot Troubleshooting Guide

This guide covers common issues, diagnostic steps, and solutions for the DiscoFryBot Advanced Ticketing System.

---

## 🚨 **Critical Issues**

### **Orphaned Tickets Problem** ✅ **RESOLVED**
> **Issue**: Users see "1 ticket already open" error but no Discord channel exists

**Root Cause**: Race condition during ticket creation where database insert succeeds but Discord channel creation fails.

**Solution Implemented**:
- Transaction-safe ticket creation with "creating" → "open" status progression
- Enhanced `checkActiveTicket()` with real-time channel verification
- Automated cleanup via Supabase RPC function every 30 minutes
- Individual ticket cleanup when orphaned tickets are detected

**Prevention**: The new system prevents this issue entirely by only marking tickets as "open" after successful channel creation.

**Manual Recovery** (if needed):
```sql
-- Check for orphaned tickets
SELECT id, user_id, discord_username, status, channel_id, created_at 
FROM api.tickets 
WHERE status = 'open' AND (channel_id IS NULL OR channel_id = '');

-- Manual cleanup (run RPC function)
SELECT * FROM api.cleanup_orphaned_tickets();
```

---

## 🎫 **Ticket System Issues**

### **User Cannot Create New Ticket**
**Symptoms**: Error about existing ticket, but user sees no open channels

**Diagnostic Steps**:
1. **Check for orphaned tickets**:
   ```sql
   SELECT * FROM api.tickets 
   WHERE user_id = 'USER_ID' AND status IN ('open', 'creating');
   ```

2. **Verify Discord channels exist**:
   - Check if the channel_id in database actually exists in Discord
   - Look for channels in wrong categories

**Solutions**:
- **Automatic**: System now auto-detects and cleans orphaned tickets
- **Manual**: Run `SELECT * FROM api.cleanup_orphaned_tickets();`
- **Emergency**: Direct database cleanup (use with caution):
   ```sql
   UPDATE api.tickets 
   SET status = 'closed', closed_at = NOW(), closed_by_id = 'SYSTEM'
   WHERE user_id = 'USER_ID' AND channel_id IS NULL;
   ```

### **Form Validation Errors**
**Symptoms**: Users stuck on validation, failed submissions

**Common Causes**:
- Missing required fields
- Invalid email format
- Long description text
- Special characters in names

**Solutions**:
1. **Use Resume Functionality**: Users can click "Resume & Correct Form" button
2. **Check Field Limits**: 
   - Description: 1024 characters max
   - Names: 100 characters max
   - Email: Must be valid format

**Debug Form Issues**:
```javascript
// Check resumeCache for user submissions
console.log(resumeCache.get(`${userId}_${ticketType}`));
```

### **Channel Capacity Issues**
**Symptoms**: "Ticket queue is currently full" message

**Cause**: Category has reached 50 channels limit

**Solutions**:
1. **Check category capacity**:
   ```javascript
   // Count channels in category
   const channelsInCategory = guild.channels.cache
     .filter(ch => ch.parentId === categoryId).size;
   ```

2. **Clean up closed tickets**: Move closed tickets to archive category

3. **Increase capacity**: Modify `MAX_CHANNELS_PER_CATEGORY` in config

---

## 🪙 **FRY Conversion Issues**

### **User Not Eligible for Conversion**
**Symptoms**: "Address not found" message

**Diagnostic Steps**:
1. **Check eligibility database**:
   ```sql
   SELECT * FROM api.conversion_eligibility_mirror 
   WHERE address = 'ALGORAND_ADDRESS';
   ```

2. **Verify address format**: Ensure proper Algorand address (58 characters)

3. **Check snapshot date**: Only FRY 1.0 held before Dec 1, 2024 eligible

### **Burn Transaction Not Detected** 
**Symptoms**: User sent FRY but system doesn't detect it

**Diagnostic Steps**:
1. **Manual burn check**:
   ```sql
   SELECT api.check_burn_transaction(
     'ALGORAND_ADDRESS', 
     ELIGIBLE_AMOUNT, 
     180, -- lookback days
     100  -- minimum amount
   );
   ```

2. **Check transaction on explorer**: Verify transaction went to correct burn wallet

3. **Verify timing**: Transaction must be within configured lookback period

**Common Solutions**:
- Increase `BURN_TX_LOOKBACK_DAYS` if transaction is older
- Check `BURN_WALLET_ADDRESS` configuration
- Verify `ASSET_ID_FRY1` matches actual FRY 1.0 asset ID

### **Vesting Calculation Issues**
**Symptoms**: Incorrect claimable amounts or months

**Debug Steps**:
1. **Check mirror data**:
   ```sql
   SELECT claimedmonths, claimableamount, pendingamount, status
   FROM api.conversion_eligibility_mirror 
   WHERE address = 'ALGORAND_ADDRESS';
   ```

2. **Manual vesting calculation**: 
   - Vesting starts August 1, 2025
   - 12 monthly unlocks
   - Current month = (current_date - vesting_start) in months

---

## 💬 **Discord Integration Issues**

### **Bot Not Responding to Interactions**
**Symptoms**: Buttons/forms not working, no responses

**Diagnostic Steps**:
1. **Check bot permissions**:
   - View Channels
   - Send Messages
   - Embed Links
   - Manage Messages
   - Use Slash Commands

2. **Verify role hierarchy**: Bot role must be above ticket roles

3. **Check interaction handlers**: Look for errors in logs

**Solutions**:
```javascript
// Test interaction handler
client.on(Events.InteractionCreate, async (interaction) => {
  console.log(`Interaction received: ${interaction.type}`);
  // Add debugging here
});
```

### **Message Logging Not Working**
**Symptoms**: Messages not appearing in database/dashboard

**Check Points**:
1. **Ticket channel detection**: Verify `getTicketByChannelId()` working
2. **Database permissions**: Service role has insert access
3. **Message format**: Ensure JSON format is valid

**Debug Message Logging**:
```javascript
// Add to message event handler
console.log(`Logging message ${message.id} in channel ${message.channelId}`);
console.log(`Ticket found:`, ticket);
```

### **Permission Denied Errors**
**Symptoms**: Bot cannot create channels or send messages

**Common Causes**:
- Bot role insufficient permissions
- Channel category permissions blocking bot
- Rate limiting from Discord

**Solutions**:
1. **Check bot permissions in category**
2. **Ensure role hierarchy correct**
3. **Add bot to category permissions explicitly**

---

## 🔧 **System Administration**

### **Database Connection Issues**
**Symptoms**: Supabase errors, connection timeouts

**Diagnostic Steps**:
1. **Check environment variables**:
   ```bash
   echo $SUPABASE_URL
   echo $SUPABASE_SERVICE_ROLE
   ```

2. **Test connection**:
   ```javascript
   const { data, error } = await supabase
     .from('tickets')
     .select('count(*)', { count: 'exact', head: true });
   ```

3. **Verify service role permissions**: Ensure all necessary table access

### **RPC Function Failures**
**Symptoms**: Automated cleanup not working, RPC errors

**Debug RPC Functions**:
```sql
-- Test cleanup function
SELECT * FROM api.cleanup_orphaned_tickets();

-- Check function exists
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'api' AND routine_type = 'FUNCTION';
```

**Common Solutions**:
- Re-run migration to create missing functions
- Check function permissions for service role
- Verify function syntax in Supabase dashboard

### **Performance Issues**
**Symptoms**: Slow responses, timeouts, high resource usage

**Optimization Steps**:
1. **Check database indexes**: Ensure proper indexing on frequently queried fields
2. **Monitor RPC performance**: Check execution times in Supabase
3. **Review Discord API calls**: Minimize unnecessary requests

---

## 📊 **Monitoring & Health Checks**

### **System Health Verification**
```bash
# Check bot container status
docker-compose ps discofrybot

# View recent logs
docker-compose logs --tail=50 discofrybot

# Check resource usage
docker stats discofrybot
```

### **Key Metrics to Monitor**
- **Ticket Volume**: Normal creation rates vs. spikes
- **Orphaned Tickets**: Should be 0 with new system
- **Error Rates**: Check bot_logs table for error frequency
- **Staff Response Times**: Monitor ticket resolution metrics

### **Database Health Checks**
```sql
-- Check recent activity
SELECT level, scope, COUNT(*) 
FROM api.bot_logs 
WHERE created_at >= NOW() - INTERVAL '1 hour' 
GROUP BY level, scope;

-- Monitor orphaned tickets
SELECT status, COUNT(*) 
FROM api.tickets 
GROUP BY status;

-- Check system performance
SELECT COUNT(*) as total_tickets,
       COUNT(CASE WHEN status = 'open' THEN 1 END) as open_tickets,
       COUNT(CASE WHEN channel_id IS NULL AND status = 'open' THEN 1 END) as orphaned
FROM api.tickets;
```

---

## 🚀 **Emergency Procedures**

### **Critical System Recovery**
1. **Bot Down**: 
   ```bash
   docker-compose restart discofrybot
   ./dockrebuild.sh  # If code changes needed
   ```

2. **Database Issues**: Check Supabase dashboard, verify connection

3. **Mass Orphaned Tickets**:
   ```sql
   -- Emergency cleanup (use carefully)
   SELECT * FROM api.cleanup_orphaned_tickets();
   ```

### **Rollback Procedures**
- **Code Rollback**: Use git tags for stable versions
- **Database Rollback**: Coordinate with database admin for schema changes
- **Configuration Rollback**: Restore previous environment variables

### **Escalation Points**
1. **Bot Issues**: Check logs, restart container
2. **Database Issues**: Verify Supabase status, check credentials
3. **Discord Issues**: Check Discord API status, bot permissions

---

## 🔍 **Common Log Patterns**

### **Success Patterns** ✅
```
INFO: Ticket 12345 successfully opened with channel 987654321
INFO: cleanup_orphaned_tickets RPC completed. Results: 0 actions taken
INFO: Message logged for ticket 12345 by user 123456789
```

### **Warning Patterns** ⚠️
```
WARN: Found orphaned ticket 12345 for user 123456789 - channel does not exist
WARN: Category 987654321 is at capacity (50 channels)
WARN: User 123456789 attempted to open new ticket while having an active one
```

### **Error Patterns** ❌
```
ERROR: Failed to create ticket channel for ticket 12345: [Discord API Error]
ERROR: Error calling cleanup_orphaned_tickets RPC: [Database Error]
ERROR: Exception in checkActiveTicket for user 123456789
```

---

## 📞 **Support Resources**

### **Internal Tools**
- **Dashboard**: Real-time system monitoring
- **Supabase**: Database administration and RPC management
- **Docker**: Container management and logging

### **Documentation**
- `README.md` - Current feature overview
- `PLANNING.md` - System architecture
- `.clinerules/general-guidelines.md` - Development standards

### **Emergency Contacts**
- **System Issues**: Check `TASK.md` for current priorities
- **Database Issues**: Supabase dashboard alerts
- **Discord Issues**: Bot permissions and API status

---

*Last updated: November 2025 | Keep this guide updated as new issues are discovered and resolved*
