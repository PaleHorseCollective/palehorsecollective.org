// Dev-only. Run with: node --test tests/stripe-webhook.test.js
// Not a Netlify function. No secrets.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder';

const stripe = require('stripe')('sk_test_placeholder');
const webhook = require('../netlify/functions/stripe-webhook');
const catalogue = require('../products.json');

const NOW = Date.parse('2026-11-28T00:00:00Z');
const WEBHOOK_SECRET = 'whsec_test_secret';
const LONG_SESSION_ID = 'cs_test_a11YYufWQzNY63zpQ6QSNRQhkUpVph4WRmzW0zWJO2znZKdVujZ0N0S22u';

function paidSession(overrides) {
  return Object.assign({
    id: LONG_SESSION_ID,
    payment_status: 'paid',
    metadata: { file_id: '001', size: 'M', slug: 'capstone-tee' },
    customer_details: { email: 'buyer@example.com' },
    shipping_details: {
      name: 'Ada Lovelace',
      address: {
        line1: '1 Example St',
        line2: 'Unit 2',
        city: 'Sydney',
        state: 'NSW',
        country: 'AU',
        postal_code: '2000',
      },
    },
  }, overrides || {});
}

function jsonResponse(status, body) {
  const raw = body == null ? '' : (typeof body === 'string' ? body : JSON.stringify(body));
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return raw; },
  };
}

function recordingFetch(responder) {
  const calls = [];
  const impl = async (url, opts) => {
    const parsed = opts && opts.body ? JSON.parse(opts.body) : null;
    calls.push({ url, opts, body: parsed });
    return responder({ url, opts, body: parsed, calls });
  };
  return { impl, calls };
}

function alertSpy() {
  const alerts = [];
  return {
    alerts,
    impl: async (details) => {
      alerts.push(details);
    },
  };
}

function checkoutOptions(extra) {
  return Object.assign({
    now: () => NOW,
    eventCreated: Math.floor(NOW / 1000),
    livemode: true,
    env: { PRINTFUL_API_KEY: 'test-printful-key', PRINTFUL_STORE_ID: 'store-1' },
  }, extra || {});
}

function duplicateBody(message) {
  return {
    code: 400,
    result: message,
    error: { reason: 'BadRequest', message },
  };
}

test('products.json is valid JSON', () => {
  const raw = fs.readFileSync(path.join(__dirname, '../products.json'), 'utf8');
  const data = JSON.parse(raw);
  assert.ok(Array.isArray(data.products) && data.products.length > 0);
  assert.deepEqual(data, catalogue);
});

test('external id is the session id when it already fits Printful', () => {
  assert.equal(webhook.externalIdForSession('cs_test_short_id'), 'cs_test_short_id');
});

test('external id keeps a stable 32-character slice of a long session id', () => {
  const first = webhook.externalIdForSession(LONG_SESSION_ID);
  const second = webhook.externalIdForSession(LONG_SESSION_ID);
  assert.equal(first, second);
  assert.equal(first.length, 32);
  assert.match(first, /^[A-Za-z0-9_-]+$/);
  assert.ok(first.startsWith('cs_test_'));
  assert.notEqual(
    webhook.externalIdForSession(LONG_SESSION_ID + 'x'),
    first
  );
});

test('shipping address is read from shipping_details or collected_information', () => {
  const legacy = paidSession();
  assert.equal(webhook.shippingFrom(legacy).name, 'Ada Lovelace');

  const newer = paidSession();
  const address = newer.shipping_details;
  delete newer.shipping_details;
  newer.collected_information = { shipping_details: address };
  assert.equal(webhook.shippingFrom(newer).address.line1, '1 Example St');

  const both = paidSession();
  both.collected_information = {
    shipping_details: {
      name: 'Other Person',
      address: { line1: '9 Other St', city: 'Melbourne', country: 'AU', postal_code: '3000' },
    },
  };
  assert.equal(webhook.shippingFrom(both).name, 'Ada Lovelace');
});

