/**
 * tools/inventory.js
 * AI-powered inventory forecasting:
 *   - forecastInventory → predict low-stock, reorder dates, sales velocity
 *
 * How it works:
 *   1. Pull order history from Shopify
 *   2. Calculate actual sales velocity (units sold per day)
 *   3. Use AI to analyze patterns and predict seasonal demand
 *   4. Optionally write forecasts into product metafields
 */

import shopify from '../utils/shopifyClient.js';
import { generateText, parseAIJson } from '../utils/aiClient.js';
import { createMetafield } from './shopify.js';

// ── forecastInventory ─────────────────────────────────────────────────────────
export async function forecastInventory({ productId, daysAhead = 30, writeToShopify = false }) {
  // 1. Get products to analyze
  let products;
  if (productId) {
    const res = await shopify.get(`/products/${productId}.json`);
    products = [res.data.product];
  } else {
    const res = await shopify.get('/products.json', { params: { limit: 50, status: 'active' } });
    products = res.data.products;
  }

  // 2. Get recent orders (last 90 days) to calculate sales velocity
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const ordersRes = await shopify.get('/orders.json', {
    params: { limit: 250, status: 'closed', created_at_min: ninetyDaysAgo },
  });
  const orders = ordersRes.data.orders;

  // 3. Calculate units sold per product
  const salesMap = {};
  for (const order of orders) {
    for (const item of order.line_items || []) {
      salesMap[item.product_id] = (salesMap[item.product_id] || 0) + item.quantity;
    }
  }

  // 4. Build analysis data for each product
  const productData = products.map((p) => {
    const totalSold     = salesMap[p.id] || 0;
    const velocityPerDay = totalSold / 90;
    const currentStock  = p.variants?.[0]?.inventory_quantity || 0;
    const daysUntilEmpty = velocityPerDay > 0 ? Math.floor(currentStock / velocityPerDay) : 999;

    return {
      id:            p.id,
      title:         p.title,
      currentStock,
      totalSoldIn90Days: totalSold,
      dailyVelocity:  parseFloat(velocityPerDay.toFixed(2)),
      daysUntilEmpty,
      predictedSoldInNext30Days: Math.ceil(velocityPerDay * 30),
      isLowStock:    daysUntilEmpty <= daysAhead,
    };
  });

  // 5. Ask AI for deeper analysis and recommendations
  const prompt = `
Analyze this Shopify inventory data and provide forecasting insights. Return JSON only.

Current date: ${new Date().toISOString().split('T')[0]}
Forecast period: Next ${daysAhead} days

Product Data:
${JSON.stringify(productData, null, 2)}

Return this JSON format:
{
  "summary": "2-3 sentence overview of inventory health",
  "criticalItems": [
    {
      "productId": "id",
      "productTitle": "name",
      "issue": "description of the issue",
      "recommendedAction": "what to do",
      "reorderDate": "YYYY-MM-DD suggested reorder date",
      "suggestedReorderQuantity": 100
    }
  ],
  "predictions": [
    {
      "productId": "id",
      "productTitle": "name",
      "predictedDemand": 50,
      "seasonalFactors": "any seasonal notes",
      "confidenceLevel": "high/medium/low"
    }
  ],
  "overallRecommendation": "General recommendation for the store"
}
`.trim();

  const raw = await generateText(prompt, 'You are an inventory management expert with deep knowledge of e-commerce demand forecasting.');
  const analysis = parseAIJson(raw);

  // 6. Optionally write forecasts to Shopify metafields
  if (writeToShopify) {
    for (const item of analysis.criticalItems || []) {
      await createMetafield({
        resourceType: 'products',
        resourceId: item.productId.toString(),
        namespace: 'inventory_forecast',
        key: 'reorder_date',
        value: item.reorderDate,
        type: 'single_line_text_field',
      }).catch(() => {}); // Don't fail if metafield already exists

      await createMetafield({
        resourceType: 'products',
        resourceId: item.productId.toString(),
        namespace: 'inventory_forecast',
        key: 'recommended_quantity',
        value: item.suggestedReorderQuantity.toString(),
        type: 'number_integer',
      }).catch(() => {});
    }
  }

  return {
    analyzedProducts: productData.length,
    forecastPeriodDays: daysAhead,
    rawVelocityData: productData,
    aiAnalysis: analysis,
    wroteToShopify: writeToShopify,
  };
}
