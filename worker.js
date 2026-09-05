const PUBLIC_HOSTS = new Set(["khushifoodproducts.in", "www.khushifoodproducts.in"]);
const CONTROL_HOSTS = new Set(["controlpanel.khushifoodproducts.in"]);
const STOCK_HOSTS = new Set(["stockandbilling.khushifoodproducts.in"]);
const COOKIE = "khushi_session";
const SESSION_DAYS = 7;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const json = (x, status=200, extra={}) => new Response(JSON.stringify(x), {status, headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...extra}});
const html = (s,status=200) => new Response(s,{status,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});

async function sha256Hex(input){const b=typeof input==="string"?encoder.encode(input):input;const h=await crypto.subtle.digest("SHA-256",b);return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function rand(n=32){const b=new Uint8Array(n);crypto.getRandomValues(b);return [...b].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function hashPassword(password,salt){const key=await crypto.subtle.importKey("raw",encoder.encode(password),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:encoder.encode(salt),iterations:120000,hash:"SHA-256"},key,256);return [...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function parseCookies(request){const out={};for(const p of (request.headers.get("Cookie")||"").split(";")){const i=p.indexOf("=");if(i>0)out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim())}return out}
function setCookie(token){return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS*86400}`}
function clearCookie(){return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`}
async function session(request,env){const t=parseCookies(request)[COOKIE];if(!t)return null;const th=await sha256Hex(t);return env.DB.prepare("SELECT s.user_id,u.username,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>datetime('now')").bind(th).first()}
async function requireAuth(request,env){const s=await session(request,env);return s||false}

const seedCatalog={business:{name:"Khushi Food Products",phone:"+91 80734 55939",gstin:"29AOGPR3564J1ZD",address:"207 Sowparnika Tharangini, Ittangur, Sarjapur, Bangalore - 562125"},offers:{global:{enabled:false,text:""}},products:[
{id:"p1",name:"Chana Makhana Laddu",category:"Laddu & Sweets",pack:"250 g",price:200,mrp:200,offerPrice:0,offerLabel:"",image:"/store/assets/products/ChanaMakhanaLaddu.jpeg",photos:["/store/assets/products/ChanaMakhanaLaddu.jpeg"],active:true},
{id:"p2",name:"Corn Flakes Mixture",category:"Namkeen & Snacks",pack:"200 g",price:0,mrp:0,offerPrice:0,offerLabel:"",image:"/store/assets/products/Cornfloormixture.jpeg",photos:["/store/assets/products/Cornfloormixture.jpeg"],active:true},
{id:"p3",name:"Murmura Laddu",category:"Laddu & Sweets",pack:"",price:0,mrp:0,offerPrice:0,offerLabel:"",image:"/store/assets/products/MurmuraLaddu.jpeg",photos:["/store/assets/products/MurmuraLaddu.jpeg"],active:true},
{id:"p4",name:"Nimki",category:"Namkeen & Snacks",pack:"",price:0,mrp:0,offerPrice:0,offerLabel:"",image:"/store/assets/products/Nimki.jpeg",photos:["/store/assets/products/Nimki.jpeg"],active:true},
{id:"p5",name:"Shakkarpara",category:"Namkeen & Snacks",pack:"",price:0,mrp:0,offerPrice:0,offerLabel:"",image:"/store/assets/products/Shakkarpara.jpeg",photos:["/store/assets/products/Shakkarpara.jpeg"],active:true},
{id:"p6",name:"Thekua",category:"Traditional Specials",pack:"",price:0,mrp:0,offerPrice:0,offerLabel:"",image:"/store/assets/products/Thekua.jpeg",photos:["/store/assets/products/Thekua.jpeg"],active:true}
]};
const emptyBusiness={settings:{business_name:"Khushi Food products",address:"207 Sowparnika Tharangini, Ittangur, Sarjapur",gstin:"29AOGPR3564J1ZD",invoice_prefix:"INV-",whatsapp:{enabled:false,autoInvoice:false,autoPayment:false,phoneNumberId:"",accessToken:"",apiVersion:"v23.0",publicBillBaseUrl:""}},products:[],rawMaterials:[],suppliers:[],customers:[],employees:[],purchases:[],sales:[],production:[],salary:[],expenses:[],stockTx:[],payments:[],salesReturns:[],creditDebitNotes:[]};

async function getKV(env,key,fallback){const r=await env.DB.prepare("SELECT data FROM kv_state WHERE key=?").bind(key).first();if(!r){if(fallback!==undefined)await putKV(env,key,fallback);return fallback}try{return JSON.parse(r.data)}catch{return fallback}}
async function putKV(env,key,value){await env.DB.prepare("INSERT INTO kv_state(key,data,updated_at) VALUES(?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at").bind(key,JSON.stringify(value)).run()}

function hostPage(host){if(CONTROL_HOSTS.has(host))return "/control/index.html";if(STOCK_HOSTS.has(host))return "/stock/index.html";return "/store/index.html"}
async function asset(env,request,path){const u=new URL(request.url);u.pathname=path;return env.ASSETS.fetch(new Request(u,request))}

function unauthorized(){return json({ok:false,error:"Authentication required"},401,{"WWW-Authenticate":"Bearer"})}

async function login(request,env){let b={};try{b=await request.json()}catch{};const username=String(b.username||"").trim();const password=String(b.password||"");if(!username||!password)return json({ok:false,error:"Username and password are required"},400);const u=await env.DB.prepare("SELECT * FROM users WHERE username=?").bind(username).first();if(!u)return json({ok:false,error:"Invalid username or password"},401);const h=await hashPassword(password,u.salt);if(h!==u.password_hash)return json({ok:false,error:"Invalid username or password"},401);const token=rand(32),th=await sha256Hex(token);await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,datetime('now',?))").bind(th,u.id,`+${SESSION_DAYS} days`).run();return json({ok:true,username:u.username,role:u.role},200,{"Set-Cookie":setCookie(token)})}

async function setupStatus(env){const r=await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();return json({setupRequired:Number(r?.n||0)===0})}
async function setup(request,env){const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();if(Number(count?.n||0)>0)return json({ok:false,error:"Administrator already exists"},409);let b={};try{b=await request.json()}catch{};const username=String(b.username||"").trim(),password=String(b.password||"");if(username.length<3||password.length<8)return json({ok:false,error:"Use a username of at least 3 characters and a password of at least 8 characters"},400);const salt=rand(16),ph=await hashPassword(password,salt);const r=await env.DB.prepare("INSERT INTO users(username,password_hash,salt,role) VALUES(?,?,?,'Admin')").bind(username,ph,salt).run();const token=rand(32),th=await sha256Hex(token);await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,datetime('now','+7 days'))").bind(th,r.meta.last_row_id).run();return json({ok:true},200,{"Set-Cookie":setCookie(token)})}

async function changeCredentials(request,env,s){let b={};try{b=await request.json()}catch{};const current=String(b.currentPassword||""),nu=String(b.newUsername||"").trim(),np=String(b.newPassword||"");const u=await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(s.user_id).first();if(!u)return json({ok:false,error:"User not found"},404);if(await hashPassword(current,u.salt)!==u.password_hash)return json({ok:false,error:"Current password is incorrect"},400);if(nu.length<3||np.length<8)return json({ok:false,error:"Username must be at least 3 characters and password at least 8 characters"},400);const salt=rand(16),ph=await hashPassword(np,salt);try{await env.DB.prepare("UPDATE users SET username=?,password_hash=?,salt=? WHERE id=?").bind(nu,ph,salt,s.user_id).run()}catch(e){return json({ok:false,error:"Username may already be in use"},400)}return json({ok:true})}

async function makePdf(bill,env,request){
  const W=595,H=842;let y=800;const ops=[];const esc=s=>String(s??"").replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)").replace(/\r?\n/g," ").replace(/[₹]/g,"Rs.");
  const text=(x,yy,t,size=9,bold=false)=>ops.push(`BT /${bold?"F2":"F1"} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td (${esc(t)}) Tj ET`);
  const line=(a,b,c,d)=>ops.push(`${a} ${b} m ${c} ${d} l S`);
  text(45,y,bill.business_name||"Khushi Food Products",16,true);y-=17;text(45,y,bill.address||"",9);y-=14;text(45,y,"GSTIN: "+(bill.business_gstin||""),9);y=680;
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
  const amount=Number(b.amount),currency=String(b.currency||"INR").toUpperCase(),receipt=String(b.receipt||`khushi_${Date.now()}`).slice(0,40)
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
  if(url.pathname==="/api/create-order"&&request.method==="POST")return createRazorpayOrder(request,env);
  if(url.pathname==="/api/verify-payment"&&request.method==="POST")return verifyRazorpayPayment(request,env);
  if(url.pathname==="/api/store"&&request.method==="GET"){let c=await getKV(env,"store_catalog",seedCatalog);return json(c)}
  if(url.pathname==="/api/change-credentials"&&request.method==="POST"){const s=await requireAuth(request,env);if(!s)return unauthorized();return changeCredentials(request,env,s)}
  if(url.pathname==="/api/control"&&(request.method==="GET"||request.method==="POST")){const s=await requireAuth(request,env);if(!s)return unauthorized();if(request.method==="GET")return json({state:await getKV(env,"store_catalog",seedCatalog),user:{username:s.username,role:s.role}});let b=await request.json();if(!b||!Array.isArray(b.products))return json({ok:false,error:"Invalid catalog"},400);await putKV(env,"store_catalog",b);return json({ok:true})}
  if(url.pathname==="/api/state"&&(request.method==="GET"||request.method==="POST")){const s=await requireAuth(request,env);if(!s)return unauthorized();if(request.method==="GET")return json(await getKV(env,"business_state",emptyBusiness));let b=await request.json();if(!b||typeof b!=="object")return json({ok:false,error:"Invalid state"},400);await putKV(env,"business_state",b);return json({ok:true})}
  if(url.pathname==="/api/backup"&&request.method==="POST"){const s=await requireAuth(request,env);if(!s)return unauthorized();const data=await getKV(env,"business_state",emptyBusiness);await env.DB.prepare("INSERT INTO backups(data) VALUES(?)").bind(JSON.stringify(data)).run();return json({ok:true})}
  if(url.pathname==="/api/invoice"&&request.method==="POST"){const s=await requireAuth(request,env);if(!s)return unauthorized();let x=await request.json();return makePdf(x.bill||{},env,request)}
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
    if(url.pathname==="/"||url.pathname==="/index.html"||url.pathname==="/store"||url.pathname==="/store/"||url.pathname==="/store/index.html") return asset(env,request,"/store/index.html");
    if(url.pathname==="/control"||url.pathname==="/control/"||url.pathname==="/control/login"||url.pathname==="/control/login/") return asset(env,request,"/control/index.html");
    if(url.pathname==="/control/index.html") return asset(env,request,"/control/index.html");
    if(url.pathname==="/setup.html"||url.pathname==="/control/setup.html") return asset(env,request,"/control/setup.html");
    if(url.pathname==="/app.js") return asset(env,request,"/store/app.js");
    if(url.pathname==="/app.css") return asset(env,request,"/store/app.css");
    if(url.pathname.startsWith("/store/")) return asset(env,request,url.pathname);
    if(url.pathname.startsWith("/assets/")) return asset(env,request,"/store"+url.pathname);
    if(url.pathname.startsWith("/control/")) return asset(env,request,url.pathname);
    return asset(env,request,"/store"+url.pathname);
  }

  // Stock-and-billing hostname: the root remains the same customer home page.
  // The protected application is available only at an explicit path.
  if(STOCK_HOSTS.has(host)){
    if(url.pathname==="/"||url.pathname==="/index.html"||url.pathname==="/store"||url.pathname==="/store/"||url.pathname==="/store/index.html") return asset(env,request,"/store/index.html");
    if(url.pathname==="/stock"||url.pathname==="/stock/"||url.pathname==="/stock/login"||url.pathname==="/stock/login/"||url.pathname==="/billing"||url.pathname==="/billing/"||url.pathname==="/billing/login"||url.pathname==="/billing/login/") return asset(env,request,"/stock/index.html");
    if(url.pathname==="/stock/index.html") return asset(env,request,"/stock/index.html");
    if(url.pathname.startsWith("/stock/")) return asset(env,request,url.pathname);
    if(url.pathname==="/app.js") return asset(env,request,"/store/app.js");
    if(url.pathname==="/app.css") return asset(env,request,"/store/app.css");
    if(url.pathname.startsWith("/store/")) return asset(env,request,url.pathname);
    if(url.pathname.startsWith("/assets/")) return asset(env,request,"/store"+url.pathname);
    return asset(env,request,"/store"+url.pathname);
  }

  return new Response("Host not configured",{status:404});
}};
