require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const cookieSession = require('cookie-session');
const multer = require('multer');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ---------- tiny JSON "database" helpers ----------
// A real deployment could swap these for a proper database; the file-based
// store keeps this project runnable with zero external services.
async function readJson(file) {
  const raw = await fsp.readFile(file, 'utf-8');
  return JSON.parse(raw);
}
async function writeJson(file, data) {
  await fsp.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
}

// ---------- bootstrap admin credentials + secret path on first run ----------
async function bootstrapSettings() {
  const settings = await readJson(SETTINGS_FILE);
  let changed = false;

  if (!settings.passwordHash) {
    const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'ChangeMe123!';
    settings.passwordHash = bcrypt.hashSync(defaultPassword, 10);
    changed = true;
    console.log('----------------------------------------------------------------');
    console.log('First run: an admin password has been set from ADMIN_DEFAULT_PASSWORD');
    console.log('(or "ChangeMe123!" if that was not set). Log in and change it from');
    console.log('the admin panel immediately.');
    console.log('----------------------------------------------------------------');
  }
  if (!settings.adminUsername) {
    settings.adminUsername = process.env.ADMIN_USERNAME || 'admin';
    changed = true;
  }
  if (!settings.adminSecretPath) {
    settings.adminSecretPath = process.env.ADMIN_SECRET_PATH || crypto.randomBytes(8).toString('hex');
    changed = true;
  }
  if (!settings.orderNotificationEmail && process.env.ORDER_NOTIFICATION_EMAIL) {
    settings.orderNotificationEmail = process.env.ORDER_NOTIFICATION_EMAIL;
    changed = true;
  }
  if (!settings.gmailSenderAddress && process.env.GMAIL_SENDER_ADDRESS) {
    settings.gmailSenderAddress = process.env.GMAIL_SENDER_ADDRESS;
    changed = true;
  }
  if (!settings.gmailAppPassword && process.env.GMAIL_APP_PASSWORD) {
    settings.gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
    changed = true;
  }

  if (changed) await writeJson(SETTINGS_FILE, settings);

  console.log('----------------------------------------------------------------');
  console.log('Hidden admin panel URL: /admin/' + settings.adminSecretPath);
  console.log('----------------------------------------------------------------');
}

// ---------- middleware ----------
app.use(express.json({ limit: '5mb' }));
app.use(
  cookieSession({
    name: 'aurelia_admin_session',
    keys: [process.env.SESSION_SECRET || 'dev_only_secret_change_me'],
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
    httpOnly: true,
    sameSite: 'lax',
  })
);

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

// simple in-memory rate limiter for the login route
const loginAttempts = new Map(); // ip -> { count, first }
function loginRateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const entry = loginAttempts.get(ip) || { count: 0, first: now };
  if (now - entry.first > windowMs) {
    entry.count = 0;
    entry.first = now;
  }
  entry.count += 1;
  loginAttempts.set(ip, entry);
  if (entry.count > 15) {
    return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  }
  next();
}

// ---------- image upload (admin only) ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
    cb(null, crypto.randomBytes(12).toString('hex') + safeExt);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  },
});

// =========================================================================
// PUBLIC API
// =========================================================================

app.get('/api/settings', async (req, res) => {
  try {
    const s = await readJson(SETTINGS_FILE);
    // never leak credentials/secrets to the public
    const {
      passwordHash, adminUsername, adminSecretPath,
      gmailAppPassword, gmailSenderAddress, orderNotificationEmail,
      ...publicSettings
    } = s;
    res.json(publicSettings);
  } catch (err) {
    res.status(500).json({ error: 'Could not load settings' });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const products = await readJson(PRODUCTS_FILE);
    res.json(products.filter((p) => p.enabled));
  } catch (err) {
    res.status(500).json({ error: 'Could not load products' });
  }
});

function validateOrderPayload(body) {
  const errors = {};
  const required = {
    fullName: 'Full name',
    houseName: 'House/Building name',
    roadName: 'Road name',
    city: 'City',
    state: 'State',
    pinCode: 'PIN code',
    phone: 'Phone number',
  };
  for (const [key, label] of Object.entries(required)) {
    if (!body[key] || String(body[key]).trim().length === 0) {
      errors[key] = `${label} is required`;
    }
  }
  if (body.pinCode && !/^[0-9]{4,10}$/.test(String(body.pinCode).trim())) {
    errors.pinCode = 'Enter a valid PIN code';
  }
  if (body.phone && !/^[0-9+\-\s()]{7,20}$/.test(String(body.phone).trim())) {
    errors.phone = 'Enter a valid phone number';
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.items = 'Your cart is empty';
  }
  return errors;
}

