(async function () {
  await loadSettings();
  renderHeader('products');
  renderOfferBanner();
  renderFooter();

  let order = null;
  try {
    order = JSON.parse(sessionStorage.getItem('lastOrder') || 'null');
  } catch {
    order = null;
  }

  if (!order) {
    document.getElementById('order-details').innerHTML = `<p>We couldn't find your order details in this session, but a confirmation has been recorded.</p>`;
    return;
  }

  document.getElementById('order-id').textContent = order.id;

  const itemsHtml = order.items
    .map(
      (i) => `
      <div class="summary-item-row">
        <div class="meta">
          <div class="name">${esc(i.name)}</div>
          <div class="qty">Qty ${i.qty} × ${formatINR(i.price)}</div>
        </div>
        <div class="price">${Number(i.lineTotal).toLocaleString('en-IN')}</div>
      </div>`
    )
    .join('');

  document.getElementById('order-details').innerHTML = `
    <h4>Order Details — ${esc(order.id)}</h4>
    <p style="margin-bottom:18px;">Placed on ${new Date(order.createdAt).toLocaleString()}</p>
    <div style="margin-bottom:18px;">
      <strong>${esc(order.customer.fullName)}</strong><br/>
      ${esc(order.customer.houseName)}, ${esc(order.customer.roadName)}<br/>
      ${esc(order.customer.city)}, ${esc(order.customer.state)} - ${esc(order.customer.pinCode)}<br/>
      Phone: ${esc(order.customer.phone)}
    </div>
    ${itemsHtml}
    <div class="summary-line total"><span>Total Paid</span><span>${formatINR(order.total)}</span></div>
  `;
})();
