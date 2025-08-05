# Use official Node.js image
FROM node:22
# Set working directory
WORKDIR /app
# Copy package.json + lock file
COPY package*.json ./
# Install dependencies
RUN npm install
# Copy the rest of the code
COPY . .
# Build the app
RUN npm run build
# Expose port
EXPOSE 3000
# Start the server
CMD ["npm", "start"]
