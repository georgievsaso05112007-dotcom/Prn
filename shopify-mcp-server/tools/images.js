/**
 * tools/images.js
 * AI-generated product images.
 *
 * FREE image generation via Pollinations.ai (no API key needed!):
 *   https://pollinations.ai — completely free, no signup required
 *
 * Optional: Replicate API (has free credits):
 *   https://replicate.com — uses Stable Diffusion
 *
 * Generated images can be saved to Shopify as product images.
 */

import axios from 'axios';
import shopify from '../utils/shopifyClient.js';

// ── generateProductImage ──────────────────────────────────────────────────────
export async function generateProductImage({ productId, imageType = 'white-background', style = '', saveToShopify = false }) {
  // Fetch product info to build a good prompt
  const res = await shopify.get(`/products/${productId}.json`);
  const product = res.data.product;

  // Build image generation prompt based on type
  const typePrompts = {
    'white-background': `Product photo of ${product.title}, clean white background, professional product photography, studio lighting, high resolution, e-commerce ready`,
    'lifestyle':        `Lifestyle photo featuring ${product.title}, natural environment, real people using the product, warm lighting, authentic feel, ${style}`,
    'social-media':     `Social media marketing image of ${product.title}, vibrant colors, eye-catching composition, modern design, Instagram-worthy, ${style}`,
  };

  const basePrompt = typePrompts[imageType] || typePrompts['white-background'];
  const fullPrompt = style ? `${basePrompt}, ${style}` : basePrompt;
  const encodedPrompt = encodeURIComponent(fullPrompt);

  // Pollinations.ai is 100% free — builds a URL you can load directly
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true`;

  let shopifyResult = null;

  // Optionally upload the image directly to Shopify
  if (saveToShopify) {
    shopifyResult = await uploadImageToShopify({ productId, imageUrl, altText: product.title });
  }

  return {
    productId,
    productTitle: product.title,
    imageType,
    prompt: fullPrompt,
    imageUrl,                          // Direct link — open in browser to see it!
    pollinationsInfo: 'Image generated via Pollinations.ai (free, no API key needed)',
    shopifyUpload: shopifyResult,
    howToSave: saveToShopify
      ? 'Image uploaded to Shopify'
      : 'Set saveToShopify: true to automatically upload this image to your Shopify product.',
    alternativeProviders: {
      replicate: 'Set IMAGE_PROVIDER=replicate in .env and add REPLICATE_API_KEY for Stable Diffusion',
      manual: 'Copy the imageUrl and upload it manually in Shopify Admin',
    },
  };
}

// ── uploadImageToShopify ──────────────────────────────────────────────────────
export async function uploadImageToShopify({ productId, imageUrl, altText = '' }) {
  const response = await shopify.post(`/products/${productId}/images.json`, {
    image: {
      src: imageUrl,
      alt: altText,
    },
  });

  const img = response.data.image;
  return {
    success: true,
    imageId: img.id,
    shopifyImageUrl: img.src,
    altText: img.alt,
  };
}

// ── generateWithReplicate ─────────────────────────────────────────────────────
// Alternative provider: Replicate (free credits on signup)
export async function generateWithReplicate(prompt) {
  const { REPLICATE_API_KEY } = process.env;

  if (!REPLICATE_API_KEY) {
    throw new Error('REPLICATE_API_KEY not set. Get free credits at https://replicate.com');
  }

  // Start the prediction
  const startRes = await axios.post(
    'https://api.replicate.com/v1/predictions',
    {
      version: 'ac732df83cea7fff18b8472768c88ad041fa750465e63d1b7e4840dedf2d5bcc', // Stable Diffusion XL
      input: { prompt, width: 1024, height: 1024, num_outputs: 1 },
    },
    {
      headers: {
        Authorization: `Token ${REPLICATE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const predictionId = startRes.data.id;

  // Poll until done (max 60 seconds)
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    const pollRes = await axios.get(
      `https://api.replicate.com/v1/predictions/${predictionId}`,
      { headers: { Authorization: `Token ${REPLICATE_API_KEY}` } }
    );

    if (pollRes.data.status === 'succeeded') {
      return pollRes.data.output[0];
    }
    if (pollRes.data.status === 'failed') {
      throw new Error(`Replicate prediction failed: ${pollRes.data.error}`);
    }
  }

  throw new Error('Replicate prediction timed out after 60 seconds');
}
