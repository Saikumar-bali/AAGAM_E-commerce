# 🧠 AAGAM E-Commerce AI Brain

## 🚀 Current State
- **Staging:** GitHub Codespaces configured with PostgreSQL & Redis features.
- **Port Forwarding:** 3001 (Admin - Public), 3005 (API - Private).
- **Automation:** `post-create.sh` handles dependency installation, schema sync, and seeding.
- **Data Persistence:** Support for `data-snapshot.sql` import integrated.

## 🛠️ Recent Tasks
- [x] feat: Codespaces Staging Environment for Client Visibility (#1)

## 📌 Technical Notes
- **Local Data Export:** Use `pg_dump -U postgres -d aagam_ecom --clean --if-exists --no-owner --no-privileges > packages/database/data-snapshot.sql` to capture local state for the client.
- **Codespaces Secrets:** Required keys: `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL`.