app.post('/api/orders', async (req, res) => {
  try {
    const errors = validateOrderPayload(req.body);
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'Validation failed', fields: errors });
    }

    const products = await readJson(PRODUCTS_FILE);
    const items = [];
    let total = 0;

    for (const line of req.body.items) {
      const product = products.find((p) => p.id === line.id && p.enabled);
      if (!product) continue;
      const qty = Math.max(1, Math.min(99, parseInt(line.qty, 10) || 1));
      const lineTotal = product.price * qty;
      total += lineTotal;
      items.push({
        id: product.id,
        name: product.name,
        price: product.price,
        qty,
        lineTotal,
      });
    }

    if (items.length === 0) {
      return res.status(400).json({ error: 'Validation failed', fields: { items: 'Your cart is empty' } });
    }

    const order = {
      id: 'ORD-' + Date.now().toString(36).toUpperCase(),
      createdAt: new Date().toISOString(),
      customer: {
        fullName: String(req.body.fullName).trim(),
        houseName: String(req.body.houseName).trim(),
        roadName: String(req.body.roadName).trim(),
        city: String(req.body.city).trim(),
        state: String(req.body.state).trim(),
        pinCode: String(req.body.pinCode).trim(),
        phone: String(req.body.phone).trim(),
      },
      items,
      total,
    };

    const orders = await readJson(ORDERS_FILE);
    orders.unshift(order);
    await writeJson(ORDERS_FILE, orders);

    sendOrderEmail(order).catch((err) => {
      console.error('Order email failed to send:', err.message);
    });

    res.status(201).json({ order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not place order' });
  }
});

async function sendOrderEmail(order) {
  const settings = await readJson(SETTINGS_FILE);
  const { gmailSenderAddress, gmailAppPassword, orderNotificationEmail } = settings;

  if (!gmailSenderAddress || !gmailAppPassword || !orderNotificationEmail) {
    console.log('Order received (email not sent — Gmail not configured in admin panel):', order.id);
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailSenderAddress, pass: gmailAppPassword },
  });

  const itemsHtml = order.items
    .map(
      (i) =>
        `<tr><td style="padding:4px 8px;border:1px solid #ddd;">${i.name}</td><td style="padding:4px 8px;border:1px solid #ddd;">${i.qty}</td><td style="padding:4px 8px;border:1px solid #ddd;">₹${i.price}</td><td style="padding:4px 8px;border:1px solid #ddd;">₹${i.lineTotal}</td></tr>`
    )
    .join('');

  const html = `
    <h2>New order ${order.id}</h2>
    <p><strong>Date:</strong> ${new Date(order.createdAt).toLocaleString()}</p>
    <h3>Customer</h3>
    <p>
      ${order.customer.fullName}<br/>
      ${order.customer.houseName}, ${order.customer.roadName}<br/>
      ${order.customer.city}, ${order.customer.state} - ${order.customer.pinCode}<br/>
      Phone: ${order.customer.phone}
    </p>
    <h3>Items</h3>
    <table style="border-collapse:collapse;">
      <thead><tr>
        <th style="padding:4px 8px;border:1px solid #ddd;">Product</th>
        <th style="padding:4px 8px;border:1px solid #ddd;">Qty</th>
        <th style="padding:4px 8px;border:1px solid #ddd;">Price</th>
        <th style="padding:4px 8px;border:1px solid #ddd;">Line total</th>
      </tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <p style="font-size:16px;"><strong>Order total: ₹${order.total}</strong></p>
  `;

  await transporter.sendMail({
    from: `"Aurelia Orders" <${gmailSenderAddress}>`,
    to: orderNotificationEmail,
    subject: `New order ${order.id} — ₹${order.total}`,
    html,
  });
}

// =========================================================================
// ADMIN API  (all under /api/admin, all protected except /login)
// =========================================================================

