#!/bin/bash

# ────────────────[ Colors ]────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
NC='\033[0m' # No Color

# ────────────────[ Start ]────────────────
echo -e "${BLUE}🚀 Fry Networks Production Rebuild Script 🧼"
echo -e "=========================================${NC}"

echo -e "${GREEN}🧠 Checking Docker network and disk usage...${NC}"
docker network ls
df -h

# ────────────────[ Cleanup ]────────────────
echo -e "${GREEN}🧹 Pruning unused Docker images, containers, volumes...${NC}"
docker image prune -af --filter "until=24h"
docker container prune -f 
docker builder prune -af --filter "until=24h"
docker volume prune -f 

# ────────────────[ Build + Recreate ]────────────────
echo -e "${GREEN}📦 Rebuilding all services (clean)${NC}"
docker compose down

docker compose build || {
  echo -e "${RED}❌ Build failed!${NC}"
  exit 1
}

echo -e "${YELLOW}🔁 Restarting containers...${NC}"
docker compose up -d --force-recreate || {
  echo -e "${RED}❌ Failed to restart containers!${NC}"
  exit 1
}

# ────────────────[ Disk Usage Check ]────────────────
DOCKER_DISK=$(df -h /var/lib/docker | tail -1 | awk '{print $5}' | tr -d '%')
echo -e "${BLUE}💾 Docker disk usage: ${DOCKER_DISK}%${NC}"
if [ "$DOCKER_DISK" -gt 85 ]; then
  echo -e "${RED}⚠️ Warning: Docker is using over ${DOCKER_DISK}% of disk space! Consider: 'docker system prune -af --volumes'${NC}"
fi

# ────────────────[ Verify Tunnel ]────────────────
echo -e "${BLUE}🌐 Verifying Cloudflare Tunnel...${NC}"
docker compose logs --tail=20 cloudflared

# ────────────────[ Done ]────────────────
echo -e "${GREEN}✅ All services are rebuilt and live!${NC}"
echo -e "${GREEN}📺 Tailing dashboard logs... (Ctrl+C to stop)${NC}"
docker compose logs -f
