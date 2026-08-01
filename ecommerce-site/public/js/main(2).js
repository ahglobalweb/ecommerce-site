(async function () {
  const settings = await loadSettings();
  renderHeader('home');
  renderOfferBanner();
  renderFooter();

  document.getElementById('hero-heading').textContent = settings.heroHeading || 'Considered objects for a well-kept life';
  document.getElementById('hero-subheading').textContent = settings.heroSubheading || '';
  document.getElementById('ticket-offer-text').textContent = settings.offerText || 'Limited-time offer';

  startCountdown(settings.countdownTarget || new Date(Date.now() + 86400000).toISOString(), {
    days: document.getElementById('cd-days'),
    hours: document.getElementById('cd-hours'),
    mins: document.getElementById('cd-mins'),
    secs: document.getElementById('cd-secs'),
  });

  document.getElementById('stub-code').textContent = 'AU-' + new Date().getFullYear();

  await loadBestProducts();
  initScrollReveal();
})();

async function loadBestProducts() {
  const grid = document.getElementById('best-products-grid');
  grid.innerHTML = Array.from({ length: 4 })
    .map(() => `<div class="product-card"><div class="skeleton" style="aspect-ratio:4/5;"></div><div class="product-body"><div class="skeleton" style="height:16px;width:70%;margin-bottom:10px;"></div><div class="skeleton" style="height:12px;width:100%;"></div></div></div>`)
    .join('');

  try {
    const res = await fetch('/api/products');
    const products = await res.json();
    const featured = products.filter((p) => p.featured).slice(0, 4);
    const list = featured.length ? featured : products.slice(0, 4);

    if (list.length === 0) {
      grid.innerHTML = `<div class="empty-state">No products yet. Check back soon.</div>`;
      return;
    }

    grid.innerHTML = list.map(productCardHtml).join('');
  } catch (err) {
    grid.innerHTML = `<div class="empty-state">Could not load products. Please refresh.</div>`;
  }
}

function productCardHtml(p) {
  return `
    <article class="product-card reveal">
      <a href="/products.html" class="product-media">
        ${p.featured ? '<span class="product-tag">Best seller</span>' : ''}
        <img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" />
      </a>
      <div class="product-body">
        <h3>${esc(p.name)}</h3>
        <p class="desc">${esc(p.shortDescription)}</p>
        <div class="product-price-row">
          <span class="price">${Number(p.price).toLocaleString('en-IN')}</span>
          <a href="/products.html" class="btn btn-outline" style="padding:9px 16px;font-size:12.5px;">View</a>
        </div>
      </div>
    </article>
  `;
}
