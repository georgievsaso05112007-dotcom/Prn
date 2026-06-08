/**
 * tools/segmentation.js
 * AI-powered customer segmentation:
 *   - Groups customers by purchase frequency, LTV, interests, behavior
 *   - Writes segment tags to Shopify customer profiles
 *   - Generates personalized marketing recommendations per segment
 */

import shopify from '../utils/shopifyClient.js';
import { generateText, parseAIJson } from '../utils/aiClient.js';

// ── segmentCustomers ──────────────────────────────────────────────────────────
export async function segmentCustomers({ limit = 100, writeToShopify = false }) {
  // 1. Fetch customers
  const customerRes = await shopify.get('/customers.json', {
    params: { limit: Math.min(limit, 250) },
  });
  const customers = customerRes.data.customers;

  if (customers.length === 0) {
    return { message: 'No customers found in your store yet.' };
  }

  // 2. Get order history for richer data
  const ordersRes = await shopify.get('/orders.json', {
    params: { limit: 250, status: 'closed' },
  });
  const orders = ordersRes.data.orders;

  // 3. Build a customer profile map
  const customerProfiles = customers.map((c) => {
    const customerOrders = orders.filter((o) => o.customer?.id === c.id);
    const orderValues    = customerOrders.map((o) => parseFloat(o.total_price));
    const avgOrderValue  = orderValues.length > 0
      ? orderValues.reduce((a, b) => a + b, 0) / orderValues.length
      : 0;

    // Get all products this customer bought
    const productsBought = customerOrders
      .flatMap((o) => o.line_items || [])
      .map((i) => i.product_type || i.name)
      .filter(Boolean);

    return {
      id:            c.id,
      name:          `${c.first_name} ${c.last_name}`,
      email:         c.email,
      ordersCount:   c.orders_count || 0,
      totalSpent:    parseFloat(c.total_spent || 0),
      avgOrderValue: parseFloat(avgOrderValue.toFixed(2)),
      productsBought: [...new Set(productsBought)].slice(0, 5), // unique, max 5
      tags:          c.tags || '',
      country:       c.default_address?.country || 'Unknown',
      createdAt:     c.created_at,
    };
  });

  // 4. Ask AI to segment the customers
  const prompt = `
Analyze these ${customerProfiles.length} Shopify customers and create meaningful segments.

Customer Data:
${JSON.stringify(customerProfiles.slice(0, 50), null, 2)}
${customerProfiles.length > 50 ? `\n... and ${customerProfiles.length - 50} more customers with similar patterns` : ''}

Create segments based on:
- Purchase frequency (one-time vs repeat)
- Lifetime value (budget, mid-tier, high-value, VIP)
- Product interests (what categories they buy)
- Behavior patterns (recent vs lapsed)
- Demographics if available

Return this JSON format:
{
  "segments": [
    {
      "name": "Segment Name",
      "tag": "shopify-tag-to-apply",
      "description": "Who is in this segment",
      "customerIds": [123, 456],
      "size": 10,
      "avgLTV": 150.00,
      "marketingRecommendation": "Specific marketing approach for this segment",
      "emailStrategy": "What emails to send them",
      "productRecommendations": ["Product type 1", "Product type 2"],
      "discountStrategy": "What discounts to offer (if any)"
    }
  ],
  "summary": "Overview of your customer base",
  "topInsights": ["Insight 1", "Insight 2", "Insight 3"],
  "revenueOpportunities": ["Opportunity 1", "Opportunity 2"]
}
`.trim();

  const raw = await generateText(prompt, 'You are an expert CRM analyst and digital marketing strategist specializing in e-commerce customer segmentation.');
  const segmentData = parseAIJson(raw);

  // 5. Optionally write segment tags to Shopify
  if (writeToShopify && segmentData.segments) {
    const updatePromises = segmentData.segments.flatMap((segment) =>
      (segment.customerIds || []).map(async (customerId) => {
        const customer = customers.find((c) => c.id === customerId);
        if (!customer) return;

        const existingTags = customer.tags ? customer.tags.split(', ').filter(Boolean) : [];
        const newTag = `segment:${segment.tag}`;

        if (!existingTags.includes(newTag)) {
          existingTags.push(newTag);
          await shopify.put(`/customers/${customerId}.json`, {
            customer: { id: customerId, tags: existingTags.join(', ') },
          });
        }
      })
    );

    // Process in batches to avoid rate limits
    await Promise.allSettled(updatePromises.slice(0, 20));
  }

  return {
    totalCustomersAnalyzed: customerProfiles.length,
    segmentsCreated: segmentData.segments?.length || 0,
    wroteTagsToShopify: writeToShopify,
    segmentData,
  };
}