test('an existing Printful external id is success and does not alert', async () => {
  const messages = [
    "Order with external_id 'cs_test_abc' already exists",
    'The external id has already been taken',
    'external_id must be unique',
  ];

  for (const message of messages) {
    const seen = recordingFetch(() => jsonResponse(400, duplicateBody(message)));
    const alerts = alertSpy();
    const session = paidSession();
    const response = await webhook.handlePaidCheckout(session, checkoutOptions({
      fetchImpl: seen.impl,
      alertImpl: alerts.impl,
    }));

    assert.equal(response.statusCode, 200, message);
    assert.equal(JSON.parse(response.body).duplicate, true, message);
    assert.equal(alerts.alerts.length, 0, message);
    assert.equal(seen.calls.length, 1, message);
    assert.equal(seen.calls[0].body.external_id, webhook.externalIdForSession(session.id));
    assert.equal(seen.calls[0].body.confirm, true);
    assert.equal(seen.calls[0].body.recipient.email, 'buyer@example.com');
    assert.equal(seen.calls[0].body.recipient.address1, '1 Example St');
    assert.equal(
      seen.calls[0].body.items[0].sync_variant_id,
      catalogue.products.find((product) => product.checkoutId === '001').printfulVariants.M
    );
    assert.equal(seen.calls[0].opts.headers.Authorization, 'Bearer test-printful-key');
  }
});

test('a length error for external_id is a permanent failure, not a duplicate', () => {
  assert.equal(
    webhook.isExistingOrderError(400, duplicateBody('external_id is too long')),
    false
  );
});

test('a permanent Printful rejection returns 200 and alerts', async () => {
  const seen = recordingFetch(() => jsonResponse(400, duplicateBody('Recipient: country_code is invalid')));
  const alerts = alertSpy();
  const session = paidSession();
  const response = await webhook.handlePaidCheckout(session, checkoutOptions({
    fetchImpl: seen.impl,
    alertImpl: alerts.impl,
  }));

  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).printful, 'needs_attention');
  assert.equal(alerts.alerts.length, 1);
  assert.equal(alerts.alerts[0].reason, 'permanent');
  assert.equal(alerts.alerts[0].session.id, session.id);
  assert.match(alerts.alerts[0].error.message, /country_code is invalid/);
});

test('missing shipping, a missing variant, and a network error follow the retry rules', async () => {
  const noAddress = paidSession();
  delete noAddress.shipping_details;
  const missingAlerts = alertSpy();
  const missing = await webhook.handlePaidCheckout(noAddress, checkoutOptions({
    fetchImpl: async () => { throw new Error('should not be called'); },
    alertImpl: missingAlerts.impl,
  }));
  assert.equal(missing.statusCode, 200);
  assert.equal(missingAlerts.alerts.length, 1);
  assert.equal(missingAlerts.alerts[0].reason, 'permanent');

  const collected = paidSession();
  const moved = collected.shipping_details;
  delete collected.shipping_details;
  collected.collected_information = { shipping_details: moved };
  const placed = recordingFetch(() => jsonResponse(200, { code: 200, result: { id: 42 } }));
  const placedAlerts = alertSpy();
  const placedResponse = await webhook.handlePaidCheckout(collected, checkoutOptions({
    fetchImpl: placed.impl,
    alertImpl: placedAlerts.impl,
  }));
  assert.equal(placedResponse.statusCode, 200);
  assert.equal(placed.calls[0].body.recipient.city, 'Sydney');
  assert.equal(placedAlerts.alerts.length, 0);

  const unknownSize = paidSession({ metadata: { file_id: '001', size: '9XL' } });
  const sizeAlerts = alertSpy();
  const sizeResponse = await webhook.handlePaidCheckout(unknownSize, checkoutOptions({
    fetchImpl: async () => { throw new Error('should not be called'); },
    alertImpl: sizeAlerts.impl,
  }));
  assert.equal(sizeResponse.statusCode, 200);
  assert.match(sizeAlerts.alerts[0].error.message, /9XL/);

  for (const status of [429, 500, 503]) {
    const seen = recordingFetch(() => jsonResponse(status, { code: status, result: 'unavailable' }));
    const alerts = alertSpy();
    const response = await webhook.handlePaidCheckout(paidSession(), checkoutOptions({
      fetchImpl: seen.impl,
      alertImpl: alerts.impl,
    }));
    assert.equal(response.statusCode, 500, String(status));
    assert.equal(response.body, 'Printful order failed');
    assert.equal(alerts.alerts.length, 0, String(status));
  }

  const network = recordingFetch(() => { throw new Error('network down'); });
  const networkAlerts = alertSpy();
  const networkResponse = await webhook.handlePaidCheckout(paidSession(), checkoutOptions({
    fetchImpl: network.impl,
    alertImpl: networkAlerts.impl,
  }));
  assert.equal(networkResponse.statusCode, 500);
  assert.equal(networkAlerts.alerts.length, 0);
  assert.equal(network.calls.length, 1);
});

