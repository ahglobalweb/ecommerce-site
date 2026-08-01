let CURRENT_PRODUCTS = [];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const session = await apiGet('/api/admin/session');
  if (session && session.isAdmin) {
    showDashboard();
  } else {
    showLogin();
  }
  bindLoginForm();
  bindNav();
  bindLogout();
  bindProductModal();
  bindContentForm();
  bindAppearanceForm();
  bindEmailForm();
  bindPasswordForm();
  bindSecretPathForm();
}

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('dashboard-screen').style.display = 'none';
}

async function showDashboard() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('dashboard-screen').style.display = 'flex';
  await Promise.all([loadProducts(), loadContentSettings(), loadAppearanceSettings(), loadOrders(), loadEmailSettings()]);
}

// ---------- fetch helpers ----------
async function apiGet(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) return null;
  return res.json();
}
async function apiSend(url, method, body) {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}
function alertBox(el, message, type) {
  el.innerHTML = message ? `<div class="admin-alert ${type}">${message}</div>` : '';
}

// ---------- login ----------
function bindLoginForm() {
  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById('login-alert');
    alertBox(alertEl, '', '');
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const { ok, data } = await apiSend('/api/admin/login', 'POST', { username, password });
    if (ok) {
      showDashboard();
    } else {
      alertBox(alertEl, data.error || 'Login failed', 'error');
    }
  });
}

function bindLogout() {
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await apiSend('/api/admin/logout', 'POST');
    showLogin();
  });
}

// ---------- nav ----------
function bindNav() {
  document.querySelectorAll('.admin-nav-item[data-panel]').forEach((item) => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.admin-nav-item[data-panel]').forEach((i) => i.classList.remove('active'));
      item.classList.add('active');
      const target = item.dataset.panel;
      document.querySelectorAll('.admin-panel-section').forEach((s) => s.classList.remove('active'));
      document.getElementById(target).classList.add('active');
    });
  });
}

// =========================================================================
// PRODUCTS
// =========================================================================
async function loadProducts() {
  const products = await apiGet('/api/admin/products');
  CURRENT_PRODUCTS = products || [];
  renderProductsTable();
}

