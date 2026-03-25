// PHC — Edition Counter
// FILE REF: PHC-TXN-003
// GET /.netlify/functions/get-edition-count?file=001
// Returns: { sold: N, remaining: N, total: 500 }

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const EDITION_TOTALS = {
  '001': 500,
  '002': 500,
};

exports.handler = async (event) => {
  const fileId = event.queryStringParameters?.file;
  const total = EDITION_TOTALS[fileId];

  if (!total) {
    return { statusCode: 400, body: 'Unknown file ID' };
  }

  try {
    let sold = 0;
    let hasMore = true;
    let startingAfter = null;

    while (hasMore) {
      const params = { limit: 100, status: 'complete' };
      if (startingAfter) params.starting_after = startingAfter;

      const result = await stripe.checkout.sessions.list(params);

      for (const session of result.data) {
        if (
          session.metadata?.file_id === fileId &&
          session.payment_status === 'paid'
        ) {
          sold++;
        }
      }

      hasMore = result.has_more;
      if (result.data.length > 0) {
        startingAfter = result.data[result.data.length - 1].id;
      }
    }

    const remaining = Math.max(0, total - sold);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ sold, remaining, total }),
    };
  } catch (err) {
    console.error('Edition count failed:', err.message);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ sold: 0, remaining: total, total }),
    };
  }
};