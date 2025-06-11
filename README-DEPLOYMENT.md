# VPS Deployment Guide for Loan Processing Co-Pilot

## Prerequisites

- VPS with Ubuntu 20.04+ or similar Linux distribution
- At least 2GB RAM and 20GB storage
- Root or sudo access
- Domain name (optional but recommended)

## Quick Deployment

1. **Upload files to your VPS:**
   ```bash
   scp -r . user@your-server-ip:/opt/loan-copilot/
   ssh user@your-server-ip
   cd /opt/loan-copilot
   ```

2. **Make deployment script executable:**
   ```bash
   chmod +x deploy.sh
   ```

3. **Run deployment:**
   ```bash
   ./deploy.sh
   ```

4. **Configure environment variables:**
   Edit the `.env` file with your actual values:
   ```bash
   nano .env
   ```

## Environment Variables Setup

### Required API Keys:

1. **Google OAuth & Drive API:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing
   - Enable Gmail API and Google Drive API
   - Create OAuth 2.0 credentials
   - Add your domain to authorized origins
   - Download service account key JSON

2. **OpenAI API:**
   - Get your API key from [OpenAI Platform](https://platform.openai.com/)

3. **Database:**
   - PostgreSQL will be automatically configured via Docker
   - Set a strong password for POSTGRES_PASSWORD

### Example .env configuration:
```env
DATABASE_URL=postgresql://loanuser:strongpassword123@postgres:5432/loancopilot
POSTGRES_PASSWORD=strongpassword123
GOOGLE_CLIENT_ID=123456789-abcdef.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your_secret_here
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"your-project",...}
OPENAI_API_KEY=sk-your_openai_key_here
```

## SSL Certificate Setup

### Option 1: Let's Encrypt (Recommended for production)
```bash
sudo apt update
sudo apt install certbot
sudo certbot certonly --standalone -d your-domain.com
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ./ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ./ssl/key.pem
```

### Option 2: Self-signed (Development)
The deployment script automatically generates self-signed certificates.

## Managing the Application

### View logs:
```bash
docker-compose logs -f
```

### Restart services:
```bash
docker-compose restart
```

### Update application:
```bash
git pull origin main
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Backup database:
```bash
docker-compose exec postgres pg_dump -U loanuser loancopilot > backup.sql
```

### Restore database:
```bash
docker-compose exec -T postgres psql -U loanuser loancopilot < backup.sql
```

## Firewall Configuration

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

## Domain Configuration

1. Point your domain's A record to your VPS IP
2. Update nginx.conf with your domain name
3. Obtain SSL certificate for your domain
4. Update Google OAuth settings with your domain

## Troubleshooting

### Check service status:
```bash
docker-compose ps
```

### View specific service logs:
```bash
docker-compose logs app
docker-compose logs postgres
docker-compose logs nginx
```

### Test database connection:
```bash
docker-compose exec postgres psql -U loanuser -d loancopilot -c "SELECT version();"
```

### Check if ports are accessible:
```bash
netstat -tlnp | grep :80
netstat -tlnp | grep :443
```

## Performance Optimization

1. **Resource Monitoring:**
   ```bash
   docker stats
   ```

2. **Database Optimization:**
   - Monitor query performance
   - Set up regular backups
   - Configure connection pooling if needed

3. **Log Rotation:**
   ```bash
   sudo nano /etc/docker/daemon.json
   ```
   Add:
   ```json
   {
     "log-driver": "json-file",
     "log-opts": {
       "max-size": "10m",
       "max-file": "3"
     }
   }
   ```

## Security Recommendations

1. Change default passwords
2. Use strong SSL certificates
3. Keep Docker images updated
4. Regular security updates for VPS
5. Implement fail2ban for SSH protection
6. Use a reverse proxy with rate limiting

## Support

- Check logs for error messages
- Ensure all environment variables are set correctly
- Verify API key permissions and quotas
- Test database connectivity

The application will be available at your server's IP address or domain name once deployment is complete.