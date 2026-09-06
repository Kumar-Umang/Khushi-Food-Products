# UMVIKA FOODS - 3 Subdomain Final QA-Verified Build

## URLs
- Customer: https://khushifoodproducts.in/
- Control Panel homepage: https://controlpanel.khushifoodproducts.in/
- Control Panel login: https://controlpanel.khushifoodproducts.in/control/
- Control Panel first-admin setup: https://controlpanel.khushifoodproducts.in/setup.html
- Stock & Billing homepage: https://stockandbilling.khushifoodproducts.in/
- Stock & Billing login: https://stockandbilling.khushifoodproducts.in/stock/

## Architecture
All three root URLs intentionally render the same UMVIKA FOODS customer storefront. No Login/Admin/Stock links are shown on the storefront. Razorpay checkout is customer-store functionality only. Control Panel and Stock & Billing are protected by application login.

## Development task list and verification
1. Branding: UMVIKA FOODS name/logo replaces the old visible brand; domains remain unchanged.
2. Shared storefront: all three root hosts render the same customer home page.
3. Store interactions: All, Best Sellers, product categories and Offers use JavaScript filtering; search, sort, cart, quantity controls and Buy now work.
4. Product modal: visible fixed close button, backdrop close and Escape close; body scroll lock while open.
5. Mobile layout: header/search/nav/product grid/modal resize without horizontal overflow.
6. Control Panel: /control/ shows login; /api/control and /api/state reject unauthenticated requests.
7. Administrator bootstrap: first setup requires ADMIN_SETUP_TOKEN; after first user, setup permanently rejects additional creation.
8. Credentials: passwords are PBKDF2-hashed; session cookie is HttpOnly/Secure/SameSite.
9. Stock & Billing: /stock/ loads its app and shares the same authentication system.
10. Razorpay: create-order validates INR and minimum 100 paise; verify-payment requires all fields and rejects bad signatures without marking paid. Secret is server-only.
11. D1: DB binding uses bbd5dec7-3b41-44bc-9dc0-19aa9248f749.
12. No default credentials are embedded in the customer page or control-panel login.

## Automated QA
Run: `npm test`
Expected output: `ALL QA CHECKS PASSED`

The QA script validates syntax-level source assumptions, route mapping for all three hosts, authentication protection, one-time bootstrap security, Razorpay validation/signature behavior, required storefront controls, close-button and Escape handlers, and D1 binding configuration.

## Deployment
1. Save Cloudflare secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, ADMIN_SETUP_TOKEN.
2. Ensure D1 schema is applied once: `npx.cmd wrangler d1 execute khushi-food-products-db --remote --file=./schema.sql`
3. Deploy: `npx.cmd wrangler deploy`
4. Test the URLs above in a fresh/private browser session.
