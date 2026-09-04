# Khushi Food Products — Cloudflare Customer Website

This package contains the customer-facing online shopping website only.

## Cloudflare deployment
Use a Cloudflare Worker with Static Assets.

- Build command: none
- Deploy command: `npx wrangler deploy`
- Root directory: `/`
- `wrangler.jsonc` is already included.

The customer site is served from `./public`.

## Important
This is the customer frontend. Product data is currently read from `public/store-data.json`, so this deployment is read-only from the website side. The Admin/backend, live orders, payments, shared stock, customer accounts, and WhatsApp automation require the production API/database that will be connected next.

Do not deploy `.git`, secrets, local `server.js`, or local state files.
