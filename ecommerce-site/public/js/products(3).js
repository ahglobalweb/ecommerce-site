let ALL_PRODUCTS = [];
let ACTIVE_CATEGORY = 'All';
let QTY_STATE = {};

(async function () {
  const settings = await loadSettings();
  renderHeader('products');
  renderOfferBanner();
  renderFooter();

  await loadProducts();

  const params = new URLSearchParams(window.location.search);
  const q = params.get('q');
  if (q) {
    document.getElementById('product-search-input').value = q;
  }

  render();
  initScrollReveal();

  document.getElementById('product-search-input').addEventListener('input', debounce(render, 200));
})();

async function loadProducts() {
  const grid = document.getElementById('all-products-grid');
  grid.innerHTML = Array.from({ length: 8 })
    .map(() => `<div class="product-card"><div class="skeleton" style="aspect-ratio:4/5;"></div><div class="product-body"><div class="skeleton" style="height:16px;width:70%;margin-bottom:10px;"></div><div class="skeleton" style="height:12px;width:100%;"></div></div></div>`)
    .join('');
  try {
    const res = await fetch('/api/products');
    ALL_PRODUCTS = await res.json();
    renderCategoryChips();
  } catch (err) {
    grid.innerHTML = `<div class="empty-state">Could not load products. Please refresh the page.</div>`;
  }
}

function renderCategoryChips() {
  const bar = document.getElementById('category-chips');
  const categories = ['All', ...new Set(ALL_PRODUCTS.map((p) => p.category).filter(Boolean))];
  bar.innerHTML = categories
    .map((c) => `<button class="filter-chip ${c === ACTIVE_CATEGORY ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`)
    .join('');
  bar.querySelectorAll('.filter-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      ACTIVE_CATEGORY = btn.dataset.cat;
      render();
    });
  });
}

function render() {
  const grid = document.getElementById('all-products-grid');
  const query = (document.getElementById('product-search-input').value || '').trim().toLowerCase();

  renderCategoryChips();

  let filtered = ALL_PRODUCTS.filter((p) => ACTIVE_CATEGORY === 'All' || p.category === ACTIVE_CATEGORY);
  if (query) {
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        (p.shortDescription || '').toLowerCase().includes(query) ||
        (p.category || '').toLowerCase().includes(query)
    );
  }

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state">No products match your search. Try a different term or category.</div>`;
    return;
  }

  grid.innerHTML = filtered.map(fullProductCardHtml).join('');

  filtered.forEach((p) => {
    if (!QTY_STATE[p.id]) QTY_STATE[p.id] = 1;
    const card = document.querySelector(`[data-product-id="${p.id}"]`);
    if (!card) return;
    const input = card.querySelector('.qty-input');
    const minus = card.querySelector('.qty-minus');
    const plus = card.querySelector('.qty-plus');
    const buyBtn = card.querySelector('.buy-now-btn');

    minus.addEventListener('click', () => {
      QTY_STATE[p.id] = Math.max(1, QTY_STATE[p.id] - 1);
      input.value = QTY_STATE[p.id];
    });
    plus.addEventListener('click', () => {
      QTY_STATE[p.id] = Math.min(p.stock || 99, QTY_STATE[p.id] + 1);
      input.value = QTY_STATE[p.id];
    });
    input.addEventListener('change', () => {
      let v = parseInt(input.value, 10) || 1;
      v = Math.max(1, Math.min(p.stock || 99, v));
      QTY_STATE[p.id] = v;
      input.value = v;
    });
    buyBtn.addEventListener('click', () => {
      setCheckoutItems([{ id: p.id, qty: QTY_STATE[p.id] }]);
      window.location.href = '/checkout.html';
    });
  });

  initScrollReveal();
}

function fullProductCardHtml(p) {
  return `
    <article class="product-card reveal" data-product-id="${p.id}">
      <div class="product-media">
        ${p.featured ? '<span class="product-tag">Best seller</span>' : ''}
        <img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" />
      </div>
      <div class="product-body">
        <h3>${esc(p.name)}</h3>
        <p class="desc">${esc(p.description || p.shortDescription)}</p>
        <div class="product-price-row">
          <span class="price">${Number(p.price).toLocaleString('en-IN')}</span>
          <div class="qty-selector">
            <button type="button" class="qty-minus" aria-label="Decrease quantity">−</button>
            <input type="text" class="qty-input" value="${QTY_STATE[p.id] || 1}" inputmode="numeric" aria-label="Quantity" />
            <button type="button" class="qty-plus" aria-label="Increase quantity">+</button>
          </div>
        </div>
        <div class="card-actions">
          <button type="button" class="btn btn-accent btn-block buy-now-btn">Buy Now</button>
        </div>
      </div>
    </article>
  `;
}

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
