// PHC — Stripe Webhook Handler
// FILE REF: PHC-TXN-002
// Handles: checkout.session.completed → creates Printful order
//
// SETUP REQUIRED:
// 1. Set STRIPE_WEBHOOK_SECRET in Netlify env vars (from Stripe Dashboard → Webhooks)
// 2. Set PRINTFUL_API_KEY in Netlify env vars (from Printful → Settings → API)
// 3. Set PRINTFUL_STORE_ID in Netlify env vars (from Printful Dashboard URL)

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// PHC product names as they appear in Printful — used to match sync products
const FILE_NAMES = {
  '001': 'FILE 001',
  '002': 'FILE 002',
};

// Mac copy-paste silently corrupts certain characters in API keys.
// Apply corrections before every Printful API call.
function getPrintfulApiKey() {
  return (process.env.PRINTFUL_API_KEY || '')
    .replace(/\u00D7/g, 'x')   // × (U+00D7) → x
    .replace(/\u041E/g, 'O');  // Cyrillic О (U+041E) → Latin O
}

function printfulHeaders() {
  return {
    'Authorization': `Bearer ${getPrintfulApiKey()}`,
    'Content-Type': 'application/json',
    'X-PF-Store-Id': process.env.PRINTFUL_STORE_ID || '',
  };
}

// Look up the numeric sync_variant_id from Printful by product name and size
async function getSyncVariantId(fileId, size) {
  const targetName = FILE_NAMES[fileId];
  if (!targetName) throw new Error(`Unknown file ID: ${fileId}`);

  const res = await fetch('https://api.printful.com/sync/products', {
    headers: printfulHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Printful products fetch failed: ${JSON.stringify(data)}`);

  const product = (data.result || []).find(p =>
    p.name.toUpperCase().includes(targetName.toUpperCase())
  );
  if (!product) throw new Error(`Printful product not found for file ${fileId}`);

  const detailRes = await fetch(`https://api.printful.com/sync/products/${product.id}`, {
    headers: printfulHeaders(),
  });
  const detail = await detailRes.json();
  if (!detailRes.ok) throw new Error(`Printful product detail failed: ${JSON.stringify(detail)}`);

  const variant = (detail.result?.sync_variants || []).find(v =>
    v.size === size || (v.name && v.name.toUpperCase().includes(size.toUpperCase()))
  );
  if (!variant) throw new Error(`No variant found for file ${fileId} size ${size}`);

  console.log(`Resolved variant — file:${fileId} size:${size} sync_variant_id:${variant.id}`);
  return variant.id; // numeric integer
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sig = event.headers['stripe-signature'];

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

  if (stripeEvent.type === 'checkout.session.completed') {
    // Retrieve full session — webhook payload may not include shipping_details
    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(
        stripeEvent.data.object.id
      );
    } catch (err) {
      console.error('Failed to retrieve session from Stripe:', err.message);
      return { statusCode: 500, body: 'Session retrieval failed' };
    }

    if (session.payment_status !== 'paid') {
      return { statusCode: 200, body: JSON.stringify({ received: true, skipped: 'unpaid' }) };
    }

    try {
      await createPrintfulOrder(session);
    } catch (err) {
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

  // Dynamically resolve the numeric sync_variant_id from Printful
  const syncVariantId = await getSyncVariantId(file_id, size);

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
      sync_variant_id: syncVariantId,
      quantity: 1,
    }],
    confirm: true,
  };

  const response = await fetch('https://api.printful.com/orders', {
    method: 'POST',
    headers: printfulHeaders(),
    body: JSON.stringify(orderPayload),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(`Printful API error ${response.status}: ${JSON.stringify(result)}`);
  }

  console.log(`Printful order created — file:${file_id} size:${size} order_id:${result.result?.id} archivist:${customerEmail}`);
  return result;
}
