/**
 * tools/landingPages.js
 * AI-generated landing pages with HTML + CSS output.
 * Includes: hero, features, testimonials, product highlights, CTA blocks.
 * Output can be embedded directly into Shopify as a custom page.
 */

import shopify from '../utils/shopifyClient.js';
import { generateText } from '../utils/aiClient.js';

// ── generateLandingPage ───────────────────────────────────────────────────────
export async function generateLandingPage({
  productId,
  style = 'minimal',
  sections = ['hero', 'features', 'testimonials', 'cta'],
}) {
  const res = await shopify.get(`/products/${productId}.json`);
  const product = res.data.product;
  const price   = product.variants?.[0]?.price;
  const imageUrl = product.images?.[0]?.src || '';
  const description = product.body_html?.replace(/<[^>]+>/g, '').substring(0, 600);

  const styleGuides = {
    minimal: 'Clean, lots of whitespace, sans-serif fonts, subtle colors (white/gray/black), modern.',
    bold:    'High-contrast colors, large typography, energetic feel, strong visual impact.',
    luxury:  'Dark backgrounds, gold accents, serif fonts, premium feel, understated elegance.',
    playful: 'Bright colors, rounded shapes, fun fonts, emoji usage, approachable brand feel.',
  };

  const sectionPrompts = {
    hero:         `HERO SECTION: Full-width with product image on right, headline on left. Include: H1 title, sub-headline, primary CTA button, price display.`,
    features:     `FEATURES SECTION: 3-column grid showing top 3 product benefits with icons (use SVG inline icons) and short descriptions.`,
    testimonials: `TESTIMONIALS SECTION: 3 realistic customer reviews with names, star ratings, and review text. Include a review carousel feel.`,
    cta:          `CTA SECTION: Strong call-to-action with headline, urgency text, and "Buy Now" button with price.`,
    highlights:   `PRODUCT HIGHLIGHTS SECTION: Before/after or problem/solution layout showing how this product changes the customer's life.`,
  };

  const selectedSections = sections.map((s) => sectionPrompts[s] || '').filter(Boolean).join('\n\n');

  const prompt = `
Generate a complete, beautiful Shopify landing page for this product. Return COMPLETE HTML with embedded CSS.

Product: ${product.title}
Price: $${price}
Description: ${description}
Product Image URL: ${imageUrl}
Design Style: ${style} — ${styleGuides[style]}

Required Sections:
${selectedSections}

IMPORTANT REQUIREMENTS:
1. Return complete HTML document (starting with <!DOCTYPE html>)
2. Include all CSS inside a <style> tag in the <head>
3. Make it mobile-responsive using CSS media queries
4. Include Google Fonts link (choose an appropriate free font)
5. Use the actual product image URL: ${imageUrl}
6. Include placeholder for the "Add to Cart" button (class="add-to-cart-btn")
7. All testimonials should feel authentic and specific
8. Include urgency elements (stock counter, limited time offer)
9. Design style: ${style}
10. No JavaScript required — pure HTML + CSS only

The page should look professional enough to actually convert customers.
`.trim();

  const html = await generateText(prompt, 'You are an expert UI/UX designer and conversion rate optimizer who creates landing pages that convert at 5-15%. Always return complete, valid HTML.');

  // Create the page in Shopify (optional — requires page creation API)
  const shopifyInstructions = `
HOW TO ADD THIS TO SHOPIFY:
1. Go to Shopify Admin → Online Store → Pages → Add page
2. Click the "</>" (HTML editor) button in the content area
3. Paste the generated HTML
4. Save the page
5. To link the "Add to Cart" button: find class="add-to-cart-btn" and add your cart URL

ALTERNATIVELY (Theme Sections):
1. Go to Online Store → Themes → Edit code
2. Create a new file in Sections folder named "${product.handle}-landing.liquid"
3. Paste the HTML there
4. Add it to your theme via the Customizer
`.trim();

  return {
    productId,
    productTitle: product.title,
    style,
    sections,
    htmlContent: html,
    shopifyInstructions,
    characterCount: html.length,
    tip: 'This HTML can be directly pasted into Shopify page editor (HTML mode).',
  };
}
