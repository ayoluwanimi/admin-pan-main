# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /app/frontend

# Copy package.json and package-lock.json (or yarn.lock) to install dependencies
COPY package.json yarn.lock ./

# Install frontend dependencies
RUN yarn install --frozen-lockfile

# Copy the rest of the application code into the container
COPY . .

# Build the React app for production
ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL
RUN yarn build

# Serve the static files with Nginx
FROM nginx:stable-alpine

# Copy the Nginx configuration from the host
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built React app to Nginx html directory
COPY --from=0 /app/frontend/build /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
