const CART_KEY = "kc-cart";
const PRINT_PRICE = 149;
const BADGES = {
  none: { label: "Ingen", price: 0 },
  liga: { label: "Liga-badge", price: 79 },
  captain: { label: "Kaptajn", price: 49 }
};

function money(n) {
  return new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(n) + " kr";
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function norm(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}
function blob(p) {
  return norm([p.name, p.league, p.season, p.cut, p.line, p.story, ...p.suggestions.flat()].join(" "));
}
function cleanName(v) {
  return String(v).replace(/[^\p{L}\p{M} '.\-]/gu, "").slice(0, 12);
}
function cleanNum(v) {
  return String(v).replace(/\D/g, "").slice(0, 2);
}
function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch { return []; }
}
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const SHIELD = `<svg class="shield" viewBox="0 0 40 46" aria-hidden="true"><path d="M20 2 L36 8 V22 C36 33 20 43 20 43 C20 43 4 33 4 22 V8 Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 14 l2.2 4.6 5 .7-3.6 3.5.9 5L20 25.4 15.5 27.8l.9-5L12.8 19.3l5-.7z" fill="currentColor"/></svg>`;
const CAPTAIN = `<span class="captain" aria-hidden="true">C</span>`;

function paintPrint(layer, { name, number, badge, color, shadow, top, off }) {
  if (!layer) return;
  const stage = layer.closest(".stage");
  if (stage) {
    if (color) stage.style.setProperty("--print", color);
    if (shadow) stage.style.setProperty("--print-shadow", shadow);
    if (top) stage.style.setProperty("--print-top", top);
  }
  layer.classList.toggle("is-off", !!off);
  const nameEl = layer.querySelector(".print-name");
  const numEl = layer.querySelector(".print-num");
  const badgeEl = layer.querySelector(".print-badge");
  const shown = (name || "").trim();
  nameEl.textContent = shown || "Navn";
  nameEl.classList.toggle("is-ghost", !shown);
  const n = (shown || "NAVN").length;
  nameEl.style.fontSize = Math.max(3.1, Math.min(5.5, 40 / n)) + "cqw";
  nameEl.style.letterSpacing = (n > 9 ? 0.06 : 0.14) + "em";
  const num = number || "";
  numEl.textContent = num || "00";
  numEl.classList.toggle("is-ghost", !num);
  numEl.style.fontSize = (num.length <= 1 ? 22 : 18) + "cqw";
  if (badgeEl) {
    if (!badge || badge === "none" || off) badgeEl.innerHTML = "";
    else badgeEl.innerHTML = badge === "captain" ? CAPTAIN : SHIELD;
  }
}

function setCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCount();
  renderDrawer();
  renderCartPage();
}
function updateCount() {
  const n = getCart().reduce((s, i) => s + i.qty, 0);
  document.querySelectorAll("[data-cart-count]").forEach((el) => {
    el.textContent = String(n);
    el.classList.toggle("show", n > 0);
  });
  document.querySelectorAll("[data-open='cart']").forEach((btn) => {
    btn.setAttribute("aria-label", n ? `Kurv, ${n} ${n === 1 ? "vare" : "varer"}` : "Kurv");
  });
}
function cartTotals(cart) {
  const sub = cart.reduce((s, i) => s + i.unit * i.qty, 0);
  const ship = sub === 0 || sub >= 899 ? 0 : 49;
  return { sub, ship, total: sub + ship };
}
function lineMeta(item) {
  const parts = [`Str. ${item.size}`];
  if (item.printOn) parts.push(`${item.player.toUpperCase()} ${item.number}`);
  if (item.printOn && item.badge !== "none") parts.push(BADGES[item.badge].label);
  return parts.join(" · ");
}

function injectDialogs() {
  if (document.getElementById("dlg-cart")) return;
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <dialog class="drawer" id="dlg-cart" aria-label="Kurv">
      <div class="dlg-head"><h2>Kurv</h2><button class="icon-btn" data-close aria-label="Luk kurv">✕</button></div>
      <div class="dlg-body" id="cart-body"></div>
      <div class="dlg-foot" id="cart-foot"></div>
    </dialog>
    <dialog class="menu" id="dlg-menu" aria-label="Menu">
      <div class="dlg-head"><a class="logo" href="index.html"><span class="logo-mark"></span><span>KitCulture</span></a><button class="icon-btn" data-close aria-label="Luk menu">✕</button></div>
      <nav class="menu-links">
        <a href="shop.html">Shop</a>
        <a href="tryk.html">Tryk</a>
        <a href="journal.html">Journal</a>
        <a href="om.html">Om os</a>
        <a href="kurv.html">Kurv</a>
      </nav>
      <div class="dlg-foot"><a class="btn btn-lime btn-block" href="shop.html">Udforsk arkivet</a></div>
    </dialog>
    <dialog class="sheet" id="dlg-search" aria-label="Søg">
      <div class="dlg-head"><h2>Søg i arkivet</h2><button class="icon-btn" data-close aria-label="Luk søgning">✕</button></div>
      <div class="dlg-body">
        <input id="search-input" type="search" placeholder="Prøv Kaká, Laudrup, Serie A…" autocomplete="off">
        <div id="search-results" style="margin-top:14px"></div>
      </div>
    </dialog>
    <dialog class="sheet" id="dlg-size" aria-label="Størrelsesguide">
      <div class="dlg-head"><h2>Størrelsesguide</h2><button class="icon-btn" data-close aria-label="Luk">✕</button></div>
      <div class="dlg-body">
        <p class="muted">Arkivsnit sidder smallere over skulderen end en moderne spillertrøje. Er du mellem to størrelser, så tag den største.</p>
        <table>
          <thead><tr><th>Str.</th><th>Bryst</th><th>Længde</th></tr></thead>
          <tbody>
            <tr><td>S</td><td>96–100 cm</td><td>71 cm</td></tr>
            <tr><td>M</td><td>100–104 cm</td><td>73 cm</td></tr>
            <tr><td>L</td><td>104–108 cm</td><td>75 cm</td></tr>
            <tr><td>XL</td><td>110–116 cm</td><td>77 cm</td></tr>
            <tr><td>XXL</td><td>118–124 cm</td><td>79 cm</td></tr>
          </tbody>
        </table>
        <p class="fine">Målene er omkreds, taget fladt og ganget med to. Mockup-tal, så du kan se, hvordan guiden ville se ud.</p>
      </div>
    </dialog>`;
  document.body.append(wrap);
}

function openDialog(id) {
  const dlg = document.getElementById(id);
  if (dlg && !dlg.open) dlg.showModal();
  return dlg;
}
function renderDrawer() {
  const body = document.getElementById("cart-body");
  const foot = document.getElementById("cart-foot");
  if (!body) return;
  const cart = getCart();
  if (!cart.length) {
    body.innerHTML = `<p style="padding:12px 0">Kurven er tom. Arkivet er ikke.</p><a class="btn btn-green" href="shop.html">Se trøjerne</a>`;
    foot.innerHTML = "";
    return;
  }
  body.innerHTML = cart.map((item) => `
    <article class="line">
      <img src="${esc(item.image)}" alt="">
      <div>
        <h3>${esc(item.title)}</h3>
        <p>${esc(lineMeta(item))}</p>
        <div class="qty">
          <button type="button" data-qty="-1" data-id="${esc(item.id)}" aria-label="Færre">–</button>
          <span>${item.qty}</span>
          <button type="button" data-qty="1" data-id="${esc(item.id)}" aria-label="Flere">+</button>
        </div>
      </div>
      <strong>${money(item.unit * item.qty)}</strong>
    </article>`).join("");
  const t = cartTotals(cart);
  foot.innerHTML = `
    <div class="sum-row"><span>Subtotal</span><span>${money(t.sub)}</span></div>
    <div class="sum-row"><span>Fragt</span><span>${t.ship ? money(t.ship) : "Fri"}</span></div>
    <div class="sum-row total"><span>I alt</span><span>${money(t.total)}</span></div>
    <a class="btn btn-lime btn-block" style="margin-top:14px" href="kurv.html">Gå til kassen</a>`;
}

function renderSearch(q) {
  const box = document.getElementById("search-results");
  if (!box) return;
  const n = norm(q.trim());
  const list = n ? PRODUCTS.filter((p) => blob(p).includes(n)) : PRODUCTS.slice(0, 4);
  box.innerHTML = list.length ? list.map((p) => `
    <a class="search-hit" href="produkt.html?id=${p.id}">
      <img src="${p.image}" alt="">
      <span><strong>${esc(p.name)}</strong><br><span class="muted">${esc(p.league)} · ${esc(p.season)}</span></span>
      <span>${money(p.price)}</span>
    </a>`).join("") : `<p>Intet i arkivet matcher „${esc(q)}“.</p>`;
}

function cardHTML(p) {
  const tag = p.tag ? `<span class="pcard-tag">${esc(p.tag)}</span>` : "";
  return `<a class="pcard" href="produkt.html?id=${p.id}" data-league="${p.leagueId}" data-year="${p.year}" data-price="${p.price}">
    <div class="pcard-media">${tag}<img src="${p.image}" alt="${esc(p.alt)}" width="864" height="1152"></div>
    <div class="pcard-meta"><span>${esc(p.league)} · ${esc(p.season)}</span><span>${money(p.price)}</span></div>
    <h3>${esc(p.name)}</h3>
    <p>${esc(p.line)}</p>
  </a>`;
}

let shopLeague = "alle";
function renderShop() {
  const grid = document.getElementById("shop-grid");
  if (!grid) return;
  const filters = document.getElementById("filters");
  const leagues = [
    ["alle", "Alle"],
    ["serie-a", "Serie A"],
    ["la-liga", "La Liga"],
    ["premier-league", "Premier League"],
    ["landshold", "Landshold"]
  ];
  const params = new URLSearchParams(location.search);
  shopLeague = params.get("liga") || "alle";
  filters.innerHTML = leagues.map(([id, label]) =>
    `<button class="chip" type="button" data-league="${id}" aria-pressed="${id === shopLeague}">${label}</button>`
  ).join("");
  grid.innerHTML = PRODUCTS.map(cardHTML).join("");
  applyShop();
  filters.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-league]");
    if (!btn) return;
    shopLeague = btn.dataset.league;
    filters.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === btn)));
    const url = new URL(location.href);
    if (shopLeague === "alle") url.searchParams.delete("liga");
    else url.searchParams.set("liga", shopLeague);
    history.replaceState(null, "", url);
    applyShop();
  });
  document.getElementById("sort")?.addEventListener("change", applyShop);
}
function applyShop() {
  const grid = document.getElementById("shop-grid");
  const empty = document.getElementById("shop-empty");
  if (!grid) return;
  const sort = document.getElementById("sort")?.value || "anbefalet";
  const cards = [...grid.querySelectorAll(".pcard")];
  cards.sort((a, b) => {
    if (sort === "pris-lav") return Number(a.dataset.price) - Number(b.dataset.price);
    if (sort === "pris-hoj") return Number(b.dataset.price) - Number(a.dataset.price);
    if (sort === "saeson") return Number(b.dataset.year) - Number(a.dataset.year);
    return 0;
  });
  cards.forEach((c) => grid.appendChild(c));
  let shown = 0;
  cards.forEach((c) => {
    const ok = shopLeague === "alle" || c.dataset.league === shopLeague;
    c.hidden = !ok;
    if (ok) shown++;
  });
  if (empty) empty.hidden = shown !== 0;
}

const productState = {
  product: null,
  size: "",
  badge: "none",
  qty: 1,
  view: "back"
};

function renderProduct() {
  if (document.body.dataset.page !== "product") return;
  const params = new URLSearchParams(location.search);
  const product = getProduct(params.get("id"));
  productState.product = product;
  const presetName = params.get("navn");
  const presetNr = params.get("nr");
  document.title = `${product.name} — KitCulture`;
  document.getElementById("crumb-name").textContent = product.name;
  document.getElementById("p-kicker").textContent = `${product.league} · ${product.cut} · ${product.season}`;
  document.getElementById("p-title").textContent = product.name;
  document.getElementById("p-story").textContent = product.story;
  document.getElementById("p-base").textContent = money(product.price);
  document.getElementById("p-fabric").textContent = product.fabric;
  document.getElementById("p-front").src = product.image;
  document.getElementById("p-front").alt = product.alt;
  document.getElementById("thumb-front").src = product.image;
  document.getElementById("thumb-back").src = product.back;
  const name = presetName ? cleanName(presetName) : product.suggestions[0][0];
  const num = presetNr ? cleanNum(presetNr) : product.suggestions[0][1];
  document.getElementById("p-name").value = name;
  document.getElementById("p-num").value = num;
  document.getElementById("suggestions").innerHTML = product.suggestions.map(([n, nr], i) =>
    `<button type="button" data-suggest="${i}" aria-pressed="${i === 0 && !presetName}">${esc(n)} ${esc(nr)}</button>`
  ).join("");
  const stock = document.getElementById("p-stock");
  stock.hidden = product.stock > 3;
  stock.textContent = product.stock <= 3 ? `Få tilbage · ${product.stock} på lager` : "";
  setView("back");
  syncProduct();
  document.body.classList.add("is-ready");
}

function currentPrint() {
  const on = document.getElementById("print-on").checked;
  return {
    on,
    name: document.getElementById("p-name").value.trim(),
    number: document.getElementById("p-num").value.trim(),
    badge: productState.badge
  };
}
function unitPrice() {
  const p = productState.product;
  const print = currentPrint();
  let extra = 0;
  if (print.on) extra += PRINT_PRICE + (BADGES[print.badge]?.price || 0);
  return p.price + extra;
}
function syncProduct() {
  const p = productState.product;
  if (!p) return;
  const print = currentPrint();
  paintPrint(document.getElementById("p-print"), {
    name: print.name,
    number: print.number,
    badge: print.on ? print.badge : "none",
    color: p.print,
    shadow: p.shadow,
    top: p.printTop,
    off: !print.on || productState.view !== "back"
  });
  const unit = unitPrice();
  const rows = [`<div><span>Trøje</span><span>${money(p.price)}</span></div>`];
  if (print.on) rows.push(`<div><span>Spillertryk</span><span>${money(PRINT_PRICE)}</span></div>`);
  if (print.on && print.badge !== "none") {
    rows.push(`<div><span>${esc(BADGES[print.badge].label)}</span><span>${money(BADGES[print.badge].price)}</span></div>`);
  }
  rows.push(`<div class="total"><span>I alt</span><span>${money(unit * productState.qty)}</span></div>`);
  document.getElementById("price-rows").innerHTML = rows.join("");
  const meta = print.on && print.name ? `${print.name.toUpperCase()} ${print.number}` : "Uden tryk";
  document.getElementById("bar-price").textContent = money(unit * productState.qty);
  document.getElementById("bar-meta").textContent = `${productState.size ? "Str. " + productState.size : "Vælg størrelse"} · ${meta}`;
  document.querySelectorAll(".badge-opt").forEach((b) => {
    b.setAttribute("aria-checked", String(b.dataset.badge === productState.badge));
  });
}
function setView(view) {
  productState.view = view;
  const p = productState.product;
  const img = document.getElementById("p-front");
  img.src = view === "back" ? p.back : p.image;
  img.alt = view === "back" ? `Bagside af ${p.name}, klar til spillertryk` : p.alt;
  document.querySelectorAll(".thumb").forEach((t) => t.setAttribute("aria-pressed", String(t.dataset.view === view)));
  syncProduct();
}
function addCurrentToCart() {
  const p = productState.product;
  const sizeMsg = document.getElementById("size-msg");
  const printMsg = document.getElementById("print-msg");
  sizeMsg.hidden = true;
  printMsg.hidden = true;
  if (!productState.size) {
    sizeMsg.hidden = false;
    document.getElementById("sizes").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const print = currentPrint();
  if (print.on && (!print.name || !print.number)) {
    printMsg.hidden = false;
    document.getElementById("p-name").focus();
    return;
  }
  const key = [p.id, productState.size, print.on, norm(print.name), print.number, print.badge].join("|");
  const cart = getCart();
  const existing = cart.find((i) => i.key === key);
  if (existing) existing.qty += productState.qty;
  else {
    cart.push({
      id: uid(),
      key,
      productId: p.id,
      title: p.name,
      image: p.image,
      size: productState.size,
      qty: productState.qty,
      printOn: print.on,
      player: print.on ? print.name : "",
      number: print.on ? print.number : "",
      badge: print.on ? print.badge : "none",
      unit: unitPrice()
    });
  }
  setCart(cart);
  openDialog("dlg-cart");
}

function bindProduct() {
  if (document.body.dataset.page !== "product") return;
  document.getElementById("sizes").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-size]");
    if (!btn) return;
    productState.size = btn.dataset.size;
    document.querySelectorAll(".size").forEach((s) => s.setAttribute("aria-checked", String(s === btn)));
    document.getElementById("size-msg").hidden = true;
    syncProduct();
  });
  document.getElementById("badge-opts").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-badge]");
    if (!btn) return;
    productState.badge = btn.dataset.badge;
    if (!document.getElementById("print-on").checked) document.getElementById("print-on").checked = true;
    setView("back");
  });
  document.getElementById("suggestions").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-suggest]");
    if (!btn) return;
    const [n, nr] = productState.product.suggestions[Number(btn.dataset.suggest)];
    document.getElementById("p-name").value = n;
    document.getElementById("p-num").value = nr;
    document.getElementById("print-on").checked = true;
    document.querySelectorAll("#suggestions button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    setView("back");
  });
  document.getElementById("thumbs").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view]");
    if (btn) setView(btn.dataset.view);
  });
  ["p-name", "p-num", "print-on"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
      const name = document.getElementById("p-name");
      const num = document.getElementById("p-num");
      if (id === "p-name") name.value = cleanName(name.value);
      if (id === "p-num") num.value = cleanNum(num.value);
      document.getElementById("print-msg").hidden = true;
      if (id !== "print-on") document.querySelectorAll("#suggestions button").forEach((b) => b.setAttribute("aria-pressed", "false"));
      if (document.getElementById("print-on").checked) setView("back");
      else syncProduct();
    });
  });
  document.getElementById("buy-form").addEventListener("submit", (e) => {
    e.preventDefault();
    addCurrentToCart();
  });
  document.getElementById("bar-add").addEventListener("click", addCurrentToCart);
  document.getElementById("related").innerHTML = PRODUCTS
    .filter((p) => p.id !== productState.product.id)
    .slice(0, 3)
    .map(cardHTML)
    .join("");
}

function bindHome() {
  const name = document.getElementById("home-name");
  const num = document.getElementById("home-num");
  const layer = document.getElementById("home-print");
  if (!name || !layer) return;
  const paint = () => {
    name.value = cleanName(name.value);
    num.value = cleanNum(num.value);
    const p = getProduct("rossoneri");
    paintPrint(layer, { name: name.value, number: num.value, badge: "none", color: p.print, shadow: p.shadow, top: p.printTop });
    const finish = document.getElementById("home-finish");
    const q = new URLSearchParams({ id: "rossoneri" });
    if (name.value) q.set("navn", name.value);
    if (num.value) q.set("nr", num.value);
    finish.href = `produkt.html?${q.toString()}`;
  };
  name.addEventListener("input", paint);
  num.addEventListener("input", paint);
  document.getElementById("home-form").addEventListener("submit", (e) => e.preventDefault());
  paint();
}

function renderCartPage() {
  const root = document.getElementById("cart-root");
  if (!root) return;
  const params = new URLSearchParams(location.search);
  if (params.get("tak") === "1") {
    const order = JSON.parse(sessionStorage.getItem("kc-order") || "null");
    if (order) {
      root.innerHTML = `
        <div class="confirm page-intro">
          <p class="kicker">Ordre ${esc(order.no)}</p>
          <h1>Tak, ${esc(order.name.split(" ")[0])}.</h1>
          <p class="lede">Det her er en designmockup, så der er ikke trukket penge, og der bliver ikke sendt en trøje. Sådan ville bekræftelsen se ud.</p>
          <div class="confirm-lines">
            ${order.lines.map((item) => `<article class="line"><img src="${esc(item.image)}" alt=""><div><h3>${esc(item.title)}</h3><p>${esc(lineMeta(item))} · ${item.qty} stk.</p></div><strong>${money(item.unit * item.qty)}</strong></article>`).join("")}
            <p style="margin-top:16px">I alt ${money(order.totals.total)} · betaling med ${esc(order.pay)} · ${esc(order.ship)}</p>
          </div>
          <p style="margin-top:22px"><a class="btn btn-lime" href="shop.html">Tilbage til arkivet</a></p>
        </div>`;
      return;
    }
  }
  const cart = getCart();
  if (!cart.length) {
    root.innerHTML = `
      <div class="page-intro" style="padding-bottom:80px">
        <p class="kicker">Kurv</p>
        <h1>Kurven er tom.</h1>
        <p class="lede">Arkivet er ikke.</p>
        <p style="margin-top:22px"><a class="btn btn-lime" href="shop.html">Se trøjerne</a></p>
      </div>`;
    return;
  }
  const t = cartTotals(cart);
  root.innerHTML = `
    <div class="page-intro"><p class="kicker">Kasse</p><h1>Din kurv.</h1></div>
    <div class="cart-layout">
      <div>
        ${cart.map((item) => `
          <article class="line">
            <img src="${esc(item.image)}" alt="">
            <div>
              <h3>${esc(item.title)}</h3>
              <p>${esc(lineMeta(item))}</p>
              <div class="qty">
                <button type="button" data-qty="-1" data-id="${esc(item.id)}" aria-label="Færre">–</button>
                <span>${item.qty}</span>
                <button type="button" data-qty="1" data-id="${esc(item.id)}" aria-label="Flere">+</button>
              </div>
              <button class="texty" type="button" data-remove="${esc(item.id)}">Fjern</button>
            </div>
            <strong>${money(item.unit * item.qty)}</strong>
          </article>`).join("")}
      </div>
      <form class="summary" id="checkout">
        <h2>Levering</h2>
        <div class="form-grid">
          <label class="field"><span>Navn</span><input name="navn" autocomplete="name" required></label>
          <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
          <label class="field"><span>Telefon</span><input name="telefon" type="tel" autocomplete="tel"></label>
          <label class="field"><span>Adresse</span><input name="adresse" autocomplete="street-address" required></label>
          <label class="field"><span>Postnr.</span><input name="postnr" inputmode="numeric" maxlength="4" required></label>
          <label class="field"><span>By</span><input name="by" autocomplete="address-level2" required></label>
        </div>
        <p class="label">Levering</p>
        <div class="ship-opts">
          <label><input type="radio" name="levering" value="Pakkeshop" checked> Pakkeshop · 2–4 hverdage</label>
          <label><input type="radio" name="levering" value="Hjemmelevering"> Hjemmelevering · 2–4 hverdage</label>
        </div>
        <p class="label">Betaling</p>
        <div class="pay-opts">
          <label><input type="radio" name="betaling" value="Kort" checked> Kort</label>
          <label><input type="radio" name="betaling" value="MobilePay"> MobilePay</label>
          <label><input type="radio" name="betaling" value="ViaBill"> ViaBill</label>
        </div>
        <div class="sum-row"><span>Subtotal</span><span>${money(t.sub)}</span></div>
        <div class="sum-row"><span>Fragt</span><span>${t.ship ? money(t.ship) : "Fri"}</span></div>
        <div class="sum-row total"><span>I alt</span><span>${money(t.total)}</span></div>
        <p class="form-error" id="check-error" hidden>Tjek de markerede felter. Postnummer skal være 4 cifre.</p>
        <button class="btn btn-lime btn-block" style="margin-top:16px" type="submit">Afgiv ordre</button>
        <p class="fine">Mockup. Der trækkes ingen penge.</p>
      </form>
    </div>`;
  document.getElementById("checkout").addEventListener("submit", onCheckout);
}

function onCheckout(e) {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  let ok = true;
  ["navn", "email", "adresse", "postnr", "by"].forEach((name) => {
    const el = form.elements[name];
    const bad = !String(fd.get(name) || "").trim();
    el.classList.toggle("invalid", bad);
    if (bad) ok = false;
  });
  const email = String(fd.get("email") || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    form.elements.email.classList.add("invalid");
    ok = false;
  }
  if (!/^\d{4}$/.test(String(fd.get("postnr") || ""))) {
    form.elements.postnr.classList.add("invalid");
    ok = false;
  }
  document.getElementById("check-error").hidden = ok;
  if (!ok) return;
  const cart = getCart();
  const order = {
    no: "KC-" + Math.floor(1000 + Math.random() * 9000),
    name: String(fd.get("navn")),
    pay: String(fd.get("betaling")),
    ship: String(fd.get("levering")),
    lines: cart,
    totals: cartTotals(cart)
  };
  sessionStorage.setItem("kc-order", JSON.stringify(order));
  localStorage.setItem(CART_KEY, "[]");
  location.href = "kurv.html?tak=1";
}

function changeQty(id, dir) {
  const cart = getCart();
  const item = cart.find((i) => i.id === id);
  if (!item) return;
  item.qty += dir;
  setCart(cart.filter((i) => i.qty > 0));
}

function bindForms() {
  document.querySelectorAll("[data-newsletter]").forEach((form) => {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const note = form.querySelector(".form-note");
      if (note) note.hidden = false;
      form.reset();
    });
  });
  const tryk = document.getElementById("tryk-form");
  if (tryk) {
    tryk.addEventListener("submit", (e) => {
      e.preventDefault();
      tryk.hidden = true;
      document.getElementById("tryk-thanks").hidden = false;
    });
  }
  document.querySelectorAll(".acc-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!open));
      const panel = btn.nextElementSibling;
      panel.hidden = open;
    });
  });
}

document.querySelectorAll("[data-nav]").forEach((a) => {
  if (a.dataset.nav === document.body.dataset.page) a.setAttribute("aria-current", "page");
});

injectDialogs();
updateCount();
renderDrawer();
bindHome();
renderShop();
renderProduct();
bindProduct();
renderCartPage();
bindForms();

document.addEventListener("click", (e) => {
  const opener = e.target.closest("[data-open]");
  if (opener) {
    const name = opener.dataset.open;
    if (name === "cart") { renderDrawer(); openDialog("dlg-cart"); }
    if (name === "menu") openDialog("dlg-menu");
    if (name === "size") openDialog("dlg-size");
    if (name === "search") {
      openDialog("dlg-search");
      renderSearch("");
      setTimeout(() => document.getElementById("search-input")?.focus(), 20);
    }
  }
  if (e.target.closest("[data-close]")) e.target.closest("dialog")?.close();
  if (e.target instanceof HTMLDialogElement) e.target.close();
  const qty = e.target.closest("[data-qty]");
  if (qty) changeQty(qty.dataset.id, Number(qty.dataset.qty));
  const remove = e.target.closest("[data-remove]");
  if (remove) changeQty(remove.dataset.remove, -99);
});

document.getElementById("search-input")?.addEventListener("input", (e) => renderSearch(e.target.value));
