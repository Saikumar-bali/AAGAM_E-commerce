#!/bin/bash

set -e

echo "🚀 Setting up AAGAM production services..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run as root (sudo)"
    exit 1
fi

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "❌ Cannot detect OS"
    exit 1
fi

install_redis() {
    echo "📦 Installing Redis..."
    
    case $OS in
        ubuntu|debian)
            apt update
            apt install -y redis-server
            ;;
        centos|rhel|almalinux|rocky)
            yum install -y epel-release
            yum install -y redis
            ;;
        almalinux|rocky)
            dnf install -y redis
            ;;
        *)
            echo "❌ Unsupported OS: $OS"
            exit 1
            ;;
    esac
    
    echo "✅ Redis installed"
}

install_node() {
    echo "📦 Checking Node.js..."
    
    if ! command -v node &> /dev/null; then
        echo "❌ Node.js not found. Please install Node.js 20+ first"
        exit 1
    fi
    
    echo "✅ Node.js $(node -v) found"
}

setup_redis() {
    echo "⚙️ Configuring Redis..."
    
    # Create redis config
    mkdir -p /var/lib/redis /var/log/redis /etc/redis
    
    # Create user if not exists
    id -u redis &>/dev/null || useradd -r -s /bin/false redis
    
    # Set permissions
    chown redis:redis /var/lib/redis /var/log/redis
    
    # Copy config
    cp -f production/redis/redis.conf /etc/redis/redis.conf
    chmod 644 /etc/redis/redis.conf
    
    echo "✅ Redis configured"
}

deploy_services() {
    echo "🚀 Deploying services..."
    
    # Create app directory
    mkdir -p /opt/aagam
    
    # Copy application files (replace with your deployment method)
    echo "📝 Copy application to /opt/aagam"
    echo "   Run: rsync -avz ./user@server:/opt/aagam/"
    
    # Copy service files
    cp -f production/api-gateway.service /etc/systemd/system/
    cp -f production/redis.service /etc/systemd/system/
    
    # Reload systemd
    systemctl daemon-reload
    
    echo "✅ Services deployed"
}

start_services() {
    echo "▶️ Starting services..."
    
    # Enable and start Redis
    systemctl enable redis
    systemctl start redis
    systemctl status redis
    
    # Wait for Redis
    sleep 2
    
    # Enable and start API Gateway
    systemctl enable aagam-api-gateway
    systemctl start aagam-api-gateway
    
    echo "✅ Services started"
}

status() {
    echo "📊 Service status:"
    systemctl status redis --no-pager
    systemctl status aagam-api-gateway --no-pager
}

case "${1:-install}" in
    install)
        install_redis
        install_node
        setup_redis
        deploy_services
        start_services
        status
        ;;
    start)
        systemctl start redis
        systemctl start aagam-api-gateway
        ;;
    stop)
        systemctl stop aagam-api-gateway
        systemctl stop redis
        ;;
    restart)
        systemctl restart redis
        systemctl restart aagam-api-gateway
        ;;
    status)
        status
        ;;
    *)
        echo "Usage: $0 {install|start|stop|restart|status}"
        exit 1
        ;;
esac