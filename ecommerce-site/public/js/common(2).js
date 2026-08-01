// ---------- shared state ----------
let SITE_SETTINGS = null;

async function loadSettings() {
  if (SITE_SETTINGS) return SITE_SETTINGS;
  const res = await fetch('/api/settings');
  SITE_SETTINGS = await res.json();
  applyTheme(SITE_SETTINGS);
  return SITE_SETTINGS;
}

function applyTheme(settings) {
  if (!settings || !settings.colors) return;
  const root = document.documentElement.style;
  const map = {
    primary: '--color-primary',
    accent: '--color-accent',
    accentSecondary: '--color-accent-2',
    background: '--color-bg',
    surface: '--color-surface',
    text: '--color-text',
  };
  Object.entries(map).forEach(([key, cssVar]) => {
    if (settings.colors[key]) root.setProperty(cssVar, settings.colors[key]);
  });
  document.title = settings.siteName ? `${settings.siteName} — considered goods` : document.title;
}

// ---------- header / footer ----------
function renderHeader(activePage) {
  const mount = document.getElementById('site-header');
  if (!mount) return;
  const siteName = (SITE_SETTINGS && SITE_SETTINGS.siteName) || 'Aurelia';
  const links = [
    { href: '/index.html', label: 'Home', key: 'home' },
    { href: '/products.html', label: 'Shop All', key: 'products' },
    { href: '/about.html', label: 'About', key: 'about' },
  ];
  mount.innerHTML = `
    <div class="container header-inner">
      <a href="/index.html" class="logo">${siteName.slice(0,1)}<span>${siteName.slice(1)}</span></a>
      <nav class="main-nav" id="main-nav">
        ${links.map(l => `<a href="${l.href}" ${l.key === activePage ? 'style="color:var(--color-accent)"' : ''}>${l.label}</a>`).join('')}
      </nav>
      <div class="header-actions">
        <form class="search-form" id="header-search-form" role="search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="text" id="header-search-input" placeholder="Search products" aria-label="Search products" />
        </form>
        <a href="/products.html" class="cart-count-btn" aria-label="Shop all products">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
        </a>
        <button class="nav-toggle" id="nav-toggle" aria-label="Open menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
        </button>
      </div>
    </div>
  `;

  const toggle = document.getElementById('nav-toggle');
  const nav = document.getElementById('main-nav');
  toggle && toggle.addEventListener('click', () => nav.classList.toggle('mobile-open'));

  const searchForm = document.getElementById('header-search-form');
  searchForm && searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = document.getElementById('header-search-input').value.trim();
    window.location.href = '/products.html' + (q ? `?q=${encodeURIComponent(q)}` : '');
  });
}

function renderOfferBanner() {
  const mount = document.getElementById('offer-banner');
  if (!mount || !SITE_SETTINGS) return;
  const text = SITE_SETTINGS.offerText || 'Limited-time offer';
  const item = `<span>✦ ${text}</span>`;
  mount.innerHTML = `<div class="marquee-track">${item.repeat(6)}</div>`;
}

function renderFooter() {
  const mount = document.getElementById('site-footer');
  if (!mount) return;
  const s = SITE_SETTINGS || {};
  mount.innerHTML = `
    <div class="container">
      <div class="footer-grid">
        <div>
          <h5>${s.siteName || 'Aurelia'}</h5>
          <p>${(s.heroSubheading || 'Considered objects for a well-kept life.')}</p>
        </div>
        <div>
          <h5>Shop</h5>
          <a href="/products.html">All Products</a>
          <a href="/index.html#best-products">Best Sellers</a>
          <a href="/about.html">About Us</a>
        </div>
        <div>
          <h5>Contact</h5>
          <p>${s.phoneNumber || ''}</p>
          <a href="${s.facebookUrl || '#'}" target="_blank" rel="noopener">Facebook</a>
          <a href="${s.instagramUrl || '#'}" target="_blank" rel="noopener">Instagram</a>
        </div>
        <div>
          <h5>Info</h5>
          <a href="/about.html">Our Story</a>
          <a href="/products.html">Shipping &amp; Returns</a>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© ${new Date().getFullYear()} ${s.siteName || 'Aurelia'}. All rights reserved.</span>
        <span>Made with care, for keeping.</span>
      </div>
    </div>
  `;
}

// ---------- toast ----------
function showToast(message) {
  let toast = document.getElementById('global-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'global-toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), 2600);
}

// ---------- scroll reveal ----------
function initScrollReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || items.length === 0) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  items.forEach((el) => observer.observe(el));
}

// ---------- countdown ----------
function startCountdown(targetIso, els) {
  const target = new Date(targetIso).getTime();
  function tick() {
    const now = Date.now();
    let diff = target - now;
    if (diff < 0) diff = 0;
    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const m = Math.floor((diff / (1000 * 60)) % 60);
    const s = Math.floor((diff / 1000) % 60);
    if (els.days) els.days.textContent = String(d).padStart(2, '0');
    if (els.hours) els.hours.textContent = String(h).padStart(2, '0');
    if (els.mins) els.mins.textContent = String(m).padStart(2, '0');
    if (els.secs) els.secs.textContent = String(s).padStart(2, '0');
  }
  tick();
  return setInterval(tick, 1000);
}

// ---------- currency ----------
function formatINR(amount) {
  return '₹' + Number(amount).toLocaleString('en-IN');
}

// ---------- checkout item transfer (Buy Now -> checkout.html) ----------
function setCheckoutItems(items) {
  sessionStorage.setItem('checkoutItems', JSON.stringify(items));
}
function getCheckoutItems() {
  try {
    return JSON.parse(sessionStorage.getItem('checkoutItems') || '[]');
  } catch {
    return [];
  }
}

// ---------- escape helper ----------
function esc(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}
