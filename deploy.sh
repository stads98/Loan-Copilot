#!/bin/bash

# VPS Deployment Script for Loan Processing Co-Pilot
echo "Starting deployment process..."

# Check if Docker and Docker Compose are installed
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
fi

if ! command -v docker-compose &> /dev/null; then
    echo "Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

# Create necessary directories
mkdir -p uploads ssl

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
    echo "Please edit .env file with your actual configuration values"
    echo "Required variables:"
    echo "- DATABASE_URL"
    echo "- GOOGLE_CLIENT_ID"
    echo "- GOOGLE_CLIENT_SECRET" 
    echo "- GOOGLE_SERVICE_ACCOUNT_KEY"
    echo "- OPENAI_API_KEY"
    echo "- POSTGRES_PASSWORD"
    read -p "Press enter when .env is configured..."
fi

# Generate SSL certificates (self-signed for development)
if [ ! -f ssl/cert.pem ]; then
    echo "Generating self-signed SSL certificates..."
    openssl req -x509 -newkey rsa:4096 -nodes -out ssl/cert.pem -keyout ssl/key.pem -days 365 -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
fi

# Build and start services
echo "Building and starting services..."
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Wait for services to be ready
echo "Waiting for services to start..."
sleep 30

# Check if services are running
echo "Checking service status..."
docker-compose ps

echo "Deployment complete!"
echo "Application should be available at:"
echo "- HTTP: http://your-server-ip"
echo "- HTTPS: https://your-server-ip"
echo ""
echo "To view logs: docker-compose logs -f"
echo "To stop services: docker-compose down"
echo "To restart: docker-compose restart"