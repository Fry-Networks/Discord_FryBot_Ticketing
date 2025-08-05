#!/bin/bash

# ────────────────[ Colors ]────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
NC='\033[0m' # No Color

# ────────────────[ Start ]────────────────
echo -e "${BLUE}🥷 Fry Dashboard Ninja Rebuild Script 🧼"
echo -e "=====================================${NC}"

echo -e "${GREEN}Checking Disk space${NC}"
df -h

# ────────────────[ Smart Cleanup ]────────────────
echo -e "${GREEN}🧹 Cleaning unused Docker images (older than 7h)...${NC}"
docker image prune -af --filter "until=12h"

echo -e "${GREEN}🧹 Cleaning stopped containers...${NC}"
docker container prune -f 

echo -e "${GREEN}🧹 Cleaning old builder cache (older than 7h)...${NC}"
docker builder prune -af --filter "until=12h"

echo -e "${GREEN}🧹 Cleaning unused volumes...${NC}"
docker volume prune -f 

# ────────────────[ Rebuild & Restart ]────────────────
echo -e "${YELLOW}⚙️ Rebuilding only 'fry-dashboard' (no cache)...${NC}"
docker compose build --no-cache discofrybot || { echo -e "${RED}❌ Failed to build discofrybot!${NC}"; exit 1; }

echo -e "${YELLOW}🚀 Restarting fry-dashboard container...${NC}"
docker compose up -d --no-deps --force-recreate discofrybot || { echo -e "${RED}❌ Failed to start fry-dashboard!${NC}"; exit 1; }

# ────────────────[ Disk Usage Check ]────────────────
DOCKER_DISK=$(df -h /var/lib/docker | tail -1 | awk '{print $5}' | tr -d '%')

echo -e "${BLUE}💾 Docker disk usage: ${DOCKER_DISK}%${NC}"
if [ "$DOCKER_DISK" -gt 85 ]; then
  echo -e "${RED}⚠️ Warning: Docker is using over ${DOCKER_DISK}% of disk space! Consider a deep clean: 'docker system prune -af --volumes'${NC}"
fi

# ────────────────[ Done ]────────────────
echo -e "${GREEN}✅ Rebuild complete. fry-dashboard is up and running!${NC}"

echo -e "${GREEN}Tailing logs... (Press Ctrl+C to stop)${NC}"
docker compose logs -f
