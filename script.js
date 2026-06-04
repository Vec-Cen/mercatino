/*
  Colonne attese:
  Nome articolo, Tipo, Prezzo, Stato, Note, Link, Immagine

  Il foglio deve essere pubblico: Condividi > Chiunque abbia il link > Visualizzatore.
  Anche le immagini devono essere pubbliche.
*/

const CONFIG = {
  sheetId: "17t5hPnQA253dSb2ThffFl3Hi31A0atNRl6mZaH9uzhU",
  gid: "0",
  siteTitle: "Catalogo prodotti",
  defaultViewMode: "image-list",
  requestTimeoutMs: 12000
};

const state = {
  products: [],
  filteredProducts: [],
  cart: loadCart(),
  viewMode: localStorage.getItem("showroomViewMode") || CONFIG.defaultViewMode
};

const els = {
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
  copyFeedback: document.querySelector("#copy-feedback"),
  clearCartButton: document.querySelector("#clear-cart-button"),
  viewButtons: document.querySelectorAll("[data-view-mode]"),
  imageModal: document.querySelector("#image-modal"),
  imageModalImg: document.querySelector("#image-modal-img")
};

document.addEventListener("click", handleGlobalClick);
document.addEventListener("keydown", handleKeydown);

els.search.addEventListener("input", applyFilters);
els.typeFilter.addEventListener("change", applyFilters);
els.statusFilter.addEventListener("change", applyFilters);
els.sort.addEventListener("change", applyFilters);
els.copyCartButton.addEventListener("click", copyCartSummary);
els.clearCartButton.addEventListener("click", clearCart);

init();

function init() {
  document.title = CONFIG.siteTitle;
  setViewMode(state.viewMode, false);

  loadProductsFromGoogleSheet()
    .then((products) => {
      state.products = products;
      cleanCartFromMissingProducts();
      populateFilters(products);
      applyFilters();
      renderCart();
    })
    .catch((error) => {
      console.error(error);
      showError("Impossibile caricare i prodotti. Controlla che il Google Sheet sia pubblico, che il gid sia corretto e che la prima riga contenga le colonne: Nome articolo, Tipo, Prezzo, Stato, Note, Link, Immagine.");
    })
    .finally(() => {
      els.loading.hidden = true;
    });
}

function loadProductsFromGoogleSheet() {
  return new Promise((resolve, reject) => {
    const callbackName = "sheetCallback_" + Date.now();
    const url = new URL(`https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq`);

    url.searchParams.set("gid", CONFIG.gid);
    url.searchParams.set("headers", "1");
    url.searchParams.set("tq", "select *");
    url.searchParams.set("tqx", `out:json;responseHandler:${callbackName}`);

    const script = document.createElement("script");
    let timeoutId;

    window[callbackName] = (response) => {
      clearTimeout(timeoutId);

      try {
        if (response.status === "error") {
          throw new Error(response.errors?.map((item) => item.detailed_message || item.message).join(" | ") || "Errore Google Sheet");
        }

        const products = parseGoogleSheetResponse(response);

        if (!products.length) {
          throw new Error("Nessun prodotto trovato nel foglio.");
        }

        cleanup();
        resolve(products);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    script.src = url.toString();
    script.async = true;
    script.onerror = () => {
      cleanup();
      reject(new Error("Impossibile raggiungere Google Sheets."));
    };

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("Timeout nel caricamento del foglio."));
    }, CONFIG.requestTimeoutMs);

    function cleanup() {
      clearTimeout(timeoutId);
      delete window[callbackName];
      script.remove();
    }

    document.body.appendChild(script);
  });
}

function parseGoogleSheetResponse(response) {
  if (!response || !response.table || !response.table.cols || !response.table.rows) {
    throw new Error("Risposta Google Sheet non valida.");
  }

  const headers = response.table.cols.map((col) => normalizeHeader(col.label));
  const rows = response.table.rows;

  return rows
    .map((row, index) => {
      const item = {};

      headers.forEach((header, columnIndex) => {
        if (!header) return;
        const cell = row.c[columnIndex];
        item[header] = cell ? String(cell.f ?? cell.v ?? "").trim() : "";
      });

      return normalizeProduct(item, index);
    })
    .filter((product) => product.name);
}

