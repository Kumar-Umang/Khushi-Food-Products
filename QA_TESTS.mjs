import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import worker from './worker.js';

const root = process.cwd();
const read = p => fs.readFileSync(path.join(root,p), 'utf8');

function makeAssets(){
  return { fetch: async req => new Response(`ASSET:${new URL(req.url).pathname}`, {status:200, headers:{'content-type':'text/plain'}}) };
}
function makeDB(){
  const users=[]; const sessions=[]; const kv=new Map(); const payments=new Map();
  let userId=0;
  const db={prepare(sql){
    const op = (...args) => ({
      async first(){
        if(sql.includes('SELECT COUNT(*) AS n FROM users')) return {n:users.length};
        if(sql.includes('SELECT * FROM users WHERE username=?')) return users.find(u=>u.username===args[0])||null;
        if(sql.includes('SELECT * FROM users WHERE id=?')) return users.find(u=>u.id===args[0])||null;
        if(sql.includes('FROM sessions s JOIN users u')) return sessions.find(s=>s.token_hash===args[0] && new Date(s.expires_at)>new Date()) || null;
        if(sql.includes('SELECT data FROM kv_state')) return kv.has(args[0])?{data:kv.get(args[0])}:null;
        if(sql.includes('SELECT order_id,amount,currency,status FROM payment_orders')) return payments.get(args[0])||null;
        return null;
      },
      async run(){
          if(sql.startsWith('INSERT INTO users')){const u={id:++userId,username:args[0],password_hash:args[1],salt:args[2],role:'Admin'};users.push(u);return {meta:{last_row_id:u.id}};}
          if(sql.startsWith('INSERT INTO sessions')){sessions.push({token_hash:args[0],user_id:args[1],expires_at:new Date(Date.now()+7*86400000).toISOString()});return {meta:{}};}
          if(sql.startsWith('DELETE FROM sessions')){for(let i=sessions.length-1;i>=0;i--)if(sessions[i].token_hash===args[0])sessions.splice(i,1);return {meta:{}};}
          if(sql.startsWith('INSERT INTO kv_state')){kv.set(args[0], args[1]);return {meta:{}};}
          if(sql.startsWith('INSERT INTO payment_orders')){payments.set(args[0],{order_id:args[0],amount:args[1],currency:args[2],receipt:args[3],status:'created'});return {meta:{}};}
          if(sql.startsWith('UPDATE payment_orders')){const p=payments.get(args[1]); if(p){p.status='signature_verified';p.payment_id=args[0];} return {meta:{}};}
          if(sql.startsWith('UPDATE users')){const u=users.find(x=>x.id===args[3]); if(u){u.username=args[0];u.password_hash=args[1];u.salt=args[2];} return {meta:{}};}
        return {meta:{}};
      }
    });
    return Object.assign(op(), {bind:(...args)=>op(...args)});
  }};
  return {db,users,payments};
}

async function call(url, init={}, env={}){ return worker.fetch(new Request(url, init), {ASSETS:makeAssets(), ...env}); }

const pkg = read('package.json');
assert.equal(pkg.includes('razorpay'), false, 'Cloudflare Worker must not require Node razorpay SDK');
assert.ok(read('wrangler.jsonc').includes('bbd5dec7-3b41-44bc-9dc0-19aa9248f749'));
assert.ok(read('public/store/index.html').includes('id="productModal"'));
assert.ok(read('public/store/index.html').includes('data-close="productModal"'));
assert.ok(read('public/store/index.html').includes('id="menuBtn"'));
assert.ok(read('public/store/index.html').includes('id="ordersInfo"'));
assert.ok(read('public/store/index.html').includes('data-cat="all"'));
for (const cat of ['best','Namkeen &amp; Snacks','Laddu &amp; Sweets','Traditional Specials','offers']) assert.ok(read('public/store/index.html').includes(`data-cat="${cat}"`));
assert.doesNotMatch(read('public/store/index.html'), /admin|login/i, 'Customer homepage must not expose admin/login text');
assert.ok(read('public/store/app.js').includes('event.key === "Escape"'));
assert.ok(read('public/store/app.js').includes('hideAllOverlays()'));
assert.ok(read('public/store/app.css').includes('position:fixed;top:18px;right:18px'));
assert.ok(read('public/control/index.html').includes('id="u"'));
assert.ok(read('public/stock/index.html').includes('js/app.js'));

