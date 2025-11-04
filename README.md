# DiscoFryBot – Advanced Discord Ticketing & Support System

A comprehensive Discord bot for managing support tickets, FRY token conversions, device management, and partner integrations. Built with Discord.js, Supabase, and modern modular architecture.

---

## 🎯 **Core Features**

### 🎫 **Advanced Ticketing System**
- **9+ Specialized Ticket Types:**
  - Order Tracking & Issues
  - Technical Support 
  - Miner Keys Management
  - Rewards & Claims
  - Registration Support
  - FRY Conversion Issues
  - Node Forgo/Return
  - Flxtime Partners Support
  - General Support

- **Smart Ticket Management:**
  - One active ticket per user (any category)
  - Automated orphaned ticket cleanup via Supabase RPC
  - Transaction-safe ticket creation preventing race conditions
  - Real-time channel verification and cleanup
  - Comprehensive form validation with resume functionality

### 🪙 **FRY Token Conversion System**
- **FRY 1.0 → 2.0/fNode Conversion Support:**
  - December 1st, 2024 snapshot eligibility checking
  - Automated burn transaction detection and verification
  - 12-month vesting schedule management (Aug 2025 - Jul 2026)
  - Real-time conversion status tracking and progress updates
  - Comprehensive balance checking (FRY 1.0, ALGO, locked balances)

### 🤝 **Flxtime Partners Integration** 
- **Specialized Partner Support:**
  - Screenshot submission and validation system
  - Automated reminder system for pending submissions
  - Serial number and factory reset verification
  - Custom validation workflows for hardware returns

### 🔧 **Staff Management & Analytics**
- **Advanced Staff Tools:**
  - Ticket claiming/unclaiming with exclusive ownership
  - Staff contribution tracking and point systems
  - Comprehensive logging and audit trails
  - Role-based permissions and access control

### 📊 **Automated Systems**
- **Intelligent Monitoring:**
  - Inactivity detection with escalating ping system
  - Automated closure after 72 hours of user inactivity
  - Screenshot detection and processing
  - Scheduled ticket closure with transcript generation

### 📋 **Transcript & Documentation**
- **Comprehensive Record Keeping:**
  - Automatic transcript generation for all tickets
  - Google Drive integration for permanent storage
  - Message logging with role tracking (user/staff/bot)
  - Flexible delivery options (DM, channel post, silent)

---

## 🏗 **Architecture Overview**

### **Core Modules** (`NewTicketLogic/`)
```
├── ticketSystem.js           # Main system initialization & event handling
├── handlers/                 # Core business logic handlers
│   ├── ticketCreationHandler.js    # Transaction-safe ticket creation
│   ├── interactionHandler.js       # Discord interaction routing
│   ├── supabaseHandler.js         # Database operations & RPC calls
│   ├── fryConversionHandler.js     # FRY conversion logic
│   ├── flxtimePartnersHandler.js   # Partner-specific workflows
│   └── screenshotDetectionHandler.js # Image processing & validation
├── modules/                  # Standalone feature modules  
│   ├── claimHandler.js             # Staff claiming system
│   ├── closeHandler.js             # Ticket closure workflows
│   ├── faqHandler.js               # FAQ system integration
│   └── inactivityPinger.js         # Automated ping system
├── utils/                    # Utilities & configuration
│   ├── formValidator.js            # Advanced form validation
│   ├── ticketUtils.js              # Shared ticket utilities  
│   ├── logger.js                   # System-wide logging
│   └── config.js                   # Configuration management
└── faq/                      # FAQ content by category
    ├── conversion.json             # FRY conversion FAQs
    ├── general.json                # General support FAQs
    └── [8 other specialized FAQ files]
```

### **Dashboard Integration** (`fry-dashboard/`)
- Next.js-based web dashboard for staff and users
- Real-time ticket management and analytics
- Device monitoring and rewards tracking
- Admin tools and bonus management systems

---

## 🚀 **Quick Setup**

### **Prerequisites**
- Node.js 18+
- Docker & Docker Compose
- Supabase project with proper schema
- Google Drive API credentials
- Discord Bot Token with necessary permissions

