FROM node:20-alpine

WORKDIR /app

# Copy the dependencies file
COPY package*.json ./

# Install dependencies cleanly
RUN npm ci

# Copy the rest of the application
COPY . .

# Build the app for production
RUN npm run build

# Expose Vite preview port
EXPOSE 5173

# Run Vite preview to serve the built application
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "5173"]
