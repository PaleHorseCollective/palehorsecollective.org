// PHC — Stripe Webhook Handler
// FILE REF: PHC-TXN-002
// Handles: checkout.session.completed → creates Printful order
//
// SETUP REQUIRED:
//   1. Set STRIPE_WEBHOOK_SECRET in Netlify env vars (from Stripe Dashboard → Webhooks)
//   2. Set PRINTFUL_API_KEY in Netlify env vars (from Printful → Settings → API)
//   3. Add each product's Printful sync variant IDs to products.json
//   4. Set ALERT_EMAIL_API_KEY so a failed order emails palehorsecollective@proton.me
//      (see docs/ORDER-ALERTS.md). Optional: ALERT_EMAIL_FROM.
//      If the key is missing, the failure is logged and no email is sent.

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// PRINTFUL SYNC VARIANT IDs live in products.json under each product's
// "printfulVariants" (size -> sync_variant_id). Find them via
// GET https://api.printful.com/sync/products or the Printful dashboard.
const catalogue = require('../../products.json');

const ALERT_TO = 'palehorsecollective@proton.me';
const DEFAULT_ALERT_FROM = 'Pale Horse Collective <onboarding@resend.dev>';
const HOUR_MS = 60 * 60 * 1000;
// Stripe retries live webhook deliveries for up to 3 days, and does not say
// which attempt is the last. Email once the event is 60 hours old, while
// still returning 5xx so a later retry can succeed.
const LIVE_FINAL_AGE_MS = 60 * HOUR_MS;
// Sandbox deliveries retry three times over a few hours.
const TEST_FINAL_AGE_MS = HOUR_MS;

function variantFor(fileId, size) {
  const product = catalogue.products.find((p) => p.checkoutId === fileId || p.slug === fileId);
  return product && product.printfulVariants ? product.printfulVariants[size] : undefined;
}

function productLabel(fileId) {
  const product = catalogue.products.find((p) => p.checkoutId === fileId || p.slug === fileId);
  if (!product) return fileId ? String(fileId) : 'unknown product';
  return product.code ? `${product.name} (${product.code})` : product.name;
}

// Stripe puts the address on shipping_details, or, on newer API versions,
// on collected_information.shipping_details. Use whichever one is present.
function shippingFrom(session) {
  if (!session) return null;
  return session.shipping_details
    || (session.collected_information && session.collected_information.shipping_details)
    || null;
}

// Printful external_id is at most 32 characters: letters, digits, _ and -.
// A Checkout Session id is longer than that. The same id must always produce
// the same code, or a retry could create a second order.
function externalIdForSession(sessionId) {
  const cleaned = String(sessionId || '').replace(/[^A-Za-z0-9_-]/g, '');
  if (!cleaned) return '';
  if (cleaned.length <= 32) return cleaned;
  return cleaned.slice(0, 8) + cleaned.slice(-24);
}

function errorText(body) {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  const parts = [];
  if (typeof body.result === 'string') parts.push(body.result);
  if (body.error) {
    if (typeof body.error === 'string') parts.push(body.error);
    if (typeof body.error.message === 'string') parts.push(body.error.message);
    if (typeof body.error.reason === 'string') parts.push(body.error.reason);
  }
  if (typeof body.message === 'string') parts.push(body.message);
  return parts.length ? parts.join(' ') : JSON.stringify(body);
}

function isExistingOrderError(status, body) {
  if (status !== 400 && status !== 409 && status !== 422) return false;
  const text = errorText(body).toLowerCase();
  const aboutExternalId = text.includes('external_id')
    || text.includes('external id')
    || text.includes('external-id');
  if (!aboutExternalId) return false;
  return /already exist|already been|\bduplicate\b|must be unique|\bunique\b|\btaken\b/.test(text);
}

function isTransientHttpStatus(status) {
  return status === 408 || status === 429 || (typeof status === 'number' && status >= 500);
}

class PrintfulOrderError extends Error {
  constructor(message, transient) {
    super(message);
    this.name = 'PrintfulOrderError';
    this.transient = Boolean(transient);
  }
}

