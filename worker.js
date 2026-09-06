const PUBLIC_HOSTS = new Set(["khushifoodproducts.in", "www.khushifoodproducts.in"]);
const CONTROL_HOSTS = new Set(["controlpanel.khushifoodproducts.in"]);
const STOCK_HOSTS = new Set(["stockandbilling.khushifoodproducts.in"]);
const COOKIE = "umvika_staff_session_v2";
const CUSTOMER_COOKIE = "umvika_customer_session";
const SESSION_DAYS = 7;
const STAFF_COOKIE_DOMAIN = ".khushifoodproducts.in";
const CUSTOMER_SESSION_DAYS = 30;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const json = (x, status=200, extra={}) => new Response(JSON.stringify(x), {status, headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...extra}});
const html = (s,status=200) => new Response(s,{status,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});

async function sha256Hex(input){const b=typeof input==="string"?encoder.encode(input):input;const h=await crypto.subtle.digest("SHA-256",b);return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function rand(n=32){const b=new Uint8Array(n);crypto.getRandomValues(b);return [...b].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function hashPassword(password,salt){const key=await crypto.subtle.importKey("raw",encoder.encode(password),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:encoder.encode(salt),iterations:100000,hash:"SHA-256"},key,256);return [...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function parseCookies(request){const out={};for(const p of (request.headers.get("Cookie")||"").split(";")){const i=p.indexOf("=");if(i>0)out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim())}return out}
function setCookie(token){return `${COOKIE}=${encodeURIComponent(token)}; Domain=${STAFF_COOKIE_DOMAIN}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS*86400}`}
function clearCookie(){return `${COOKIE}=; Domain=${STAFF_COOKIE_DOMAIN}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`}
async function session(request,env){const t=parseCookies(request)[COOKIE];if(!t)return null;const th=await sha256Hex(t);return env.DB.prepare("SELECT s.user_id,u.username,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>datetime('now')").bind(th).first()}
async function requireAuth(request,env){const s=await session(request,env);return s||false}

const ROLE_RULES={
  Admin:{control:true,stock:true,controlWrite:true,stockWrite:true,users:true,backup:true},
  Manager:{control:true,stock:true,controlWrite:true,stockWrite:true,users:false,backup:true},
  ProductManager:{control:true,stock:false,controlWrite:true,stockWrite:false,users:false,backup:false},
  Billing:{control:false,stock:true,controlWrite:false,stockWrite:true,users:false,backup:false},
  Inventory:{control:false,stock:true,controlWrite:false,stockWrite:true,users:false,backup:false},
  Viewer:{control:false,stock:true,controlWrite:false,stockWrite:false,users:false,backup:false}
};
const ROLE_ALLOWED_STATE={
  Admin:null,
  Manager:null,
  Billing:new Set(["customers","sales","payments","salesReturns","creditDebitNotes"]),
  Inventory:new Set(["products","rawMaterials","suppliers","purchases","production","stockTx"]),
  Viewer:new Set()
};
function roleRules(role){return ROLE_RULES[role]||ROLE_RULES.Viewer}
function canRole(role,permission){return !!roleRules(role)[permission]}
function roleDenied(permission){return json({ok:false,error:`Your role does not have ${permission} access`},403)}
async function requirePermission(request,env,permission){const s=await session(request,env);if(!s)return false;return canRole(s.role,permission)?s:false}
function stateChangedKeys(oldState,newState){const keys=new Set();const all=new Set([...Object.keys(oldState||{}),...Object.keys(newState||{})]);for(const k of all){if(JSON.stringify(oldState?.[k])!==JSON.stringify(newState?.[k]))keys.add(k)}return keys}
function roleCanChangeState(role,keys){const allowed=ROLE_ALLOWED_STATE[role];if(allowed===null)return true;for(const k of keys)if(!allowed.has(k))return false;return true}

function setCustomerCookie(token){return `${CUSTOMER_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${CUSTOMER_SESSION_DAYS*86400}`}
function clearCustomerCookie(){return `${CUSTOMER_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`}
async function customerSession(request,env){const t=parseCookies(request)[CUSTOMER_COOKIE];if(!t)return null;const th=await sha256Hex(t);return env.DB.prepare("SELECT s.customer_id,c.full_name,c.mobile,c.email,c.whatsapp_consent,c.email_consent FROM customer_sessions s JOIN customer_accounts c ON c.id=s.customer_id WHERE s.token_hash=? AND s.expires_at>datetime('now') AND c.active='Y'").bind(th).first()}
function normalizeMobile(v){return String(v||'').replace(/\D/g,'').replace(/^91(?=\d{10}$)/,'')}
function validMobile(v){return /^\d{10}$/.test(v)}
function validPincode(v){return /^\d{6}$/.test(String(v||''))}
async function getCustomerWithAddress(env,customerId){return env.DB.prepare(`SELECT c.id,c.full_name,c.mobile,c.email,c.whatsapp_consent,c.email_consent,a.address_line1,a.address_line2,a.landmark,a.city,a.state,a.pincode FROM customer_accounts c LEFT JOIN customer_addresses a ON a.customer_id=c.id AND a.is_default='Y' WHERE c.id=? AND c.active='Y'`).bind(customerId).first()}
async function createCustomerSession(env,customerId){const token=rand(32),th=await sha256Hex(token);await env.DB.prepare("DELETE FROM customer_sessions WHERE customer_id=? OR expires_at<=datetime('now')").bind(customerId).run();await env.DB.prepare("INSERT INTO customer_sessions(token_hash,customer_id,expires_at) VALUES(?,?,datetime('now',?))").bind(th,customerId,`+${CUSTOMER_SESSION_DAYS} days`).run();return token}
async function customerRegister(request,env){
  let b={};try{b=await request.json()}catch{return json({ok:false,error:'Invalid JSON body'},400)}
  const fullName=String(b.fullName||'').trim();const mobile=normalizeMobile(b.mobile);const email=String(b.email||'').trim().toLowerCase();const password=String(b.password||'');const confirm=String(b.confirmPassword||'');
  const address1=String(b.addressLine1||'').trim();const address2=String(b.addressLine2||'').trim();const landmark=String(b.landmark||'').trim();const city=String(b.city||'').trim();const state=String(b.state||'').trim();const pincode=String(b.pincode||'').trim();
  const whatsappConsent=String(b.whatsappConsent||'N').toUpperCase()==='Y'?'Y':'N';const emailConsent=String(b.emailConsent||'N').toUpperCase()==='Y'?'Y':'N';
  if(fullName.length<2)return json({ok:false,error:'Enter your full name'},400);
  if(!validMobile(mobile))return json({ok:false,error:'Enter a valid 10-digit mobile number'},400);
  if(email && !/^\S+@\S+\.\S+$/.test(email))return json({ok:false,error:'Enter a valid email address'},400);
  if(password.length<8)return json({ok:false,error:'Password must be at least 8 characters'},400);
  if(password!==confirm)return json({ok:false,error:'Passwords do not match'},400);
  if(!address1||!city||!state||!validPincode(pincode))return json({ok:false,error:'Complete your delivery address and valid 6-digit pincode'},400);
  if(!email) { /* email consent remains N when no email is provided */ }
  const existing=await env.DB.prepare("SELECT id FROM customer_accounts WHERE mobile=?").bind(mobile).first();
  if(existing)return json({ok:false,error:'An account already exists for this mobile number. Please sign in.'},409);
  const salt=rand(16),ph=await hashPassword(password,salt);
  let r;try{r=await env.DB.prepare("INSERT INTO customer_accounts(full_name,mobile,email,password_hash,salt,whatsapp_consent,email_consent,active) VALUES(?,?,?,?,?,?,?,'Y')").bind(fullName,mobile,email||null,ph,salt,whatsappConsent,email?emailConsent:'N').run();
    const cid=r.meta.last_row_id;
    await env.DB.prepare("INSERT INTO customer_addresses(customer_id,address_line1,address_line2,landmark,city,state,pincode,is_default) VALUES(?,?,?,?,?,?,?,'Y')").bind(cid,address1,address2||null,landmark||null,city,state,pincode).run();
    const token=await createCustomerSession(env,cid);
    return json({ok:true,customer:{id:cid,full_name:fullName,mobile,email},message:'Registration successful'},200,{'Set-Cookie':setCustomerCookie(token)});
  }catch(e){return json({ok:false,error:'Unable to create customer account'},500)}
}
async function customerLogin(request,env){
  let b={};try{b=await request.json()}catch{return json({ok:false,error:'Invalid JSON body'},400)}
  const mobile=normalizeMobile(b.mobile),password=String(b.password||'');if(!validMobile(mobile)||!password)return json({ok:false,error:'Mobile number and password are required'},400);
  const c=await env.DB.prepare("SELECT * FROM customer_accounts WHERE mobile=? AND active='Y'").bind(mobile).first();if(!c)return json({ok:false,error:'Invalid mobile number or password'},401);
  const h=await hashPassword(password,c.salt);if(h!==c.password_hash)return json({ok:false,error:'Invalid mobile number or password'},401);
  const token=await createCustomerSession(env,c.id);return json({ok:true,customer:{id:c.id,full_name:c.full_name,mobile:c.mobile,email:c.email,whatsapp_consent:c.whatsapp_consent,email_consent:c.email_consent}},200,{'Set-Cookie':setCustomerCookie(token)})
}
async function customerMe(request,env){const s=await customerSession(request,env);if(!s)return json({authenticated:false});const c=await getCustomerWithAddress(env,s.customer_id);return json({authenticated:true,customer:c})}
async function customerLogout(request,env){const t=parseCookies(request)[CUSTOMER_COOKIE];if(t)await env.DB.prepare("DELETE FROM customer_sessions WHERE token_hash=?").bind(await sha256Hex(t)).run();return json({ok:true},200,{'Set-Cookie':clearCustomerCookie()})}
async function updateCustomerProfile(request,env,s){
  let b={};try{b=await request.json()}catch{return json({ok:false,error:'Invalid JSON body'},400)}
  const fullName=String(b.fullName||'').trim();const email=String(b.email||'').trim().toLowerCase();const address1=String(b.addressLine1||'').trim();const address2=String(b.addressLine2||'').trim();const landmark=String(b.landmark||'').trim();const city=String(b.city||'').trim();const state=String(b.state||'').trim();const pincode=String(b.pincode||'').trim();const whatsappConsent=String(b.whatsappConsent||'N').toUpperCase()==='Y'?'Y':'N';const emailConsent=String(b.emailConsent||'N').toUpperCase()==='Y'?'Y':'N';
  if(fullName.length<2||!address1||!city||!state||!validPincode(pincode))return json({ok:false,error:'Please complete your name and delivery address'},400);
  if(email && !/^\S+@\S+\.\S+$/.test(email))return json({ok:false,error:'Enter a valid email address'},400);
  await env.DB.prepare("UPDATE customer_accounts SET full_name=?,email=?,whatsapp_consent=?,email_consent=?,updated_at=datetime('now') WHERE id=?").bind(fullName,email||null,whatsappConsent,email?emailConsent:'N',s.customer_id).run();
  const old=await env.DB.prepare("SELECT id FROM customer_addresses WHERE customer_id=? AND is_default='Y'").bind(s.customer_id).first();
  if(old) await env.DB.prepare("UPDATE customer_addresses SET address_line1=?,address_line2=?,landmark=?,city=?,state=?,pincode=?,updated_at=datetime('now') WHERE id=?").bind(address1,address2||null,landmark||null,city,state,pincode,old.id).run();
  else await env.DB.prepare("INSERT INTO customer_addresses(customer_id,address_line1,address_line2,landmark,city,state,pincode,is_default) VALUES(?,?,?,?,?,?,?,'Y')").bind(s.customer_id,address1,address2||null,landmark||null,city,state,pincode).run();
  return customerMe(request,env);
}
async function customerOrders(request,env){const s=await customerSession(request,env);if(!s)return unauthorized();const rows=await env.DB.prepare("SELECT id,order_number,total_amount,currency,status,delivery_city,delivery_state,delivery_pincode,created_at FROM customer_orders WHERE customer_id=? ORDER BY id DESC").bind(s.customer_id).all();return json({orders:rows.results||[]})}
function catalogPriceMap(catalog){const m=new Map();for(const p of (catalog?.products||[])){if(p.active===false)continue;const price=Number(p.offerPrice)>0?Number(p.offerPrice):Number(p.price||0);m.set(String(p.id),{id:String(p.id),name:String(p.name||''),pack:String(p.pack||''),price});}return m}
async function createCustomerRazorpayOrder(request,env){
  const c=await customerSession(request,env);if(!c)return unauthorized();
  let b={};try{b=await request.json()}catch{return json({ok:false,error:'Invalid JSON body'},400)}
  const items=Array.isArray(b.items)?b.items:[];if(!items.length)return json({ok:false,error:'Your cart is empty'},400);
  const customer=await getCustomerWithAddress(env,c.customer_id);if(!customer?.address_line1||!customer?.city||!customer?.state||!customer?.pincode)return json({ok:false,error:'Please complete your delivery address before payment'},400);
  const catalog=await getKV(env,'store_catalog',seedCatalog);const map=catalogPriceMap(catalog);const normalized=[];let subtotal=0;
  for(const i of items){const id=String(i.id||'');const qty=Math.floor(Number(i.qty));const p=map.get(id);if(!p||!Number.isFinite(qty)||qty<1||qty>999)return json({ok:false,error:'Invalid cart item'},400);const line=Math.round(p.price*100)*qty;subtotal+=line;normalized.push({id:p.id,name:p.name,pack:p.pack,price:p.price,qty,line});}
  if(subtotal<100)return json({ok:false,error:'Order total must be at least ₹1.00'},400);
  const orderNo=`UMV-${Date.now()}-${String(Math.floor(Math.random()*1000)).padStart(3,'0')}`;let localOrder;
  try{const r=await env.DB.prepare(`INSERT INTO customer_orders(order_number,customer_id,subtotal,total_amount,currency,status,delivery_name,delivery_mobile,delivery_email,delivery_address_line1,delivery_address_line2,delivery_landmark,delivery_city,delivery_state,delivery_pincode) VALUES(?,?,?,?,?,'PENDING_PAYMENT',?,?,?,?,?,?,?, ?,?)`).bind(orderNo,c.customer_id,subtotal,subtotal,'INR',customer.full_name,customer.mobile,customer.email,customer.address_line1,customer.address_line2,customer.landmark,customer.city,customer.state,customer.pincode).run();localOrder=r.meta.last_row_id;
    for(const i of normalized) await env.DB.prepare("INSERT INTO customer_order_items(customer_order_id,product_id,product_name,pack,unit_price,quantity,line_total) VALUES(?,?,?,?,?,?,?)").bind(localOrder,i.id,i.name,i.pack||null,i.price,i.qty,i.line).run();
  }catch(e){return json({ok:false,error:'Could not create local customer order'},500)}
  const receipt=orderNo.slice(0,40);const payload={amount:subtotal,currency:'INR',receipt};let response;try{response=await fetch('https://api.razorpay.com/v1/orders',{method:'POST',headers:{'Authorization':basicAuth(env.RAZORPAY_KEY_ID,env.RAZORPAY_KEY_SECRET),'Content-Type':'application/json'},body:JSON.stringify(payload)})}catch(e){await env.DB.prepare("UPDATE customer_orders SET status='PAYMENT_INIT_FAILED',updated_at=datetime('now') WHERE id=?").bind(localOrder).run();return json({ok:false,error:'Unable to reach Razorpay'},500)}
  let data={};try{data=await response.json()}catch{}if(response.status===401)return json({ok:false,error:'Razorpay authentication failed'},401);if(!response.ok){await env.DB.prepare("UPDATE customer_orders SET status='PAYMENT_INIT_FAILED',updated_at=datetime('now') WHERE id=?").bind(localOrder).run();return json({ok:false,error:data.error?.description||data.error?.reason||'Razorpay order creation failed'},500)}
  try{await env.DB.prepare("INSERT INTO checkout_orders(razorpay_order_id,customer_order_id,amount,currency,receipt,status) VALUES(?,?,?,?,?,'created')").bind(data.id,localOrder,data.amount,data.currency,data.receipt||receipt).run();return json({ok:true,order_id:data.id,amount:data.amount,currency:data.currency,customer_order_id:localOrder,order_number:orderNo,customer:{full_name:customer.full_name,mobile:customer.mobile,email:customer.email}})}catch(e){return json({ok:false,error:'Razorpay order created but could not be recorded'},500)}
}


function notificationConfig(env){
  return {
    email: Boolean(env.RESEND_API_KEY && (env.ORDER_EMAIL_TO || 'contact@khushifoodproducts.in') && (env.ORDER_EMAIL_FROM || 'UMVIKA FOODS <contact@khushifoodproducts.in>')),
    sms: Boolean(env.MSG91_AUTHKEY && env.MSG91_SMS_TEMPLATE_ID && env.MSG91_SMS_SENDER_ID)
  };
}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function formatOrderEmail(order,items){
  const rows=(items||[]).map(i=>`<tr><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(i.product_name)}</td><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(i.pack||'')}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${Number(i.quantity||0)}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">₹${Number(i.unit_price||0).toFixed(2)}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">₹${(Number(i.line_total||0)/100).toFixed(2)}</td></tr>`).join('');
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#222"><div style="max-width:760px;margin:auto"><h2 style="margin-bottom:4px">UMVIKA FOODS — New Order</h2><p style="margin-top:0;color:#666">Order <strong>${escapeHtml(order.order_number)}</strong> has been paid successfully.</p><table style="border-collapse:collapse;width:100%;margin:18px 0"><tr><td><strong>Customer</strong></td><td>${escapeHtml(order.delivery_name)}</td></tr><tr><td><strong>Mobile</strong></td><td>${escapeHtml(order.delivery_mobile)}</td></tr><tr><td><strong>Email</strong></td><td>${escapeHtml(order.delivery_email||'')}</td></tr><tr><td><strong>Address</strong></td><td>${escapeHtml(order.delivery_address_line1)}${order.delivery_address_line2?', '+escapeHtml(order.delivery_address_line2):''}${order.delivery_landmark?', '+escapeHtml(order.delivery_landmark):''}, ${escapeHtml(order.delivery_city)}, ${escapeHtml(order.delivery_state)} - ${escapeHtml(order.delivery_pincode)}</td></tr></table><h3>Items</h3><table style="border-collapse:collapse;width:100%"><thead><tr><th style="padding:8px;text-align:left;border-bottom:2px solid #333">Product</th><th style="padding:8px;text-align:left;border-bottom:2px solid #333">Pack</th><th style="padding:8px;text-align:center;border-bottom:2px solid #333">Qty</th><th style="padding:8px;text-align:right;border-bottom:2px solid #333">Unit</th><th style="padding:8px;text-align:right;border-bottom:2px solid #333">Amount</th></tr></thead><tbody>${rows}</tbody></table><p style="text-align:right;font-size:18px"><strong>Total: ₹${(Number(order.total_amount||0)/100).toFixed(2)}</strong></p><p><strong>Payment ID:</strong> ${escapeHtml(order.payment_id||'')}</p><p style="color:#666">Please process this order for delivery.</p></div></body></html>`;
}
async function sendOrderEmail(env,order,items){
  if(!env.RESEND_API_KEY)return {ok:false,skipped:true,error:'RESEND_API_KEY is not configured'};
  const to=env.ORDER_EMAIL_TO||'contact@khushifoodproducts.in';
  const from=env.ORDER_EMAIL_FROM||'UMVIKA FOODS <contact@khushifoodproducts.in>';
  const body={from,to:[to],subject:`UMVIKA FOODS - New Order ${order.order_number}`,html:formatOrderEmail(order,items)};
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  let data={};try{data=await r.json()}catch{}
  if(!r.ok)return {ok:false,error:data?.message||data?.name||`Resend HTTP ${r.status}`};
  return {ok:true,id:data?.id||null};
}
async function sendOrderSms(env,order){
  if(!env.MSG91_AUTHKEY||!env.MSG91_SMS_TEMPLATE_ID||!env.MSG91_SMS_SENDER_ID)return {ok:false,skipped:true,error:'MSG91 SMS secrets/config are not configured'};
  const mobiles=`91${String(order.admin_mobile||'8073455939').replace(/\D/g,'').replace(/^91/,'')}`;
  const payload={template_id:env.MSG91_SMS_TEMPLATE_ID,short_url:'0',recipients:[{mobiles,var1:order.order_number,var2:order.delivery_name,var3:String(order.delivery_mobile),var4:`${order.delivery_city} ${order.delivery_pincode}`,var5:`${(Number(order.total_amount||0)/100).toFixed(2)}`}]};
  const r=await fetch('https://control.msg91.com/api/v5/flow',{method:'POST',headers:{accept:'application/json','content-type':'application/json',authkey:env.MSG91_AUTHKEY},body:JSON.stringify(payload)});
  let data={};try{data=await r.json()}catch{}
  if(!r.ok)return {ok:false,error:data?.message||`MSG91 HTTP ${r.status}`};
  return {ok:true,response:data};
}
async function notifyPaidOrder(env,customerOrderId,paymentId){
  const order=await env.DB.prepare(`SELECT o.*, co.payment_id AS checkout_payment_id FROM customer_orders o LEFT JOIN checkout_orders co ON co.customer_order_id=o.id WHERE o.id=?`).bind(customerOrderId).first();
  if(!order)return {email:{ok:false,error:'Order not found'},sms:{ok:false,error:'Order not found'}};
  const items=await env.DB.prepare('SELECT product_name,pack,unit_price,quantity,line_total FROM customer_order_items WHERE customer_order_id=? ORDER BY id').bind(customerOrderId).all();
  const cfg=notificationConfig(env); const results={email:{ok:false,skipped:!cfg.email},sms:{ok:false,skipped:!cfg.sms}};
  const send=async(channel,fn)=>{
    const existing=await env.DB.prepare('SELECT id,status FROM order_notifications WHERE customer_order_id=? AND channel=?').bind(customerOrderId,channel).first();
    if(existing?.status==='SENT') return {ok:true,alreadySent:true};
    try{
      const out=await fn();
      await env.DB.prepare(`INSERT INTO order_notifications(customer_order_id,channel,status,provider_message,error,updated_at) VALUES(?,?,?,?,?,datetime('now')) ON CONFLICT(customer_order_id,channel) DO UPDATE SET status=excluded.status,provider_message=excluded.provider_message,error=excluded.error,updated_at=datetime('now')`).bind(customerOrderId,channel,out.ok?'SENT':'FAILED',JSON.stringify(out).slice(0,2000),out.ok?null:String(out.error||'Unknown notification error')).run();
      return out;
    }catch(e){
      const out={ok:false,error:String(e?.message||e)};
      await env.DB.prepare(`INSERT INTO order_notifications(customer_order_id,channel,status,provider_message,error,updated_at) VALUES(?,?,?,?,?,datetime('now')) ON CONFLICT(customer_order_id,channel) DO UPDATE SET status=excluded.status,provider_message=excluded.provider_message,error=excluded.error,updated_at=datetime('now')`).bind(customerOrderId,channel,'FAILED',null,out.error).run();
      return out;
    }
  };
  if(cfg.email) results.email=await send('EMAIL',()=>sendOrderEmail(env,{...order,payment_id:paymentId},items.results||[]));
  if(cfg.sms) results.sms=await send('SMS',()=>sendOrderSms(env,{...order,payment_id:paymentId,admin_mobile:env.ORDER_SMS_TO||'8073455939'}));
  return results;
}

async function verifyCustomerRazorpayPayment(request,env){
  const c=await customerSession(request,env);if(!c)return unauthorized();if(!razorpayConfigured(env))return json({ok:false,error:'Razorpay is not configured on the server'},500);let b={};try{b=await request.json()}catch{return json({ok:false,error:'Invalid JSON body'},400)}
  const paymentId=String(b.razorpay_payment_id||''),orderId=String(b.razorpay_order_id||''),signature=String(b.razorpay_signature||'');if(!paymentId||!orderId||!signature)return json({ok:false,error:'Payment verification fields are required'},400);
  const local=await env.DB.prepare("SELECT co.razorpay_order_id,co.customer_order_id,co.status,co.amount,co.currency,co.payment_id,co.verified_at,co.customer_order_id AS local_customer_order_id FROM checkout_orders co JOIN customer_orders o ON o.id=co.customer_order_id WHERE co.razorpay_order_id=? AND o.customer_id=?").bind(orderId,c.customer_id).first();if(!local)return json({ok:false,error:'Unknown payment order'},400);
  if(local.status==='signature_verified')return json({ok:true,verified:true,customer_order_id:local.customer_order_id,razorpay_payment_id:local.payment_id});
  const expected=await razorpaySignature(local.razorpay_order_id,paymentId,env.RAZORPAY_KEY_SECRET);if(expected.length!==signature.length)return json({ok:false,error:'Payment signature verification failed'},400);let mismatch=0;for(let i=0;i<expected.length;i++)mismatch|=expected.charCodeAt(i)^signature.charCodeAt(i);if(mismatch!==0)return json({ok:false,error:'Payment signature verification failed'},400);
  await env.DB.prepare("UPDATE checkout_orders SET status='signature_verified',payment_id=?,verified_at=datetime('now') WHERE razorpay_order_id=?").bind(paymentId,orderId).run();await env.DB.prepare("UPDATE customer_orders SET status='PAID',updated_at=datetime('now') WHERE id=?").bind(local.customer_order_id).run();const ord=await env.DB.prepare("SELECT order_number FROM customer_orders WHERE id=?").bind(local.customer_order_id).first();let notifications={email:{ok:false,skipped:true},sms:{ok:false,skipped:true}};try{notifications=await notifyPaidOrder(env,local.customer_order_id,paymentId)}catch(e){notifications={email:{ok:false,error:'Notification processing failed'},sms:{ok:false,error:'Notification processing failed'}}}return json({ok:true,verified:true,customer_order_id:local.customer_order_id,order_number:ord?.order_number||'',razorpay_payment_id:paymentId,notifications})
}

const seedCatalog={business:{name:"UMVIKA FOODS",phone:"+91 80734 55939",gstin:"29AOGPR3564J1ZD",address:"207 Sowparnika Tharangini, Ittangur, Sarjapur, Bangalore - 562125"},offers:{global:{enabled:false,text:""}},products:[
{id:"p1",name:"Chana Makhana Laddu",category:"Laddu & Sweets",pack:"250 g",price:200,mrp:200,offerPrice:0,offerLabel:"",image:"/store/assets/products/ChanaMakhanaLaddu.jpeg",photos:["/store/assets/products/ChanaMakhanaLaddu.jpeg"],active:true},
{id:"p2",name:"Corn Flakes Mixture",category:"Namkeen & Snacks",pack:"200 g",price:0,mrp:0,offerPrice:0,offerLabel:"",image:"/store/assets/products/Cornfloormixture.jpeg",photos:["/store/assets/products/Cornfloormixture.jpeg"],active:true},
{id:"p3",name:"Murmura Laddu",category:"Laddu & Sweets",pack:"",price:0,mrp:0,offerPrice:0,offerLabel:"",image:"/store/assets/products/MurmuraLaddu.jpeg",photos:["/store/assets/products/MurmuraLaddu.jpeg"],active:true},
{id:"p4",name:"Nimki",category:"Namkeen & Snacks",pack:"",price:0,mrp:0,offerPrice:0,offerLabel:"",image:"/store/assets/products/Nimki.jpeg",photos:["/store/assets/products/Nimki.jpeg"],active:true},
{id:"p5",name:"Shakkarpara",category:"Namkeen & Snacks",pack:"",price:0,mrp:0,offerPrice:0,offerLabel:"",image:"/store/assets/products/Shakkarpara.jpeg",photos:["/store/assets/products/Shakkarpara.jpeg"],active:true},
{id:"p6",name:"Thekua",category:"Traditional Specials",pack:"",price:0,mrp:0,offerPrice:0,offerLabel:"",image:"/store/assets/products/Thekua.jpeg",photos:["/store/assets/products/Thekua.jpeg"],active:true}
]};
const emptyBusiness={settings:{business_name:"UMVIKA FOODS",address:"207 Sowparnika Tharangini, Ittangur, Sarjapur",gstin:"29AOGPR3564J1ZD",invoice_prefix:"INV-",whatsapp:{enabled:false,autoInvoice:false,autoPayment:false,phoneNumberId:"",accessToken:"",apiVersion:"v23.0",publicBillBaseUrl:""}},products:[],rawMaterials:[],suppliers:[],customers:[],employees:[],purchases:[],sales:[],production:[],salary:[],expenses:[],stockTx:[],payments:[],salesReturns:[],creditDebitNotes:[]};

async function getKV(env,key,fallback){const r=await env.DB.prepare("SELECT data FROM kv_state WHERE key=?").bind(key).first();if(!r){if(fallback!==undefined)await putKV(env,key,fallback);return fallback}try{return JSON.parse(r.data)}catch{return fallback}}
async function putKV(env,key,value){await env.DB.prepare("INSERT INTO kv_state(key,data,updated_at) VALUES(?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at").bind(key,JSON.stringify(value)).run()}

function hostPage(host){if(CONTROL_HOSTS.has(host))return "/control/index.html";if(STOCK_HOSTS.has(host))return "/stock/index.html";return "/store/index.html"}
async function asset(env,request,path){const u=new URL(request.url);u.pathname=path;return env.ASSETS.fetch(new Request(u,request))}

function unauthorized(){return json({ok:false,error:"Authentication required"},401,{"WWW-Authenticate":"Bearer"})}

async function login(request,env){let b={};try{b=await request.json()}catch{};const username=String(b.username||"").trim();const password=String(b.password||"");if(!username||!password)return json({ok:false,error:"Username and password are required"},400);const u=await env.DB.prepare("SELECT * FROM users WHERE username=?").bind(username).first();if(!u)return json({ok:false,error:"Invalid username or password"},401);const h=await hashPassword(password,u.salt);if(h!==u.password_hash)return json({ok:false,error:"Invalid username or password"},401);const token=rand(32),th=await sha256Hex(token);await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,datetime('now',?))").bind(th,u.id,`+${SESSION_DAYS} days`).run();return json({ok:true,username:u.username,role:u.role},200,{"Set-Cookie":setCookie(token)})}

async function setupStatus(env){const r=await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();return json({setupRequired:Number(r?.n||0)===0})}
async function setup(request,env){const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();if(Number(count?.n||0)>0)return json({ok:false,error:"Administrator setup is already disabled"},409);if(!env.ADMIN_SETUP_TOKEN)return json({ok:false,error:"Administrator setup is not configured on the server"},503);let b={};try{b=await request.json()}catch{return json({ok:false,error:"Invalid JSON body"},400)};const bootstrap=String(b.setupToken||"");if(!bootstrap||bootstrap!==env.ADMIN_SETUP_TOKEN)return json({ok:false,error:"Invalid setup token"},403);const username=String(b.username||"").trim(),password=String(b.password||"");if(username.length<3||password.length<8)return json({ok:false,error:"Use a username of at least 3 characters and a password of at least 8 characters"},400);const salt=rand(16),ph=await hashPassword(password,salt);const r=await env.DB.prepare("INSERT INTO users(username,password_hash,salt,role) VALUES(?,?,?,'Admin')").bind(username,ph,salt).run();const token=rand(32),th=await sha256Hex(token);await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,datetime('now','+7 days'))").bind(th,r.meta.last_row_id).run();return json({ok:true},200,{"Set-Cookie":setCookie(token)})}

async function listUsers(request,env,s){
  if(!canRole(s.role,"users"))return roleDenied("user management");
  const r=await env.DB.prepare("SELECT id,username,role,created_at FROM users ORDER BY id ASC").all();
  return json({ok:true,users:r.results||[]});
}
async function createUser(request,env,s){
  if(!canRole(s.role,"users"))return roleDenied("user management");
  let b={};try{b=await request.json()}catch{return json({ok:false,error:"Invalid JSON body"},400)}
  const username=String(b.username||"").trim(),password=String(b.password||""),role=String(b.role||"").trim();
  if(username.length<3||password.length<8)return json({ok:false,error:"Username must be at least 3 characters and password at least 8 characters"},400);
  if(!ROLE_RULES[role])return json({ok:false,error:"Invalid role"},400);
  if(role==="Admin"&&s.role!=="Admin")return roleDenied("Admin role assignment");
  const exists=await env.DB.prepare("SELECT id FROM users WHERE username=?").bind(username).first();
  if(exists)return json({ok:false,error:"Username already exists"},409);
  const salt=rand(16),ph=await hashPassword(password,salt);
  try{const r=await env.DB.prepare("INSERT INTO users(username,password_hash,salt,role) VALUES(?,?,?,?)").bind(username,ph,salt,role).run();return json({ok:true,user:{id:r.meta.last_row_id,username,role}})}catch(e){return json({ok:false,error:"Unable to create user"},500)}
}
async function updateUserRole(request,env,s,userId){
  if(!canRole(s.role,"users"))return roleDenied("user management");
  const id=Number(userId);if(!Number.isInteger(id)||id<=0)return json({ok:false,error:"Invalid user id"},400);
  let b={};try{b=await request.json()}catch{return json({ok:false,error:"Invalid JSON body"},400)}
  const role=String(b.role||"").trim();if(!ROLE_RULES[role])return json({ok:false,error:"Invalid role"},400);
  const target=await env.DB.prepare("SELECT id,username,role FROM users WHERE id=?").bind(id).first();if(!target)return json({ok:false,error:"User not found"},404);
  if(target.id===s.user_id&&role!=="Admin")return json({ok:false,error:"You cannot remove Admin role from your own account"},400);
  if(role==="Admin"&&s.role!=="Admin")return roleDenied("Admin role assignment");
  await env.DB.prepare("UPDATE users SET role=? WHERE id=?").bind(role,id).run();return json({ok:true,user:{id:target.id,username:target.username,role}});
}
async function deleteUser(request,env,s,userId){
  if(!canRole(s.role,"users"))return roleDenied("user management");
  const id=Number(userId);if(!Number.isInteger(id)||id<=0)return json({ok:false,error:"Invalid user id"},400);
  if(id===s.user_id)return json({ok:false,error:"You cannot delete your own account"},400);
  const target=await env.DB.prepare("SELECT id,username FROM users WHERE id=?").bind(id).first();if(!target)return json({ok:false,error:"User not found"},404);
  await env.DB.prepare("DELETE FROM users WHERE id=?").bind(id).run();return json({ok:true});
}
async function changeCredentials(request,env,s){let b={};try{b=await request.json()}catch{};const current=String(b.currentPassword||""),nu=String(b.newUsername||"").trim(),np=String(b.newPassword||"");const u=await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(s.user_id).first();if(!u)return json({ok:false,error:"User not found"},404);if(await hashPassword(current,u.salt)!==u.password_hash)return json({ok:false,error:"Current password is incorrect"},400);if(nu.length<3||np.length<8)return json({ok:false,error:"Username must be at least 3 characters and password at least 8 characters"},400);const salt=rand(16),ph=await hashPassword(np,salt);try{await env.DB.prepare("UPDATE users SET username=?,password_hash=?,salt=? WHERE id=?").bind(nu,ph,salt,s.user_id).run()}catch(e){return json({ok:false,error:"Username may already be in use"},400)}return json({ok:true})}

async function makePdf(bill,env,request){
  const W=595,H=842;let y=800;const ops=[];const esc=s=>String(s??"").replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)").replace(/\r?\n/g," ").replace(/[₹]/g,"Rs.");
  const text=(x,yy,t,size=9,bold=false)=>ops.push(`BT /${bold?"F2":"F1"} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td (${esc(t)}) Tj ET`);
  const line=(a,b,c,d)=>ops.push(`${a} ${b} m ${c} ${d} l S`);
  text(45,y,bill.business_name||"UMVIKA FOODS",16,true);y-=17;text(45,y,bill.address||"",9);y-=14;text(45,y,"GSTIN: "+(bill.business_gstin||""),9);y=680;
  text(45,y,"TAX INVOICE",15,true);y-=22;line(45,y,550,y);y-=18;text(45,y,"Invoice No: "+(bill.invoiceNo||""),9,true);text(370,y,"Date: "+(bill.date||""),9,true);y-=17;text(45,y,"Customer: "+(bill.customer||""),9,true);y-=14;text(45,y,"Mobile: "+(bill.mobile||""),9);y-=14;text(45,y,"Type: "+(bill.customerType||"retail"),9);y-=14;text(45,y,"Address: "+(bill.address||""),9);y-=14;text(45,y,"GSTIN: "+(bill.gstin||"N/A"),9);y-=22;
  const xs=[45,70,235,285,325,370,420,470,550];line(45,y,550,y);y-=13;["#","Product","HSN","Qty","Type","Rate","MRP","GST","Amount"].forEach((v,i)=>text(xs[i],y,v,7.2,true));y-=8;line(45,y,550,y);y-=15;
  (bill.items||[]).forEach((it,i)=>{const vals=[String(i+1),String(it.description||"").slice(0,26),String(it.hsn||""),String(it.qty||""),String(it.sellType||"retail"),"Rs. "+Number(it.rate||0).toFixed(2),"Rs. "+Number(it.mrp||0).toFixed(2),String(it.gstRate||0)+"%","Rs. "+Number(it.amount||0).toFixed(2)];vals.forEach((v,j)=>text(xs[j],y,v,6.9));y-=18});
  y-=4;line(350,y,550,y);y-=18;text(350,y,"Subtotal: Rs. "+Number(bill.subtotal||0).toFixed(2),9);y-=15;text(350,y,"Discount: Rs. "+Number(bill.discount||0).toFixed(2),9);y-=15;text(350,y,"CGST: Rs. "+Number(bill.cgst||0).toFixed(2),9);y-=15;text(350,y,"SGST: Rs. "+Number(bill.sgst||0).toFixed(2),9);y-=18;text(350,y,"Grand Total: Rs. "+Number(bill.total||0).toFixed(2),11,true);y-=16;text(350,y,"Paid: Rs. "+Number(bill.paidAmount||0).toFixed(2),9);y-=15;text(350,y,"Due: Rs. "+Math.max(0,Number(bill.total||0)-Number(bill.paidAmount||0)-Number(bill.returnedAmount||0)).toFixed(2),9,true);y-=18;text(45,y,"Payment Status: "+(bill.paymentStatus||"Credit"),9,true);y-=18;text(45,y,"Thank you for your business.",9);
  const stream=ops.join("\n");const objs=["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`];
  const page=`<< /Type /Page /Parent 5 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 1 0 R /F2 2 0 R >> >> /Contents 3 0 R >>`;objs.push(page);objs.push("<< /Type /Pages /Kids [4 0 R] /Count 1 >>");objs.push("<< /Type /Catalog /Pages 5 0 R >>");
  let out="%PDF-1.4\n",offs=[0];for(let i=0;i<objs.length;i++){offs.push(encoder.encode(out).length);out+=`${i+1} 0 obj\n${objs[i]}\nendobj\n`}const xref=encoder.encode(out).length;out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`;for(let i=1;i<offs.length;i++)out+=String(offs[i]).padStart(10,"0")+" 00000 n \n";out+=`trailer\n<< /Size ${objs.length+1} /Root 6 0 R >>\nstartxref\n${xref}\n%%EOF`;return new Response(encoder.encode(out),{headers:{"content-type":"application/pdf","content-disposition":`inline; filename="${String(bill.invoiceNo||"invoice").replace(/[^A-Za-z0-9_-]/g,"_")}.pdf"`,"cache-control":"no-store"}})}


function razorpayConfigured(env){return Boolean(env.RAZORPAY_KEY_ID&&env.RAZORPAY_KEY_SECRET)}
function basicAuth(keyId,keySecret){return 'Basic '+btoa(`${keyId}:${keySecret}`)}
function validOrderAmount(amount){return Number.isInteger(amount)&&amount>=100}
async function createRazorpayOrder(request,env){
  if(!razorpayConfigured(env))return json({ok:false,error:"Razorpay is not configured on the server"},500)
  let b={};try{b=await request.json()}catch{return json({ok:false,error:"Invalid JSON body"},400)}
  const amount=Number(b.amount),currency=String(b.currency||"INR").toUpperCase(),receipt=String(b.receipt||`umvika_${Date.now()}`).slice(0,40)
  if(!validOrderAmount(amount))return json({ok:false,error:"Amount must be an integer of at least 100 paise"},400)
  if(currency!=="INR")return json({ok:false,error:"Currency must be INR"},400)
  const payload={amount,currency,receipt}
  let response
  try{
    response=await fetch("https://api.razorpay.com/v1/orders",{method:"POST",headers:{"Authorization":basicAuth(env.RAZORPAY_KEY_ID,env.RAZORPAY_KEY_SECRET),"Content-Type":"application/json"},body:JSON.stringify(payload)})
  }catch(e){return json({ok:false,error:"Unable to reach Razorpay"},500)}
  let data={};try{data=await response.json()}catch{}
  if(response.status===401)return json({ok:false,error:"Razorpay authentication failed"},401)
  if(!response.ok)return json({ok:false,error:data.error?.description||data.error?.reason||"Razorpay order creation failed"},500)
  try{
    await env.DB.prepare("INSERT INTO payment_orders(order_id,amount,currency,receipt,status) VALUES(?,?,?,?, 'created')").bind(data.id,data.amount,data.currency,data.receipt||receipt).run()
  }catch(e){return json({ok:false,error:"Razorpay order was created but could not be recorded locally"},500)}
  return json({ok:true,order_id:data.id,amount:data.amount,currency:data.currency})
}
function hexFromBytes(bytes){return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function razorpaySignature(orderId,paymentId,secret){
  const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"])
  const sig=await crypto.subtle.sign("HMAC",key,encoder.encode(`${orderId}|${paymentId}`))
  return hexFromBytes(sig)
}
async function verifyRazorpayPayment(request,env){
  if(!razorpayConfigured(env))return json({ok:false,error:"Razorpay is not configured on the server"},500)
  let b={};try{b=await request.json()}catch{return json({ok:false,error:"Invalid JSON body"},400)}
  const paymentId=String(b.razorpay_payment_id||""),orderId=String(b.razorpay_order_id||""),signature=String(b.razorpay_signature||"")
  if(!paymentId||!orderId||!signature)return json({ok:false,error:"razorpay_payment_id, razorpay_order_id and razorpay_signature are required"},400)
  const localOrder=await env.DB.prepare("SELECT order_id,amount,currency,status FROM payment_orders WHERE order_id=?").bind(orderId).first()
  if(!localOrder)return json({ok:false,error:"Unknown Razorpay order"},400)
  if(localOrder.status==="signature_verified")return json({ok:true,verified:true,razorpay_payment_id:paymentId,razorpay_order_id:orderId})
  const expected=await razorpaySignature(localOrder.order_id,paymentId,env.RAZORPAY_KEY_SECRET)
  if(expected.length!==signature.length)return json({ok:false,error:"Payment signature verification failed"},400)
  let mismatch=0;for(let i=0;i<expected.length;i++)mismatch|=expected.charCodeAt(i)^signature.charCodeAt(i)
  if(mismatch!==0)return json({ok:false,error:"Payment signature verification failed"},400)
  await env.DB.prepare("UPDATE payment_orders SET status='signature_verified',payment_id=?,verified_at=datetime('now') WHERE order_id=?").bind(paymentId,localOrder.order_id).run()
  return json({ok:true,verified:true,razorpay_payment_id:paymentId,razorpay_order_id:localOrder.order_id})
}

async function api(request,env,url,host){
  if(url.pathname==="/api/setup-status"&&request.method==="GET")return setupStatus(env);
  if(url.pathname==="/api/setup"&&request.method==="POST")return setup(request,env);
  if(url.pathname==="/api/login"&&request.method==="POST")return login(request,env);
  if(url.pathname==="/api/logout"&&request.method==="POST"){const t=parseCookies(request)[COOKIE];if(t)await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256Hex(t)).run();return json({ok:true},200,{"Set-Cookie":clearCookie()})}
  if(url.pathname==="/api/session"&&request.method==="GET"){const s=await session(request,env);return json({authenticated:!!s,user:s?{username:s.username,role:s.role}:null})}
  if(url.pathname==="/api/razorpay-key"&&request.method==="GET")return razorpayConfigured(env)?json({ok:true,key_id:env.RAZORPAY_KEY_ID}):json({ok:false,error:"Razorpay is not configured"},500);
  if(url.pathname==="/api/customer/register"&&request.method==="POST")return customerRegister(request,env);
  if(url.pathname==="/api/customer/login"&&request.method==="POST")return customerLogin(request,env);
  if(url.pathname==="/api/customer/session"&&request.method==="GET")return customerMe(request,env);
  if(url.pathname==="/api/customer/logout"&&request.method==="POST")return customerLogout(request,env);
  if(url.pathname==="/api/customer/profile"&&request.method==="PUT"){const s=await customerSession(request,env);if(!s)return unauthorized();return updateCustomerProfile(request,env,s)}
  if(url.pathname==="/api/customer/orders"&&request.method==="GET")return customerOrders(request,env);
  if(url.pathname==="/api/create-order"&&request.method==="POST")return createCustomerRazorpayOrder(request,env);
  if(url.pathname==="/api/verify-payment"&&request.method==="POST")return verifyCustomerRazorpayPayment(request,env);
  if(url.pathname==="/api/store"&&request.method==="GET"){let c=await getKV(env,"store_catalog",seedCatalog);return json(c)}
  if(url.pathname==="/api/change-credentials"&&request.method==="POST"){const s=await requireAuth(request,env);if(!s)return unauthorized();return changeCredentials(request,env,s)}
  if(url.pathname==="/api/users"&&request.method==="GET"){const s=await requireAuth(request,env);if(!s)return unauthorized();return listUsers(request,env,s)}
  if(url.pathname==="/api/users"&&request.method==="POST"){const s=await requireAuth(request,env);if(!s)return unauthorized();return createUser(request,env,s)}
  if(url.pathname.startsWith("/api/users/")&&request.method==="PUT"){const s=await requireAuth(request,env);if(!s)return unauthorized();return updateUserRole(request,env,s,url.pathname.split("/").pop())}
  if(url.pathname.startsWith("/api/users/")&&request.method==="DELETE"){const s=await requireAuth(request,env);if(!s)return unauthorized();return deleteUser(request,env,s,url.pathname.split("/").pop())}
  if(url.pathname==="/api/control"&&(request.method==="GET"||request.method==="POST")){const s=await requireAuth(request,env);if(!s)return unauthorized();if(!canRole(s.role,request.method==="GET"?"control":"controlWrite"))return roleDenied("control panel");if(request.method==="GET")return json({state:await getKV(env,"store_catalog",seedCatalog),user:{username:s.username,role:s.role}});let b=await request.json();if(!b||!Array.isArray(b.products))return json({ok:false,error:"Invalid catalog"},400);await putKV(env,"store_catalog",b);return json({ok:true})}
  if(url.pathname==="/api/state"&&(request.method==="GET"||request.method==="POST")){const s=await requireAuth(request,env);if(!s)return unauthorized();if(!canRole(s.role,request.method==="GET"?"stock":"stockWrite"))return roleDenied("stock & billing");if(request.method==="GET")return json(await getKV(env,"business_state",emptyBusiness));let b=await request.json();if(!b||typeof b!=="object")return json({ok:false,error:"Invalid state"},400);const old=await getKV(env,"business_state",emptyBusiness);const changed=stateChangedKeys(old,b);if(!roleCanChangeState(s.role,changed))return roleDenied("the requested data");await putKV(env,"business_state",b);return json({ok:true})}
  if(url.pathname==="/api/backup"&&request.method==="POST"){const s=await requireAuth(request,env);if(!s)return unauthorized();if(!canRole(s.role,"backup"))return roleDenied("backup");const data=await getKV(env,"business_state",emptyBusiness);await env.DB.prepare("INSERT INTO backups(data) VALUES(?)").bind(JSON.stringify(data)).run();return json({ok:true})}
  if(url.pathname==="/api/invoice"&&request.method==="POST"){const s=await requireAuth(request,env);if(!s)return unauthorized();if(!canRole(s.role,"stockWrite"))return roleDenied("invoice");let x=await request.json();return makePdf(x.bill||{},env,request)}
  return json({ok:false,error:"Not found"},404)
}

export default {async fetch(request,env){
  const url=new URL(request.url);
  const host=url.hostname;

  if(url.pathname.startsWith("/api/")) return api(request,env,url,host);
  if(host==="www.khushifoodproducts.in"&&url.pathname==="/") return Response.redirect("https://khushifoodproducts.in/",301);

  // Public/customer home is available at / on all configured hostnames.
  // /store/* is also supported so direct navigation does not break relative assets/scripts.
  if(PUBLIC_HOSTS.has(host)){
    if(url.pathname==="/"||url.pathname==="/index.html"||url.pathname==="/store"||url.pathname==="/store/"||url.pathname==="/store/index.html") return asset(env,request,"/store/index.html");
    if(url.pathname==="/app.js") return asset(env,request,"/store/app.js");
    if(url.pathname==="/app.css") return asset(env,request,"/store/app.css");
    if(url.pathname.startsWith("/store/")) return asset(env,request,url.pathname);
    if(url.pathname.startsWith("/assets/")) return asset(env,request,"/store"+url.pathname);
    return asset(env,request,"/store"+url.pathname);
  }

  // Control-panel hostname: the root remains the same customer home page.
  // The protected application is available only at an explicit path.
  if(CONTROL_HOSTS.has(host)){
    if(url.pathname==="/"||url.pathname==="/index.html") return asset(env,request,"/store/index.html");
    if(url.pathname==="/store"||url.pathname==="/store/"||url.pathname==="/store/index.html") return asset(env,request,"/control/index.html");
    if(url.pathname==="/login"||url.pathname==="/admin"||url.pathname==="/admin/"||url.pathname==="/control/login"||url.pathname==="/control/login/") return Response.redirect(new URL("/control/",request.url),302);
    if(url.pathname==="/control"||url.pathname==="/control/"||url.pathname==="/control/index.html") return asset(env,request,"/control/index.html");
    if(url.pathname==="/setup.html"||url.pathname==="/control/setup.html") return asset(env,request,"/control/setup.html");
    if(url.pathname==="/app.js") return asset(env,request,"/store/app.js");
    if(url.pathname==="/app.css") return asset(env,request,"/store/app.css");
    if(url.pathname.startsWith("/control/")) return asset(env,request,url.pathname);
    if(url.pathname.startsWith("/store/")) return asset(env,request,url.pathname);
    if(url.pathname.startsWith("/assets/")) return asset(env,request,"/store"+url.pathname);
    return asset(env,request,"/store"+url.pathname);
  }

  // Stock-and-billing hostname: the root remains the same customer home page.
  // The protected application is available only at an explicit path.
  if(STOCK_HOSTS.has(host)){
    if(url.pathname==="/"||url.pathname==="/index.html") return asset(env,request,"/store/index.html");
    if(url.pathname==="/store"||url.pathname==="/store/"||url.pathname==="/store/index.html") return asset(env,request,"/stock/index.html");
    if(url.pathname==="/login"||url.pathname==="/billing"||url.pathname==="/billing/"||url.pathname==="/billing/login"||url.pathname==="/billing/login/") return Response.redirect(new URL("/stock/",request.url),302);
    if(url.pathname==="/stock"||url.pathname==="/stock/"||url.pathname==="/stock/login"||url.pathname==="/stock/login/"||url.pathname==="/stock/index.html") return asset(env,request,"/stock/index.html");
    if(url.pathname.startsWith("/stock/")) return asset(env,request,url.pathname);
    if(url.pathname==="/app.js") return asset(env,request,"/store/app.js");
    if(url.pathname==="/app.css") return asset(env,request,"/store/app.css");
    if(url.pathname==="/store/css/app.css") return asset(env,request,"/stock/css/app.css");
    if(url.pathname==="/store/js/app.js") return asset(env,request,"/stock/js/app.js");
    if(url.pathname.startsWith("/assets/")) return asset(env,request,"/store"+url.pathname);
    if(url.pathname.startsWith("/store/")) return asset(env,request,url.pathname);
    return asset(env,request,"/store"+url.pathname);
  }

  return new Response("Host not configured",{status:404});
}};
