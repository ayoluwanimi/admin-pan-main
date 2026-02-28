# admin-pan-main: Deployment Guide

This document outlines the steps to deploy the `admin-pan-main` application, comprising a React frontend and a FastAPI backend, as a permanent website. This guide provides instructions for both traditional server deployment (using Nginx and Systemd) and containerized deployment using Docker.

## 1. Project Overview

-   **Frontend**: React application (`frontend/`)
-   **Backend**: FastAPI application (`backend/`)
-   **Database**: MongoDB

## 2. Prerequisites

Before you begin, ensure your server has the following installed:

-   **For Traditional Deployment**:
    -   **Python 3.8+** and `pip`
    -   **Node.js 16+** and `npm` (or `yarn`)
    -   **Nginx**
    -   **MongoDB** (or access to a MongoDB Atlas cluster)
    -   **`git`**
-   **For Docker Deployment**:
    -   **Docker** and **Docker Compose**
    -   **`git`**
    -   **MongoDB** (or access to a MongoDB Atlas cluster)

## 3. Server Setup

### 3.1. Clone the Repository

First, clone your repository to the server:

```bash
git clone https://github.com/ayoluwanimi/admin-pan-main.git /var/www/admin-pan-main
cd /var/www/admin-pan-main
```

### 3.2. Environment Variables

**Backend (`backend/`)**

Create a `.env` file in the `backend/` directory with your production-specific variables. Refer to `backend/.env.example` for required variables.

```bash
# Example: /var/www/admin-pan-main/backend/.env
MONGO_URL="mongodb+srv://<username>:<password>@<cluster-url>/"
DB_NAME="admin_panel_prod"
TELEGRAM_BOT_TOKEN="your_telegram_bot_token" # Optional
TELEGRAM_CHAT_ID="your_telegram_chat_id"     # Optional
```

**Frontend (`frontend/`)**

The `REACT_APP_BACKEND_URL` needs to be set during the frontend build process. This will be the public URL of your deployed backend API (e.g., `https://api.yourdomain.com`).

## 4. Deployment Options

### Option A: Traditional Server Deployment (Nginx & Systemd)

#### 4.1. Backend Deployment (FastAPI with Gunicorn & Systemd)

1.  **Install Dependencies**: Navigate to the `backend/` directory and install the production dependencies. It's highly recommended to use a Python virtual environment.

    ```bash
    cd /var/www/admin-pan-main/backend
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements_prod.txt
    ```

    *(Note: `requirements_prod.txt` was created to include only essential dependencies for production. If you need other packages, add them to this file.)*

2.  **Configure Gunicorn**: Gunicorn will serve your FastAPI application. The `admin-pan-backend.service` file (provided in the repository root) is a `systemd` unit file to manage Gunicorn.

    Copy the `admin-pan-backend.service` file to `/etc/systemd/system/`:

    ```bash
    sudo cp /var/www/admin-pan-main/admin-pan-backend.service /etc/systemd/system/
    ```

    **Edit the `admin-pan-backend.service` file** (`sudo nano /etc/systemd/system/admin-pan-backend.service`):

    -   Update `User` if `www-data` is not appropriate for your setup.
    -   Ensure `WorkingDirectory` points to `/var/www/admin-pan-main/backend`.
    -   Verify `Environment="PATH=/var/www/admin-pan-main/backend/venv/bin"` points to your virtual environment.
    -   **Crucially, update `Environment="MONGO_URL=..."` and `Environment="DB_NAME=..."` with your actual MongoDB connection string and database name.**

3.  **Start and Enable the Backend Service**:

    ```bash
    sudo systemctl daemon-reload
    sudo systemctl start admin-pan-backend
    sudo systemctl enable admin-pan-backend
    ```

    Verify the service status:

    ```bash
    sudo systemctl status admin-pan-backend
    ```

#### 4.2. Frontend Deployment (React with Nginx)

1.  **Install Dependencies and Build**: Navigate to the `frontend/` directory, install dependencies, and create a production build.

    ```bash
    cd /var/www/admin-pan-main/frontend
    npm install # or yarn install
    REACT_APP_BACKEND_URL=https://api.yourdomain.com npm run build # Replace with your actual backend URL
    ```

    This will create a `build/` directory containing the optimized static files.

