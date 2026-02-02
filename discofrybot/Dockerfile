FROM 1password/op:2@sha256:57d7d6a2bb2b74b2cf8111f6afb2973c74772198f82ea30359a53faae9fff5b1 AS op

FROM node:22

# Keep npm current for security/bugfixes.
RUN npm install -g npm@11.8.0

# Reason: copy the 1Password CLI from the official image to avoid ad-hoc downloads.
COPY --from=op /usr/local/bin/op /usr/local/bin/op

WORKDIR /app
COPY package*.json ./

# Use ci when lockfile exists; fallback to install if needed.
RUN npm ci || npm install

COPY . .

# Reason: standardize on uid/gid 1001 across repos while keeping runtime non-root.
RUN groupadd -g 1001 app \
  && useradd -u 1001 -g 1001 -m -s /usr/sbin/nologin app \
  && chown -R app:app /app
USER app

# Reason: runtime secrets are injected via docker-compose entrypoint using op run.
CMD ["node", "discofrybot.js"]
