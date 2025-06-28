# Backend Dockerfile
FROM node:18.19-slim

# Install Python and pip
RUN apt-get update && \
    apt-get install -y python3 python3-pip git && \
    rm -rf /var/lib/apt/lists/* && \
    python3 -m pip install --no-cache-dir --upgrade pip

# Configure Git to handle line endings
RUN git config --global core.autocrlf false

# Create app directory
WORKDIR /app

# Set default environment variables
ENV NODE_ENV=production \
    PORT=3001 \
    PYTHON_VERSION=3.8.12

# Feature Flags
ENV ENABLE_ANALYTICS=true \
    ENABLE_MAP_SEARCH=true \
    ENABLE_SOCIAL_SHARING=true \
    ENABLE_LAZY_LOADING=true \
    ENABLE_IMAGE_OPTIMIZATION=true \
    ENABLE_SEARCH_SUGGESTIONS=true \
    ENABLE_SAVED_SEARCHES=true \
    ENABLE_ML_RECOMMENDATIONS=true \
    DEBUG_AUTH=false

# File Upload Configuration
ENV MAX_FILE_SIZE=1048760 \
    MAX_FILES_COUNT=10

# JWT Token Expiration (non-sensitive defaults)
ENV JWT_EXPIRES_IN=7d \
    REFRESH_TOKEN_EXPIRES_IN=30d

# Copy package files and Python requirements first
COPY package*.json requirements.txt ./

# Install dependencies
RUN npm install --omit=dev && \
    python3 -m pip install --no-cache-dir -r requirements.txt

# Copy app source
COPY . .

# Create uploads directory and ensure proper permissions
RUN mkdir -p uploads && chown -R node:node /app

# Use node user for security
USER node

# Expose port (Render will use PORT env variable)
EXPOSE ${PORT}

# Start the application
CMD ["node", "index.js"]
