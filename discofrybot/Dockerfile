FROM node:22

# Keep npm current for security/bugfixes.
RUN npm install -g npm@latest

# Install 1Password CLI so secrets defined as op:// references are resolved at runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl gnupg \
  && curl -sS https://downloads.1password.com/linux/keys/1password.asc | gpg --dearmor -o /usr/share/keyrings/1password-archive-keyring.gpg \
  && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/1password-archive-keyring.gpg] https://downloads.1password.com/linux/debian/amd64 stable main" > /etc/apt/sources.list.d/1password.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends 1password-cli \
  && apt-get purge -y --auto-remove gnupg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./

# Use ci when lockfile exists; fallback to install if needed.
RUN npm ci || npm install

COPY . .

# Ensure the app dir is owned by non-root before switching users.
RUN chown -R node:node /app
USER node

# Resolve secrets via op run at start while keeping the runtime non-root.
# Use node directly since the bot runs via discofrybot.js.
CMD ["sh", "-c", "op run -- node discofrybot.js"]
