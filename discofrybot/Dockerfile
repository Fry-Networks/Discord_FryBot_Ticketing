FROM node:22
WORKDIR /app
COPY package*.json ./
RUN npm install --verbose
COPY . .
# Add these two lines:
RUN chown -R node:node /app  # Ensures the app dir is owned by non-root
USER node  # Switches to non-root user for runtime
CMD ["node", "discofrybot.js"]
#CMD ["npm", "run", "dev"]  # Keep commented if not needed