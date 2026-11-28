# palehorsecollective.org

Plain HTML, CSS and JavaScript, hosted on Netlify. Every push to `main` deploys the live site.

## What's where

```
products.json          ← every product, price, photo and Printful ID. Edit this to add a product
index.html             home
shop.html              all products, with category filters
product.html           one template for every product page (/products/<slug>)
about.html             about, shipping, returns, contact
thanks.html            shown after someone pays

assets/css/styles.css  the look of the shop pages
assets/js/site.js      builds menus, product grids and product pages from products.json
assets/brand/          horse mark
img/products/          product photos and design files (name them <slug>-1.webp, <slug>-2.webp)

archive.html           the archive (stories behind the designs), reads archive.json
archive/               full write-ups for each symbol
doctrine.html          the doctrine page

netlify/functions/     checkout (Stripe) and order sending (Printful). Both read products.json
_redirects             clean URLs, plus old links (001, files, transmissions) pointing to the new pages
docs/                  how-to guides
```

## Adding a product

See [docs/HOW-TO-ADD-A-PRODUCT.md](docs/HOW-TO-ADD-A-PRODUCT.md). Short version: drop photos in `img/products/`, add one block to `products.json`, push.

## Checking it before it goes live

Push to a branch and open a pull request. Netlify builds a preview link for it. Merge when it looks right.
