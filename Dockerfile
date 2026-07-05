FROM node:20-slim

# Install FFmpeg
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production

# Copy source
COPY backend/ ./backend/
COPY frontend/ ./frontend/

EXPOSE 8080

CMD ["node", "backend/src/server.js"]