for (const host of ['khushifoodproducts.in','controlpanel.khushifoodproducts.in','stockandbilling.khushifoodproducts.in']) {
  const r = await call(`https://${host}/`);
  assert.equal(r.status,200,`${host} root must be reachable`);
  const text=await r.text();
  assert.match(text,/ASSET:\/store\/index\.html/);
}
for (const [host,p] of [['controlpanel.khushifoodproducts.in','/control/'],['stockandbilling.khushifoodproducts.in','/stock/']]) {
  const r=await call(`https://${host}${p}`);
  assert.equal(r.status,200);
}

const {db,payments}=makeDB(); const env={DB:db,ASSETS:makeAssets(),RAZORPAY_KEY_ID:'rzp_test_x',RAZORPAY_KEY_SECRET:'secret',ADMIN_SETUP_TOKEN:'bootstrap'};
let r=await worker.fetch(new Request('https://controlpanel.khushifoodproducts.in/api/setup-status'),env); assert.equal(r.status,200); assert.equal((await r.json()).setupRequired,true);
r=await worker.fetch(new Request('https://controlpanel.khushifoodproducts.in/api/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'Khushbu',password:'password123',setupToken:'wrong'})}),env); assert.equal(r.status,403);
r=await worker.fetch(new Request('https://controlpanel.khushifoodproducts.in/api/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'Khushbu',password:'password123',setupToken:'bootstrap'})}),env); assert.equal(r.status,200);
assert.match(r.headers.get('set-cookie')||'',/umvika_session=/);
r=await worker.fetch(new Request('https://controlpanel.khushifoodproducts.in/api/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'Other',password:'password123',setupToken:'bootstrap'})}),env); assert.equal(r.status,409);
r=await worker.fetch(new Request('https://controlpanel.khushifoodproducts.in/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'Khushbu',password:'bad'})}),env); assert.equal(r.status,401);
r=await worker.fetch(new Request('https://controlpanel.khushifoodproducts.in/api/control'),env); assert.equal(r.status,401);
r=await worker.fetch(new Request('https://controlpanel.khushifoodproducts.in/api/state'),env); assert.equal(r.status,401);
r=await worker.fetch(new Request('https://controlpanel.khushifoodproducts.in/api/invoice',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({bill:{}})}),env); assert.equal(r.status,401);
r=await worker.fetch(new Request('https://controlpanel.khushifoodproducts.in/api/create-order',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({amount:99,currency:'INR'})}),env); assert.equal(r.status,400);
r=await worker.fetch(new Request('https://controlpanel.khushifoodproducts.in/api/verify-payment',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({})}),env); assert.equal(r.status,400);

const oldFetch=globalThis.fetch;
globalThis.fetch=async (u,opts)=> new Response(JSON.stringify({id:'order_test_1',amount:500,currency:'INR',receipt:'umvika_1'}),{status:200,headers:{'content-type':'application/json'}});
r=await worker.fetch(new Request('https://khushifoodproducts.in/api/create-order',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({amount:500,currency:'INR',receipt:'umvika_1'})}),env); assert.equal(r.status,200); assert.equal(payments.get('order_test_1').status,'created');
await import('node:crypto');
const cryptoMod=await import('node:crypto');
const sig=cryptoMod.createHmac('sha256','secret').update('order_test_1|pay_test_1').digest('hex');
r=await worker.fetch(new Request('https://khushifoodproducts.in/api/verify-payment',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({razorpay_order_id:'order_test_1',razorpay_payment_id:'pay_test_1',razorpay_signature:'bad'})}),env); assert.equal(r.status,400); assert.equal(payments.get('order_test_1').status,'created');
r=await worker.fetch(new Request('https://khushifoodproducts.in/api/verify-payment',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({razorpay_order_id:'order_test_1',razorpay_payment_id:'pay_test_1',razorpay_signature:sig})}),env); assert.equal(r.status,200); assert.equal((await r.json()).verified,true); assert.equal(payments.get('order_test_1').status,'signature_verified');
globalThis.fetch=oldFetch;
console.log('ALL QA CHECKS PASSED');
