let CHECKOUT_PRODUCTS = [];
let CHECKOUT_ITEMS = [];

(async function () {
  await loadSettings();
  renderHeader('products');
  renderOfferBanner();
  renderFooter();

  CHECKOUT_ITEMS = getCheckoutItems();
  if (!CHECKOUT_ITEMS.length) {
    document.getElementById('checkout-empty').style.display = 'block';
    document.getElementById('checkout-content').style.display = 'none';
    return;
  }

  await loadSummary();
  bindForm();
})();

async function loadSummary() {
  const res = await fetch('/api/products');
  const products = await res.json();
  CHECKOUT_PRODUCTS = products;

  const list = document.getElementById('summary-items');
  let total = 0;
  list.innerHTML = CHECKOUT_ITEMS.map((item) => {
    const p = products.find((x) => x.id === item.id);
    if (!p) return '';
    const lineTotal = p.price * item.qty;
    total += lineTotal;
    return `
      <div class="summary-item-row">
        <img src="${esc(p.image)}" alt="${esc(p.name)}" />
        <div class="meta">
          <div class="name">${esc(p.name)}</div>
          <div class="qty">Qty ${item.qty} × ${formatINR(p.price)}</div>
        </div>
        <div class="price">${Number(lineTotal).toLocaleString('en-IN')}</div>
      </div>
    `;
  }).join('');

  const shipping = total > 5000 || total === 0 ? 0 : 199;
  const grandTotal = total + shipping;

  document.getElementById('summary-subtotal').textContent = formatINR(total);
  document.getElementById('summary-shipping').textContent = shipping === 0 ? 'Free' : formatINR(shipping);
  document.getElementById('summary-total').textContent = formatINR(grandTotal);
}

function bindForm() {
  const form = document.getElementById('checkout-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);

    const fields = ['fullName', 'houseName', 'roadName', 'city', 'state', 'pinCode', 'phone'];
    const payload = {};
    fields.forEach((f) => (payload[f] = form.elements[f].value.trim()));

    const clientErrors = validateClient(payload);
    if (Object.keys(clientErrors).length) {
      showErrors(form, clientErrors);
      return;
    }

    payload.items = CHECKOUT_ITEMS;

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Placing order…';

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.fields) showErrors(form, data.fields);
        else showToast(data.error || 'Could not place order');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm Order';
        return;
      }

      sessionStorage.setItem('lastOrder', JSON.stringify(data.order));
      sessionStorage.removeItem('checkoutItems');
      window.location.href = '/success.html';
    } catch (err) {
      showToast('Network error. Please try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirm Order';
    }
  });
}

function validateClient(payload) {
  const errors = {};
  if (!payload.fullName) errors.fullName = 'Full name is required';
  if (!payload.houseName) errors.houseName = 'House/Building name is required';
  if (!payload.roadName) errors.roadName = 'Road name is required';
  if (!payload.city) errors.city = 'City is required';
  if (!payload.state) errors.state = 'State is required';
  if (!payload.pinCode || !/^[0-9]{4,10}$/.test(payload.pinCode)) errors.pinCode = 'Enter a valid PIN code';
  if (!payload.phone || !/^[0-9+\-\s()]{7,20}$/.test(payload.phone)) errors.phone = 'Enter a valid phone number';
  return errors;
}

function showErrors(form, errors) {
  Object.entries(errors).forEach(([field, message]) => {
    const row = form.querySelector(`[data-field="${field}"]`);
    if (!row) return;
    row.classList.add('has-error');
    const msgEl = row.querySelector('.error-msg');
    if (msgEl) msgEl.textContent = message;
  });
  const firstError = form.querySelector('.has-error');
  if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function clearErrors(form) {
  form.querySelectorAll('.form-row').forEach((row) => row.classList.remove('has-error'));
}
