const CART = "umvika_cart_v1";
const PROFILE = "umvika_profile_v1";
const $ = (s) => document.querySelector(s);

let store = { products: [], offers: { global: {} } };
let cart = [];
let currentCat = "all";
let bestOnly = false;
let offersOnly = false;
let searchTerm = "";

try { cart = JSON.parse(localStorage.getItem(CART) || "[]"); } catch { cart = []; }

function money(v) {
  const n = Number(v) || 0;
  return n > 0 ? `₹${n.toFixed(2)}` : "Price not set";
}
function activePrice(p) {
  return Number(p?.offerPrice) > 0 ? Number(p.offerPrice) : Number(p?.price || 0);
}
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}
function saveCart() { localStorage.setItem(CART, JSON.stringify(cart)); }
function toast(message) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(window.__umvikaToast);
  window.__umvikaToast = setTimeout(() => el.classList.add("hidden"), 2200);
}
function showModal(id) { document.getElementById(id)?.classList.remove("hidden"); }
function hideModal(id) { document.getElementById(id)?.classList.add("hidden"); }

async function loadStore() {
  try {
    const r = await fetch("/api/store", { cache: "no-store" });
    if (!r.ok) throw new Error("store API unavailable");
    store = await r.json();
  } catch {
    try {
      const r = await fetch("store-data.json", { cache: "no-store" });
      if (!r.ok) throw new Error("fallback catalog unavailable");
      store = await r.json();
    } catch {
      store = { products: [], offers: { global: {} } };
    }
  }
  render();
}