### **Environment Configuration**
```env
# Discord Configuration
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
GUILD_ID=your_server_id

# Supabase Configuration  
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE=your_service_role_key

# Google Drive Integration
GOOGLE_REFRESH_TOKEN=your_refresh_token
GOOGLE_DRIVE_FOLDER_ID=your_drive_folder

# Discord Channel & Role IDs
CLOSED_TICKET_CAT=closed_category_id
STAFF_ROLE_ID=staff_role_id
TICKET_ADMIN_ROLE_ID=admin_role_id
INTERN_ROLE_ID=intern_role_id
LOG_CHANNEL_ID=log_channel_id

# Ticket Category IDs (9 categories)
TICKET_CAT_ORDER=category_id
TICKET_CAT_TECH_SUPPORT=category_id  
TICKET_CAT_MINER_KEYS=category_id
TICKET_CAT_REWARDS=category_id
TICKET_CAT_REGISTRATION=category_id
TICKET_CAT_FRY_CONVERSION=category_id
TICKET_CAT_NODE_FORGO_RETURN=category_id
TICKET_CAT_FLXTIME_PARTNERS=category_id
TICKET_CAT_GENERAL=category_id

# FRY Conversion Configuration
ASSET_ID_FRY1=fry_1_asset_id
ASSET_ID_FRY2=fry_2_asset_id  
ASSET_ID_FNODE=fnode_asset_id
ASSET_ID_TFRY=tfry_asset_id
BURN_WALLET_ADDRESS=burn_wallet_address
MIN_ALGO_BALANCE_FOR_TX=0.5
BURN_TX_LOOKBACK_DAYS=180
BURN_TX_MIN_AMOUNT=100

# System Configuration
INACTIVITY_MONITORING_ENABLED=true
MAX_CHANNELS_PER_CATEGORY=50
```

### **Docker Deployment**
```bash
# Build and start the bot
docker-compose up -d

# View logs
docker-compose logs -f discofrybot

# Rebuild after changes
./dockrebuild.sh
```

---

## 📚 **Key Integrations**

### **Supabase Schema**
- `api.tickets` - Core ticket data with 30+ fields
- `api.ticket_messages` - Message history with role tracking
- `api.ticket_staff` - Staff contribution tracking
- `api.conversion_eligibility_mirror` - FRY conversion data
- `api.bot_logs` - System activity logging
- Custom RPC functions for complex operations

### **Discord Integration**
- Slash commands for staff operations
- Interactive forms with validation and resume capability  
- Button-based workflows with state management
- Embed-rich notifications and status updates
- Role-based permission enforcement

### **External APIs**
- Algorand blockchain for FRY balance checking
- Google Drive for transcript storage
- Image processing for screenshot validation

---

## 🛠 **Development**

### **Code Standards**
- Modular architecture with clear separation of concerns
- Comprehensive error handling and logging
- Transaction-safe database operations
- Stateless design for scalability

### **Key Design Patterns**
- **Handler Pattern**: Specialized handlers for different ticket types
- **RPC Functions**: Database-level operations for efficiency  
- **Event-Driven**: Reactive system based on Discord events
- **State Machines**: Complex workflows with safe transitions

### **Testing & Reliability**
- Automated orphaned ticket cleanup every 30 minutes
- Real-time channel verification and healing
- Comprehensive logging for troubleshooting
- Failsafe mechanisms for critical operations

---

## 📊 **Monitoring & Analytics**

### **Built-in Observability**
- Real-time ticket metrics and health monitoring
- Staff performance tracking and point systems
- System health checks and automated recovery
- Detailed audit trails for all operations

### **Dashboard Analytics**
- Ticket volume and resolution time tracking
- Staff workload distribution analysis  
- User engagement and satisfaction metrics
- Conversion system performance monitoring

---

## 🔧 **Troubleshooting**

### **Common Issues**
- **Orphaned Tickets**: Resolved automatically via RPC cleanup system
- **Permission Errors**: Check role IDs and bot permissions
- **Form Validation**: Use resume functionality for incomplete submissions
- **Channel Capacity**: Automatic handling up to 50 channels per category

### **Health Checks**
```bash
# Check bot status
docker-compose ps

# View recent logs  
docker-compose logs --tail=100 discofrybot

# Database connectivity
# Check Supabase dashboard for RPC function status
```

---

## 🚀 **What's New**

### **Recent Major Updates**
- ✅ **Robust Ticket Creation**: Transaction-safe system preventing orphaned tickets
- ✅ **FRY Conversion System**: Complete integration with vesting and burn detection  
- ✅ **Flxtime Partners**: Specialized workflows for hardware partner support
- ✅ **Advanced Analytics**: Comprehensive tracking and staff point systems
- ✅ **Automated Cleanup**: Supabase RPC-based orphaned ticket resolution

### **Upcoming Features**
- Enhanced FAQ system with machine learning categorization
- Multi-language support for international users
- Advanced reporting and business intelligence
- Mobile app integration for staff notifications

---

## 🤝 **Contributing**

This is a private project for Fry Networks. Please follow the coding standards in `.clinerules/general-guidelines.md` and update `TASK.md` when working on tickets.

### **Development Workflow** 
1. Check `TASK.md` for current priorities
2. Follow modular architecture patterns
3. Add comprehensive logging for new features
4. Test with both user and staff perspectives
5. Update documentation for any API changes

---

## 📞 **Support**

For technical issues or feature requests:
- Check the FAQ system via `/faq` command
- Review logs via dashboard analytics
- Contact development team via internal channels

---

*Last updated: November 2025 | Made with ❤️ for Fry Networks Community*
