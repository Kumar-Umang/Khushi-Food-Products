const KEY="khushi_store_v4", CART="khushi_cart_v4", PROFILE="khushi_profile_v4";
const $=s=>document.querySelector(s); let store,cart=JSON.parse(localStorage.getItem(CART)||"[]"), currentCat="all", searchTerm="";
async function load(){try{const r=await fetch("/api/store",{cache:"no-store"});if(!r.ok)throw Error();store=await r.json()}catch(e){try{store=await (await fetch("store-data.json",{cache:"no-store"})).json()}catch(e2){store={products:[],offers:{global:{}}}}} render();}
function money(v){return Number(v)>0?"₹"+Number(v).toFixed(2):"Price not set"}
function activePrice(p){return Number(p.offerPrice)>0?p.offerPrice:p.price}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function cats(){return [...new Set(store.products.filter(p=>p.active!==false).map(p=>p.category).filter(Boolean))]}
function render(){renderCategories();renderOffer();renderProducts();renderCart();const y=$("#year");if(y)y.textContent=new Date().getFullYear()}
function renderCategories(){const c=cats();$("#searchCategory").innerHTML='<option value="all">All</option>'+c.map(x=>`<option>${esc(x)}</option>`).join("")}
function renderOffer(){const o=store.offers?.global;if(o?.enabled&&o.text){$("#offerBanner").textContent=o.text;$("#offerBanner").classList.remove("hidden")}else $("#offerBanner").classList.add("hidden")}
function filtered(){let a=store.products.filter(p=>p.active!==false); if(currentCat!=="all")a=a.filter(p=>p.category===currentCat); if($("#availableOnly")?.checked)a=a.filter(p=>activePrice(p)>0); if(searchTerm)a=a.filter(p=>(p.name+" "+p.category+" "+p.pack).toLowerCase().includes(searchTerm.toLowerCase())); const s=$("#sort")?.value||"featured"; if(s==="low")a.sort((x,y)=>activePrice(x)-activePrice(y)); if(s==="high")a.sort((x,y)=>activePrice(y)-activePrice(x)); if(s==="name")a.sort((x,y)=>x.name.localeCompare(y.name)); return a}
function renderProducts(){const a=filtered();$("#grid").innerHTML=a.map(p=>{const pr=activePrice(p), offer=Number(p.offerPrice)>0; return `<article class="card"><div class="card-img" data-view="${esc(p.id)}"><img src="${esc(p.image||"assets/logo.png")}" alt="${esc(p.name)}"></div>${offer?`<span class="badge">${esc(p.offerLabel||"OFFER")}</span>`:""}<div class="card-body"><h3>${esc(p.name)}</h3><div class="pack">${esc(p.pack||"")}</div><div class="price">${money(pr)}${Number(p.mrp)>pr&&pr>0?`<span class="mrp">${money(p.mrp)}</span>`:""}</div>${pr>0?`<div class="card-actions"><button class="add" data-add="${esc(p.id)}">Add to cart</button><button class="buy" data-buy="${esc(p.id)}">Buy</button></div>`:`<div class="unpriced">Price will be updated soon</div>`}</div></article>`}).join("");$("#empty").classList.toggle("hidden",!a.length);$("#resultText").textContent=`${a.length} product${a.length===1?"":"s"}`;$("#clearSearch").classList.toggle("hidden",!searchTerm)}
function saveCart(){localStorage.setItem(CART,JSON.stringify(cart))}
function add(id,qty=1){const p=store.products.find(x=>x.id===id);if(!p||activePrice(p)<=0)return toast("Product price is not available yet");const x=cart.find(i=>i.id===id);if(x)x.qty+=qty;else cart.push({id,qty});saveCart();renderCart();toast(p.name+" added to cart")}
function renderCart(){const box=$("#cartItems");if(!box)return; if(!cart.length){box.innerHTML='<p class="muted">Your cart is empty.</p>'}else box.innerHTML=cart.map(i=>{const p=store.products.find(x=>x.id===i.id);if(!p)return"";return `<div class="cart-row"><img src="${esc(p.image||"assets/logo.png")}"><div><b>${esc(p.name)}</b><div>${money(activePrice(p))}</div><div class="qty"><button data-dec="${p.id}">−</button><span>${i.qty}</span><button data-inc="${p.id}">+</button></div></div><button data-remove="${p.id}">×</button></div>`}).join("");let total=cart.reduce((s,i)=>{const p=store.products.find(x=>x.id===i.id);return s+(p?activePrice(p)*i.qty:0)},0);$("#subtotal").textContent="₹"+total.toFixed(2);$("#cartCount").textContent=cart.reduce((s,i)=>s+i.qty,0)}
function openProduct(id){const p=store.products.find(x=>x.id===id);if(!p)return;$("#productDetail").innerHTML=`<div><img src="${esc(p.image||"assets/logo.png")}" alt="${esc(p.name)}"></div><div><span class="eyebrow">${esc(p.category||"PRODUCT")}</span><h2>${esc(p.name)}</h2><p>${esc(p.pack||"")}</p><div class="bigprice">${money(activePrice(p))}${Number(p.mrp)>activePrice(p)?` <span class="mrp">${money(p.mrp)}</span>`:""}</div><p class="muted">Pure • Fresh • Wholesome</p>${activePrice(p)>0?`<button class="hero-btn" data-add="${p.id}">Add to cart</button>`:`<div class="unpriced">Price will be updated soon</div>`}</div>`;$("#productModal").classList.remove("hidden")}
function toast(m){$("#toast").textContent=m;$("#toast").classList.remove("hidden");clearTimeout(window.tt);window.tt=setTimeout(()=>$("#toast").classList.add("hidden"),2200)}
document.addEventListener("click",e=>{const a=e.target.closest("[data-add]");if(a){add(a.dataset.add);return}const b=e.target.closest("[data-buy]");if(b){add(b.dataset.buy);$("#cartDrawer").classList.remove("hidden");return}const v=e.target.closest("[data-view]");if(v){openProduct(v.dataset.view);return}const inc=e.target.closest("[data-inc]");if(inc){const x=cart.find(i=>i.id===inc.dataset.inc);if(x)x.qty++;saveCart();renderCart();return}const dec=e.target.closest("[data-dec]");if(dec){const x=cart.find(i=>i.id===dec.dataset.dec);if(x)x.qty--;cart=cart.filter(i=>i.qty>0);saveCart();renderCart();return}const rem=e.target.closest("[data-remove]");if(rem){cart=cart.filter(i=>i.id!==rem.dataset.remove);saveCart();renderCart();return}const close=e.target.closest("[data-close]");if(close){$("#"+close.dataset.close).classList.add("hidden");return}const cat=e.target.closest("[data-cat]");if(cat){currentCat=cat.dataset.cat;document.querySelectorAll(".filter").forEach(x=>x.classList.toggle("active",x.dataset.cat===currentCat));renderProducts();location.hash="shop";return}});
$("#cartBtn").onclick=()=>$("#cartDrawer").classList.remove("hidden");
$("#accountBtn").onclick=()=>{$("#accountModal").classList.remove("hidden");const p=JSON.parse(localStorage.getItem(PROFILE)||"{}");$("#pname").value=p.name||"";$("#pmobile").value=p.mobile||"";$("#pemail").value=p.email||"";$("#paddress").value=p.address||""};
$("#profileForm").onsubmit=e=>{e.preventDefault();localStorage.setItem(PROFILE,JSON.stringify({name:$("#pname").value,mobile:$("#pmobile").value,email:$("#pemail").value,address:$("#paddress").value}));$("#accountModal").classList.add("hidden");toast("Profile saved")};
$("#search").oninput=e=>{searchTerm=e.target.value.trim();renderProducts()};$("#searchBtn").onclick=()=>{searchTerm=$("#search").value.trim();renderProducts();location.hash="shop"};$("#searchCategory").onchange=e=>{currentCat=e.target.value;renderProducts()};$("#sort").onchange=renderProducts;$("#availableOnly").onchange=renderProducts;