function categories() {
  return [...new Set((store.products || [])
    .filter(p => p.active !== false)
    .map(p => p.category)
    .filter(Boolean))];
}
function renderCategories() {
  const el = $("#searchCategory");
  if (!el) return;
  el.innerHTML = '<option value="all">All</option>' +
    categories().map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  el.value = categories().includes(currentCat) ? currentCat : "all";
}
function renderOffer() {
  const el = $("#offerBanner");
  const o = store.offers?.global;
  if (!el) return;
  if (o?.enabled && o.text) {
    el.textContent = o.text;
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}
function filteredProducts() {
  let list = (store.products || []).filter(p => p.active !== false);
  if (currentCat !== "all") list = list.filter(p => p.category === currentCat);
  if (bestOnly) list = list.filter(p => p.bestSeller === true);
  if (offersOnly) list = list.filter(p => Number(p.offerPrice) > 0);
  if ($("#availableOnly")?.checked) list = list.filter(p => activePrice(p) > 0);
  if (searchTerm) {
    const q = searchTerm.toLowerCase();
    list = list.filter(p => `${p.name} ${p.category || ""} ${p.pack || ""}`.toLowerCase().includes(q));
  }
  const sort = $("#sort")?.value || "featured";
  if (sort === "low") list.sort((a,b) => activePrice(a) - activePrice(b));
  if (sort === "high") list.sort((a,b) => activePrice(b) - activePrice(a));
  if (sort === "name") list.sort((a,b) => String(a.name).localeCompare(String(b.name)));
  return list;
}
function renderProducts() {
  const grid = $("#grid");
  if (!grid) return;
  const list = filteredProducts();
  grid.innerHTML = list.map(p => {
    const price = activePrice(p);
    const hasOffer = Number(p.offerPrice) > 0 && price > 0;
    return `<article class="card">
      <div class="card-img" data-view="${esc(p.id)}"><img src="${esc(p.image || "assets/logo.png")}" alt="${esc(p.name)}" loading="lazy"></div>
      ${hasOffer ? `<span class="badge">${esc(p.offerLabel || "OFFER")}</span>` : ""}
      <div class="card-body">
        <h3>${esc(p.name)}</h3>
        <div class="pack">${esc(p.pack || "")}</div>
        <div class="price">${money(price)}${Number(p.mrp) > price && price > 0 ? `<span class="mrp">${money(p.mrp)}</span>` : ""}</div>
        ${price > 0
          ? `<div class="card-actions"><button class="add" data-add="${esc(p.id)}">Add to cart</button><button class="buy" data-buy="${esc(p.id)}">Buy now</button></div>`
          : `<div class="unpriced">Price will be updated soon</div>`}
      </div>
    </article>`;
  }).join("");
  $("#empty")?.classList.toggle("hidden", list.length > 0);
  if ($("#resultText")) $("#resultText").textContent = `${list.length} product${list.length === 1 ? "" : "s"}`;
  $("#clearSearch")?.classList.toggle("hidden", !searchTerm);
}
function renderCart() {
  const box = $("#cartItems");
  if (!box) return;
  const validCart = cart.filter(item => store.products.some(p => p.id === item.id));
  cart = validCart;
  if (!cart.length) {
    box.innerHTML = '<p class="muted">Your cart is empty.</p>';
  } else {
    box.innerHTML = cart.map(item => {
      const p = store.products.find(x => x.id === item.id);
      return `<div class="cart-row">
        <img src="${esc(p.image || "assets/logo.png")}" alt="${esc(p.name)}">
        <div><b>${esc(p.name)}</b><div>${money(activePrice(p))}</div>
          <div class="qty"><button data-dec="${esc(p.id)}">−</button><span>${item.qty}</span><button data-inc="${esc(p.id)}">+</button></div>
        </div>
        <button data-remove="${esc(p.id)}" aria-label="Remove">×</button>
      </div>`;
    }).join("");
  }
  const total = cart.reduce((sum, item) => {
    const p = store.products.find(x => x.id === item.id);
    return sum + (p ? activePrice(p) * Number(item.qty) : 0);
  }, 0);
  if ($("#subtotal")) $("#subtotal").textContent = `₹${total.toFixed(2)}`;
  if ($("#cartCount")) $("#cartCount").textContent = cart.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  saveCart();
}
function render() {
  renderCategories();
  renderOffer();
  renderProducts();
  renderCart();
  if ($("#year")) $("#year").textContent = new Date().getFullYear();
}
function addToCart(id, quantity = 1) {
  const product = store.products.find(p => p.id === id);
  if (!product || activePrice(product) <= 0) return toast("Product price is not available yet");
  const existing = cart.find(x => x.id === id);
  if (existing) existing.qty += quantity;
  else cart.push({ id, qty: quantity });
  saveCart();
  renderCart();
  toast(`${product.name} added to cart`);
}
function openProduct(id) {
  const p = store.products.find(x => x.id === id);
  if (!p) return;
  const price = activePrice(p);
  const detail = $("#productDetail");
  if (!detail) return;
  detail.innerHTML = `<div><img src="${esc(p.image || "assets/logo.png")}" alt="${esc(p.name)}"></div>
    <div><span class="section-kicker">${esc(p.category || "PRODUCT")}</span><h2>${esc(p.name)}</h2><p>${esc(p.pack || "")}</p>
    <div class="bigprice">${money(price)}${Number(p.mrp) > price ? ` <span class="mrp">${money(p.mrp)}</span>` : ""}</div>
    <p class="muted">Traditional • Fresh • Wholesome</p>
    ${price > 0 ? `<button class="hero-button" data-add="${esc(p.id)}">Add to cart</button>` : `<div class="unpriced">Price will be updated soon</div>`}</div>`;
  showModal("productModal");
}

function cartTotalPaise() {
  return Math.round(cart.reduce((sum, item) => {
    const p = store.products.find(x => x.id === item.id);
    return sum + (p ? activePrice(p) * Number(item.qty) : 0);
  }, 0) * 100);
}
function showPaymentStatus(title, text) {
  if ($("#paymentStatusTitle")) $("#paymentStatusTitle").textContent = title;
  if ($("#paymentStatusText")) $("#paymentStatusText").textContent = text;
  showModal("paymentStatusModal");
}

async function startRazorpayCheckout() {
  if (!cart.length) return toast("Your cart is empty");
  const amount = cartTotalPaise();
  if (amount < 100) return showPaymentStatus("Minimum payment", "The minimum Razorpay order amount is ₹1.00.");

  const button = $("#checkoutBtn");
  if (button) { button.disabled = true; button.textContent = "Creating secure payment…"; }
  try {
    const orderResponse = await fetch("/api/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, currency: "INR", receipt: `umvika_${Date.now()}` })
    });
    let order = {};
    try { order = await orderResponse.json(); } catch {}
    if (!orderResponse.ok || !order.order_id) throw new Error(order.error || "Unable to create payment order");

    const keyResponse = await fetch("/api/razorpay-key", { cache: "no-store" });
    const keyData = await keyResponse.json();
    if (!keyResponse.ok || !keyData.key_id) throw new Error(keyData.error || "Razorpay is not configured");
    if (typeof window.Razorpay !== "function") throw new Error("Razorpay Checkout could not be loaded");

    let profile = {};
    try { profile = JSON.parse(localStorage.getItem(PROFILE) || "{}"); } catch {}

    const options = {
      key: keyData.key_id,
      order_id: order.order_id,
      amount: order.amount,
      currency: order.currency,
      name: "UMVIKA FOODS",
      description: "Online order",
      image: "/store/assets/logo.png",
      prefill: { name: profile.name || "", email: profile.email || "", contact: profile.mobile || "" },
      theme: { color: "#216b19" },
      handler: async (response) => {
        try {
          const verifyResponse = await fetch("/api/verify-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(response)
          });
          let verification = {};
          try { verification = await verifyResponse.json(); } catch {}
          if (!verifyResponse.ok || !verification.verified) throw new Error(verification.error || "Payment verification failed");
          cart = [];
          saveCart();
          renderCart();
          hideModal("cartDrawer");
          showPaymentStatus("Payment successful", `Your payment was verified successfully. Payment ID: ${response.razorpay_payment_id}`);
        } catch (error) {
          showPaymentStatus("Payment verification failed", error.message || "We could not verify the payment. Please contact support.");
        }
      },
      modal: { ondismiss: () => toast("Payment cancelled") }
    };
    const razorpay = new window.Razorpay(options);
    razorpay.on("payment.failed", (response) => {
      const error = response?.error || {};
      showPaymentStatus("Payment failed", error.description || error.reason || "Razorpay could not complete the payment.");
    });
    razorpay.open();
  } catch (error) {
    showPaymentStatus("Payment error", error.message || "Unable to start payment. Please try again.");
  } finally {
    if (button) { button.disabled = false; button.textContent = "Proceed to checkout"; }
  }
}

