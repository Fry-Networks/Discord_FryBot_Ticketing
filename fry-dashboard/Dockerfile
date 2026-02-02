FROM 1password/op:2@sha256:57d7d6a2bb2b74b2cf8111f6afb2973c74772198f82ea30359a53faae9fff5b1 AS op

FROM node:22

# Keep npm current for security/bugfixes.
RUN npm install -g npm@11.8.0

# Reason: copy the 1Password CLI from the official image for runtime secret resolution.
COPY --from=op /usr/local/bin/op /usr/local/bin/op

WORKDIR /app
COPY package*.json ./

# Use ci when lockfile exists; fallback to install if needed.
RUN npm ci || npm install

# Reason: Next.js embeds NEXT_PUBLIC_* at build time; these are public values only.
ARG NEXT_PUBLIC_SUPABASE_URL="https://placeholder.invalid"
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY="anon_key_placeholder"
# Reason: build-time placeholder to prevent Supabase client init errors during next build.
ARG SUPABASE_SERVICE_ROLE_KEY="service_role_placeholder"
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY} \
    SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}

# Copy the rest of the code.
COPY . .

# Reason: build without 1Password secret injection; runtime op run resolves op:// refs.
RUN npm run build

# Reason: standardize on uid/gid 1001 across repos while keeping runtime non-root.
RUN groupadd -g 1001 app \
  && useradd -u 1001 -g 1001 -m -s /usr/sbin/nologin app \
  && chown -R app:app /app
USER app

EXPOSE 3000

# Reason: runtime secrets are injected via docker-compose entrypoint using op run.
CMD ["npm", "start"]
