# Cursor Pagination Demo (test_pagination_sham2) — v2

This demo shows cursor-based pagination with:
- Next / Previous navigation
- pageSize + 1 trick
- Stable sorting by `_id` or `price` (with `_id` tie-breaker)
- Cursor token (base64url) includes: `filter`, `sort`, and tuple anchor `(price,_id)` when sorting by price
- Buttons are hidden at boundaries:
  - Prev hidden at the top
  - Next hidden at the end
  - Between pages, both are shown

## Setup
```bash
npm install
cp .env.example .env
```

## Seed
```bash
npm run seed
```

## Run
```bash
npm start
```
Open http://localhost:3000

## Notes
- Filters are embedded in the cursor so back/forward stays consistent.
- The API performs existence checks around the returned page to decide hasPrevious/hasNext, so the UI can hide buttons correctly.
