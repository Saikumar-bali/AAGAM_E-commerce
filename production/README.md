# Production Setup (Without Docker)

This directory contains configuration files for deploying AAGAM E-commerce on a Linux server **without Docker**.

## Prerequisites

- Ubuntu 20.04+ / Debian 11+ / CentOS 8+
- Node.js 20+
- Redis 7+

## Quick Setup

Run the automated setup script:

```bash
# Upload files to your server
rsync -avz --exclude node_modules --exclude .git ./ user@your-server:/opt/aagam/

# SSH to server and run
cd /opt/aagam
chmod +x production/setup.sh
sudo ./production/setup.sh install
```

## Manual Setup

### 1. Install Redis

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install redis-server

# CentOS/RHEL
sudo yum install epel-release
sudo yum install redis
```

### 2. Configure Redis

```bash
sudo cp production/redis/redis.conf /etc/redis/redis.conf
sudo systemctl enable redis
sudo systemctl start redis
```

### 3. Deploy Application

```bash
# Build for production
npm run build

# Copy to server (from your local machine)
rsync -avz --exclude node_modules --exclude .git ./ user@server:/opt/aagam/

# On server - install dependencies
cd /opt/aagam
npm ci --production

# Copy systemd service
sudo cp production/api-gateway.service /etc/systemd/system/

# Start service
sudo systemctl daemon-reload
sudo systemctl enable aagam-api-gateway
sudo systemctl start aagam-api-gateway
```

### 4. Environment Variables

Create `/opt/aagam/.env`:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:pass@host:5432/aagam
JWT_SECRET=your-secure-secret-min-32-chars
REDIS_URL=redis://127.0.0.1:6379
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your-anon-key
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

## Service Management

```bash
# Check status
sudo systemctl status aagam-api-gateway
sudo systemctl status redis

# View logs
sudo journalctl -u aagam-api-gateway -f
sudo journalctl -u redis -f

# Restart
sudo systemctl restart aagam-api-gateway
sudo systemctl restart redis

# Stop
sudo systemctl stop aagam-api-gateway
```

## Production Checklist

- [ ] Set strong `JWT_SECRET` (32+ random characters)
- [ ] Configure firewall (allow port 3000)
- [ ] Set up SSL/TLS (nginx/Apache)
- [ ] Configure CORS origins
- [ ] Set up monitoring (PM2, logs)
- [ ] Configure database connection pooling
- [ ] Enable Redis persistence

## Directory Structure

```
production/
├── setup.sh              # Automated setup script
├── redis/
│   ├── redis.conf       # Redis configuration
│   └── redis.service    # Systemd service file
└── api-gateway.service  # API Gateway systemd service
```

## Troubleshooting

### Redis not starting
```bash
sudo journalctl -u redis -n 50
# Check config: sudo redis-cli config get *
```

### API not starting
```bash
sudo journalctl -u aagam-api-gateway -n 50
# Check env: sudo systemctl show aagam-api-gateway
```

### Connection refused
```bash
# Check Redis
sudo redis-cli ping

# Check port
sudo netstat -tlnp | grep 3000
```
