# How to add a new design

You only touch two things: your photos and `products.json`. Every page (home, shop, category pages, product page, menu, footer) updates itself.

## 1. Export your photos

- Portrait, 4:5 ratio (for example 1600 x 2000 px)
- `.webp` or `.jpg`, under about 400 KB each
- First photo is the main one. Second photo shows when someone hovers the card on desktop, so a worn shot first and a flat or graphic shot second works well
- Name them after the product, e.g. `img/eagle-hood-1.webp`, `img/eagle-hood-2.webp`
- A design file (`.svg`) also works. It gets shown on the dark background with padding instead of cropped

## 2. Set it up in Printful

Make the product in Printful like you did for 001 and 002. Grab the sync variant ID for each size (Printful dashboard, open the product, each size has its own ID). You don't need to touch Stripe: the price and name come from products.json.

## 3. Add it to products.json

Copy an existing product block, paste it at the top of the `products` list, and change the values:

```json
{
  "slug": "eagle-hood",
  "code": "PHC-003",
  "name": "Double Eagle Hood",
  "category": "Hoods",
  "price": 99,
  "colour": "Black",
  "status": "live",
  "isNew": true,
  "checkoutId": "003",
  "sizes": ["S", "M", "L", "XL", "2XL"],
  "printfulVariants": { "S": 5300000001, "M": 5300000002, "L": 5300000003, "XL": 5300000004, "2XL": 5300000005 },
  "images": [
    { "src": "/img/eagle-hood-1.webp", "alt": "Double Eagle Hood being worn, front view" },
    { "src": "/img/eagle-hood-2.webp", "alt": "Back print of the double-headed eagle" }
  ],
  "blurb": "One line about the design.",
  "details": ["Garment and colour", "Fabric", "Print method and placement", "Printed to order"],
  "story": "Two or three sentences on where the symbol comes from.",
  "storyLink": null
},
```

What each field does:

| Field | What it's for |
|---|---|
| `slug` | The web address: `palehorsecollective.org/products/eagle-hood`. Lowercase, hyphens, no spaces |
| `code` | Small product code shown under the name |
| `category` | Tees, Hoods, Headwear, whatever. A new category gets its own menu link and filter automatically |
| `status` | `live` (on sale), `coming-soon` (shows, can't buy), `sold-out` (shows, can't buy), `hidden` (off the site) |
| `isNew` | `true` puts a "New" badge on it and moves it to the front |
| `checkoutId` | Short ID the checkout uses for this product. Use the next number: 003, 004 |
| `printfulVariants` | Printful sync variant ID for each size. A size without an ID can't be bought, so checkout never takes money for something Printful can't print |
| `price` | Price in AUD. This is what Stripe charges |
| `images` | Photos in order. `alt` is a short plain description for screen readers |
| `story` | Shows in the "Behind the design" section on the product page |
| `storyLink` | Link to a longer write-up in the archive, or `null` if there isn't one |

Watch the commas: every product block ends with `},` except the last one in the list.

## 4. Push to GitHub

Netlify deploys it. Done.

## Changing the homepage

The top of `products.json` has a `site` section. Change `heroImage` to swap the big homepage photo (landscape or portrait both work, it fills the screen), and edit `announcement`, `heroLine` or the shipping and returns wording there too.

## How checkout works

The Buy button sends the product's `checkoutId` and the size to the `create-checkout` function. It looks the product up in products.json, charges that price in Stripe, and after payment sends the customer to `/thanks`. The `stripe-webhook` function then finds the Printful variant for that size in products.json and places the order. Nothing in the functions needs editing when you add products.