function isFinalDelivery(options) {
  if (!options.eventCreated) return false;
  const now = options.now || (() => Date.now());
  const ageMs = now() - options.eventCreated * 1000;
  if (ageMs < 0) return false;
  const livemode = options.livemode !== false;
  return ageMs >= (livemode ? LIVE_FINAL_AGE_MS : TEST_FINAL_AGE_MS);
}

async function createPrintfulOrder(session, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const env = deps.env || process.env;

  if (!session || !session.id) {
    throw new PrintfulOrderError('Missing Stripe checkout session id', false);
  }

  const fileId = session.metadata && session.metadata.file_id;
  const size = session.metadata && session.metadata.size;
  const shipping = shippingFrom(session);
  const customerEmail = session.customer_details && session.customer_details.email;

  const externalId = externalIdForSession(session.id);
  if (!externalId) {
    throw new PrintfulOrderError('Stripe session id cannot be used as a Printful external id', false);
  }

  if (!shipping || !shipping.address || !fileId || !size) {
    throw new PrintfulOrderError(
      `Missing session data: file_id=${fileId} size=${size} shipping=${Boolean(shipping && shipping.address)}`,
      false
    );
  }

  const variantId = variantFor(fileId, size);
  if (!variantId) {
    throw new PrintfulOrderError(`No Printful variant ID configured for file ${fileId} size ${size}`, false);
  }

  const orderPayload = {
    external_id: externalId,
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
    // Confirm immediately — Printful will hold for review if there's an issue.
    // Do not send update_existing: a retry must not edit an order already placed.
    confirm: true,
  };

  let response;
  try {
    response = await fetchImpl('https://api.printful.com/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.PRINTFUL_API_KEY}`,
        'Content-Type': 'application/json',
        'X-PF-Store-Id': env.PRINTFUL_STORE_ID || '',
      },
      body: JSON.stringify(orderPayload),
    });
  } catch (err) {
    throw new PrintfulOrderError(`Printful request failed: ${err.message}`, true);
  }

  let raw = '';
  try {
    raw = await response.text();
  } catch (err) {
    throw new PrintfulOrderError(`Printful response could not be read: ${err.message}`, true);
  }

  let result = null;
  if (raw) {
    try {
      result = JSON.parse(raw);
    } catch (parseErr) {
      const snippet = raw.slice(0, 500);
      if (!response.ok) {
        throw new PrintfulOrderError(
          `Printful API error ${response.status}: ${snippet}`,
          isTransientHttpStatus(response.status)
        );
      }
      // The order may have been created. A retry is safe because external_id is set.
      throw new PrintfulOrderError(`Printful returned ${response.status} with an unreadable body`, true);
    }
  }

  if (isExistingOrderError(response.status, result)) {
    return { duplicate: true, externalId, result };
  }

  if (!response.ok) {
    const detail = result == null ? '' : (typeof result === 'string' ? result : JSON.stringify(result));
    throw new PrintfulOrderError(
      `Printful API error ${response.status}: ${detail}`.slice(0, 2000),
      isTransientHttpStatus(response.status)
    );
  }

  console.log(`Printful order created — file:${fileId} size:${size} order_id:${result && result.result && result.result.id} external_id:${externalId} session:${session.id} customer:${customerEmail}`);
  return { duplicate: false, externalId, result };
}

function formatAddress(session) {
  const shipping = shippingFrom(session);
  if (!shipping || !shipping.address) return 'unknown';
  const address = shipping.address;
  return [
    shipping.name,
    address.line1,
    address.line2,
    [address.city, address.state, address.postal_code].filter(Boolean).join(' '),
    address.country,
  ].filter(Boolean).join(', ');
}

function formatAlert(details) {
  const session = details.session || {};
  const metadata = session.metadata || {};
  const fileId = metadata.file_id;
  const size = metadata.size || 'unknown';
  const email = (session.customer_details && session.customer_details.email) || 'unknown';
  const intro = details.reason === 'final'
    ? 'Someone paid, but Printful has been failing for a long time. Stripe retries for up to three days and is near the end of those retries. This site is still asking Stripe to try again. If a later try works, the order will show up in Printful on its own. Look there before you place a second one.'
    : 'Someone paid, but the order was not created and retrying will not fix it. Stripe will stop trying. The customer has been charged. Place the order in Printful by hand, or fix the problem and resend this event from Stripe.';
  const errorMessage = details.error && details.error.message ? details.error.message : String(details.error || 'unknown error');
  return [
    intro,
    '',
    `Stripe session: ${session.id || 'unknown'}`,
    `Product: ${productLabel(fileId)}`,
    `Size: ${size}`,
    `Customer email: ${email}`,
    `Ship to: ${formatAddress(session)}`,
    '',
    'Printful error:',
    errorMessage.slice(0, 2000),
  ].join('\n');
}

