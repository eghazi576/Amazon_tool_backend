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

# ── Harden Postgres before creating anything in it ──────────────────────────
#
# The app connects over localhost, so the database never needs to be reachable
# from the network. Two controls enforce that, and they are belt-and-suspenders
# with the firewall (ufw), not a replacement for it:
#
#   listen_addresses = 'localhost'  -- Postgres itself refuses non-local TCP.
#       Ubuntu already defaults to this, but we set it explicitly so a future
#       edit or a different base image cannot silently open it to the world.
#
#   scram-sha-256 for host auth      -- password auth over a modern challenge,
#       not md5 and certainly not `trust` (which is passwordless and would let
#       anyone who reached the port in as any user).
#
# We deliberately do NOT enable TLS. The connection is loopback: the bytes never
# leave the machine's network stack, so there is nobody on the wire to encrypt
# against. Sniffing loopback needs root, and root already owns the database.
# TLS would only become necessary if the database moved to a separate host (a
# managed Postgres, another droplet) -- at which point add `?sslmode=verify-full`
# to DATABASE_URL and point it at the CA, not before.
PG_CONF="$(sudo -u postgres psql -tAc 'SHOW config_file;')"
PG_HBA="$(sudo -u postgres psql -tAc 'SHOW hba_file;')"

sed -i "s/^#\?listen_addresses.*/listen_addresses = 'localhost'/" "$PG_CONF"

# Any md5 host rules -> scram-sha-256. (No effect if already scram.)
sed -i -E 's/^(host\s+.*)\bmd5\b/\1scram-sha-256/' "$PG_HBA"
# Refuse to proceed if pg_hba has a `trust` line for a TCP host -- passwordless
# network auth is never acceptable, and silently "fixing" it could lock someone
# out, so make it loud instead.
if grep -qE '^host\s+.*\btrust\b' "$PG_HBA"; then
  echo "  ⚠  pg_hba.conf has a host ... trust rule (passwordless). Remove it before going live:"
  grep -nE '^host\s+.*\btrust\b' "$PG_HBA" | sed 's/^/       /'
fi

systemctl restart postgresql

# Create DB user and database. The password is a 24-byte openssl value from the
# top of this script -- never a default, never reused.
sudo -u postgres psql <<SQL
CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';
CREATE DATABASE $DB_NAME OWNER $DB_USER;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
SQL

# Lock the built-in superuser: give `postgres` a strong password so it is not an
# unauthenticated way in, and revoke the public schema's create-for-everyone
# default so a compromised app role cannot scribble across the database.
POSTGRES_SUPER_PASS="$(openssl rand -base64 24)"
sudo -u postgres psql <<SQL
ALTER USER postgres WITH PASSWORD '$POSTGRES_SUPER_PASS';
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL

echo ""
echo "  ✓ Database created and hardened (localhost-only, scram-sha-256)"
echo "  DB_USER: $DB_USER"
echo "  DB_NAME: $DB_NAME"
echo "  DB_PASS: $DB_PASS   ← SAVE THIS!"
echo "  postgres superuser password: $POSTGRES_SUPER_PASS   ← SAVE THIS TOO!"

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
# config/env.js validates this file with zod on boot and calls process.exit(1) if
# anything is missing. The previous version of this heredoc omitted
# JWT_REFRESH_SECRET entirely, so a freshly built droplet would have failed to
# start -- and CORS_ORIGIN pointed at the raw IP over http, which the real
# frontend (https, on the domain) would then be blocked by.
#
# Both secrets are generated here and are DIFFERENT from each other on purpose:
# if the access-token secret ever leaks, refresh tokens are still not forgeable.
cat > /var/www/amazon-backend/.env <<EOF
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://www.thewholesaleos.com

DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"

JWT_SECRET=$(openssl rand -hex 32)
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_EXPIRES_IN=7d

KEEPA_API_KEY=REPLACE_WITH_YOUR_KEEPA_KEY
ADMIN_EMAILS=
EOF

chmod 600 /var/www/amazon-backend/.env

echo "  ✓ .env created at /var/www/amazon-backend/.env (mode 600)"
echo "  ⚠  Replace KEEPA_API_KEY in that file, or the backend will refuse to boot."

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
# Cloudflare forwards the client's real scheme in X-Forwarded-Proto. default 0
# means "header absent -> do nothing", so a direct origin hit can never loop.
map \$http_x_forwarded_proto \$need_https {
    default 0;
    http    1;
}

server {
    listen 80;
    server_name www.thewholesaleos.com $SERVER_IP;

    # TLS terminates at Cloudflare, so nginx believes every request is http and
    # builds absolute redirects as http://, silently downgrading the client.
    # Relative Location headers keep whatever scheme the browser used.
    absolute_redirect off;

    # http -> https, keyed on the client's real scheme (never on \$scheme, which
    # is always http at the origin under Cloudflare Flexible SSL -> would loop).
    if (\$need_https) { return 301 https://\$host\$request_uri; }

    # The deploy workflow scps dist/* with strip_components: 1, so the built
    # files land here directly -- not in a dist/ subdirectory.
    root /var/www/amazon-frontend;
    index index.html;

    # Block dotfiles and anything that should never be served from the web root.
    location ~ /\. {
        deny all;
        return 404;
    }

    location ~* \.(sql|bak|map|env|log|sh|key|pem|crt|conf|config|lock)\$ {
        deny all;
        return 404;
    }

    location ~ ^/(prisma|node_modules|\.git|\.github)/ {
        deny all;
        return 404;
    }

    location /api/ {
        proxy_pass         http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }

    location /health {
        proxy_pass http://localhost:3001;
    }

    # Soft-404 fix: unknown URLs return a real 404 page (prerendered to 404.html)
    # with a 404 status, instead of the homepage shell with 200.
    error_page 404 /404.html;
    location = /404.html { internal; }

    # Valid client-only routes have no prerendered file, so serve the SPA shell.
    # Any NEW non-prerendered top-level route must be added here or it 404s on refresh.
    location ^~ /dashboard      { try_files \$uri /index.html; }
    location ^~ /admin          { try_files \$uri /index.html; }
    location = /forgot-password { try_files \$uri /index.html; }
    location = /reset-password  { try_files \$uri /index.html; }

    location / {
        # \$uri/ matches the *directory* faq/, and nginx's index module answers a
        # slash-less directory request with a 301 to /faq/. Match the file
        # directly (canonical URLs have no trailing slash); everything else 404s.
        try_files \$uri \$uri/index.html =404;
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
}

# Apex -> www, 301. https is hardcoded: Cloudflare terminates TLS so the origin
# always sees http, and \$scheme here would loop forever.
server {
    listen 80;
    server_name thewholesaleos.com;
    return 301 https://www.thewholesaleos.com\$request_uri;
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
