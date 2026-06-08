/**
 * tools/automation.js
 * AI-powered automation tools:
 *   - generateProductDescription  → rewrites product copy with AI
 *   - generateSEOFields           → creates SEO title + description + tags
 *   - generateOrderEmail          → thank-you, VIP, loyalty, follow-up emails
 *   - generateAbandonedCartEmail  → abandoned cart recovery email
 *   - analyzeOrderForTriggers     → detects VIP / loyalty / new-customer triggers
 */

import shopify from '../utils/shopifyClient.js';
import { generateText, parseAIJson } from '../utils/aiClient.js';
import { updateProduct } from './shopify.js';
import { createMetafield } from './shopify.js';

// ── generateProductDescription ────────────────────────────────────────────────
export async function generateProductDescription({ productId, tone = 'professional', saveToShopify = false }) {
  // 1. Fetch product details from Shopify
  const res = await shopify.get(`/products/${productId}.json`);
  const product = res.data.product;

  // 2. Ask AI to write a compelling description
  const prompt = `
Write a compelling product description for this Shopify product.
Product Title: ${product.title}
Product Type: ${product.product_type}
Vendor: ${product.vendor}
Tags: ${product.tags}
Current Description: ${product.body_html?.replace(/<[^>]+>/g, '') || 'None'}

Tone: ${tone}

Requirements:
- Write 2-3 short paragraphs
- Focus on benefits, not just features
- Use the specified tone
- Make it conversion-focused
- Output plain HTML (use <p> tags, <strong> for emphasis, <ul> for bullet lists)
- Do NOT include the product title in the description
`.trim();

  const description = await generateText(prompt, 'You are an expert Shopify copywriter who writes high-converting product descriptions.');

  // 3. Optionally save to Shopify
  if (saveToShopify) {
    await updateProduct({ productId, bodyHtml: description });
  }

  return {
    productId,
    productTitle: product.title,
    description,
    savedToShopify: saveToShopify,
  };
}

// ── generateSEOFields ─────────────────────────────────────────────────────────
export async function generateSEOFields({ productId, saveToShopify = false }) {
  const res = await shopify.get(`/products/${productId}.json`);
  const product = res.data.product;

  const prompt = `
Generate SEO fields for this Shopify product. Return ONLY valid JSON.

Product: ${product.title}
Type: ${product.product_type}
Description: ${product.body_html?.replace(/<[^>]+>/g, '').substring(0, 500) || 'No description'}
Current Tags: ${product.tags}

Return this exact JSON format:
{
  "seoTitle": "55-60 character SEO title",
  "seoDescription": "150-160 character meta description",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8"]
}
`.trim();

  const raw = await generateText(prompt, 'You are an SEO expert specializing in Shopify e-commerce stores.');
  const seoData = parseAIJson(raw);

  // Save SEO fields to Shopify via metafields
  if (saveToShopify) {
    // Update product tags
    await updateProduct({ productId, tags: seoData.tags.join(', ') });

    // Save SEO title and description as metafields
    await createMetafield({
      resourceType: 'products',
      resourceId: productId,
      namespace: 'seo',
      key: 'title',
      value: seoData.seoTitle,
      type: 'single_line_text_field',
    });

    await createMetafield({
      resourceType: 'products',
      resourceId: productId,
      namespace: 'seo',
      key: 'description',
      value: seoData.seoDescription,
      type: 'multi_line_text_field',
    });
  }

  return {
    productId,
    productTitle: product.title,
    ...seoData,
    savedToShopify: saveToShopify,
  };
}

