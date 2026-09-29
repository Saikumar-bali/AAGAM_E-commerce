# Phase 5 — Production Smoke Test Plan

**Date:** 2026-06-29
**Branch:** `phase-5-production-readiness-deployment`

## Smoke Test Scenarios

### 1. Health Endpoint

```bash
# Basic health check
curl -s https://your-api.up.railway.app/health | jq .

# Expected: status "ok", database "ok", redis "ok"
# Failure criteria: status "degraded" or "fail"

# Liveness probe (Kubernetes-style)
curl -s https://your-api.up.railway.app/healthz | jq .

# Expected: status "ok"
```

### 2. Public Endpoints (No Auth Required)

```bash
# Products listing
curl -s https://your-api.up.railway.app/products | jq .

# Categories
curl -s https://your-api.up.railway.app/categories | jq .

# Root endpoint
curl -s https://your-api.up.railway.app/ | jq .

# Expected: 200 OK with valid JSON
```

### 3. Auth Login/Logout (Staging User Only)

```bash
# Login with staging/demo user
curl -s -X POST https://your-api.up.railway.app/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"store@aagam.com","password":"Demo@123"}' \
  -c cookies.txt | jq .

# Expected: 200 OK with user object and Set-Cookie header

# Verify session
curl -s https://your-api.up.railway.app/auth/me \
  -b cookies.txt | jq .

# Expected: 200 OK with user profile

# Logout
curl -s -X POST https://your-api.up.railway.app/auth/logout \
  -b cookies.txt | jq .

# Expected: 200 OK, cookie cleared
```

### 4. Customer Quote (Safe Endpoint)

```bash
# Get product quote (read-only, no order created)
curl -s -X POST https://your-api.up.railway.app/checkout/quote \
  -H "Content-Type: application/json" \
  -d '{"storeId":"test-store-001","items":[{"productId":"test-prod-rice-(1kg)","quantity":1}]}' \
  | jq .

# Expected: 200 OK with pricing breakdown
# NOTE: This is a quote endpoint, not an order creation
```

### 5. Redis Connectivity

```bash
# Already covered in /health endpoint
curl -s https://your-api.up.railway.app/health | jq .checks.redis

# Expected: status "ok", latencyMs < 50
```

### 6. Database Connectivity

```bash
# Already covered in /health endpoint
curl -s https://your-api.up.railway.app/health | jq .checks.database

# Expected: status "ok", latencyMs < 100
```

### 7. Throttler Verification

```bash
# Test rate limiting (should get 429 after 3 requests in 1 minute)
for i in {1..5}; do
  echo "Request $i:"
  curl -s -o /dev/null -w "%{http_code}" \
    -X POST https://your-api.up.railway.app/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
  echo ""
done

# Expected: 401 for wrong credentials, 429 after 3rd request
```

### 8. CORS Verification

```bash
# Test CORS from allowed origin
curl -s -I https://your-api.up.railway.app/health \
  -H "Origin: https://admin.aagam.com" \
  | grep -i "access-control"

# Expected: Access-Control-Allow-Origin header present

# Test CORS from blocked origin
curl -s -I https://your-api.up.railway.app/health \
  -H "Origin: https://evil.com" \
  | grep -i "access-control"

# Expected: No Access-Control-Allow-Origin header
```

## Automated Smoke Test Script

```bash
#!/bin/bash
# run-smoke-tests.sh
set -e

API_URL="${1:-http://localhost:3005}"
echo "Running smoke tests against: $API_URL"

echo "1. Health check..."
curl -sf "$API_URL/health" | jq -e '.status == "ok"' > /dev/null

echo "2. Public products..."
curl -sf "$API_URL/products" | jq -e 'type == "array"' > /dev/null

echo "3. Root endpoint..."
curl -sf "$API_URL/" > /dev/null

echo "All smoke tests passed!"
```

## What We Do NOT Test in Production

- Real customer order creation
- Payment processing
- Rider assignment
- Admin force cancel
- Any write operations that affect real data
- Mobile app deployments
