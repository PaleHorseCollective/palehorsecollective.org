// PHC — Create Stripe Checkout Session
// Receives: { fileId: <checkoutId from products.json>, size: 'M' }
// Returns:  { url: stripe_checkout_url }
//
// Product name, price, sizes and status all come from products.json,
// so adding a product to that file is all the checkout needs.

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const catalogue = require('../../products.json');

const ALLOWED_COUNTRIES = [
  'AU', 'US', 'GB', 'CA', 'NZ', 'DE', 'FR', 'NL', 'SE', 'DK', 'NO', 'FI',
  'AT', 'BE', 'CH', 'IE', 'IT', 'ES', 'PT', 'PL', 'JP', 'SG', 'HK',
];

function findProduct(id) {
  return catalogue.products.find((p) => p.checkoutId === id || p.slug === id);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let fileId, size;
  try {
    ({ fileId, size } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: 'Invalid request body' };
  }

  const product = findProduct(fileId);
  if (!product || product.status !== 'live') {
    return { statusCode: 400, body: 'Product not available' };
  }
  if (!product.sizes.includes(size)) {
    return { statusCode: 400, body: 'Invalid size' };
  }
  if (!product.printfulVariants || !product.printfulVariants[size]) {
    // Stop here rather than take money for something Printful can't make.
    console.error(`No Printful variant for ${product.slug} size ${size}`);
    return { statusCode: 400, body: 'Size not set up for printing' };
  }

  const origin = event.headers.origin || 'https://palehorsecollective.org';

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'aud',
          product_data: {
            name: product.name,
            description: `Size ${size}, ${product.colour}`,
          },
          unit_amount: Math.round(product.price * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      shipping_address_collection: {
        allowed_countries: ALLOWED_COUNTRIES,
      },
      success_url: `${origin}/thanks?session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/products/${product.slug}`,
      metadata: {
        file_id: product.checkoutId,
        slug: product.slug,
        size: size,
      },
      custom_text: {
        submit: {
          message: 'Printed to order and shipped free. Allow 10 to 14 days for delivery.',
        },
      },
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
      },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error('Stripe session creation failed:', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Checkout session failed' }),
    };
  }
};
