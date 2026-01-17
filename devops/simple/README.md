# "Simple" Deployment Strategy 🚀
> For Resume Demos & Pet Projects

This directory contains a simplified deployment configuration to run the entire Video Conferencing stack on a single Virtual Private Server (VPS) using Docker Compose and Caddy.

**Live URL:** [https://meet.rosewright.dev](https://meet.rosewright.dev)

## Architecture
- **Infrastrucutre:** Single Ubuntu VPS ($10-20/mo)
- **Orchestration:** Docker Compose
- **Reverse Proxy:** Caddy (Auto-HTTPS)
- **Networking:** 
  - `frontend` & `backend` on bridge network
  - `rust-sfu` on **host network** for raw UDP performance

## Setup Instructions

### 1. Provision Server
Get a VPS (DigitalOcean/AWS/Hetzner) with Ubuntu 24.04 and Docker installed.

### 2. DNS Configuration
Point A records to your VPS IP:
- `meet.rosewright.dev` -> `A <VPS_IP>`
- `api.meet.rosewright.dev` -> `A <VPS_IP>`

### 3. Deploy
SSH into your server and run:

```bash
# 1. Create directory
mkdir -p ~/video-conferencing/simple
cd ~/video-conferencing/simple

# 2. Copy files from this directory to the server
# (docker-compose.prod.yaml, Caddyfile, deploy.sh)

# 3. Create .env file
cat <<EOF > .env
JWT_SECRET=super-secure-secret-change-me
REDIS_PASSWORD=another-secure-secret
PUBLIC_IP=$(curl -s ifconfig.me)
EOF

# 4. Run Deploy Script
chmod +x deploy.sh
./deploy.sh
```

## Maintenance
To update the app after pushing code to GitHub:
```bash
./deploy.sh
```
