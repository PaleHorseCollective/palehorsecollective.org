// PHC — Create Stripe Checkout Session
// FILE REF: PHC-TXN-001
// Receives: { fileId: '001'|'002', size: 'XS'|'S'|'M'|'L'|'XL'|'2XL' }
// Returns:  { url: stripe_checkout_url }

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const FILES = {
  '001': {
    name: 'File 001 — The Capstone',
    description: 'The unfinished pyramid. Inverted, decoded, documented. Edition of 500. Never reprinted.',
    successPath: '/001.html',
    cancelPath: '/001.html',
  },
  '002': {
    name: 'File 002 — The Signal Tower',
    description: 'The broadcast infrastructure of manufactured consensus. Edition of 500. Never reprinted.',
    successPath: '/002.html',
    cancelPath: '/002.html',
  },
};

const ALLOWED_COUNTRIES = [
  'AU', 'US', 'GB', 'CA', 'NZ', 'DE', 'FR', 'NL', 'SE', 'DK', 'NO', 'FI',
  'AT', 'BE', 'CH', 'IE', 'IT', 'ES', 'PT', 'PL', 'JP', 'SG', 'HK',
];

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

  const file = FILES[fileId];
  if (!file) {
    return { statusCode: 400, body: 'Unknown file ID' };
  }

  const VALID_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL'];
  if (!VALID_SIZES.includes(size)) {
    return { statusCode: 400, body: 'Invalid size' };
  }

  const origin = event.headers.origin || 'https://palehorsecollective.org';

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'aud',
          product_data: {
            name: file.name,
            description: `Size: ${size} // ${file.description}`,
          },
          unit_amount: 5900, // $59.00 AUD in cents
        },
        quantity: 1,
      }],
      mode: 'payment',
      shipping_address_collection: {
        allowed_countries: ALLOWED_COUNTRIES,
      },
      success_url: `${origin}${file.successPath}?order=confirmed&session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${file.cancelPath}`,
      metadata: {
        file_id: fileId,
        size: size,
      },
      custom_text: {
        submit: {
          message: 'Print on demand. Ships globally via Printful. No reprints.',
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