function cartTotalPaise(){return Math.round(cart.reduce((s,i)=>{const p=store.products.find(x=>x.id===i.id);return s+(p?Number(activePrice(p))*Number(i.qty):0)},0)*100)}
function paymentStatus(title,text){const t=$("#paymentStatusTitle"),m=$("#paymentStatusText");if(t)t.textContent=title;if(m)m.textContent=text;$("#paymentStatusModal")?.classList.remove("hidden")}
async function startRazorpayCheckout(){
  if(!cart.length)return toast("Your cart is empty");
  const amount=cartTotalPaise();
  if(amount<100)return paymentStatus("Minimum payment","The minimum Razorpay order amount is ₹1.00.");
  const button=$("#checkoutBtn");
  if(button){button.disabled=true;button.textContent="Creating secure payment…"}
  try{
    const r=await fetch("/api/create-order",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({amount,currency:"INR",receipt:`khushi_${Date.now()}`})});
    const order=await r.json();
    if(!r.ok||!order.order_id)throw Error(order.error||"Unable to create payment order");
    const keyResp=await fetch("/api/razorpay-key",{cache:"no-store"});
    const keyData=await keyResp.json();
    if(!keyResp.ok||!keyData.key_id)throw Error(keyData.error||"Razorpay is not configured");
    if(typeof Razorpay!=="function")throw Error("Razorpay Checkout could not be loaded");
    const options={
      key:keyData.key_id,order_id:order.order_id,amount:order.amount,currency:order.currency,
      name:"Khushi Food Products",description:"Online order",image:"/store/assets/logo.png",
      prefill:(()=>{const p=JSON.parse(localStorage.getItem(PROFILE)||"{}");return {name:p.name||"",email:p.email||"",contact:p.mobile||""}})(),
      theme:{color:"#232f3e"},
      handler:async response=>{
        try{
          const vr=await fetch("/api/verify-payment",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(response)});
          const vd=await vr.json();
          if(!vr.ok||!vd.verified)throw Error(vd.error||"Payment verification failed");
          cart=[];saveCart();renderCart();$("#cartDrawer")?.classList.add("hidden");
          paymentStatus("Payment successful","Your payment was verified successfully. Payment ID: "+response.razorpay_payment_id);
        }catch(err){paymentStatus("Payment verification failed",err.message||"We could not verify the payment. Please contact support.")}
      },
      modal:{ondismiss:()=>toast("Payment cancelled")},
    };
    const rz=new Razorpay(options);
    rz.on("payment.failed",response=>{const d=response?.error||{};paymentStatus("Payment failed",d.description||d.reason||"Razorpay could not complete the payment.")});
    rz.open();
  }catch(err){paymentStatus("Payment error",err.message||"Unable to start payment. Please try again.")}
  finally{if(button){button.disabled=false;button.textContent="Proceed to checkout"}}
}
$("#checkoutBtn").onclick=startRazorpayCheckout;
load();
