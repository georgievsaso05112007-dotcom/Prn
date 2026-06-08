/**
 * tools/ads.js
 * AI-generated ad creatives for multiple platforms:
 *   - Facebook Ads, Instagram Ads, TikTok Ads, Google Shopping
 *   - Multiple A/B test variations
 *   - Headlines, hooks, CTAs, angles, video scripts
 */

import shopify from '../utils/shopifyClient.js';
import { generateText, parseAIJson } from '../utils/aiClient.js';

// ── generateAdCreative ────────────────────────────────────────────────────────
export async function generateAdCreative({ productId, platform = 'all', goal = 'conversions', variations = 3 }) {
  // Fetch product details
  const res = await shopify.get(`/products/${productId}.json`);
  const product = res.data.product;
  const price  = product.variants?.[0]?.price;
  const description = product.body_html?.replace(/<[^>]+>/g, '').substring(0, 500);

  const platformGuides = {
    facebook:        'Facebook Ads: max 125 chars primary text, 40 chars headline, 30 chars description. Conversational, story-driven.',
    instagram:       'Instagram Ads: visual-first, max 125 chars caption, strong hook, lifestyle focus.',
    tiktok:          'TikTok Ads: Gen Z tone, hook in first 3 seconds, casual language, trending references.',
    'google-shopping': 'Google Shopping: keyword-rich title (max 150 chars), detailed description for SEO, focus on specs and price.',
    all:             'Create ads for Facebook, Instagram, TikTok, and Google Shopping.',
  };

  const goalGuides = {
    awareness:   'Build brand recognition. Focus on storytelling and brand values.',
    traffic:     'Drive clicks. Focus on curiosity and value proposition.',
    conversions: 'Drive purchases. Focus on urgency, social proof, and clear CTA.',
    sales:       'Maximize ROAS. Focus on price, deals, and direct response.',
  };

  const prompt = `
Generate ${variations} ad creative variations for this Shopify product.

Product: ${product.title}
Price: $${price}
Type: ${product.product_type}
Description: ${description}
Platform: ${platform}
Campaign Goal: ${goal}

Platform Guidelines: ${platformGuides[platform] || platformGuides.all}
Goal Strategy: ${goalGuides[goal]}

Return ONLY this JSON format:
{
  "productTitle": "${product.title}",
  "platform": "${platform}",
  "goal": "${goal}",
  "variations": [
    {
      "variationName": "Variation A - [angle name]",
      "angle": "The marketing angle (e.g. 'Pain point', 'Social proof', 'Curiosity')",
      "headline": "Short punchy headline",
      "primaryText": "Main ad copy (2-3 sentences)",
      "hook": "First sentence that stops the scroll",
      "callToAction": "Shop Now / Learn More / Get Yours",
      "description": "Short description text",
      "targetAudience": "Who this variation targets",
      "videoScript": "If TikTok/Instagram Reels: 30-second script outline",
      "googleTitle": "Google Shopping optimized title",
      "keywords": ["keyword1", "keyword2", "keyword3"]
    }
  ],
  "abTestingAdvice": "How to split test these variations",
  "budgetAdvice": "Suggested daily budget to start testing"
}
`.trim();

  const raw = await generateText(prompt, 'You are a performance marketing expert who specializes in direct-response e-commerce advertising with proven ROAS results.');
  const adData = parseAIJson(raw);

  return {
    ...adData,
    generatedVariations: variations,
    tip: 'Test each variation with equal budget for 3-5 days before scaling the winner.',
  };
}
