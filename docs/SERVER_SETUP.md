# Production Server Setup Guide

Step-by-step setup for deploying this app to a fresh **Ubuntu 24.04 LTS** VDS with
**Nginx + HTTPS (Let's Encrypt) + PostgreSQL + PM2**. Companion to
`PRODUCTION_ROADMAP.md` (the *why*); this doc is the *how*.

> Run every command as written, in order. Replace placeholders in ALL CAPS
> (`YOUR_DOMAIN`, `SERVER_IP`, `DB_PASSWORD`, …) with your real values.

## Target architecture (one box)

```
                    Internet (443/HTTPS)
                          │
                    ┌─────▼─────┐
                    │   Nginx   │  TLS termination (Certbot)
                    └─────┬─────┘
              /api/*      │      everything else
          ┌───────────────┴───────────────┐
   127.0.0.1:3000                   127.0.0.1:3001
   Express (PM2)                    Next.js (PM2)
          │
   127.0.0.1:5432
   PostgreSQL (local only)
```

Everything is **same-origin over HTTPS** (`https://YOUR_DOMAIN` → frontend,
`https://YOUR_DOMAIN/api` → backend). This automatically fixes the two problems you
hit in dev: it's a **secure context** (no more native-form-submit login bug), and
it's **same-origin** (no CORS headaches). Ports 3000/3001/5432 are never exposed.

---

## 1. First connection (SSH)

From your Fedora laptop:

```bash
ssh root@SERVER_IP
# enter the root password your provider gave you
```

If you get a host-key prompt the first time, type `yes`.

---

## 2. Initial hardening (do this before anything else)

### 2.1 Update the system
```bash
apt update && apt upgrade -y
```

### 2.2 Create a non-root sudo user
```bash
adduser deploy                 # set a strong password when prompted
usermod -aG sudo deploy
```

### 2.3 Set up SSH key login (from your LAPTOP, in a new terminal)
```bash
# On your laptop — generate a key if you don't have one:
ssh-keygen -t ed25519 -C "you@example.com"
# Copy it to the server's deploy user:
ssh-copy-id deploy@SERVER_IP
```
Test it: `ssh deploy@SERVER_IP` should log in **without** a password.

### 2.4 Lock down SSH (back on the server, as root)
```bash
nano /etc/ssh/sshd_config
```
Set these lines (uncomment/change):
```
PermitRootLogin no
PasswordAuthentication no
```
Then:
```bash
systemctl restart ssh
```
> ⚠️ Keep your current root session open and confirm `ssh deploy@SERVER_IP` still
> works in another terminal BEFORE closing it — otherwise you can lock yourself out.

### 2.5 Firewall (UFW)
```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'      # opens 80 + 443
ufw enable                  # type y
ufw status
```
Only 22/80/443 are open. 3000/3001/5432 stay internal.

### 2.6 fail2ban (blocks SSH brute-force)
```bash
apt install -y fail2ban
systemctl enable --now fail2ban
```

**From here on, work as the `deploy` user** (`ssh deploy@SERVER_IP`) and prefix
admin commands with `sudo`.

---

## 3. Install the runtime stack

### 3.1 Node.js 22 LTS (NodeSource)
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs build-essential git
node -v && npm -v
```

### 3.2 PM2 (process manager)
```bash
sudo npm install -g pm2
```

### 3.3 Nginx + Certbot
```bash
sudo apt install -y nginx
sudo apt install -y certbot python3-certbot-nginx
```

### 3.4 PostgreSQL
```bash
sudo apt install -y postgresql
sudo systemctl enable --now postgresql
```

---

## 4. Create the database (secure, local-only)

PostgreSQL on Ubuntu listens on `localhost` only by default — good, leave it that way.

```bash
sudo -u postgres psql
```
In the `psql` prompt (use a strong `DB_PASSWORD`):
```sql
CREATE DATABASE dining;
CREATE USER dining_app WITH ENCRYPTED PASSWORD 'DB_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE dining TO dining_app;
\c dining
GRANT ALL ON SCHEMA public TO dining_app;
\q
```
Your connection string will be:
```
postgresql://dining_app:DB_PASSWORD@localhost:5432/dining?schema=public
```

---

## 5. Point your domain at the server

In your domain registrar / DNS panel, create an **A record**:
```
YOUR_DOMAIN     →  SERVER_IP
```
(Optionally `www` too.) Wait for it to resolve: `dig +short YOUR_DOMAIN` should
print `SERVER_IP`. HTTPS in step 9 needs this working first.

---

## 6. Get the code + configure

### 6.1 Clone
```bash
cd ~
git clone git@github.com:erdeemaydin/dining-reservation.git
cd dining-reservation
git checkout main          # production branch
```
> If the server can't use your GitHub SSH key, clone over HTTPS instead:
> `git clone https://github.com/erdeemaydin/dining-reservation.git`

### 6.2 Switch Prisma to PostgreSQL
Edit `prisma/schema.prisma` — the datasource currently hardcodes SQLite. Change it to:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### 6.3 Backend env (`.env` in the repo root)
```bash
cp .env.example .env
nano .env
```
Set at minimum:
```
DATABASE_URL="postgresql://dining_app:DB_PASSWORD@localhost:5432/dining?schema=public"
JWT_SECRET="<paste a long random string>"     # generate: openssl rand -base64 48
SETUP_SECRET_TOKEN="<another long random string>"
PORT=3000
```

### 6.4 Frontend env (`frontend/.env`)
```bash
cp frontend/.env.example frontend/.env
nano frontend/.env
```
Set:
```
NEXT_PUBLIC_API_URL=https://YOUR_DOMAIN/api
```
This is baked in at build time and makes the browser call the API same-origin over
HTTPS (the fix for the login bug).

### 6.5 Install, create schema, build
```bash
# Backend
npm install
npx prisma generate
npx prisma db push          # creates all tables in PostgreSQL from the schema
npm run build               # compiles TS -> dist/

# Frontend
cd frontend
npm install
npm run build               # production build (transpiles for all browsers)
cd ..
```
> **On DB migrations:** `prisma migrate` is flagged as fragile in this repo (shadow-DB
> issue — see `PRODUCTION_ROADMAP.md` §5). `prisma db push` is the reliable way to
> create the schema for the first deploy. Fixing the `migrate deploy` workflow is a
> Phase-2 task before you're doing frequent schema changes in production.

---

## 7. Run both apps with PM2

Create `ecosystem.config.js` in the repo root:
```js
module.exports = {
  apps: [
    {
      name: 'dining-api',
      cwd: '/home/deploy/dining-reservation',
      script: 'dist/server.js',
      exec_mode: 'fork',            // fork (NOT cluster) — the price-updater worker runs in-process; never run >1
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'dining-web',
      cwd: '/home/deploy/dining-reservation/frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      env: { NODE_ENV: 'production' },
    },
  ],
};
```
Start them:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup      # run the command it prints (sets PM2 to start on boot)
pm2 status
```

---

## 8. Bootstrap the first super admin

With the API running, on the server. The JSON field is **`secretToken`** and it must
equal `SETUP_SECRET_TOKEN` in your `.env`. This reads the token straight from `.env`
so you don't mis-paste it — just replace the email/password/name values:
```bash
TOKEN=$(grep '^SETUP_SECRET_TOKEN=' .env | cut -d= -f2- | tr -d '"')
curl -X POST http://127.0.0.1:3000/api/system/setup-super-admin \
  -H "Content-Type: application/json" \
  -d "{\"secretToken\":\"$TOKEN\",\"email\":\"you@YOUR_DOMAIN\",\"password\":\"a-strong-password\",\"firstName\":\"You\",\"lastName\":\"Admin\"}"
```
> If you edited `.env` *after* starting PM2, run `pm2 restart dining-api` first so the
> process picks up the token. A 403 means `secretToken` didn't match `SETUP_SECRET_TOKEN`.

---

## 9. Nginx reverse proxy + HTTPS

Create `/etc/nginx/sites-available/dining`:
```nginx
server {
    server_name YOUR_DOMAIN www.YOUR_DOMAIN;

    client_max_body_size 15M;              # for image uploads

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Uploaded files served by the backend
    location /uploads/ {
        proxy_pass http://127.0.0.1:3000;
    }

    # Everything else -> Next.js
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 80;
}
```
Enable it and get the certificate:
```bash
sudo ln -s /etc/nginx/sites-available/dining /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

# Let's Encrypt — Certbot edits the server block to add HTTPS + auto-redirect:
sudo certbot --nginx -d YOUR_DOMAIN -d www.YOUR_DOMAIN
```
Certbot auto-renews via a systemd timer. Verify: `sudo certbot renew --dry-run`.

Now `https://YOUR_DOMAIN` serves the app over TLS. Log in — it works because it's
now a secure, same-origin HTTPS context.

---

## 10. Backend security hardening (do these once you're live)

These are `PRODUCTION_ROADMAP.md` §10 items — small backend edits:

1. **Restrict CORS** (`src/app.ts`): `app.use(cors({ origin: ['https://YOUR_DOMAIN'], credentials: true }))`.
2. **Rate-limit login** (`express-rate-limit` on `/api/auth/login`).
3. **Re-enable HSTS** — now that you're on HTTPS, helmet's HSTS is correct and desirable (leave it on).
4. Confirm `JWT_SECRET` / `SETUP_SECRET_TOKEN` are long random values, only in `.env` (never committed).

Rebuild + `pm2 reload dining-api` after backend edits.

---

## 11. Backups (don't skip)

Nightly encrypted `pg_dump`, off the box (see roadmap §6 for retention/offsite):
```bash
# ~/backup.sh
pg_dump "postgresql://dining_app:DB_PASSWORD@localhost:5432/dining" \
  | gzip > ~/backups/dining-$(date +\%F).sql.gz
# then push the file to object storage (R2/B2/S3), ideally Turkey-region
```
Cron it:
```bash
mkdir -p ~/backups
crontab -e
# add:
0 3 * * * bash ~/backup.sh
```
**Do a practice restore before launch** — an untested backup isn't a backup.

---

## 12. Deploy an update (the repeatable loop)

```bash
cd ~/dining-reservation
bash ~/backup.sh                 # 1. back up DB first
git pull origin main             # 2. get new code (production branch)

npm install                      # 3. deps (if changed)
npx prisma generate
npx prisma db push               # 4. apply schema changes (review first!)
npm run build                    # 5. backend build

cd frontend && npm install && npm run build && cd ..   # 6. frontend build

pm2 reload ecosystem.config.js   # 7. zero-downtime restart
npm run smoke                    # 8. optional: post-deploy smoke test (set SMOKE_* in .env)
```
If something breaks: `pm2 logs`, and restore the pre-deploy backup if it's a DB issue.

---

## Quick reference

| Thing | Command |
|---|---|
| App logs | `pm2 logs` |
| Restart API | `pm2 reload dining-api` |
| Nginx test/reload | `sudo nginx -t && sudo systemctl reload nginx` |
| DB shell | `sudo -u postgres psql dining` |
| Cert renew test | `sudo certbot renew --dry-run` |
| Firewall status | `sudo ufw status` |
