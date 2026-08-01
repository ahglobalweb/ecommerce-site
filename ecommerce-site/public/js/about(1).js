(async function () {
  const settings = await loadSettings();
  renderHeader('about');
  renderOfferBanner();
  renderFooter();

  document.getElementById('about-description').textContent =
    settings.aboutDescription || 'Aurelia is a small-batch studio making considered objects for the home and wardrobe.';
  document.getElementById('fb-link').href = settings.facebookUrl || '#';
  document.getElementById('ig-link').href = settings.instagramUrl || '#';
  document.getElementById('phone-text').textContent = settings.phoneNumber || '';
  document.getElementById('phone-link').href = 'tel:' + (settings.phoneNumber || '').replace(/\s+/g, '');

  initScrollReveal();
})();