test('a transient failure emails only when Stripe is near the end of its retries', async () => {
  async function run(options) {
    const seen = recordingFetch(() => jsonResponse(503, { code: 503, result: 'down' }));
    const alerts = alertSpy();
    const response = await webhook.handlePaidCheckout(paidSession(), checkoutOptions(Object.assign({
      fetchImpl: seen.impl,
      alertImpl: alerts.impl,
    }, options)));
    return { response, alerts };
  }

  const freshLive = await run({ livemode: true, eventCreated: Math.floor(NOW / 1000) });
  assert.equal(freshLive.response.statusCode, 500);
  assert.equal(freshLive.alerts.alerts.length, 0);

  const oldLive = await run({
    livemode: true,
    eventCreated: Math.floor(NOW / 1000) - 61 * 60 * 60,
  });
  assert.equal(oldLive.response.statusCode, 500);
  assert.equal(oldLive.alerts.alerts.length, 1);
  assert.equal(oldLive.alerts.alerts[0].reason, 'final');

  const freshTest = await run({
    livemode: false,
    eventCreated: Math.floor(NOW / 1000) - 30 * 60,
  });
  assert.equal(freshTest.response.statusCode, 500);
  assert.equal(freshTest.alerts.alerts.length, 0);

  const oldTest = await run({
    livemode: false,
    eventCreated: Math.floor(NOW / 1000) - 2 * 60 * 60,
  });
  assert.equal(oldTest.response.statusCode, 500);
  assert.equal(oldTest.alerts.alerts.length, 1);
  assert.equal(oldTest.alerts.alerts[0].reason, 'final');
});

test('alert email includes the session, product, size, customer and error', async () => {
  const seen = recordingFetch(() => jsonResponse(200, { id: 'email_1' }));
  const session = paidSession();
  const result = await webhook.sendOwnerAlert({
    session,
    reason: 'permanent',
    error: new Error('Printful API error 400: bad postcode'),
  }, {
    fetchImpl: seen.impl,
    env: { ALERT_EMAIL_API_KEY: 're_test_key' },
  });

  assert.equal(result.sent, true);
  assert.equal(seen.calls[0].url, 'https://api.resend.com/emails');
  assert.equal(seen.calls[0].opts.headers.Authorization, 'Bearer re_test_key');
  assert.equal(seen.calls[0].body.to[0], 'palehorsecollective@proton.me');
  assert.match(seen.calls[0].body.text, new RegExp(session.id));
  assert.match(seen.calls[0].body.text, /The Capstone Tee/);
  assert.match(seen.calls[0].body.text, /Size: M/);
  assert.match(seen.calls[0].body.text, /buyer@example.com/);
  assert.match(seen.calls[0].body.text, /bad postcode/);
  assert.match(seen.calls[0].body.subject, /The Capstone Tee/);
  assert.equal(seen.calls[0].body.from, 'Pale Horse Collective <onboarding@resend.dev>');
});

test('a missing alert key logs and does not call the email service', async () => {
  let called = false;
  const errors = [];
  const original = console.error;
  console.error = (message) => errors.push(message);
  try {
    const result = await webhook.sendOwnerAlert({
      session: paidSession(),
      reason: 'permanent',
      error: new Error('no variant'),
    }, {
      fetchImpl: async () => { called = true; },
      env: {},
    });
    assert.equal(result.sent, false);
    assert.equal(result.reason, 'missing_api_key');
    assert.equal(called, false);
    assert.match(errors.join('\n'), /ALERT EMAIL NOT SENT/);
    assert.match(errors.join('\n'), /buyer@example.com/);
  } finally {
    console.error = original;
  }
});

test('an email provider failure does not throw', async () => {
  const result = await webhook.sendOwnerAlert({
    session: paidSession(),
    reason: 'permanent',
    error: new Error('bad address'),
  }, {
    fetchImpl: async () => jsonResponse(500, { message: 'resend down' }),
    env: { ALERT_EMAIL_API_KEY: 're_test_key' },
  });
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'provider_error');
});

function signedEvent(stripeEvent) {
  const payload = JSON.stringify(stripeEvent);
  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });
  return {
    httpMethod: 'POST',
    headers: { 'stripe-signature': header },
    body: payload,
  };
}