2.  **Configure Nginx**: Nginx will serve the static frontend files and act as a reverse proxy for the backend API and WebSockets.

    Copy the `nginx.conf` file (provided in the repository root) to `/etc/nginx/sites-available/` and create a symlink to `sites-enabled`:

    ```bash
    sudo cp /var/www/admin-pan-main/nginx.conf /etc/nginx/sites-available/admin-pan-main.conf
    sudo ln -s /etc/nginx/sites-available/admin-pan-main.conf /etc/nginx/sites-enabled/
    ```

    **Edit the `admin-pan-main.conf` file** (`sudo nano /etc/nginx/sites-available/admin-pan-main.conf`):

    -   Replace `yourdomain.com` and `www.yourdomain.com` with your actual domain names.
    -   Update `ssl_certificate` and `ssl_certificate_key` paths to your SSL certificate files (e.g., from Let's Encrypt).
    -   Ensure `root /var/www/admin-pan-main/frontend/build;` is correct.

    Test Nginx configuration and restart:

    ```bash
    sudo nginx -t
    sudo systemctl restart nginx
    ```

### Option B: Docker Deployment

This option uses Docker to containerize both the frontend and backend applications, making deployment more portable and consistent.

#### 4.3. Create `docker-compose.yml`

Create a `docker-compose.yml` file in the root of your project (`/var/www/admin-pan-main/`) with the following content:

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      # Replace with your actual MongoDB connection string and database name
      MONGO_URL: "mongodb+srv://<username>:<password>@<cluster-url>/"
      DB_NAME: "admin_panel_prod"
      TELEGRAM_BOT_TOKEN: "your_telegram_bot_token" # Optional
      TELEGRAM_CHAT_ID: "your_telegram_chat_id"     # Optional
    restart: always

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        # Replace with the public URL of your deployed backend API
        REACT_APP_BACKEND_URL: "https://api.yourdomain.com"
    ports:
      - "80:80"
    restart: always
    depends_on:
      - backend
```

**Important**: Update the `MONGO_URL`, `DB_NAME`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and `REACT_APP_BACKEND_URL` variables in `docker-compose.yml` with your actual production values.

#### 4.4. Build and Run with Docker Compose

Navigate to the project root (`/var/www/admin-pan-main/`) and run:

```bash
sudo docker compose up --build -d
```

-   `--build`: Rebuilds images if there are changes.
-   `-d`: Runs the containers in detached mode.

This will build the Docker images for both frontend and backend, and start the services. The frontend will be accessible on port 80 of your server.

## 5. Database Setup (MongoDB)

For a permanent website, it is highly recommended to use a managed MongoDB service like [MongoDB Atlas](https://www.mongodb.com/cloud/atlas). Create a free-tier cluster, set up a database user, and obtain the connection string. This connection string will be used for the `MONGO_URL` environment variable in your backend service (or `docker-compose.yml`).

## 6. Domain and SSL

-   **Domain**: Point your domain's A record to your server's IP address through your domain registrar.
-   **SSL**: Obtain and configure SSL/TLS certificates for HTTPS. [Let's Encrypt](https://letsencrypt.org/) with [Certbot](https://certbot.eff.org/) is a popular free option.

    If using **Traditional Deployment (Nginx)**, follow the Nginx configuration steps in Section 4.2.

    If using **Docker Deployment**, you can either configure Nginx as a reverse proxy *in front* of your Dockerized frontend (mapping port 80 from Docker to a different port on the host, and then Nginx proxies to that host port), or use a service like Caddy within Docker for SSL termination.

## 7. Continuous Integration/Continuous Deployment (CI/CD)

For automated deployments, you can set up CI/CD pipelines using services like GitHub Actions, GitLab CI, or Jenkins. A basic workflow would involve:

1.  **Push to `main` branch**.
2.  **Build & Deploy**: Depending on your chosen deployment option (Traditional or Docker), trigger the appropriate build and deployment commands on your server.

*(A detailed CI/CD configuration is beyond the scope of this general guide but can be implemented based on your chosen CI/CD platform.)*

## 8. Final Checks

-   Ensure all environment variables are correctly set.
-   Check Nginx/Gunicorn/Docker logs for any errors.
-   Verify that your domain points to the server IP.
-   Test the application thoroughly after deployment.

--- 
*Author: Manus AI*
