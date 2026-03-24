// PHC — Stripe Webhook Handler
// FILE REF: PHC-TXN-002
// Handles: checkout.session.completed → creates Printful order
//
// SETUP REQUIRED:
//   1. Set STRIPE_WEBHOOK_SECRET in Netlify env vars (from Stripe Dashboard → Webhooks)
//   2. Set PRINTFUL_API_KEY in Netlify env vars (from Printful → Settings → API)
//   3. Fill in PRINTFUL_VARIANT_IDS below (from Printful API or dashboard)

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// ─────────────────────────────────────────────────────────────────────────────
// PRINTFUL SYNC VARIANT IDs
// Find these via: GET https://api.printful.com/sync/products (with API key)
// Or: Printful Dashboard → your store → each product → each variant
//
// Format: PRINTFUL_VARIANT_IDS['fileId']['SIZE'] = sync_variant_id (number)
// ─────────────────────────────────────────────────────────────────────────────
const PRINTFUL_VARIANT_IDS = {
  '001': {
    'XS':  '69c25c14ef7c52',
    'S':   '69c25c14ef7cb9',
    'M':   '69c25c14ef7d04',
    'L':   '69c25c14ef7d56',
    'XL':  '69c25c14ef7d96',
    '2XL': '69c25c14ef7dd2',
  },
  '002': {
    'XS':  null, // TODO: replace with Printful sync_variant_id
    'S':   null,
    'M':   null,
    'L':   null,
    'XL':  null,
    '2XL': null,
  },
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sig = event.headers['stripe-signature'];

  // Verify webhook signature
  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // Handle checkout completion
  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;

    // Only process paid sessions
    if (session.payment_status !== 'paid') {
      return { statusCode: 200, body: JSON.stringify({ received: true, skipped: 'unpaid' }) };
    }

    try {
      await createPrintfulOrder(session);
    } catch (err) {
      // Log but don't fail the webhook — Stripe will retry on 5xx
      console.error('Printful order creation failed:', err.message);
      return { statusCode: 500, body: 'Printful order failed' };
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

async function createPrintfulOrder(session) {
  const { file_id, size } = session.metadata;
  const shipping = session.shipping_details;
  const customerEmail = session.customer_details?.email;

  if (!shipping || !file_id || !size) {
    throw new Error(`Missing session data: file_id=${file_id} size=${size} shipping=${!!shipping}`);
  }

  const variantId = PRINTFUL_VARIANT_IDS[file_id]?.[size];
  if (!variantId) {
    throw new Error(`No Printful variant ID configured for file ${file_id} size ${size}`);
  }

  const orderPayload = {
    recipient: {
      name: shipping.name,
      address1: shipping.address.line1,
      address2: shipping.address.line2 || '',
      city: shipping.address.city,
      state_code: shipping.address.state || '',
      country_code: shipping.address.country,
      zip: shipping.address.postal_code,
      email: customerEmail,
    },
    items: [{
      sync_variant_id: variantId,
      quantity: 1,
    }],
    // Confirm immediately — Printful will hold for review if there's an issue
    confirm: true,
  };

  const response = await fetch('https://api.printful.com/orders', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.PRINTFUL_API_KEY}`,
      'Content-Type': 'application/json',
      'X-PF-Store-Id': process.env.PRINTFUL_STORE_ID || '',
    },
    body: JSON.stringify(orderPayload),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(`Printful API error ${response.status}: ${JSON.stringify(result)}`);
  }

  console.log(`Printful order created — file:${file_id} size:${size} order_id:${result.result?.id} archivist:${customerEmail}`);
  return result;
}
