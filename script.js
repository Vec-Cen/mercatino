const CONFIG = {
  apiUrl: "https://vec.mercatino.workers.dev/",
  siteTitle: "Il Mercatino",
  defaultViewMode: "image-list",
  placeholderImage: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 24 24' fill='none' stroke='%23667085' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><rect width='18' height='18' x='3' y='3' rx='2' ry='2'/><circle cx='9' cy='9' r='2'/><path d='m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'/></svg>"
};

const state = {
  products: [],
  filteredProducts: [],
  cart: loadCart(),
  viewMode: localStorage.getItem("showroomViewMode") || CONFIG.defaultViewMode,
  isCartOpen: false
};

const els = {
  header: document.querySelector("#site-header"),
  loading: document.querySelector("#loading"),
  error: document.querySelector("#error"),
  grid: document.querySelector("#products-grid"),
  empty: document.querySelector("#empty-state"),
  search: document.querySelector("#search-input"),
  typeFilter: document.querySelector("#type-filter"),
  statusFilter: document.querySelector("#status-filter"),
  sort: document.querySelector("#sort-select"),
  cartPanel: document.querySelector("#cart-panel"),
  backdrop: document.querySelector("#cart-backdrop"),
  cartCount: document.querySelector("#cart-count"),
  cartItems: document.querySelector("#cart-items"),
  cartTotal: document.querySelector("#cart-total"),
  copyCartButton: document.querySelector("#copy-cart-button"),
  clearCartButton: document.querySelector("#clear-cart-button"),
  toast: document.querySelector("#toast"),
  viewButtons: document.querySelectorAll("[data-view-mode]"),
  imageModal: document.querySelector("#image-modal"),
  imageModalImg: document.querySelector("#image-modal-img"),
  template: document.querySelector("#product-card-template")
};

// Event Listeners Globali
document.addEventListener("click", handleGlobalClick);
document.addEventListener("keydown", handleKeydown);
window.addEventListener("popstate", handlePopState);
window.addEventListener("scroll", handleWindowScroll);

els.search.addEventListener("input", () => { applyFilters(); updateURLParams(); });
els.typeFilter.addEventListener("change", () => { applyFilters(); updateURLParams(); });
els.statusFilter.addEventListener("change", () => { applyFilters(); updateURLParams(); });
els.sort.addEventListener("change", () => { applyFilters(); updateURLParams(); });
els.copyCartButton.addEventListener("click", copyCartSummary);
els.clearCartButton.addEventListener("click", clearCart);

init();

async function init() {
  document.title = CONFIG.siteTitle;
  setViewMode(state.viewMode, false);
  readURLParams();
  handleWindowScroll();

  try {
    state.products = await fetchProductsFromWorker();
    cleanCartFromMissingProducts();
    populateFilters(state.products);
    applyFilters();
    renderCart();
  } catch (error) {
    console.error(error);
    showError("Impossibile caricare i prodotti. Riprova più tardi.");
  } finally {
    els.loading.hidden = true;
  }
}

function handleWindowScroll() {
  if (window.scrollY > 50) {
    els.header.classList.add("is-sticky");
  } else {
    els.header.classList.remove("is-sticky");
  }
}

async function fetchProductsFromWorker() {
  const response = await fetch(CONFIG.apiUrl);
  if (!response.ok) throw new Error("Errore nel recupero dei dati dal server.");
  return await response.json();
}

function readURLParams() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("search")) els.search.value = params.get("search");
  if (params.get("type")) els.typeFilter.value = params.get("type");
  if (params.get("status")) els.statusFilter.value = params.get("status");
  if (params.get("sort")) els.sort.value = params.get("sort");
}

function updateURLParams() {
  const params = new URLSearchParams();
  if (els.search.value.trim()) params.set("search", els.search.value.trim());
  if (els.typeFilter.value) params.set("type", els.typeFilter.value);
  if (els.statusFilter.value) params.set("status", els.statusFilter.value);
  if (els.sort.value !== "name-asc") params.set("sort", els.sort.value);
  
  const newRelativePathQuery = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
  window.history.replaceState(null, "", newRelativePathQuery);
}

function populateFilters(products) {
  fillSelect(els.typeFilter, uniqueValues(products.map(p => p.type)), "Tutti i tipi");
  fillSelect(els.statusFilter, uniqueValues(products.map(p => p.status)), "Tutti gli stati");
}

function fillSelect(select, values, defaultText) {
  while (select.options.length > 0) select.remove(0);
  const defOpt = document.createElement("option");
  defOpt.value = "";
  defOpt.textContent = defaultText;
  select.appendChild(defOpt);
  
  values.forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "it"));
}

function applyFilters() {
  const query = els.search.value.trim().toLowerCase();
  const type = els.typeFilter.value;
  const status = els.statusFilter.value;

  state.filteredProducts = state.products
    .filter(product => {
      const searchable = [product.name, product.type, product.priceRaw, product.status, product.notes].join(" ").toLowerCase();
      return (
        (!query || searchable.includes(query)) &&
        (!type || product.type === type) &&
        (!status || product.status === status)
      );
    })
    .sort(sortProducts);

  renderProducts();
}