function normalizeHeader(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function normalizeProduct(item, index) {
  const name = item.nome_articolo || "";
  return {
    id: slugify(name) || `prodotto-${index + 1}`,
    name,
    type: item.tipo || "",
    priceRaw: item.prezzo || "",
    price: parsePrice(item.prezzo || ""),
    status: item.stato || "",
    notes: item.note || "",
    link: item.link || "",
    image: normalizeImageUrl(item.immagine || "")
  };
}

function normalizeImageUrl(value) {
  const url = String(value || "").trim();

  if (!url) return "";

  const driveFileMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (driveFileMatch) {
    return `https://drive.google.com/uc?export=view&id=${driveFileMatch[1]}`;
  }

  const driveIdMatch = url.match(/[?&]id=([^&]+)/);
  if (url.includes("drive.google.com") && driveIdMatch) {
    return `https://drive.google.com/uc?export=view&id=${driveIdMatch[1]}`;
  }

  return url;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function parsePrice(value) {
  const cleaned = String(value || "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPrice(product) {
  if (product.priceRaw) return product.priceRaw;
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(product.price);
}

function formatComputedPrice(value) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value);
}

function populateFilters(products) {
  fillSelect(els.typeFilter, uniqueValues(products.map((product) => product.type)));
  fillSelect(els.statusFilter, uniqueValues(products.map((product) => product.status)));
}

function fillSelect(select, values) {
  values.forEach((value) => {
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
    .filter((product) => {
      const searchable = [product.name, product.type, product.priceRaw, product.status, product.notes, product.link].join(" ").toLowerCase();

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
    case "name-desc":
      return b.name.localeCompare(a.name, "it");
    case "price-asc":
      return a.price - b.price;
    case "price-desc":
      return b.price - a.price;
    case "type-asc":
      return a.type.localeCompare(b.type, "it");
    case "status-asc":
      return a.status.localeCompare(b.status, "it");
    case "name-asc":
    default:
      return a.name.localeCompare(b.name, "it");
  }
}

function setViewMode(mode, shouldSave = true) {
  const allowedModes = ["simple", "image-list", "grid"];
  state.viewMode = allowedModes.includes(mode) ? mode : CONFIG.defaultViewMode;

  els.grid.classList.remove("view-simple", "view-image-list", "view-grid");
  els.grid.classList.add(`view-${state.viewMode}`);

  els.viewButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.viewMode === state.viewMode);
  });

  if (shouldSave) {
    localStorage.setItem("showroomViewMode", state.viewMode);
  }

  if (state.products.length) {
    renderProducts();
  }
}

function renderProducts() {
  els.grid.innerHTML = "";
  els.empty.hidden = state.filteredProducts.length > 0;

  const fragment = document.createDocumentFragment();

  state.filteredProducts.forEach((product) => {
    const detailLink = product.link || "";
    const detailMarkup = detailLink
      ? `<a class="secondary-button" href="${escapeAttribute(detailLink)}" target="_blank" rel="noopener">Dettagli</a>`
      : `<span class="secondary-button is-disabled">Dettagli</span>`;

    const isInCart = Boolean(state.cart[product.id]);
    const addButtonLabel = isInCart ? "Nel carrello" : "Aggiungi";
    const addButtonClass = isInCart ? "primary-button is-added" : "primary-button";

    const imageMarkup = product.image
      ? `<img class="product-image" src="${escapeAttribute(product.image)}" alt="${escapeAttribute(product.name)}" loading="lazy" onerror="this.remove();" />`
      : "";

    const card = document.createElement("article");
    card.className = "product-card";
    card.innerHTML = `
      <button class="product-image-button" type="button" data-image-url="${escapeAttribute(product.image)}" data-image-alt="${escapeAttribute(product.name)}" aria-label="Apri immagine ingrandita: ${escapeAttribute(product.name)}">
        ${imageMarkup}
      </button>

      <div class="product-content">
        <h2>${escapeHtml(product.name)}</h2>
        <div class="product-meta">
          ${product.type ? `<span class="badge">${escapeHtml(product.type)}</span>` : ""}
          ${product.status ? `<span class="badge">${escapeHtml(product.status)}</span>` : ""}
        </div>
        <p class="price">${escapeHtml(formatPrice(product))}</p>
        ${product.notes ? `<p class="notes">${escapeHtml(product.notes)}</p>` : ""}
      </div>

      <div class="card-actions">
        ${detailMarkup}
        <button class="${addButtonClass}" type="button" data-add-to-cart="${escapeHtml(product.id)}">${addButtonLabel}</button>
      </div>
    `;
    fragment.appendChild(card);
  });

  els.grid.appendChild(fragment);
}

function handleGlobalClick(event) {
  const viewButton = event.target.closest("[data-view-mode]");
  if (viewButton) {
    setViewMode(viewButton.dataset.viewMode);
    return;
  }

  const productImageButton = event.target.closest("[data-image-url]");
  if (productImageButton) {
    const imageUrl = productImageButton.dataset.imageUrl;
    const imageAlt = productImageButton.dataset.imageAlt || "";
    if (imageUrl) openImageModal(imageUrl, imageAlt);
    return;
  }

  if (event.target.closest("[data-close-image-modal]") || event.target === els.imageModal) {
    closeImageModal();
    return;
  }

  const addButton = event.target.closest("[data-add-to-cart]");
  if (addButton) {
    addToCart(addButton.dataset.addToCart);
    return;
  }

  if (event.target.closest("[data-open-cart]")) {
    openCart();
    return;
  }

  if (event.target.closest("[data-close-cart]")) {
    closeCart();
    return;
  }

  const removeButton = event.target.closest("[data-remove-from-cart]");
  if (removeButton) {
    removeFromCart(removeButton.dataset.removeFromCart);
  }
}

function handleKeydown(event) {
  if (event.key === "Escape") {
    closeImageModal();
    closeCart();
  }
}

function openImageModal(imageUrl, imageAlt) {
  els.imageModalImg.src = imageUrl;
  els.imageModalImg.alt = imageAlt;
  els.imageModal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeImageModal() {
  if (els.imageModal.hidden) return;

  els.imageModal.hidden = true;
  els.imageModalImg.src = "";
  els.imageModalImg.alt = "";
  document.body.style.overflow = "";
}

function addToCart(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;

  state.cart[productId] = { productId };

  saveCart();
  renderCart();
  renderProducts();
  openCart();
}

function removeFromCart(productId) {
  delete state.cart[productId];
  saveCart();
  renderCart();
  renderProducts();
}

function cleanCartFromMissingProducts() {
  const validIds = new Set(state.products.map((product) => product.id));
  let changed = false;

  Object.keys(state.cart).forEach((productId) => {
    if (!validIds.has(productId)) {
      delete state.cart[productId];
      changed = true;
    }
  });

  if (changed) saveCart();
}

function renderCart() {
  const items = getCartItems();

  els.cartCount.textContent = String(items.length);
  els.cartItems.innerHTML = "";

  if (!items.length) {
    els.cartItems.innerHTML = `<p class="notice">Il carrello è vuoto.</p>`;
  } else {
    const fragment = document.createDocumentFragment();

    items.forEach((product) => {
      const row = document.createElement("div");
      row.className = "cart-item";
      row.innerHTML = `
        ${product.image ? `<img class="cart-thumb" src="${escapeAttribute(product.image)}" alt="${escapeAttribute(product.name)}" loading="lazy" onerror="this.remove();" />` : `<div class="cart-thumb"></div>`}
        <div>
          <h3>${escapeHtml(product.name)}</h3>
          <p>${escapeHtml(formatPrice(product))}</p>
        </div>
        <button class="remove-cart-button" type="button" data-remove-from-cart="${escapeHtml(product.id)}" aria-label="Rimuovi ${escapeAttribute(product.name)} dal carrello">×</button>
      `;
      fragment.appendChild(row);
    });

    els.cartItems.appendChild(fragment);
  }

  els.cartTotal.textContent = formatComputedPrice(getCartTotal());
}

function getCartItems() {
  return Object.values(state.cart)
    .map((item) => state.products.find((candidate) => candidate.id === item.productId))
    .filter(Boolean);
}

function getCartTotal() {
  return getCartItems().reduce((sum, product) => sum + product.price, 0);
}

function buildCartSummary() {
  const items = getCartItems();

  if (!items.length) {
    return "Carrello vuoto.";
  }

  const lines = items.map((product) => `- ${product.name} | ${formatPrice(product)}`);

  return ["Riepilogo carrello", "", ...lines, "", `Totale: ${formatComputedPrice(getCartTotal())}`].join("\n");
}

async function copyCartSummary() {
  const summary = buildCartSummary();

  try {
    await navigator.clipboard.writeText(summary);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = summary;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  els.copyFeedback.hidden = false;
  window.setTimeout(() => {
    els.copyFeedback.hidden = true;
  }, 2200);
}

function clearCart() {
  state.cart = {};
  saveCart();
  renderCart();
  renderProducts();
}

function openCart() {
  els.cartPanel.classList.add("is-open");
  els.cartPanel.setAttribute("aria-hidden", "false");
  els.backdrop.hidden = false;
}

function closeCart() {
  els.cartPanel.classList.remove("is-open");
  els.cartPanel.setAttribute("aria-hidden", "true");
  els.backdrop.hidden = true;
}

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem("showroomCart")) || {};
  } catch {
    return {};
  }
}

function saveCart() {
  localStorage.setItem("showroomCart", JSON.stringify(state.cart));
}

function showError(message) {
  els.error.textContent = message;
  els.error.hidden = false;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