// ── generateOrderEmail ────────────────────────────────────────────────────────
export async function generateOrderEmail({ orderId, emailType = 'thankyou' }) {
  const res = await shopify.get(`/orders/${orderId}.json`);
  const order = res.data.order;

  const customerName = order.customer?.first_name || 'Valued Customer';
  const orderTotal   = order.total_price;
  const currency     = order.currency;
  const items        = order.line_items?.map((i) => `${i.name} x${i.quantity}`).join(', ');

  const emailPrompts = {
    confirmation: `Write an order confirmation email. Be clear and professional. Include order details.`,
    thankyou:     `Write a warm thank-you email. Be genuine and personal. Make the customer feel special.`,
    followup:     `Write a post-purchase follow-up email asking for a review. Be friendly and not pushy.`,
    vip:          `Write a VIP customer email. Acknowledge their large purchase. Offer exclusive benefits.`,
    loyalty:      `Write a loyalty email for a repeat customer. Acknowledge this is not their first order. Offer a loyalty reward.`,
  };

  const prompt = `
${emailPrompts[emailType] || emailPrompts.thankyou}

Customer Name: ${customerName}
Order Number: #${order.order_number}
Order Total: ${currency} ${orderTotal}
Items Ordered: ${items}
Store Name: My Shopify Store

Format:
- Subject line
- Email body (with greeting and sign-off)
- Keep it concise but warm
`.trim();

  const email = await generateText(prompt, 'You are an expert e-commerce email copywriter who writes emails with high open and click rates.');

  return {
    orderId,
    orderNumber: order.order_number,
    emailType,
    customerEmail: order.email,
    customerName,
    generatedEmail: email,
  };
}

// ── generateAbandonedCartEmail ────────────────────────────────────────────────
export async function generateAbandonedCartEmail({ customerEmail, customerName = 'there', cartItems, discountCode }) {
  const itemList = cartItems.map((i) => `- ${i.title}: $${i.price}`).join('\n');

  const prompt = `
Write an abandoned cart recovery email that convinces the customer to complete their purchase.

Customer Name: ${customerName}
Abandoned Items:
${itemList}
${discountCode ? `Discount Code to Include: ${discountCode} (mention it prominently!)` : ''}

Requirements:
- Create urgency without being pushy
- Remind them WHY they wanted these items
- Include a clear call-to-action button text
- If a discount code is provided, make it the centerpiece
- 3-4 short paragraphs max
- Include: Subject line, Preview text, Email body

Format as:
SUBJECT: ...
PREVIEW: ...
BODY:
...
`.trim();

  const email = await generateText(prompt, 'You are an expert e-commerce email copywriter specializing in cart abandonment recovery with high conversion rates.');

  return {
    customerEmail,
    customerName,
    cartItems,
    discountCode,
    generatedEmail: email,
  };
}

// ── analyzeOrderForTriggers ───────────────────────────────────────────────────
export async function analyzeOrderForTriggers({ orderId }) {
  // Get the order
  const orderRes = await shopify.get(`/orders/${orderId}.json`);
  const order = orderRes.data.order;

  const customerId  = order.customer?.id;
  const orderTotal  = parseFloat(order.total_price);
  const vipThreshold = parseFloat(process.env.VIP_ORDER_THRESHOLD || '100');

  const triggers = [];
  const actions  = [];

  // Trigger 1: VIP order (high value)
  if (process.env.ENABLE_VIP_TRIGGERS !== 'false' && orderTotal >= vipThreshold) {
    triggers.push('VIP_ORDER');
    actions.push({
      trigger: 'VIP_ORDER',
      action: 'Send VIP email',
      details: `Order total $${orderTotal} exceeds VIP threshold $${vipThreshold}`,
      emailType: 'vip',
    });
  }

  // Trigger 2: Repeat customer (loyalty)
  if (customerId && process.env.ENABLE_LOYALTY_TRIGGERS !== 'false') {
    const customerRes = await shopify.get(`/customers/${customerId}.json`);
    const customer = customerRes.data.customer;

    if (customer.orders_count >= 2) {
      triggers.push('REPEAT_CUSTOMER');
      actions.push({
        trigger: 'REPEAT_CUSTOMER',
        action: 'Send loyalty email',
        details: `Customer has placed ${customer.orders_count} orders`,
        emailType: 'loyalty',
      });
    }
  }

  // Trigger 3: New customer (first order)
  if (process.env.ENABLE_ORDER_TRIGGERS !== 'false' && order.customer?.orders_count === 1) {
    triggers.push('NEW_CUSTOMER');
    actions.push({
      trigger: 'NEW_CUSTOMER',
      action: 'Send thank-you email',
      details: 'First order from this customer',
      emailType: 'thankyou',
    });
  }

  return {
    orderId,
    orderNumber: order.order_number,
    customerEmail: order.email,
    orderTotal,
    triggersDetected: triggers,
    recommendedActions: actions,
    message: triggers.length > 0
      ? `Found ${triggers.length} trigger(s). Use generateOrderEmail to create the emails.`
      : 'No automation triggers found for this order.',
  };
}
