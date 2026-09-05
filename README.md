# Khushi Food Products — 3 Subdomain Production Starter + Razorpay

## Final URLs
- Customer store: https://khushifoodproducts.in/
- Control panel: https://controlpanel.khushifoodproducts.in/
- Stock & billing: https://stockandbilling.khushifoodproducts.in/

The same Cloudflare Worker serves the three hostnames, with Cloudflare D1 used for shared data and login sessions.

## Razorpay Standard Web Checkout
The customer store now includes Razorpay Standard Checkout in Test Mode.

Flow:
1. Customer clicks **Proceed to checkout**.
2. Store calls `POST /api/create-order`.
3. Worker creates a Razorpay Order through `https://api.razorpay.com/v1/orders` using the server-side key secret.
4. Razorpay Checkout opens with the returned `order_id`.
5. On successful authorization, the browser sends `razorpay_payment_id`, `razorpay_order_id` and `razorpay_signature` to `POST /api/verify-payment`.
6. Worker verifies the HMAC-SHA256 signature server-side and only then returns `verified: true`.
7. Created payment orders are recorded in the existing D1 database in `payment_orders` so signature verification uses the server-recorded order ID.

Razorpay requires server-side order creation and server-side signature verification for Standard Checkout. citeturn0search0turn0search2

### Environment variables
The package contains a local `.env` file with the Test Mode credentials supplied for this integration. `.env` is ignored by Git.

For Cloudflare production, set the credentials as Worker secrets instead of relying on `.env`:

```bash
npx wrangler secret put RAZORPAY_KEY_ID
npx wrangler secret put RAZORPAY_KEY_SECRET
```

Enter the corresponding values when Wrangler prompts you. Never commit `.env` or the key secret.

A safe template is provided as `.env.example`.

### Why the Razorpay npm SDK is not bundled
This project is a Cloudflare Worker, not a conventional Node.js server. The Worker uses the Razorpay REST API with `fetch()` and Web Crypto HMAC-SHA256. This avoids Node-only runtime dependencies while implementing the same Razorpay Standard Checkout flow.

## Cloudflare setup
This package uses Custom Domains because the Worker is the origin for each hostname. Cloudflare can create the DNS records and certificates for Custom Domains.

### 1. Install/login to Wrangler
```bash
npm install -g wrangler
wrangler login
```

### 2. Create the D1 database
From this folder:
```bash
npx wrangler d1 create khushi-food-products-db
```
If Wrangler gives you a database ID, add that ID to `wrangler.jsonc` as `database_id` under the DB binding.

### 3. Apply the schema
After the database ID is in `wrangler.jsonc`:
```bash
npx wrangler d1 execute khushi-food-products-db --remote --file=./schema.sql
```

This creates the existing application tables plus `payment_orders` for Razorpay order/signature tracking.

### 4. Configure Razorpay secrets
```bash
npx wrangler secret put RAZORPAY_KEY_ID
npx wrangler secret put RAZORPAY_KEY_SECRET
```
Use the Test Mode values supplied for this build.

### 5. Deploy
```bash
npx wrangler deploy
```

### 6. Create your administrator
Open:
https://controlpanel.khushifoodproducts.in/setup.html

Choose your own username and password. Do not put these credentials in source code or Git.

## Test the payment flow
1. Open `https://khushifoodproducts.in/`.
2. Add a product that has a price greater than ₹0.
3. Open **Cart**.
4. Click **Proceed to checkout**.
5. Razorpay Standard Checkout should open.
6. Use Razorpay's Test Mode payment credentials/test cards from the Razorpay Dashboard/docs.
7. After successful authorization, the site calls `/api/verify-payment`.
8. The success screen appears only when the server-side signature matches.

Razorpay's documentation recommends testing the full flow in Test Mode before switching to Live Mode. citeturn0search0turn0search3

## API endpoints added
- `GET /api/razorpay-key` — returns only the public Key ID; never the secret.
- `POST /api/create-order` — validates amount >= 100 paise and creates a Razorpay order.
- `POST /api/verify-payment` — validates required fields and verifies HMAC-SHA256.

## Security behaviour
- `RAZORPAY_KEY_SECRET` is server-side only.
- The frontend receives only `RAZORPAY_KEY_ID`.
- Invalid/missing verification fields return HTTP 400.
- Signature mismatch returns HTTP 400 and does not mark the payment as verified.
- Razorpay authentication failures return HTTP 401.
- Other Razorpay order-creation failures return HTTP 500.
- No payment is treated as verified merely because the browser reports success.

## Existing application features
- Public Amazon-style storefront using the supplied logo and six supplied product images.
- Central product catalog shared by storefront and control panel.
- Product add/edit/delete/discontinue.
- Retail price / MRP and offer price / label.
- 0–5 product photos.
- Store-wide offer banner.
- Control-panel credential change.
- Stock & billing UI based on the existing bill-book module.
- Central business state in D1 for stock, customers, sales, purchases, production, salary, expenses, returns, notes and reports.
- Invoice endpoint returns a real PDF response.


## Final hostname behavior

All three hostnames intentionally serve the same customer home page at `/` and the home page contains no Admin/Login links.

- `khushifoodproducts.in/` -> customer home + shopping + Razorpay
- `controlpanel.khushifoodproducts.in/` -> same customer home
- `stockandbilling.khushifoodproducts.in/` -> same customer home
- `controlpanel.khushifoodproducts.in/control/` -> protected Control Panel login
- `controlpanel.khushifoodproducts.in/setup.html` -> first-time administrator setup
- `stockandbilling.khushifoodproducts.in/stock/` -> protected Stock & Billing login

Razorpay is used only by the customer store checkout.

## Customer Home Page
All three configured hostnames intentionally serve the same Amazon.in-inspired customer home page at `/` with no Login/Admin/Stock links visible on the home page. Protected applications remain at `/control/` and `/stock/` on their respective subdomains.


## Correct routing and protected paths

All three hostnames serve the same Amazon.in-inspired customer home page at `/`. The home page intentionally has no Admin/Login/Stock links.

Protected applications are entered directly by URL:
- Control Panel: `https://controlpanel.khushifoodproducts.in/control/`
- First-time setup: `https://controlpanel.khushifoodproducts.in/setup.html`
- Stock & Billing: `https://stockandbilling.khushifoodproducts.in/stock/`
- Stock & Billing alias: `https://stockandbilling.khushifoodproducts.in/billing/`

The Worker explicitly supports `/store/*` as well as `/` so opening `/store/` does not turn into a broken static copy whose JavaScript and CSS fail to load.
