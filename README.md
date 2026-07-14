# AAGAM E-Commerce

Full-stack e-commerce platform with admin dashboard, customer shop, rider portal, store management, and mobile apps.

## Live Demo

**https://aagam.accesscam.org**

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@aagam.com | TestPass123! |
| Customer | customer@aagam.com | TestPass123! |
| Rider | rider1@aagam.com | TestPass123! |
| Store Owner | store@aagam.com | TestPass123! |

## Tech Stack

- **API**: NestJS + Prisma + PostgreSQL + Redis
- **Web**: Next.js 15 + Tailwind CSS
- **Mobile**: React Native (bare workflow)
- **Infra**: VPS (Ubuntu) + nginx + PM2 + Let's Encrypt SSL

## Project Structure

```
├── apps/
│   ├── api-gateway/        # NestJS REST API (port 3005)
│   ├── admin-dashboard/    # Next.js web app (port 3001)
│   ├── mobile-customer/    # React Native customer app
│   ├── mobile-partners/    # React Native rider/store partner app
│   └── worker-service/     # Background job processor
├── packages/
│   ├── database/           # Prisma schema & migrations
│   ├── mobile-shared/      # Shared mobile utilities
│   ├── types/              # Shared TypeScript types
│   └── utils/              # Shared utilities & API client
└── docs/                   # QA evidence & phase docs
```

## Local Development

```bash
# Install dependencies
npm install

# Set up database
cp .env.example .env
# Edit .env with your credentials
npm run db:migrate
npm run db:seed

# Start all services
npm run dev
```

## Production Deployment

See [production/README.md](production/README.md) for VPS setup without Docker.

```bash
# Deploy to VPS
rsync -avz --exclude node_modules --exclude .git ./ user@your-server:/opt/aagam/

# On server
cd /opt/aagam
npm ci --production
npm run build
pm2 restart all
```

## Environment Variables

Copy `.env.example` to `.env` and configure. See [`.env.example`](.env.example) for all required and optional variables.

### Mobile Apps

```bash
cd apps/mobile-customer
cp .env.example .env
# Edit .env with your API URL and Google client IDs
```

## License

Private
