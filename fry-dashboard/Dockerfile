FROM node:22

# Keep npm current for security/bugfixes.
RUN npm install -g npm@latest

# Install 1Password CLI so op:// refs are resolved at build/run time.
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

# Build-time secrets are provided via build args as op:// refs.
ARG OP_SERVICE_ACCOUNT_TOKEN
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG SUPABASE_SERVICE_ROLE_KEY
ARG SUPABASE_URL
ARG SUPABASE_ACCESS_TOKEN
ARG SUPABASE_PROJECT_ID
ARG DISCORD_CLIENT_ID
ARG DISCORD_CLIENT_SECRET
ARG DISCORD_BOT_TOKEN
ARG DISCORD_GUILD_ID
ARG GUILD_ID
ARG STAFF_ROLE_ID
ARG INTERN_ROLE_ID
ARG STAFF_MAP
ARG MONGO_DASH_URI
ARG GOOGLE_CLIENT_ID
ARG GOOGLE_CLIENT_SECRET
ARG GOOGLE_REFRESH_TOKEN
ARG GOOGLE_DRIVE_FOLDER_ID
ARG GOOGLE_BOTLOGS_FOLDER_ID
ARG GOOGLE_SHARED_DRIVE_ID
ARG DUDE350Z_AVATAR
ARG ATORMONKEY_AVATAR
ARG CRYPTOSOLJAH_AVATAR
ARG IOTANINE_AVATAR
ARG MRSIR9333_AVATAR
ARG FUDSKIE_AVATAR
ARG KATARONI_SURPRISE_AVATAR
ARG PACKETTHROWER_AVATAR

# Surface build-time envs for Next.js and op run without baking secrets.
ENV OP_SERVICE_ACCOUNT_TOKEN=${OP_SERVICE_ACCOUNT_TOKEN} \
    NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY} \
    SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY} \
    SUPABASE_URL=${SUPABASE_URL} \
    SUPABASE_ACCESS_TOKEN=${SUPABASE_ACCESS_TOKEN} \
    SUPABASE_PROJECT_ID=${SUPABASE_PROJECT_ID} \
    DISCORD_CLIENT_ID=${DISCORD_CLIENT_ID} \
    DISCORD_CLIENT_SECRET=${DISCORD_CLIENT_SECRET} \
    DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN} \
    DISCORD_GUILD_ID=${DISCORD_GUILD_ID} \
    GUILD_ID=${GUILD_ID} \
    STAFF_ROLE_ID=${STAFF_ROLE_ID} \
    INTERN_ROLE_ID=${INTERN_ROLE_ID} \
    STAFF_MAP=${STAFF_MAP} \
    MONGO_DASH_URI=${MONGO_DASH_URI} \
    GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID} \
    GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET} \
    GOOGLE_REFRESH_TOKEN=${GOOGLE_REFRESH_TOKEN} \
    GOOGLE_DRIVE_FOLDER_ID=${GOOGLE_DRIVE_FOLDER_ID} \
    GOOGLE_BOTLOGS_FOLDER_ID=${GOOGLE_BOTLOGS_FOLDER_ID} \
    GOOGLE_SHARED_DRIVE_ID=${GOOGLE_SHARED_DRIVE_ID} \
    DUDE350Z_AVATAR=${DUDE350Z_AVATAR} \
    ATORMONKEY_AVATAR=${ATORMONKEY_AVATAR} \
    CRYPTOSOLJAH_AVATAR=${CRYPTOSOLJAH_AVATAR} \
    IOTANINE_AVATAR=${IOTANINE_AVATAR} \
    MRSIR9333_AVATAR=${MRSIR9333_AVATAR} \
    FUDSKIE_AVATAR=${FUDSKIE_AVATAR} \
    KATARONI_SURPRISE_AVATAR=${KATARONI_SURPRISE_AVATAR} \
    PACKETTHROWER_AVATAR=${PACKETTHROWER_AVATAR}

# Copy the rest of the code.
COPY . .

# Build the Next.js app with secrets resolved via 1Password inside the container.
# Token is provided via BuildKit secret mount (see docker-compose.yml `op_token`).
RUN --mount=type=secret,id=op_token sh -c '\
  export OP_SERVICE_ACCOUNT_TOKEN="$(cat /run/secrets/op_token)" && \
  op run -- npm run build \
'

# Ensure the app dir is owned by non-root before switching users.
RUN chown -R node:node /app
USER node

EXPOSE 3000

# Resolve secrets via op run at start while keeping the runtime non-root.
CMD ["sh", "-c", "op run -- npm start"]
