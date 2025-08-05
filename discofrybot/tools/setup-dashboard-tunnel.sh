#!/bin/bash

# VARIABLES (CHANGE THESE)
TUNNEL_NAME="fryticketsdash"
SUBDOMAIN="fryticketsdash.aitechbit.xyz"
USERNAME="$(whoami)"

# INSTALL CLOUDFLARED
echo "Installing cloudflared..."
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
rm cloudflared-linux-amd64.deb

# CLOUDFLARE AUTH
echo "Logging into Cloudflare — follow the browser link to authenticate."
cloudflared login || { echo "Login failed. Exiting."; exit 1; }

# CREATE TUNNEL
echo "Creating tunnel $TUNNEL_NAME..."
cloudflared tunnel create "$TUNNEL_NAME"

# SETUP CONFIG FILE
mkdir -p /home/$USERNAME/.cloudflared
cat <<EOF > /home/$USERNAME/.cloudflared/config.yml
tunnel: $TUNNEL_NAME
credentials-file: /home/$USERNAME/.cloudflared/${TUNNEL_NAME}.json

ingress:
  - hostname: $SUBDOMAIN
    service: http://localhost:3000
  - service: http_status:404
EOF

# ROUTE DNS
echo "Creating DNS route for $SUBDOMAIN..."
cloudflared tunnel route dns "$TUNNEL_NAME" "$SUBDOMAIN"

# INSTALL AS SYSTEMD SERVICE
echo "Installing systemd service for cloudflared..."
sudo cloudflared service install

# START TUNNEL
sudo systemctl start cloudflared
sudo systemctl enable cloudflared

echo "✅ Cloudflare Tunnel setup complete. Access your dashboard at: https://$SUBDOMAIN"
