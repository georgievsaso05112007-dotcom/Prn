/**
 * tools/supportAgent.js
 * AI-powered customer support agent:
 *   - Answers customer questions automatically
 *   - Summarizes support tickets
 *   - Generates tone-matched replies
 *   - Handles: shipping, refunds, exchanges, product questions
 *   - Writes notes to customer Shopify profile
 */

import shopify from '../utils/shopifyClient.js';
import { generateText, parseAIJson } from '../utils/aiClient.js';

// ── supportAgent ──────────────────────────────────────────────────────────────
export async function supportAgent({ customerQuestion, customerEmail, orderId, tone = 'friendly' }) {
  // 1. Gather context: look up customer and order if provided
  let customerContext = '';
  let orderContext    = '';

  if (customerEmail) {
    try {
      const customerRes = await shopify.get('/customers.json', {
        params: { query: customerEmail, limit: 1 },
      });
      const customer = customerRes.data.customers[0];

      if (customer) {
        customerContext = `
Customer: ${customer.first_name} ${customer.last_name} (${customer.email})
Total Orders: ${customer.orders_count}
Total Spent: $${customer.total_spent}
Account Tags: ${customer.tags || 'None'}
Member Since: ${new Date(customer.created_at).toLocaleDateString()}
`.trim();

        // Write a note to the customer profile about this support interaction
        await shopify.post(`/customers/${customer.id}/metafields.json`, {
          metafield: {
            namespace: 'support',
            key: `ticket_${Date.now()}`,
            value: `Question: ${customerQuestion.substring(0, 200)}`,
            type: 'single_line_text_field',
          },
        }).catch(() => {}); // Silently fail if this doesn't work
      }
    } catch (err) {
      customerContext = `Could not find customer with email: ${customerEmail}`;
    }
  }

  if (orderId) {
    try {
      const orderRes = await shopify.get(`/orders/${orderId}.json`);
      const order    = orderRes.data.order;

      orderContext = `
Order #${order.order_number}
Status: ${order.fulfillment_status || 'processing'}
Payment: ${order.financial_status}
Total: $${order.total_price} ${order.currency}
Items: ${order.line_items?.map((i) => `${i.name} x${i.quantity}`).join(', ')}
Created: ${new Date(order.created_at).toLocaleDateString()}
Tracking: ${order.fulfillments?.[0]?.tracking_number || 'Not yet available'}
Shipping: ${order.fulfillments?.[0]?.tracking_company || 'Not shipped yet'}
`.trim();
    } catch (err) {
      orderContext = `Could not find order: ${orderId}`;
    }
  }

  // 2. Detect the type of question
  const questionLower = customerQuestion.toLowerCase();
  const questionType =
    questionLower.includes('track') || questionLower.includes('ship') || questionLower.includes('deliver') ? 'shipping' :
    questionLower.includes('refund') || questionLower.includes('money back') || questionLower.includes('return') ? 'refund' :
    questionLower.includes('exchange') || questionLower.includes('swap') || questionLower.includes('replace') ? 'exchange' :
    questionLower.includes('how') || questionLower.includes('does') || questionLower.includes('work') ? 'product_question' :
    'general';

  // 3. Generate the support response
  const toneGuides = {
    professional: 'Professional and formal. Use proper business language.',
    friendly:     'Warm, friendly, and conversational. Use the customer\'s first name.',
    empathetic:   'Very empathetic and understanding. Acknowledge frustration before solving.',
    formal:       'Strict formal business tone. No contractions or casual language.',
  };

  const prompt = `
You are a customer support agent for a Shopify e-commerce store. Answer this customer question.

Customer Question: "${customerQuestion}"
Question Type: ${questionType}
Tone: ${toneGuides[tone] || toneGuides.friendly}

${customerContext ? `Customer Context:\n${customerContext}\n` : ''}
${orderContext    ? `Order Context:\n${orderContext}\n`    : ''}

Store Policies (use these):
- Returns accepted within 30 days of purchase
- Exchanges accepted within 30 days
- Refunds processed in 3-5 business days
- Standard shipping: 5-7 business days
- Express shipping: 2-3 business days
- Contact support@yourstore.com for escalations

Return this JSON format:
{
  "questionType": "${questionType}",
  "response": "Complete customer-facing reply",
  "subject": "Email subject line",
  "internalNote": "Internal note for your team (not sent to customer)",
  "urgencyLevel": "low/medium/high",
  "requiresManualReview": false,
  "suggestedNextSteps": ["step1", "step2"],
  "relatedPolicies": ["policy that applies"],
  "sentiment": "positive/neutral/negative",
  "csat_risk": "low/medium/high"
}
`.trim();

  const raw = await generateText(prompt, 'You are an expert customer support agent who resolves issues on the first contact with empathy and efficiency.');
  const supportResponse = parseAIJson(raw);

  return {
    originalQuestion: customerQuestion,
    questionType,
    customerEmail,
    orderId,
    tone,
    ...supportResponse,
    tip: 'Copy the "response" field and send it to the customer via email.',
  };
}

// ── summarizeSupportTicket ────────────────────────────────────────────────────
export async function summarizeSupportTicket({ ticketText, customerEmail }) {
  const prompt = `
Summarize this customer support ticket. Return JSON only.

Ticket Content:
${ticketText}

Return:
{
  "summary": "1-2 sentence summary",
  "mainIssue": "The core problem",
  "customerSentiment": "frustrated/neutral/positive",
  "urgency": "low/medium/high/critical",
  "category": "shipping/refund/product/technical/other",
  "suggestedResponse": "Draft response",
  "actionRequired": ["action1", "action2"]
}
`.trim();

  const raw = await generateText(prompt, 'You are a customer support supervisor who quickly triages and summarizes tickets.');
  return parseAIJson(raw);
}
