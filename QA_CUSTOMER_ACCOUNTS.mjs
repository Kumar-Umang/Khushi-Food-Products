import fs from 'node:fs';
import assert from 'node:assert/strict';

const worker=fs.readFileSync('worker.js','utf8');
const html=fs.readFileSync('public/store/index.html','utf8');
const app=fs.readFileSync('public/store/app.js','utf8');
const schema=fs.readFileSync('schema.sql','utf8');

assert.match(schema,/CREATE TABLE IF NOT EXISTS customer_accounts/);
assert.match(schema,/whatsapp_consent TEXT NOT NULL DEFAULT 'N' CHECK \(whatsapp_consent IN \('Y','N'\)\)/);
assert.match(schema,/email_consent TEXT NOT NULL DEFAULT 'N' CHECK \(email_consent IN \('Y','N'\)\)/);
assert.match(schema,/CREATE TABLE IF NOT EXISTS customer_addresses/);
assert.match(schema,/CREATE TABLE IF NOT EXISTS customer_sessions/);
assert.match(schema,/CREATE TABLE IF NOT EXISTS customer_orders/);
assert.match(schema,/CREATE TABLE IF NOT EXISTS customer_order_items/);
assert.match(schema,/CREATE TABLE IF NOT EXISTS checkout_orders/);

for (const route of ['/api/customer/register','/api/customer/login','/api/customer/session','/api/customer/logout','/api/customer/orders','/api/create-order','/api/verify-payment']) assert.match(worker,new RegExp(route.replaceAll('/','\\/')));
assert.match(worker,/whatsappConsent/);
assert.match(worker,/emailConsent/);
assert.match(worker,/whatsapp_consent/);
assert.match(worker,/email_consent/);
assert.match(worker,/customer_addresses/);
assert.match(worker,/customer_orders/);
assert.match(worker,/customer_order_items/);
assert.match(worker,/delivery_address_line1/);
assert.match(worker,/status='PAID'/);

assert.match(html,/id="registerForm"/);
assert.match(html,/name="whatsappConsent"/);
assert.match(html,/name="emailConsent"/);
assert.match(html,/order tracking and offer updates/);
assert.match(html,/id="customerLoginForm"/);
assert.match(app,/requireCustomerForCheckout/);
assert.match(app,/\/api\/customer\/register/);
assert.match(app,/\/api\/customer\/login/);
assert.match(app,/body\.whatsappConsent=fd\.has\('whatsappConsent'\)\?'Y':'N'/);
assert.match(app,/body\.emailConsent=fd\.has\('emailConsent'\)\?'Y':'N'/);
assert.match(app,/\/api\/create-order/);

console.log('CUSTOMER ACCOUNT/CONSENT QA PASSED');
