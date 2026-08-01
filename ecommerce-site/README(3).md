# Aurelia — E-commerce Website

A full-stack store: static HTML/CSS/JS storefront + a small Node/Express backend
that stores products/settings/orders in JSON files, sends order emails via
Gmail, and exposes a hidden, password-protected admin panel.

## 1. Install & run

You need [Node.js 18+](https://nodejs.org/) installed.

```bash
cd ecommerce-site
npm install
cp .env.example .env
# edit .env — at minimum set SESSION_SECRET and ADMIN_SECRET_PATH
npm start
```

The site runs at `http://localhost:3000`.

On first start the server prints your hidden admin URL and creates the
default admin login from `.env` (username `admin`, password `ChangeMe123!`
unless you changed `ADMIN_DEFAULT_PASSWORD`). **Log in and change the
password immediately** from Admin → Security.

## 2. Public pages

| Page | File | What it does |
|---|---|---|
| Home | `/index.html` | Hero, offer banner, live countdown, best sellers |
| Shop All | `/products.html` | Every product, search, category filters, qty selector, Buy Now |
| Checkout | `/checkout.html` | Delivery details form → places the order |
| Order Success | `/success.html` | Green check + order recap |
| About | `/about.html` | Company description, Facebook/Instagram, phone |

## 3. The hidden admin panel

There is **no link to it anywhere on the site** — no nav item, no footer
link. The only way in is the exact secret URL:

```
http://localhost:3000/admin/<ADMIN_SECRET_PATH>
```

`<ADMIN_SECRET_PATH>` is whatever you set in `.env` (or the random one
printed in the server log if you didn't set it). Any other value under
`/admin/*` returns a plain 404, same as a page that doesn't exist.

From inside the panel (all changes save instantly, no code edits needed):

- **Products** — add, edit, delete, enable/disable, upload images, mark as
  featured (shows on the homepage "Best Sellers" section).
- **Homepage & Offer** — site name, hero heading/subheading, offer banner
  text, countdown end date/time, About page copy, social links, phone.
- **Appearance** — six theme colors, applied across the whole site instantly.
- **Orders** — every order placed, with customer + item details.
- **Order Email** — the Gmail address that *receives* order notifications,
  and the Gmail account (+ App Password) used to *send* them.
- **Security** — change the admin password, and rotate the secret admin URL.

### Setting up order emails

1. In your Google Account go to **Security → 2-Step Verification → App
   Passwords** and generate an app password for "Mail".
2. In the admin panel, open **Order Email** and fill in:
   - **Notification recipient** — your Gmail address (where you want to
     receive orders).
   - **Sender Gmail address** — the Gmail account sending the email (can be
     the same address).
   - **Gmail App Password** — the 16-character app password from step 1.
3. Place a test order — you should receive an email with the customer's
   name, address, phone, ordered products, quantities, total, and the date
   and time of the order.

If email isn't configured yet, orders still save normally — they just
aren't emailed until you fill this in.

## 4. Project structure

```
ecommerce-site/
  server.js              Express app: public API, admin API, auth, email
  data/                  JSON "database" (products, settings, orders)
  public/                Storefront (served at /)
    index.html, products.html, checkout.html, success.html, about.html
    css/style.css
    js/common.js          shared header/footer/theme/toast/countdown
    js/main.js, products.js, checkout.js, success.js, about.js
    uploads/              product images uploaded from the admin panel
  admin/                  Hidden admin app (never linked publicly)
    panel.html             served only at /admin/<secret>
    css/admin.css
    js/admin.js
```

## 5. Notes on security

- Admin sessions use signed, httpOnly cookies (`cookie-session`).
- The admin password is hashed with bcrypt — never stored in plain text.
- The admin login route is rate-limited (15 attempts / 10 minutes / IP).
- All order form input is validated on both the client and the server.
- Only enabled products can be viewed or ordered through the public API.
- Change `SESSION_SECRET` and `ADMIN_SECRET_PATH` in `.env` before putting
  this online, and use HTTPS in production (e.g. behind a reverse proxy).

## 6. Deploying

This runs anywhere Node.js runs (Render, Railway, a VPS, etc.). Because
data is stored in local JSON files under `data/` and images under
`public/uploads/`, make sure your host's filesystem persists across
deploys/restarts (or swap the `readJson`/`writeJson` helpers in `server.js`
for a real database if you outgrow the file store).