function closeAnyOverlay(target) {
  if (target?.classList.contains("modal") || target?.classList.contains("drawer")) target.classList.add("hidden");
}

document.addEventListener("click", (event) => {
  const add = event.target.closest("[data-add]");
  if (add) { addToCart(add.dataset.add); return; }

  const buy = event.target.closest("[data-buy]");
  if (buy) { addToCart(buy.dataset.buy); showModal("cartDrawer"); return; }

  const view = event.target.closest("[data-view]");
  if (view) { openProduct(view.dataset.view); return; }

  const inc = event.target.closest("[data-inc]");
  if (inc) {
    const item = cart.find(x => x.id === inc.dataset.inc);
    if (item) item.qty++;
    renderCart();
    return;
  }

  const dec = event.target.closest("[data-dec]");
  if (dec) {
    const item = cart.find(x => x.id === dec.dataset.dec);
    if (item) item.qty--;
    cart = cart.filter(x => x.qty > 0);
    renderCart();
    return;
  }

  const remove = event.target.closest("[data-remove]");
  if (remove) {
    cart = cart.filter(x => x.id !== remove.dataset.remove);
    renderCart();
    return;
  }

  const close = event.target.closest("[data-close]");
  if (close) { hideModal(close.dataset.close); return; }

  const category = event.target.closest("[data-cat]");
  if (category) {
    const value = category.dataset.cat || "all";
    bestOnly = value === "best";
    offersOnly = value === "offers";
    currentCat = (bestOnly || offersOnly) ? "all" : value;
    document.querySelectorAll("[data-cat]").forEach(el => el.classList.toggle("active", el === category));
    const searchCategory = $("#searchCategory");
    if (searchCategory) searchCategory.value = currentCat;
    renderProducts();
    location.hash = "shop";
    return;
  }

  closeAnyOverlay(event.target);
});

$("#cartBtn")?.addEventListener("click", () => showModal("cartDrawer"));
$("#checkoutBtn")?.addEventListener("click", startRazorpayCheckout);
$("#search")?.addEventListener("input", (e) => { searchTerm = e.target.value.trim(); renderProducts(); });
$("#searchBtn")?.addEventListener("click", () => { searchTerm = $("#search")?.value.trim() || ""; renderProducts(); location.hash = "shop"; });
$("#searchCategory")?.addEventListener("change", (e) => {
  bestOnly = false;
  offersOnly = false;
  currentCat = e.target.value || "all";
  document.querySelectorAll(".filter").forEach(el => el.classList.toggle("active", el.dataset.cat === currentCat));
  renderProducts();
});
$("#sort")?.addEventListener("change", renderProducts);
$("#availableOnly")?.addEventListener("change", renderProducts);
$("#clearSearch")?.addEventListener("click", () => { if ($("#search")) $("#search").value = ""; searchTerm = ""; renderProducts(); });

loadStore();
