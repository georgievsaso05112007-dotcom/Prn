/**
 * webhooks/handler.js
 * Express server that listens for Shopify webhook events.
 *
 * WHY: Without webhooks, you have to manually call tools.
 * WITH webhooks: Shopify calls YOUR server the moment an order is created,
 * and the AI automation runs automatically.
 *
 * HOW TO SET UP SHOPIFY WEBHOOKS:
 *   1. Start this server (it needs a public URL)
 *   2. Go to Shopify Admin → Settings → Notifications → Webhooks
 *   3. Click "Create webhook"
 *   4. Event: Order creation
 *   5. URL: https://your-server.com/webhooks/orders/create
 *   6. Format: JSON
 *   7. Save
 *
 * FOR LOCAL TESTING (expose localhost to the internet free):
 *   npx localtunnel --port 3001 --subdomain my-shopify-mcp
 *   → gives you: https://my-shopify-mcp.loca.lt
 *   Use THAT URL in Shopify webhooks.
 */

import express from 'express';
import crypto from 'crypto';
import 'dotenv/config';
import { analyzeOrderForTriggers, generateOrderEmail } from '../tools/automation.js';

const app = express();
const PORT = process.env.WEBHOOK_PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
// Must use raw body for HMAC verification (Shopify security check)
app.use('/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json());

// ── HMAC Verification ─────────────────────────────────────────────────────────
// Shopify signs every webhook so you can verify it's really from Shopify.
// Get your secret from: Shopify Admin → Settings → Notifications → Webhooks
function verifyShopifyWebhook(req, res, next) {
  const hmac   = req.headers['x-shopify-hmac-sha256'];
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

  // Skip verification if no secret is set (not recommended for production!)
  if (!secret) {
    console.warn('[Webhook] WARNING: SHOPIFY_WEBHOOK_SECRET not set. Skipping HMAC verification.');
    req.body = JSON.parse(req.body);
    return next();
  }

  const hash = crypto
    .createHmac('sha256', secret)
    .update(req.body)
    .digest('base64');

  if (hash !== hmac) {
    console.error('[Webhook] Invalid HMAC — rejected request');
    return res.status(401).send('Unauthorized');
  }

  req.body = JSON.parse(req.body);
  next();
}

// ── Health check endpoint ─────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    server: 'Shopify AI MCP Webhook Handler',
    endpoints: [
      'POST /webhooks/orders/create   ← Shopify fires this when order is created',
      'POST /webhooks/orders/paid     ← fires when payment is confirmed',
      'GET  /health                   ← health check',
    ],
  });
});

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── ORDER CREATED webhook ─────────────────────────────────────────────────────
app.post('/webhooks/orders/create', verifyShopifyWebhook, async (req, res) => {
  // Acknowledge immediately (Shopify requires < 5 second response)
  res.status(200).send('OK');

  const order = req.body;
  console.log(`[Webhook] New order #${order.order_number} — $${order.total_price} from ${order.email}`);

  // Run all trigger analysis in the background (don't block the response)
  processOrderTriggers(order).catch((err) => {
    console.error(`[Webhook] Order trigger processing failed:`, err.message);
  });
});

// ── ORDER PAID webhook ────────────────────────────────────────────────────────
app.post('/webhooks/orders/paid', verifyShopifyWebhook, async (req, res) => {
  res.status(200).send('OK');
  const order = req.body;
  console.log(`[Webhook] Order #${order.order_number} PAID — processing confirmation email`);
  processOrderTriggers(order, 'paid').catch((err) => {
    console.error('[Webhook] Paid trigger failed:', err.message);
  });
});

// ── ABANDONED CHECKOUT webhook ────────────────────────────────────────────────
app.post('/webhooks/checkouts/create', verifyShopifyWebhook, async (req, res) => {
  res.status(200).send('OK');
  const checkout = req.body;

  if (!checkout.email) return; // Anonymous checkout — skip

  console.log(`[Webhook] Abandoned checkout from ${checkout.email}`);

  // Log the abandoned cart (you'd normally store this and email later)
  console.log('[Webhook] Cart items:', checkout.line_items?.map((i) => i.title).join(', '));
  // In production: store in DB, send email after 1-4 hours via cron job
});

// ── Core trigger processing logic ─────────────────────────────────────────────
async function processOrderTriggers(order, event = 'create') {
  try {
    const orderId = order.id.toString();

    // 1. Analyze what triggers apply
    const analysis = await analyzeOrderForTriggers({ orderId });
    console.log(`[Webhook] Triggers detected for order #${order.order_number}:`, analysis.triggersDetected);

    // 2. Log the recommended emails (in production you'd send these via email provider)
    for (const action of analysis.recommendedActions) {
      console.log(`[Webhook] Generating ${action.emailType} email for order #${order.order_number}...`);

      const email = await generateOrderEmail({ orderId, emailType: action.emailType });

      // ── In production: send via Mailgun / SendGrid / Klaviyo / etc. ──────────
      // Example with Mailgun (free tier at mailgun.com):
      //   await sendEmail({
      //     to: order.email,
      //     subject: email.generatedEmail.split('\n')[0].replace('SUBJECT: ', ''),
      //     text: email.generatedEmail
      //   });
      //
      // For now, we just log the output:
      console.log(`\n${'='.repeat(60)}`);
      console.log(`[Webhook] EMAIL READY TO SEND — ${action.emailType.toUpperCase()}`);
      console.log(`To: ${order.email}`);
      console.log(`\n${email.generatedEmail}`);
      console.log('='.repeat(60) + '\n');
    }

    if (analysis.triggersDetected.length === 0) {
      console.log(`[Webhook] No special triggers for order #${order.order_number} — standard thank-you applies`);
    }
  } catch (err) {
    console.error(`[Webhook] Failed to process order triggers:`, err.message);
  }
}

// ── Start the webhook server ──────────────────────────────────────────────────
export function startWebhookServer() {
  app.listen(PORT, () => {
    console.error(`[Webhook] Server listening on port ${PORT}`);
    console.error(`[Webhook] Local URL: http://localhost:${PORT}`);
    console.error(`[Webhook] To expose publicly (free): npx localtunnel --port ${PORT}`);
  });
  return app;
}

export default app;
