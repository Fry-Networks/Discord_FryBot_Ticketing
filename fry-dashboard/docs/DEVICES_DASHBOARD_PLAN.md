# 🎯 Comprehensive Device Management Dashboard Plan

## 📋 Project Overview

Create a comprehensive device management dashboard page in the Fry tickets dashboard that displays and syncs data from MongoDB `main.devices` collection. This dashboard will provide staff with complete visibility into the device ecosystem, including device information, staking details, reward structures, and device credentials.

---

## 🔍 Data Sources & Structure

### MongoDB `main.devices` Collection Schema

```json
{
  "_id": "ObjectId",
  "miner_key": "String - Device identifier (e.g., AEM-K2FHBJ0Y7PLGCEUS79R804DPKS6WO34K)",
  "name": "String - Device name",
  "order": "String - Order number",
  "email": "String - User email", 
  "created_at": "Date - Device creation date",
  "is_registered": "Boolean - Registration status",
  "names": {
    "first_name": "String",
    "last_name": "String"
  },
  "nickname": "String - Device nickname",
  "address": "String - Main wallet address",
  "reward_wallet": "String - Reward wallet address",
  "registration": {
    "amount": "Number - Registration staking amount",
    "asset_id": "String - Token asset ID",
    "time": "Date - Registration staking date",
    "txId": "String - Transaction ID"
  },
  "node": {
    "amount": "Number - Node operation staking amount", 
    "asset_id": "String - Token asset ID",
    "time": "Date - Node staking date",
    "txId": "String - Transaction ID"
  },
  "staked": {
    "amount": "Number - Verification staking amount",
    "asset_id": "String - Token asset ID", 
    "time": "Date - Verification staking date",
    "txId": "String - Transaction ID",
    "type": "String - 'one' (1.5x multiplier) or 'two' (3x multiplier)",
    "rewarded_time": "Date - When rewards were last calculated"
  },
  "verified": "Boolean - Verification status"
}
```

### Token Asset IDs & Names (from `main.tokens`)

- __924268058__: Fry 1.0 (Retired/Legacy miner rewards)
- __2485314946__: FRY 2.0 (verification staking for all device types)
- __2485202024__: fNODE (registration & node operation staking, node rewards)
- __2485198745__: fVPN (not released yet)
- __2681521901__: tFRY (New miner rewards)

### Device Credentials Structure (from `creds` database)

__Collections:__ `hardware`, `camera`, `energy`, `weather`, `water`, `air`, `radiation`

__Hardware Collection Schema:__

```json
{
  "_id": "ObjectId",
  "address": "String",
  "miner_key": "String", 
  "miner_type": "String",
  "credentials": {
    "mac_address": "String"
  },
  "credentials_saved_at": "Date",
  "position": {
    "lat": "Number",
    "lng": "Number", 
    "hexId": "String"
  },
  "position_saved_at": "Date"
}
```

__Camera Collection Schema:__

```json
{
  "_id": "ObjectId",
  "miner_key": "String",
  "address": "String",
  "miner_type": "String",
  "api_type": "String",
  "credentials": {
    "rtsp_url": "String"
  },
  "credentials_saved_at": "Date",
  "position": {
    "lat": "Number",
    "lng": "Number",
    "hexId": "String" 
  },
  "position_saved_at": "Date"
}
```

__Energy Collection Schema:__

```json
{
  "_id": "ObjectId",
  "miner_key": "String",
  "address": "String", 
  "miner_type": "String",
  "api_type": "String",
  "credentials": {
    "deviceId": "String",
    "serverUrl": "String", 
    "authKey": "String"
  },
  "credentials_saved_at": "Date",
  "position": {
    "lat": "Number",
    "lng": "Number",
    "hexId": "String"
  },
  "position_saved_at": "Date"
}
```

__Weather Collection Schema:__

```json
{
  "_id": "ObjectId",
  "miner_key": "String",
  "address": "String",
  "miner_type": "String", 
  "api_type": "String",
  "credentials": {
    "api_key": "String",
    "device_mac": "String"
  },
  "credentials_saved_at": "Date",
  "position": {
    "lat": "Number",
    "lng": "Number",
    "hexId": "String"
  },
  "position_saved_at": "Date"
}
```

