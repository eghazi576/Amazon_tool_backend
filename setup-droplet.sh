#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Amazon Insight Hub — One-time Droplet Setup Script
# Run as root on a fresh Ubuntu 22.04 droplet:
#   bash setup-droplet.sh
# ─────────────────────────────────────────────────────────────
set -e

DB_NAME="amazon_db"
DB_USER="amazon_user"
DB_PASS="$(openssl rand -base64 24)"   # auto-generate strong password

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Amazon Insight Hub — Droplet Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. System update ─────────────────────────────────────────
echo ""
echo "→ [1/7] Updating system packages..."
apt update -y && apt upgrade -y

# ── 2. Node.js 20 ────────────────────────────────────────────
echo ""
echo "→ [2/7] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pm2

# ── 3. PostgreSQL ─────────────────────────────────────────────
echo ""
echo "→ [3/7] Installing PostgreSQL..."
apt install -y postgresql postgresql-contrib

systemctl start postgresql
systemctl enable postgresql

# Create DB user and database
sudo -u postgres psql <<SQL
CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';
CREATE DATABASE $DB_NAME OWNER $DB_USER;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
SQL

echo ""
echo "  ✓ Database created"
echo "  DB_USER: $DB_USER"
echo "  DB_NAME: $DB_NAME"
echo "  DB_PASS: $DB_PASS   ← SAVE THIS!"

# ── 4. Nginx ─────────────────────────────────────────────────
echo ""
echo "→ [4/7] Installing Nginx..."
apt install -y nginx
systemctl enable nginx

# ── 5. Clone repositories ────────────────────────────────────
echo ""
echo "→ [5/7] Cloning repositories..."
mkdir -p /var/www

git clone https://github.com/eghazi576/Amazon_tool_backend.git  /var/www/amazon-backend
git clone https://github.com/eghazi576/Amazon_tool_frontend.git /var/www/amazon-frontend

mkdir -p /var/www/amazon-frontend/dist

# ── 6. Backend .env ───────────────────────────────────────────
echo ""
echo "→ [6/7] Creating backend .env..."
cat > /var/www/amazon-backend/.env <<EOF
PORT=3001
NODE_ENV=production
CORS_ORIGIN=http://$(curl -s ifconfig.me)

DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"

JWT_SECRET=$(openssl rand -hex 32)
JWT_EXPIRES_IN=7d

KEEPA_API_KEY=REPLACE_WITH_YOUR_KEEPA_KEY
EOF

echo "  ✓ .env created at /var/www/amazon-backend/.env"
echo "  ⚠  Don't forget to replace KEEPA_API_KEY in that file!"

# ── 7. Backend install + migrate + PM2 ───────────────────────
echo ""
echo "→ [7/7] Installing backend deps and running migrations..."
cd /var/www/amazon-backend
npm install --omit=dev
npx prisma generate
npx prisma migrate deploy

pm2 start app.js --name amazon-backend
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash

# ── Nginx config ─────────────────────────────────────────────
echo ""
echo "→ Configuring Nginx..."
SERVER_IP=$(curl -s ifconfig.me)

cat > /etc/nginx/sites-available/amazon-tool <<EOF
server {
    listen 80;
    server_name $SERVER_IP;

    root /var/www/amazon-frontend/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass         http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    location /health {
        proxy_pass http://localhost:3001;
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript;
}
EOF

ln -sf /etc/nginx/sites-available/amazon-tool /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ── Done ─────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅  Setup complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  App running at:  http://$SERVER_IP"
echo "  Health check:    http://$SERVER_IP/health"
echo ""
echo "  Next steps:"
echo "  1. Edit /var/www/amazon-backend/.env → add your KEEPA_API_KEY"
echo "  2. Add GitHub Secrets (DO_HOST, DO_USER, DO_SSH_KEY, VITE_BACKEND_URL)"
echo "  3. Push to main → auto-deploy will trigger"
echo ""
echo "  DB_PASS saved:   $DB_PASS"
echo "  (Also stored in /var/www/amazon-backend/.env)"
echo ""