function alertSubject(session, reason) {
  const metadata = (session && session.metadata) || {};
  const size = metadata.size || '?';
  const name = productLabel(metadata.file_id);
  const lead = reason === 'final'
    ? 'Printful still failing for a paid order'
    : 'Paid order was not sent to Printful';
  return `${lead}: ${name}, size ${size}`.slice(0, 180);
}

async function sendOwnerAlert(details, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const env = deps.env || process.env;
  const session = details.session || {};
  const text = formatAlert(details);
  const apiKey = env.ALERT_EMAIL_API_KEY;

  if (!apiKey) {
    console.error(`ALERT EMAIL NOT SENT — ALERT_EMAIL_API_KEY is not set in Netlify. Paid order needs a person.\n${text}`);
    return { sent: false, reason: 'missing_api_key' };
  }

  const reason = details.reason || 'permanent';
  try {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `phc-${reason}-${session.id || 'unknown'}`.slice(0, 256),
      },
      body: JSON.stringify({
        from: env.ALERT_EMAIL_FROM || DEFAULT_ALERT_FROM,
        to: [ALERT_TO],
        subject: alertSubject(session, reason),
        text,
      }),
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });

    if (!response.ok) {
      let providerBody = '';
      try {
        providerBody = await response.text();
      } catch (readErr) {
        providerBody = readErr.message;
      }
      console.error(`ALERT EMAIL FAILED — Resend responded ${response.status}. Paid order needs a person.\n${text}\nProvider said: ${String(providerBody).slice(0, 500)}`);
      return { sent: false, reason: 'provider_error' };
    }

    console.log(`Alert email sent to ${ALERT_TO} for session ${session.id} (${reason})`);
    return { sent: true };
  } catch (err) {
    console.error(`ALERT EMAIL FAILED — ${err.message}. Paid order needs a person.\n${text}`);
    return { sent: false, reason: 'network' };
  }
}

async function alertSafely(alertImpl, details) {
  try {
    await alertImpl(details);
  } catch (err) {
    console.error(`ALERT EMAIL FAILED — ${err.message}`);
  }
}

async function handlePaidCheckout(session, options = {}) {
  const alertImpl = options.alertImpl || sendOwnerAlert;

  try {
    const result = await createPrintfulOrder(session, {
      fetchImpl: options.fetchImpl,
      env: options.env,
    });
    if (result.duplicate) {
      console.log(`Printful order already exists — external_id:${result.externalId} session:${session.id}`);
      return { statusCode: 200, body: JSON.stringify({ received: true, duplicate: true }) };
    }
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    const transient = Boolean(err && err.transient);
    console.error(`Printful order creation failed (${transient ? 'will retry' : 'will not retry'}): ${err.message}`);

    const finalAttempt = transient && isFinalDelivery({
      eventCreated: options.eventCreated,
      livemode: options.livemode,
      now: options.now,
    });

    if (!transient || finalAttempt) {
      await alertSafely(alertImpl, {
        session,
        error: err,
        reason: transient ? 'final' : 'permanent',
      });
    }

    if (transient) {
      return { statusCode: 500, body: 'Printful order failed' };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ received: true, printful: 'needs_attention' }),
    };
  }
}

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

    return handlePaidCheckout(session, {
      eventCreated: stripeEvent.created,
      livemode: stripeEvent.livemode === true,
    });
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

exports.handlePaidCheckout = handlePaidCheckout;
exports.externalIdForSession = externalIdForSession;
exports.shippingFrom = shippingFrom;
exports.isExistingOrderError = isExistingOrderError;
exports.sendOwnerAlert = sendOwnerAlert;