__Water Collection Schema:__

```json
{
  "_id": "ObjectId",
  "miner_key": "String", 
  "address": "String",
  "position": {
    "lat": "Number",
    "lng": "Number",
    "hexId": "String"
  },
  "position_saved_at": "Date"
}
```

__Air Collection Schema:__

```json
{
  "_id": "ObjectId",
  "miner_key": "String",
  "address": "String", 
  "position": {
    "lat": "Number",
    "lng": "Number",
    "hexId": "String"
  },
  "position_saved_at": "Date"
}
```

__Radiation Collection Schema:__

```json
{
  "_id": "ObjectId",
  "miner_key": "String",
  "address": "String",
  "miner_type": "String",
  "api_type": "String", 
  "credentials": {
    "gmc_map_id": "Number"
  },
  "credentials_saved_at": "Date",
  "position": {
    "lat": "Number",
    "lng": "Number",
    "hexId": "String"
  },
  "position_saved_at": "Date"
}
```

### Existing MongoDB Indexes

#### Current Indexes on `main.devices`:

- __\_id\___: Default ObjectId index
- __miner_key_1__: Single field index on miner_key ✅ (perfect for our search)
- __address_1_is_registered_1__: Compound index on address + is_registered ✅ (good for wallet searches)
- __idx_is_registered__: Single field index on is_registered ✅ (good for filtering)
- __idx_user_id__: Single field index on user_id
- __idx_verified__: Single field index on verified ✅ (good for filtering)
- __idx_reward_wallet__: Single field index on reward_wallet ✅ (good for wallet search)

#### Recommended New Indexes Needed:

- __email_1__: Single field index on email (for search functionality)
- __order_1__: Single field index on order (for order number search)
- __nickname_1__: Single field index on nickname (for nickname search)
- __names.first_name_1__: Single field index for name searches
- __names.last_name_1__: Single field index for name searches  
- __created_at_1__: Single field index for date filtering/sorting
- __compound_search__: Compound text index on multiple search fields for efficient multi-field search

---

## 🏭 Complete Device Types (29 Total)

### __Node Types (4)__ - Require registration + node operation staking:

- __RDN__: $FRY Reward Decentralization Node (119.04 unverified rewards)
- __SVN__: $FRY Storage Validator Node (119.04 unverified rewards)
- __SDN__: $FRY Storage Decentralization Node (119.04 unverified rewards)
- __CN__: $FRY Contributor Node (226.17 unverified rewards)

__Staking Requirements:__

- Registration: 50$ USD worth of fNODE (2485202024)
- Node Operation: 50$ USD worth of fNODE (2485202024)
- Verification: 2235 FRY 2.0 (type one/24hour lock for 1.5x multiplier), 745 FRY 2.0 (type two/6months lock for 3x multiplier)

### __AI Edge Miner (1)__ - Requires registration staking:

- __AEM__: $FRY AI Edge Miner (990 unverified rewards)

__Staking Requirements:__

- Registration: 50$ USD worth of fNODE (2485202024)
- Verification: 559 FRY 2.0 (type one/24hour lock for 1.5x multiplier), 186 FRY 2.0 (type two/6months lock for 3x multiplier)

### __Standard Miners (24)__ - Only need `is_registered: true`:

__Weather Miners:__

- __HWM__: High-End Weather Miner (59.52 unverified) - 1118/373 verification
- __LWM__: Low-End Weather Miner (22.89 unverified) - 429.95/143.44 verification
- __OLWQM__: Outdoor Low-End Water Quality Miner (22.89 unverified) - 429.95/143.44 verification
- __OHWQM__: Outdoor High-End Water Quality Miner (59.52 unverified) - 1118/373 verification

__Air Quality Miners:__

- __ILAQM__: Indoor Low-End Air Quality Miner (22.89 unverified) - 429.95/143.44 verification
- __IMAQM__: Indoor Mid-End Air Quality Miner (29.76 unverified) - 559/186.5 verification
- __IHAQM__: Indoor High-End Air Quality Miner (59.52 unverified) - 1118/373 verification
- __OMAQM__: Outdoor Mid-End Air Quality Miner (29.76 unverified) - 559/186.5 verification
- __OHAQM__: Outdoor High-End Air Quality Miner (59.52 unverified) - 1118/373 verification

