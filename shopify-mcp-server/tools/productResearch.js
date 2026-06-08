/**
 * tools/productResearch.js
 * AI-powered product research tool:
 *   - Market trend analysis
 *   - Winning product identification
 *   - Demand prediction
 *   - Pricing strategy
 *   - Bundle suggestions
 *   - Competitor analysis
 *   - Structured research reports
 *
 * NOTE: This uses AI knowledge + your existing store data.
 * For real-time competitor data, you'd need additional data sources.
 */

import shopify from '../utils/shopifyClient.js';
import { generateText, parseAIJson } from '../utils/aiClient.js';

// ── researchProducts ──────────────────────────────────────────────────────────
export async function researchProducts({ niche, targetMarket = 'general consumers', priceRange = '$10-$100' }) {
  // Get existing store products for context
  const storeRes = await shopify.get('/products.json', { params: { limit: 50, status: 'active' } });
  const existingProducts = storeRes.data.products.map((p) => ({
    title: p.title,
    type: p.product_type,
    price: p.variants?.[0]?.price,
    tags: p.tags,
  }));

  const prompt = `
You are a product research expert. Conduct thorough market research for:

Niche: ${niche}
Target Market: ${targetMarket}
Target Price Range: ${priceRange}

Existing Store Products (for context / avoid duplication):
${JSON.stringify(existingProducts.slice(0, 20), null, 2)}

Conduct comprehensive research and return this JSON format:
{
  "niche": "${niche}",
  "marketOverview": {
    "marketSize": "Estimated market size",
    "growthTrend": "Growing/Declining/Stable + percentage",
    "competitionLevel": "Low/Medium/High",
    "entryBarrier": "Low/Medium/High + explanation",
    "seasonality": "Description of seasonal patterns"
  },
  "winningProducts": [
    {
      "productName": "Product name",
      "description": "What it is",
      "whyItWins": "Why this product succeeds",
      "estimatedCost": "$X-$Y (manufacturing/wholesale)",
      "suggestedRetailPrice": "$X",
      "expectedMargin": "X%",
      "demandScore": "1-10",
      "competitionScore": "1-10 (lower = better)",
      "trends": ["trend1", "trend2"],
      "targetCustomer": "Who buys this",
      "salesChannels": ["Shopify", "Amazon", "TikTok Shop"]
    }
  ],
  "competitorAnalysis": {
    "mainCompetitors": ["competitor1", "competitor2"],
    "theirStrengths": ["strength1", "strength2"],
    "marketGaps": ["gap1 you can fill", "gap2 you can fill"],
    "differentiationOpportunities": ["how to stand out"]
  },
  "pricingStrategy": {
    "recommendedPricePoint": "$X",
    "pricingModel": "Premium/Value/Competitive + explanation",
    "bundleOpportunities": [
      {
        "bundleName": "Bundle name",
        "products": ["product1", "product2"],
        "suggestedPrice": "$X",
        "estimatedMargin": "X%"
      }
    ]
  },
  "demandPrediction": {
    "shortTerm3Months": "Outlook",
    "midTerm6Months": "Outlook",
    "longTerm12Months": "Outlook",
    "keyDrivers": ["driver1", "driver2"],
    "risks": ["risk1", "risk2"]
  },
  "marketingAngles": [
    {
      "angle": "Marketing angle name",
      "targetAudience": "Who to target",
      "platforms": ["Instagram", "TikTok"],
      "adHook": "Example ad hook"
    }
  ],
  "supplierSuggestions": {
    "whereToSource": ["AliExpress", "Alibaba", "US-based suppliers"],
    "qualityTips": ["tip1", "tip2"],
    "moqRange": "Minimum order quantity range"
  },
  "actionPlan": [
    "Step 1: ...",
    "Step 2: ...",
    "Step 3: ...",
    "Step 4: ...",
    "Step 5: ..."
  ],
  "overallRecommendation": "Should you enter this niche? Why or why not?",
  "confidenceScore": "High/Medium/Low + explanation"
}
`.trim();

  const raw = await generateText(prompt, 'You are a world-class e-commerce product researcher with expertise in dropshipping, private label, and Shopify stores. You have deep knowledge of market trends, consumer behavior, and product sourcing.');
  const research = parseAIJson(raw);

  return {
    niche,
    targetMarket,
    priceRange,
    researchReport: research,
    disclaimer: 'This research is AI-generated based on training data. Verify trends using Google Trends, Jungle Scout, or Minea for real-time data.',
    freeTools: {
      googleTrends: 'trends.google.com — verify search volume trends',
      explodingTopics: 'explodingtopics.com — find emerging trends (free tier)',
      amazonBestSellers: 'amazon.com/bestsellers — see what is selling',
      tiktokCreativeCenter: 'ads.tiktok.com/business/creativecenter — trending TikTok products',
    },
  };
}