function renderProductsTable() {
  const body = document.getElementById('products-table-body');
  if (!CURRENT_PRODUCTS.length) {
    body.innerHTML = `<tr><td colspan="8">No products yet. Click "Add Product" to create one.</td></tr>`;
    return;
  }
  body.innerHTML = CURRENT_PRODUCTS.map((p) => `
    <tr>
      <td><img src="${escAttr(p.image)}" alt="" /></td>
      <td>${escHtml(p.name)}</td>
      <td>${escHtml(p.category)}</td>
      <td>₹${Number(p.price).toLocaleString('en-IN')}</td>
      <td>${p.stock}</td>
      <td><span class="pill ${p.enabled ? 'on' : 'off'}">${p.enabled ? 'Enabled' : 'Disabled'}</span></td>
      <td>${p.featured ? '★' : '—'}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn-outline" data-edit="${p.id}">Edit</button>
          <button class="btn btn-outline" data-toggle="${p.id}">${p.enabled ? 'Disable' : 'Enable'}</button>
          <button class="btn btn-outline" data-delete="${p.id}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');

  body.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => openProductModal(btn.dataset.edit)));
  body.querySelectorAll('[data-toggle]').forEach((btn) => btn.addEventListener('click', () => toggleProduct(btn.dataset.toggle)));
  body.querySelectorAll('[data-delete]').forEach((btn) => btn.addEventListener('click', () => deleteProduct(btn.dataset.delete)));
}

async function toggleProduct(id) {
  const p = CURRENT_PRODUCTS.find((x) => x.id === id);
  if (!p) return;
  await apiSend(`/api/admin/products/${id}`, 'PUT', { enabled: !p.enabled });
  await loadProducts();
}

async function deleteProduct(id) {
  if (!confirm('Delete this product? This cannot be undone.')) return;
  await apiSend(`/api/admin/products/${id}`, 'DELETE');
  await loadProducts();
}

function bindProductModal() {
  document.getElementById('add-product-btn').addEventListener('click', () => openProductModal(null));
  document.getElementById('product-modal-cancel').addEventListener('click', closeProductModal);

  document.getElementById('pm-image-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch('/api/admin/upload', { method: 'POST', credentials: 'same-origin', body: formData });
    const data = await res.json();
    if (res.ok) {
      document.getElementById('pm-preview').src = data.url;
      document.getElementById('pm-preview').dataset.url = data.url;
    } else {
      alertBox(document.getElementById('product-modal-alert'), data.error || 'Upload failed', 'error');
    }
  });

  document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('pm-id').value;
    const payload = {
      name: document.getElementById('pm-name').value.trim(),
      shortDescription: document.getElementById('pm-shortDescription').value.trim(),
      description: document.getElementById('pm-description').value.trim(),
      price: Number(document.getElementById('pm-price').value),
      stock: Number(document.getElementById('pm-stock').value),
      category: document.getElementById('pm-category').value.trim(),
      featured: document.getElementById('pm-featured').checked,
      enabled: document.getElementById('pm-enabled').checked,
      image: document.getElementById('pm-preview').dataset.url || document.getElementById('pm-preview').src,
    };
    const alertEl = document.getElementById('product-modal-alert');
    const { ok, data } = id
      ? await apiSend(`/api/admin/products/${id}`, 'PUT', payload)
      : await apiSend('/api/admin/products', 'POST', payload);
    if (!ok) {
      alertBox(alertEl, data.error || 'Could not save product', 'error');
      return;
    }
    closeProductModal();
    await loadProducts();
  });
}

function openProductModal(id) {
  const modal = document.getElementById('product-modal');
  const alertEl = document.getElementById('product-modal-alert');
  alertBox(alertEl, '', '');
  const form = document.getElementById('product-form');
  form.reset();

  if (id) {
    const p = CURRENT_PRODUCTS.find((x) => x.id === id);
    document.getElementById('product-modal-title').textContent = 'Edit Product';
    document.getElementById('pm-id').value = p.id;
    document.getElementById('pm-name').value = p.name;
    document.getElementById('pm-shortDescription').value = p.shortDescription;
    document.getElementById('pm-description').value = p.description;
    document.getElementById('pm-price').value = p.price;
    document.getElementById('pm-stock').value = p.stock;
    document.getElementById('pm-category').value = p.category;
    document.getElementById('pm-featured').checked = !!p.featured;
    document.getElementById('pm-enabled').checked = !!p.enabled;
    document.getElementById('pm-preview').src = p.image;
    document.getElementById('pm-preview').dataset.url = p.image;
  } else {
    document.getElementById('product-modal-title').textContent = 'Add Product';
    document.getElementById('pm-id').value = '';
    document.getElementById('pm-enabled').checked = true;
    document.getElementById('pm-preview').src = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80';
    document.getElementById('pm-preview').dataset.url = '';
  }
  modal.classList.add('open');
}
function closeProductModal() {
  document.getElementById('product-modal').classList.remove('open');
}

// =========================================================================
// HOMEPAGE / OFFER CONTENT
// =========================================================================
async function loadContentSettings() {
  const s = await apiGet('/api/admin/settings');
  if (!s) return;
  document.getElementById('f-siteName').value = s.siteName || '';
  document.getElementById('f-heroHeading').value = s.heroHeading || '';
  document.getElementById('f-heroSubheading').value = s.heroSubheading || '';
  document.getElementById('f-offerText').value = s.offerText || '';
  document.getElementById('f-countdownTarget').value = toLocalDatetimeValue(s.countdownTarget);
  document.getElementById('f-aboutDescription').value = s.aboutDescription || '';
  document.getElementById('f-facebookUrl').value = s.facebookUrl || '';
  document.getElementById('f-instagramUrl').value = s.instagramUrl || '';
  document.getElementById('f-phoneNumber').value = s.phoneNumber || '';
}

function toLocalDatetimeValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function bindContentForm() {
  document.getElementById('content-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById('content-alert');
    const payload = {
      siteName: document.getElementById('f-siteName').value.trim(),
      heroHeading: document.getElementById('f-heroHeading').value.trim(),
      heroSubheading: document.getElementById('f-heroSubheading').value.trim(),
      offerText: document.getElementById('f-offerText').value.trim(),
      countdownTarget: document.getElementById('f-countdownTarget').value
        ? new Date(document.getElementById('f-countdownTarget').value).toISOString()
        : undefined,
      aboutDescription: document.getElementById('f-aboutDescription').value.trim(),
      facebookUrl: document.getElementById('f-facebookUrl').value.trim(),
      instagramUrl: document.getElementById('f-instagramUrl').value.trim(),
      phoneNumber: document.getElementById('f-phoneNumber').value.trim(),
    };
    const { ok, data } = await apiSend('/api/admin/settings', 'PUT', payload);
    alertBox(alertEl, ok ? 'Saved.' : data.error || 'Could not save', ok ? 'success' : 'error');
  });
}

// =========================================================================
// APPEARANCE
// =========================================================================
async function loadAppearanceSettings() {
  const s = await apiGet('/api/admin/settings');
  if (!s || !s.colors) return;
  const map = { primary: 'primary', accent: 'accent', accentSecondary: 'accentSecondary', background: 'background', surface: 'surface', text: 'text' };
  Object.entries(map).forEach(([key]) => {
    const val = s.colors[key] || '#000000';
    document.getElementById('c-' + key).value = val;
    document.getElementById('c-' + key + '-hex').value = val;
  });

  ['primary', 'accent', 'accentSecondary', 'background', 'surface', 'text'].forEach((key) => {
    const colorInput = document.getElementById('c-' + key);
    const hexInput = document.getElementById('c-' + key + '-hex');
    colorInput.addEventListener('input', () => (hexInput.value = colorInput.value));
    hexInput.addEventListener('input', () => {
      if (/^#([0-9a-f]{6})$/i.test(hexInput.value)) colorInput.value = hexInput.value;
    });
  });
}

function bindAppearanceForm() {
  document.getElementById('appearance-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById('appearance-alert');
    const colors = {
      primary: document.getElementById('c-primary-hex').value,
      accent: document.getElementById('c-accent-hex').value,
      accentSecondary: document.getElementById('c-accentSecondary-hex').value,
      background: document.getElementById('c-background-hex').value,
      surface: document.getElementById('c-surface-hex').value,
      text: document.getElementById('c-text-hex').value,
    };
    const { ok, data } = await apiSend('/api/admin/settings', 'PUT', { colors });
    alertBox(alertEl, ok ? 'Colors saved. Visit the site to see them live.' : data.error || 'Could not save', ok ? 'success' : 'error');
  });
}

// =========================================================================
// ORDERS
// =========================================================================
async function loadOrders() {
  const orders = await apiGet('/api/admin/orders');
  const body = document.getElementById('orders-table-body');
  if (!orders || !orders.length) {
    body.innerHTML = `<tr><td colspan="6">No orders yet.</td></tr>`;
    return;
  }
  body.innerHTML = orders.map((o) => `
    <tr>
      <td>${escHtml(o.id)}</td>
      <td>${new Date(o.createdAt).toLocaleString()}</td>
      <td>${escHtml(o.customer.fullName)}</td>
      <td>${escHtml(o.customer.phone)}</td>
      <td>${o.items.map((i) => `${escHtml(i.name)} ×${i.qty}`).join(', ')}</td>
      <td>₹${Number(o.total).toLocaleString('en-IN')}</td>
    </tr>
  `).join('');
}

// =========================================================================
// EMAIL CONFIG
// =========================================================================
async function loadEmailSettings() {
  const s = await apiGet('/api/admin/settings');
  if (!s) return;
  document.getElementById('e-orderNotificationEmail').value = s.orderNotificationEmail || '';
  document.getElementById('e-gmailSenderAddress').value = s.gmailSenderAddress || '';
  document.getElementById('e-gmailAppPassword').placeholder = s.gmailAppPasswordSet
    ? 'App password saved — leave blank to keep it'
    : 'Not set yet';
}

function bindEmailForm() {
  document.getElementById('email-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById('email-alert');
    const payload = {
      orderNotificationEmail: document.getElementById('e-orderNotificationEmail').value.trim(),
      gmailSenderAddress: document.getElementById('e-gmailSenderAddress').value.trim(),
      gmailAppPassword: document.getElementById('e-gmailAppPassword').value.trim(),
    };
    const { ok, data } = await apiSend('/api/admin/email-config', 'PUT', payload);
    alertBox(alertEl, ok ? 'Email settings saved.' : data.error || 'Could not save', ok ? 'success' : 'error');
    document.getElementById('e-gmailAppPassword').value = '';
    if (ok) loadEmailSettings();
  });
}

// =========================================================================
// SECURITY
// =========================================================================
function bindPasswordForm() {
  document.getElementById('password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById('password-alert');
    const current = document.getElementById('p-current').value;
    const next = document.getElementById('p-new').value;
    const confirm = document.getElementById('p-confirm').value;
    if (next !== confirm) {
      alertBox(alertEl, 'New passwords do not match', 'error');
      return;
    }
    const { ok, data } = await apiSend('/api/admin/password', 'PUT', { currentPassword: current, newPassword: next });
    alertBox(alertEl, ok ? 'Password updated.' : data.error || 'Could not update password', ok ? 'success' : 'error');
    if (ok) document.getElementById('password-form').reset();
  });
}

function bindSecretPathForm() {
  document.getElementById('secretpath-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById('secretpath-alert');
    const newSecretPath = document.getElementById('s-newpath').value.trim();
    const { ok, data } = await apiSend('/api/admin/secret-path', 'PUT', { newSecretPath });
    if (ok) {
      alertBox(alertEl, `Admin URL updated. New link: /admin/${escHtml(data.newSecretPath)} — save it now, this page will still work for this session.`, 'success');
    } else {
      alertBox(alertEl, data.error || 'Could not update admin URL', 'error');
    }
  });
}

// ---------- escaping ----------
function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}
function escAttr(str) {
  return escHtml(str);
}