__AI Camera Miners (all 29.76 unverified, 559/186.5 verification):__

- __AOWSCM__: AI Outdoor Weather Station Camera Miner
- __AOWCM__: AI Outdoor Wildlife Camera Miner
- __AOTCM__: AI Outdoor Traffic Camera Miner
- __AOSCM__: AI Outdoor Sky Camera Miner
- __AITCM__: AI Indoor Traffic Camera Miner
- __AIWCM__: AI Indoor Wildlife Camera Miner
- __AIWSCM__: AI Indoor Weather Station Camera Miner
- __AISCM__: AI Indoor Sky Camera Miner

__Other Specialized Miners:__

- __EM__: Energy Miner (29.76 unverified) - 559/186.5 verification
- __BM__: Bandwidth Miner (59.52 unverified) - 1118/373 verification
- __IRM__: Indoor Radiation Miner (29.76 unverified) - 559/186.5 verification
- __IDM__: Indoor Decibel Miner (59.52 unverified) - 1118/373 verification
- __ODM__: Outdoor Decibel Miner (59.52 unverified) - 1118/373 verification
- __OSM__: Outdoor Satellite Miner (59.52 unverified) - 1118/373 verification
- __ISM__: Indoor Satellite Miner (59.52 unverified) - 1118/373 verification

---

## 🎯 Implementation Plan

### Phase 1: Navigation & Page Setup

1. __Add "Devices" to navigation__ (`src/components/NavBar.tsx`)
2. __Create devices page__ (`src/app/(dashboard)/devices/page.tsx`)
3. __Implement staff authorization__ (following existing pattern)

### Phase 2: API Development

4. __Create API endpoints:__

   - `GET /api/devices` - Main device query with search/filter
   - `GET /api/devices/[minerKey]` - Individual device details
   - `GET /api/devices/credentials/[minerKey]` - Device credentials
   - `GET /api/devices/count` - Total count for pagination

### Phase 3: Search & Filter System

5. __Multi-field search functionality:__

   - Order number (`order`)
   - Miner key (`miner_key`)
   - Email (`email`)
   - Main wallet (`address`)
   - Reward wallet (`reward_wallet`)
   - Owner name (`names.first_name`, `names.last_name`)
   - Nickname (`nickname`)

6. __Advanced filtering:__

   - Device type (extracted from miner key prefix)
   - Registration status (`is_registered`)
   - Verification status (`verified`)
   - Verification type ("one"/"two"/none)
   - Date ranges (creation, staking dates)
   - Staking requirements (registration required, node required, none)

### Phase 4: Data Display Components

7. __Main table view:__

   - Miner Key (with device type badge)
   - Owner Name (first + last)
   - Email
   - Order Number
   - Registration Status Badge
   - Verification Status Badge (with multiplier)
   - Created Date
   - Actions (View Details, View Credentials)

8. __Detailed device view:__

   - Complete device information
   - All staking transactions with amounts/dates/txIds
   - Token names with asset IDs
   - Device credentials (MAC address, RTSP URL, position)
   - Timeline of device lifecycle

### Phase 5: Advanced Features

9. __Pagination & Sorting__
10. __Export functionality__ (CSV with complete data)
11. __Device type badges__ with color coding
12. __Verification multiplier indicators__ (1.5x, 3x)
13. __Responsive design__ for mobile/tablet

### Phase 6: Performance & Polish

14. __MongoDB indexes__ for search performance
15. __Loading states__ and error handling
16. __Real-time data refresh__
17. __Bulk operations__ (if needed)

---

## 🎨 UI/UX Design

- __Device Type Badges:__ Color-coded by category (Nodes=blue, AI Edge=purple, Weather=green, etc.)
- __Staking Status:__ Visual indicators for required vs optional staking
- __Verification Multipliers:__ Prominent badges showing 1.5x or 3x
- __Credential Access:__ Secure toggle/modal for viewing sensitive data
- __Search Bar:__ Prominent with real-time suggestions
- __Filter Panel:__ Collapsible sidebar with all filter options

This plan provides complete visibility into the entire device ecosystem while maintaining security and performance standards.