async function withWebhookEnv(fn) {
  const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const previousAlert = process.env.ALERT_EMAIL_API_KEY;
  const previousPrintful = process.env.PRINTFUL_API_KEY;
  const previousFetch = global.fetch;
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.PRINTFUL_API_KEY = 'test-printful-key';
  delete process.env.ALERT_EMAIL_API_KEY;
  try {
    return await fn();
  } finally {
    if (previousSecret == null) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
    if (previousAlert == null) delete process.env.ALERT_EMAIL_API_KEY;
    else process.env.ALERT_EMAIL_API_KEY = previousAlert;
    if (previousPrintful == null) delete process.env.PRINTFUL_API_KEY;
    else process.env.PRINTFUL_API_KEY = previousPrintful;
    global.fetch = previousFetch;
  }
}

test('signature verification still rejects a bad signature', async () => {
  await withWebhookEnv(async () => {
    global.fetch = async () => { throw new Error('fetch should not run'); };
    const response = await webhook.handler({
      httpMethod: 'POST',
      headers: { 'stripe-signature': 't=1,v1=deadbeef' },
      body: JSON.stringify({ type: 'checkout.session.completed' }),
    });
    assert.equal(response.statusCode, 400);
    assert.match(response.body, /Webhook Error/);
  });
});

test('the handler acknowledges an unpaid session without calling Printful', async () => {
  await withWebhookEnv(async () => {
    global.fetch = async () => { throw new Error('fetch should not run'); };
    const response = await webhook.handler(signedEvent({
      id: 'evt_unpaid',
      type: 'checkout.session.completed',
      created: Math.floor(NOW / 1000),
      livemode: false,
      data: { object: paidSession({ payment_status: 'unpaid' }) },
    }));
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).skipped, 'unpaid');
  });
});

test('the handler treats a duplicate Printful order as success', async () => {
  await withWebhookEnv(async () => {
    const calls = [];
    global.fetch = async (url, opts) => {
      calls.push(url);
      assert.equal(url, 'https://api.printful.com/orders');
      return jsonResponse(400, duplicateBody("Order with external_id 'x' already exists"));
    };
    const response = await webhook.handler(signedEvent({
      id: 'evt_dup',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      data: { object: paidSession() },
    }));
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).duplicate, true);
    assert.deepEqual(calls, ['https://api.printful.com/orders']);
  });
});

test('the handler returns 500 for a fresh Printful outage and 200 for a permanent rejection', async () => {
  await withWebhookEnv(async () => {
    const urls = [];
    global.fetch = async (url) => {
      urls.push(url);
      if (url === 'https://api.resend.com/emails') return jsonResponse(200, { id: 'email_1' });
      return jsonResponse(503, { code: 503, result: 'down' });
    };
    process.env.ALERT_EMAIL_API_KEY = 're_test_key';

    const fresh = await webhook.handler(signedEvent({
      id: 'evt_fresh',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      data: { object: paidSession() },
    }));
    assert.equal(fresh.statusCode, 500);
    assert.deepEqual(urls, ['https://api.printful.com/orders']);

    urls.length = 0;
    global.fetch = async (url) => {
      urls.push(url);
      if (url === 'https://api.resend.com/emails') return jsonResponse(200, { id: 'email_2' });
      return jsonResponse(400, duplicateBody('Recipient: Address line 1 is required'));
    };
    const permanent = await webhook.handler(signedEvent({
      id: 'evt_perm',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      livemode: true,
      data: { object: paidSession() },
    }));
    assert.equal(permanent.statusCode, 200);
    assert.equal(JSON.parse(permanent.body).printful, 'needs_attention');
    assert.ok(urls.includes('https://api.resend.com/emails'));
  });
});

test('the handler emails on the last stretch of test-mode retries and still returns 500', async () => {
  await withWebhookEnv(async () => {
    const urls = [];
    global.fetch = async (url) => {
      urls.push(url);
      if (url === 'https://api.resend.com/emails') return jsonResponse(200, { id: 'email_3' });
      return jsonResponse(503, { code: 503, result: 'down' });
    };
    process.env.ALERT_EMAIL_API_KEY = 're_test_key';
    const response = await webhook.handler(signedEvent({
      id: 'evt_final',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000) - 2 * 60 * 60,
      livemode: false,
      data: { object: paidSession() },
    }));
    assert.equal(response.statusCode, 500);
    assert.ok(urls.includes('https://api.printful.com/orders'));
    assert.ok(urls.includes('https://api.resend.com/emails'));
  });
});

test('non-POST requests are rejected', async () => {
  const response = await webhook.handler({ httpMethod: 'GET', headers: {}, body: '' });
  assert.equal(response.statusCode, 405);
});