app.post('/api/admin/login', loginRateLimit, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const settings = await readJson(SETTINGS_FILE);
    if (
      username === settings.adminUsername &&
      password &&
      bcrypt.compareSync(password, settings.passwordHash)
    ) {
      req.session.isAdmin = true;
      req.session.username = username;
      return res.json({ ok: true });
    }
    return res.status(401).json({ error: 'Invalid username or password' });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get('/api/admin/session', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

app.get('/api/admin/products', requireAdmin, async (req, res) => {
  const products = await readJson(PRODUCTS_FILE);
  res.json(products);
});

app.post('/api/admin/products', requireAdmin, async (req, res) => {
  const products = await readJson(PRODUCTS_FILE);
  const body = req.body || {};
  if (!body.name || !body.price) {
    return res.status(400).json({ error: 'Name and price are required' });
  }
  const product = {
    id: 'p' + crypto.randomBytes(5).toString('hex'),
    name: String(body.name).trim(),
    shortDescription: String(body.shortDescription || '').trim(),
    description: String(body.description || '').trim(),
    price: Math.max(0, Number(body.price) || 0),
    image: body.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80',
    featured: !!body.featured,
    enabled: body.enabled !== false,
    category: String(body.category || 'General').trim(),
    stock: Math.max(0, Number(body.stock) || 0),
  };
  products.push(product);
  await writeJson(PRODUCTS_FILE, products);
  res.status(201).json({ product });
});

app.put('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const products = await readJson(PRODUCTS_FILE);
  const idx = products.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Product not found' });

  const body = req.body || {};
  const existing = products[idx];
  products[idx] = {
    ...existing,
    name: body.name !== undefined ? String(body.name).trim() : existing.name,
    shortDescription:
      body.shortDescription !== undefined ? String(body.shortDescription).trim() : existing.shortDescription,
    description: body.description !== undefined ? String(body.description).trim() : existing.description,
    price: body.price !== undefined ? Math.max(0, Number(body.price) || 0) : existing.price,
    image: body.image !== undefined ? body.image : existing.image,
    featured: body.featured !== undefined ? !!body.featured : existing.featured,
    enabled: body.enabled !== undefined ? !!body.enabled : existing.enabled,
    category: body.category !== undefined ? String(body.category).trim() : existing.category,
    stock: body.stock !== undefined ? Math.max(0, Number(body.stock) || 0) : existing.stock,
  };
  await writeJson(PRODUCTS_FILE, products);
  res.json({ product: products[idx] });
});

app.delete('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const products = await readJson(PRODUCTS_FILE);
  const next = products.filter((p) => p.id !== req.params.id);
  if (next.length === products.length) return res.status(404).json({ error: 'Product not found' });
  await writeJson(PRODUCTS_FILE, next);
  res.json({ ok: true });
});

app.post('/api/admin/upload', requireAdmin, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    res.json({ url: '/uploads/' + req.file.filename });
  });
});

app.get('/api/admin/settings', requireAdmin, async (req, res) => {
  const s = await readJson(SETTINGS_FILE);
  const { passwordHash, gmailAppPassword, ...safe } = s;
  res.json({ ...safe, gmailAppPasswordSet: !!gmailAppPassword });
});

app.put('/api/admin/settings', requireAdmin, async (req, res) => {
  const s = await readJson(SETTINGS_FILE);
  const body = req.body || {};
  const updatable = [
    'siteName',
    'heroHeading',
    'heroSubheading',
    'offerText',
    'countdownTarget',
    'colors',
    'aboutDescription',
    'facebookUrl',
    'instagramUrl',
    'phoneNumber',
  ];
  for (const key of updatable) {
    if (body[key] !== undefined) s[key] = body[key];
  }
  await writeJson(SETTINGS_FILE, s);
  const { passwordHash, gmailAppPassword, ...safe } = s;
  res.json(safe);
});

app.put('/api/admin/password', requireAdmin, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  const s = await readJson(SETTINGS_FILE);
  if (!bcrypt.compareSync(currentPassword || '', s.passwordHash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  s.passwordHash = bcrypt.hashSync(newPassword, 10);
  await writeJson(SETTINGS_FILE, s);
  res.json({ ok: true });
});

app.put('/api/admin/secret-path', requireAdmin, async (req, res) => {
  const { newSecretPath } = req.body || {};
  if (!newSecretPath || !/^[a-zA-Z0-9\-_.]{6,64}$/.test(newSecretPath)) {
    return res
      .status(400)
      .json({ error: 'Secret path must be 6-64 characters: letters, numbers, - _ . only' });
  }
  const s = await readJson(SETTINGS_FILE);
  s.adminSecretPath = newSecretPath;
  await writeJson(SETTINGS_FILE, s);
  res.json({ ok: true, newSecretPath });
});

app.put('/api/admin/email-config', requireAdmin, async (req, res) => {
  const { orderNotificationEmail, gmailSenderAddress, gmailAppPassword } = req.body || {};
  const s = await readJson(SETTINGS_FILE);
  if (orderNotificationEmail !== undefined) s.orderNotificationEmail = String(orderNotificationEmail).trim();
  if (gmailSenderAddress !== undefined) s.gmailSenderAddress = String(gmailSenderAddress).trim();
  if (gmailAppPassword) s.gmailAppPassword = String(gmailAppPassword).trim();
  await writeJson(SETTINGS_FILE, s);
  res.json({ ok: true });
});

app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  const orders = await readJson(ORDERS_FILE);
  res.json(orders);
});

// =========================================================================
// STATIC FILES + HIDDEN ADMIN ROUTE
// =========================================================================

app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/admin-assets', express.static(path.join(__dirname, 'admin')));
app.use(express.static(path.join(__dirname, 'public')));

// The ONLY way to reach the admin panel: knowing the exact secret slug.
// Any other value under /admin/* returns a plain 404, indistinguishable
// from a route that doesn't exist.
app.get('/admin/:secret', async (req, res) => {
  const s = await readJson(SETTINGS_FILE);
  if (req.params.secret !== s.adminSecretPath) {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(__dirname, 'admin', 'panel.html'));
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

bootstrapSettings().then(() => {
  app.listen(PORT, () => {
    console.log(`Aurelia server running on http://localhost:${PORT}`);
  });
});
