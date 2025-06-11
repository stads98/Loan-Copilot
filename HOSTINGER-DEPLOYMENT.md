# Hostinger VPS Deployment Guide

## Your Server Details
- **IP Address:** 82.25.104.87
- **OS:** Ubuntu 24.04
- **Access:** SSH root access
- **Login Credentials for App:**
  - Username: `stads98@gmail.com`
  - Password: `Adlercapital!!!`

## Step 1: Connect to Your Hostinger VPS

Open terminal and connect:
```bash
ssh root@82.25.104.87
```

Enter your root password when prompted.

## Step 2: Update System and Install Dependencies

```bash
# Update system
apt update && apt upgrade -y

# Install required packages
apt install -y curl wget git nano ufw unzip

# Create application directory
mkdir -p /opt/loan-copilot
cd /opt/loan-copilot
```

## Step 3: Download Your Application Files

**Option A: Download from Replit (Recommended)**
1. In Replit, click the three dots menu → "Download as zip"
2. Extract the zip on your computer
3. Upload to server:

```bash
# From your local computer terminal
scp -r /path/to/extracted/files/* root@82.25.104.87:/opt/loan-copilot/
```

**Option B: Direct download (if you have the files online)**
```bash
# On your server - if you have a download link
wget your-download-link.zip
unzip your-download-link.zip
```

## Step 4: Configure Environment Variables

```bash
cd /opt/loan-copilot
cp .env.example .env
nano .env
```

**Fill in these values in the .env file:**
```env
DATABASE_URL=postgresql://loanuser:SecurePass2024!@postgres:5432/loancopilot
POSTGRES_PASSWORD=SecurePass2024!
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"your_project_id",...}
OPENAI_API_KEY=sk-your_openai_key_here
SESSION_SECRET=your_random_session_secret_here_make_it_long_and_secure
NODE_ENV=production
PORT=5000
```

**To save in nano:** Press `Ctrl+X`, then `Y`, then `Enter`

## Step 5: Get Required API Keys

### Google OAuth Setup:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project: "Loan Copilot Production"
3. Enable APIs:
   - Gmail API
   - Google Drive API
4. Create OAuth 2.0 Client:
   - Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
   - Application type: "Web application"
   - Authorized origins: `https://82.25.104.87`
   - Authorized redirect URIs: `https://82.25.104.87/api/auth/google/callback`
   - Copy Client ID and Secret to .env

### Google Service Account:
1. In Google Cloud Console → "IAM & Admin" → "Service Accounts"
2. Create service account: "loan-copilot-service"
3. Grant roles: "Editor" or specific Drive/Gmail permissions
4. Create and download JSON key
5. Copy entire JSON content to GOOGLE_SERVICE_ACCOUNT_KEY in .env

### OpenAI API Key:
1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Create API key
3. Copy to OPENAI_API_KEY in .env

## Step 6: Run Deployment

```bash
# Make deployment script executable
chmod +x deploy.sh

# Run deployment
./deploy.sh
```

The script will:
- Install Docker and Docker Compose
- Create SSL certificates
- Build and start all services
- Set up the database

**Wait 5-10 minutes for completion.**

## Step 7: Configure Firewall

```bash
# Allow necessary ports
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw enable

# Check firewall status
ufw status
```

## Step 8: Verify Deployment

```bash
# Check if services are running
docker-compose ps

# Should show 3 services: app, postgres, nginx (all "Up")

# Check logs if needed
docker-compose logs app
```

## Step 9: Access Your Application

1. Open web browser
2. Go to: `https://82.25.104.87`
3. Accept SSL certificate warning (click "Advanced" → "Proceed")
4. Login with:
   - Username: `stads98@gmail.com`
   - Password: `Adlercapital!!!`

## Step 10: Optional Domain Setup

If you want to use a custom domain:

1. **Point domain to your server:**
   - In your domain DNS settings, create an A record pointing to `82.25.104.87`

2. **Update nginx configuration:**
   ```bash
   nano nginx.conf
   ```
   Replace `server_name _;` with `server_name yourdomain.com;`

3. **Get SSL certificate:**
   ```bash
   apt install certbot
   certbot certonly --standalone -d yourdomain.com
   cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ./ssl/cert.pem
   cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ./ssl/key.pem
   docker-compose restart nginx
   ```

4. **Update Google OAuth:**
   - Add your domain to authorized origins in Google Cloud Console

## Troubleshooting

**If you can't access the site:**
```bash
# Check if services are running
docker-compose ps

# Check nginx logs
docker-compose logs nginx

# Check if ports are open
netstat -tlnp | grep :80
netstat -tlnp | grep :443
```

**If login doesn't work:**
```bash
# Check app logs
docker-compose logs app

# Restart services
docker-compose restart
```

**If Google services don't work:**
- Verify API keys in .env file
- Check Google Cloud Console for quota limits
- Ensure correct redirect URIs are set

## Maintenance Commands

**View live logs:**
```bash
docker-compose logs -f
```

**Restart application:**
```bash
docker-compose restart app
```

**Update application:**
```bash
# Upload new files, then:
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

**Backup database:**
```bash
docker-compose exec postgres pg_dump -U loanuser loancopilot > backup-$(date +%Y%m%d).sql
```

## Performance Monitoring

```bash
# Check resource usage
docker stats

# Check disk space
df -h

# Check memory usage
free -h
```

Your Loan Processing Co-Pilot will be live at `https://82.25.104.87` once deployment completes!