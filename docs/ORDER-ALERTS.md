# Email when a paid order does not reach Printful

The shop charges the customer in Stripe. A Netlify function then sends the order to Printful. You only need this page when that second step fails.

The page the customer sees after paying (`thanks.html`) is unchanged.

## When you get an email

Mail goes to palehorsecollective@proton.me.

- Printful refuses the order for a reason that will not fix itself (a bad address, a size that is not set up, and similar). Stripe stops retrying. The customer has still been charged, so the order needs a person.
- Printful is down, or it is asking us to slow down, and Stripe has been retrying for a long time. Stripe is still allowed to try again. Check Printful before you place a second order, in case a later try succeeds.

You do not get an email when the order is created, or when Printful says this payment was already turned into an order. A repeat of the same payment must not make a second shirt.

Stripe does not tell the site which retry is the last one. On the live site the email goes out once the payment is about 60 hours old. Stripe keeps retrying for up to 3 days. On a test payment the email goes out once the payment is about an hour old, because Stripe's test mode only retries for a few hours.

## What to set in Netlify

The key lives only in Netlify. It is not in the code. If it is missing, the site still runs. The failure is written in the Netlify function log, with the words `ALERT EMAIL NOT SENT`, instead of being emailed.

1. Create a free account at [Resend](https://resend.com) using **palehorsecollective@proton.me**. The free plan is enough. Do not buy a paid plan for this.
2. In Resend, create an API key. Sending access is enough.
3. In Netlify, open Site configuration → Environment variables → Add a variable.
   - Name: `ALERT_EMAIL_API_KEY`
   - Value: the Resend API key
   - Include production. Also include deploy previews if you want these emails from preview links.
4. Redeploy the site. A new variable is not visible to functions that are already running.

Leave the sender as the default for now. That default is Resend's shared test address, `onboarding@resend.dev`. Resend only delivers mail from that address to the inbox on the Resend account. That is why the account has to be palehorsecollective@proton.me.

Later, if you want the mail to come from your own domain:

1. In Resend, add palehorsecollective.org and enter the DNS records they show you, at the place that hosts the domain's DNS.
2. Add a second Netlify variable, `ALERT_EMAIL_FROM`, set to `Pale Horse Collective <orders@palehorsecollective.org>` (or any address on that verified domain).

## Keys that were already there

This does not replace them. They stay in Netlify, not in git.

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PRINTFUL_API_KEY`
- `PRINTFUL_STORE_ID`

## Why the same payment cannot make two shirts

Each Printful order is tagged with the Stripe payment id. Printful only allows 32 characters in that tag, and a Stripe id is longer, so the site keeps the start and the end of the same id. The same payment always gets the same tag. If Stripe tries again and Printful says that tag is already used, the site tells Stripe the order is done.