function sortProducts(a, b) {
  switch (els.sort.value) {
    case "name-desc": return b.name.localeCompare(a.name, "it");
    case "price-asc": return a.price - b.price;
    case "price-desc": return b.price - a.price;
    case "type-asc": return a.type.localeCompare(b.type, "it");
    case "status-asc": return a.status.localeCompare(b.status, "it");
    default: return a.name.localeCompare(b.name, "it");
  }
}

function setViewMode(mode, shouldSave = true) {
  const allowedModes = ["simple", "image-list", "grid"];
  state.viewMode = allowedModes.includes(mode) ? mode : CONFIG.defaultViewMode;

  els.grid.className = `products-grid view-${state.viewMode}`;
  els.viewButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.viewMode === state.viewMode));

  if (shouldSave) localStorage.setItem("showroomViewMode", state.viewMode);
}

function getStatusBadgeClass(status) {
  const normalized = String(status || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (normalized === "disponibile") return "badge-green";
  if (normalized === "in trattativa") return "badge-yellow";
  if (normalized === "esaurito") return "badge-red";
  return "";
}

function renderProducts() {
  els.grid.textContent = "";
  els.empty.hidden = state.filteredProducts.length > 0;

  const fragment = document.createDocumentFragment();

  state.filteredProducts.forEach(product => {
    const clone = els.template.content.cloneNode(true);
    
    const imgBtn = clone.querySelector(".product-image-button");
    const img = clone.querySelector(".product-image");
    if (product.image) {
      img.src = product.image;
      img.alt = product.name;
      img.onerror = () => { img.src = CONFIG.placeholderImage; };
      imgBtn.dataset.imageUrl = product.image;
      imgBtn.dataset.imageAlt = product.name;
    } else {
      img.src = CONFIG.placeholderImage;
      imgBtn.disabled = true;
    }

    clone.querySelector(".product-title").textContent = product.name;
    
    const badgesContainer = clone.querySelector(".product-badges");
    if (product.type) {
      const typeBadge = document.createElement("span");
      typeBadge.className = "badge";
      typeBadge.textContent = product.type;
      badgesContainer.appendChild(typeBadge);
    }
    
    const normalizedStatus = String(product.status || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const isSoldOut = normalizedStatus === "esaurito";

    if (product.status) {
      const statusBadge = document.createElement("span");
      statusBadge.className = `badge ${getStatusBadgeClass(product.status)}`;
      statusBadge.textContent = product.status;
      badgesContainer.appendChild(statusBadge);
    }

    clone.querySelector(".product-price").textContent = product.priceRaw || new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(product.price);
    
    const notesEl = clone.querySelector(".product-notes");
    if (product.notes) notesEl.textContent = product.notes;
    else notesEl.remove();

    const detailBtn = clone.querySelector(".secondary-button");
    if (product.link) detailBtn.href = product.link;
    else {
      detailBtn.removeAttribute("href");
      detailBtn.classList.add("disabled");
    }

    const cartBtn = clone.querySelector(".product-actions .primary-button");
    if (isSoldOut) {
      cartBtn.textContent = "Non disponibile";
      cartBtn.disabled = true;
      cartBtn.className = "primary-button disabled";
    } else {
      const isInCart = Boolean(state.cart[product.id]);
      cartBtn.textContent = isInCart ? "Nel carrello" : "Aggiungi";
      cartBtn.className = isInCart ? "primary-button active" : "primary-button";
      cartBtn.dataset.addToCart = product.id;
    }

    fragment.appendChild(clone);
  });

  els.grid.appendChild(fragment);
}

function openCart(pushState = true) {
  state.isCartOpen = true;
  els.cartPanel.classList.add("is-open");
  els.cartPanel.setAttribute("aria-hidden", "false");
  els.backdrop.hidden = false;
  els.cartPanel.focus();

  if (pushState) {
    window.history.pushState({ view: "cart" }, "", "#cart");
  }
}

function closeCart(shouldGoBackInHistory = false) {
  if (!state.isCartOpen) return;
  state.isCartOpen = false;
  els.cartPanel.classList.remove("is-open");
  els.cartPanel.setAttribute("aria-hidden", "true");
  els.backdrop.hidden = true;

  if (shouldGoBackInHistory && window.location.hash === "#cart") {
    window.history.back();
  }
}

function handlePopState(event) {
  if (event.state && event.state.view === "cart") {
    openCart(false);
  } else {
    closeCart(false);
  }
}

function handleGlobalClick(event) {
  const viewButton = event.target.closest("[data-view-mode]");
  if (viewButton) return setViewMode(viewButton.dataset.viewMode);

  const imgBtn = event.target.closest(".product-image-button[data-image-url]");
  if (imgBtn) return openImageModal(imgBtn.dataset.imageUrl, imgBtn.dataset.imageAlt);

  // Gestione chiusura cliccando all'esterno o sulla X (Problema 2)
  if (
    event.target.closest("[data-close-image-modal]") || 
    event.target === els.imageModal || 
    event.target.classList.contains("image-modal-content")
  ) {
    return closeImageModal();
  }

  const addButton = event.target.closest("[data-add-to-cart]");
  if (addButton) return addToCart(addButton.dataset.addToCart);

  if (event.target.closest("[data-open-cart]")) return openCart(true);
  if (event.target.closest("[data-close-cart]")) return closeCart(true);

  const removeButton = event.target.closest("[data-remove-from-cart]");
  if (removeButton) removeFromCart(removeButton.dataset.removeFromCart);
}

function handleKeydown(event) {
  if (event.key === "Escape") {
    closeImageModal();
    closeCart(true);
  }
}

function openImageModal(url, alt) {
  els.imageModalImg.src = url;
  els.imageModalImg.alt = alt || "";
  els.imageModal.hidden = false;
}

function closeImageModal() {
  els.imageModal.hidden = true;
  els.imageModalImg.src = "";
}

function addToCart(id) {
  const product = state.products.find(p => p.id === id);
  if (!product) return;
  state.cart[id] = { productId: id };
  saveCart();
  renderCart();
  renderProducts();
  openCart(true);
}

function removeFromCart(id) {
  delete state.cart[id];
  saveCart();
  renderCart();
  renderProducts();
}

function clearCart() {
  state.cart = {};
  saveCart();
  renderCart();
  renderProducts();
}

function cleanCartFromMissingProducts() {
  const validIds = new Set(state.products.map(p => p.id));
  let changed = false;
  Object.keys(state.cart).forEach(id => {
    if (!validIds.has(id)) { delete state.cart[id]; changed = true; }
  });
  if (changed) saveCart();
}

function renderCart() {
  const items = Object.values(state.cart)
    .map(item => state.products.find(p => p.id === item.productId))
    .filter(Boolean);

  els.cartCount.textContent = String(items.length);
  els.cartItems.textContent = "";

  if (!items.length) {
    const p = document.createElement("p");
    p.className = "cart-empty-notice";
    p.textContent = "Il carrello è vuoto.";
    els.cartItems.appendChild(p);
  } else {
    items.forEach(product => {
      const row = document.createElement("div");
      row.className = "cart-item";

      const thumb = document.createElement("img");
      thumb.className = "cart-thumb";
      thumb.src = product.image || CONFIG.placeholderImage;
      thumb.alt = product.name;
      thumb.onerror = () => { thumb.src = CONFIG.placeholderImage; };
      row.appendChild(thumb);

      const info = document.createElement("div");
      info.className = "cart-item-details";
      const h3 = document.createElement("h3");
      h3.textContent = product.name;
      const priceP = document.createElement("p");
      priceP.className = "cart-item-price";
      priceP.textContent = product.priceRaw || new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(product.price);
      info.appendChild(h3);
      info.appendChild(priceP);
      row.appendChild(info);

      const delBtn = document.createElement("button");
      delBtn.className = "icon-button remove-item";
      delBtn.textContent = "×";
      delBtn.type = "button";
      delBtn.dataset.removeFromCart = product.id;
      row.appendChild(delBtn);

      els.cartItems.appendChild(row);
    });
  }

  const total = items.reduce((sum, p) => sum + p.price, 0);
  els.cartTotal.textContent = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(total);
}

function copyCartSummary() {
  const items = Object.values(state.cart)
    .map(item => state.products.find(p => p.id === item.productId))
    .filter(Boolean);

  if (!items.length) return;

  const lines = items.map(p => `- ${p.name} | ${p.priceRaw || p.price + "€"}`);
  const total = items.reduce((sum, p) => sum + p.price, 0);
  const summary = ["Riepilogo carrello", "", ...lines, "", `Totale: ${total}€`].join("\n");

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(summary)
      .then(() => {
        showToast();
        const originalText = els.copyCartButton.textContent;
        els.copyCartButton.textContent = "✓ Copiato!";
        els.copyCartButton.setAttribute("data-copied", "true");
        
        setTimeout(() => {
          els.copyCartButton.textContent = originalText;
          els.copyCartButton.removeAttribute("data-copied");
        }, 2000);
      })
      .catch(err => console.error("Errore nella copia: ", err));
  }
}

function showToast() {
  els.toast.hidden = false;
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => { els.toast.hidden = true; }, 2400);
}

function loadCart() { try { return JSON.parse(localStorage.getItem("showroomCart")) || {}; } catch { return {}; } }
function saveCart() { localStorage.setItem("showroomCart", JSON.stringify(state.cart)); }
function showError(msg) { els.error.textContent = msg; els.error.hidden = false; }