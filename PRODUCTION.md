# AAGAM E-commerce Production Deployment

## Quick Start

1. Copy environment template:
```bash
cp .env.production.example .env
```

2. Edit `.env` with your production values:
- DATABASE_URL - Your Supabase PostgreSQL connection string
- JWT_SECRET - Secure random string (min 32 chars)
- SUPABASE_URL - Your Supabase project URL
- SUPABASE_KEY - Your Supabase anon key

3. Deploy with Docker:
```bash
docker-compose up -d --build
```

## Services

| Service | Port | Purpose |
|---------|-----|--------|
| Redis | 6379 | Cache & WebSocket adapter |
| API Gateway | 3000 | REST API & WebSocket |

## Health Checks

- API: http://localhost:3000/health (if configured)
- Redis: `docker exec aagam-redis redis-cli ping`

## Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api-gateway
docker-compose logs -f redis
```

## Troubleshooting

```bash
# Restart services
docker-compose restart

# Rebuild
docker-compose up -d --build --force-recreate

# Stop
docker-compose down
```

## Production Notes

1. **Redis is required** in production (WebSocket scaling)
2. **CORS origins** must be configured via `CORS_ORIGINS` env var
3. **JWT_SECRET** must be secure and consistent across deploys
4. Add monitoring (Prometheus/Grafana) as needed
5. Enable SSL/TLS with a reverse proxy (nginx/Traefik)