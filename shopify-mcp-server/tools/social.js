/**
 * tools/social.js
 * Social media automation tools:
 *   - generateSocialPost  → AI-generated captions, hashtags, highlights
 *   - scheduleSocialPost  → queue a post for later
 *   - getSocialQueue      → view scheduled/pending posts
 *   - Posting to: Instagram, TikTok, Facebook, Pinterest
 *
 * NOTE ON FREE USE:
 *   Posting to social platforms requires developer accounts.
 *   Instagram & Facebook use the Meta Graph API (free).
 *   TikTok uses TikTok for Developers API (free).
 *   Pinterest uses the Pinterest API (free).
 *   All require registering an app on their developer portals.
 */

import axios from 'axios';
import shopify from '../utils/shopifyClient.js';
import { generateText, parseAIJson } from '../utils/aiClient.js';
import { schedulePost, getScheduledPosts } from '../utils/scheduler.js';
import { addToQueue, getQueueStatus } from '../utils/queue.js';

// ── generateSocialPost ────────────────────────────────────────────────────────
export async function generateSocialPost({ productId, platform = 'instagram', style = 'promotional' }) {
  // Fetch product data
  const res = await shopify.get(`/products/${productId}.json`);
  const product = res.data.product;
  const imageUrl = product.images?.[0]?.src || '';

  // Platform-specific constraints
  const constraints = {
    instagram:  'Max 2200 chars, use 20-30 hashtags, emoji-friendly, visual storytelling',
    tiktok:     'Max 2200 chars, use 5-10 trending hashtags, casual Gen Z tone, hook in first line',
    facebook:   'Max 500 chars for best engagement, 3-5 hashtags, conversational, include a question',
    pinterest:  'Max 500 chars, keyword-rich for SEO, descriptive, include board-relevant terms',
    all:        'Create separate versions for Instagram, TikTok, Facebook, and Pinterest',
  };

  const styleGuides = {
    promotional:   'Focus on sale, deal, or product value. Create urgency.',
    educational:   'Teach something about the product or niche. Provide value.',
    entertaining:  'Be funny, relatable, or surprising. Story-driven.',
    story:         'Behind-the-scenes or customer journey angle.',
  };

  const prompt = `
Create a ${platform} social media post for this Shopify product.

Product: ${product.title}
Type: ${product.product_type}
Price: $${product.variants?.[0]?.price}
Description: ${product.body_html?.replace(/<[^>]+>/g, '').substring(0, 300)}

Style: ${styleGuides[style]}
Platform rules: ${constraints[platform]}

${platform === 'all' ? `
Return JSON with this format:
{
  "instagram": { "caption": "...", "hashtags": ["...", "..."], "highlights": ["feature1", "feature2"] },
  "tiktok":    { "caption": "...", "hashtags": ["...", "..."], "hook": "first line hook" },
  "facebook":  { "caption": "...", "hashtags": ["...", "..."], "question": "engagement question" },
  "pinterest": { "caption": "...", "keywords": ["...", "..."], "boardSuggestion": "board name" }
}
` : `
Return JSON with this format:
{
  "caption":    "full post caption",
  "hashtags":   ["hashtag1", "hashtag2"],
  "highlights": ["product highlight 1", "product highlight 2", "product highlight 3"],
  "callToAction": "Link in bio / Shop now / etc."
}
`}
`.trim();

  const systemPrompt = 'You are a social media expert who creates viral content for e-commerce brands. Always return valid JSON only.';
  const raw = await generateText(prompt, systemPrompt);
  const postData = parseAIJson(raw);

  return {
    productId,
    productTitle: product.title,
    productImageUrl: imageUrl,
    platform,
    style,
    generated: postData,
    tip: `Use scheduleSocialPost to schedule this post, or copy the caption manually to post now.`,
  };
}

// ── scheduleSocialPost ────────────────────────────────────────────────────────
export async function scheduleSocialPost({ platform, content, imageUrl, scheduledTime }) {
  const result = schedulePost({
    platform,
    content,
    imageUrl,
    scheduledTime,
    postFn: async ({ platform: p, content: c, imageUrl: img }) => {
      // Route to the correct posting function
      switch (p) {
        case 'instagram': return postToInstagram({ caption: c, imageUrl: img });
        case 'facebook':  return postToFacebook({ message: c, imageUrl: img });
        case 'tiktok':    return postToTikTok({ caption: c, videoUrl: img });
        case 'pinterest': return postToPinterest({ description: c, imageUrl: img });
        default: throw new Error(`Unknown platform: ${p}`);
      }
    },
  });

  return {
    ...result,
    platform,
    contentPreview: content.substring(0, 100) + '...',
  };
}

// ── getSocialQueue ────────────────────────────────────────────────────────────
export async function getSocialQueue() {
  return {
    scheduled: getScheduledPosts(),
    queue:     getQueueStatus(),
  };
}

// ── postToInstagram ───────────────────────────────────────────────────────────
// Uses Meta Graph API (Instagram Business Account required)
export async function postToInstagram({ caption, imageUrl }) {
  const { META_ACCESS_TOKEN, META_INSTAGRAM_ACCOUNT_ID } = process.env;

  if (!META_ACCESS_TOKEN || !META_INSTAGRAM_ACCOUNT_ID) {
    return {
      success: false,
      platform: 'instagram',
      message: 'Instagram not configured. Set META_ACCESS_TOKEN and META_INSTAGRAM_ACCOUNT_ID in .env',
      instruction: 'Go to https://developers.facebook.com, create an app, connect your Instagram Business account.',
    };
  }

  return addToQueue(async () => {
    // Step 1: Create a media container
    const containerRes = await axios.post(
      `https://graph.facebook.com/v18.0/${META_INSTAGRAM_ACCOUNT_ID}/media`,
      {
        image_url: imageUrl,
        caption,
        access_token: META_ACCESS_TOKEN,
      }
    );
    const containerId = containerRes.data.id;

    // Step 2: Publish the container
    const publishRes = await axios.post(
      `https://graph.facebook.com/v18.0/${META_INSTAGRAM_ACCOUNT_ID}/media_publish`,
      {
        creation_id: containerId,
        access_token: META_ACCESS_TOKEN,
      }
    );

    return { success: true, platform: 'instagram', postId: publishRes.data.id };
  }, { platform: 'instagram', caption: caption.substring(0, 50) });
}

// ── postToFacebook ────────────────────────────────────────────────────────────
export async function postToFacebook({ message, imageUrl }) {
  const { META_ACCESS_TOKEN, META_PAGE_ID } = process.env;

  if (!META_ACCESS_TOKEN || !META_PAGE_ID) {
    return {
      success: false,
      platform: 'facebook',
      message: 'Facebook not configured. Set META_ACCESS_TOKEN and META_PAGE_ID in .env',
      instruction: 'Go to https://developers.facebook.com, create an app, get a Page access token.',
    };
  }

  return addToQueue(async () => {
    const endpoint = imageUrl
      ? `https://graph.facebook.com/v18.0/${META_PAGE_ID}/photos`
      : `https://graph.facebook.com/v18.0/${META_PAGE_ID}/feed`;

    const payload = { message, access_token: META_ACCESS_TOKEN };
    if (imageUrl) payload.url = imageUrl;

    const res = await axios.post(endpoint, payload);
    return { success: true, platform: 'facebook', postId: res.data.id };
  }, { platform: 'facebook', message: message.substring(0, 50) });
}

// ── postToTikTok ──────────────────────────────────────────────────────────────
export async function postToTikTok({ caption, videoUrl }) {
  const { TIKTOK_ACCESS_TOKEN } = process.env;

  if (!TIKTOK_ACCESS_TOKEN) {
    return {
      success: false,
      platform: 'tiktok',
      message: 'TikTok not configured. Set TIKTOK_ACCESS_TOKEN in .env',
      instruction: 'Go to https://developers.tiktok.com, create an app, get an access token. Note: TikTok requires video content for posting.',
    };
  }

  return addToQueue(async () => {
    // TikTok Content Posting API v2
    const res = await axios.post(
      'https://open.tiktokapis.com/v2/post/publish/video/init/',
      {
        post_info: {
          title: caption.substring(0, 150),
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: videoUrl,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${TIKTOK_ACCESS_TOKEN}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
      }
    );
    return { success: true, platform: 'tiktok', publishId: res.data.data?.publish_id };
  }, { platform: 'tiktok', caption: caption.substring(0, 50) });
}

// ── postToPinterest ───────────────────────────────────────────────────────────
export async function postToPinterest({ description, imageUrl }) {
  const { PINTEREST_ACCESS_TOKEN, PINTEREST_BOARD_ID } = process.env;

  if (!PINTEREST_ACCESS_TOKEN || !PINTEREST_BOARD_ID) {
    return {
      success: false,
      platform: 'pinterest',
      message: 'Pinterest not configured. Set PINTEREST_ACCESS_TOKEN and PINTEREST_BOARD_ID in .env',
      instruction: 'Go to https://developers.pinterest.com, create an app, get an access token.',
    };
  }

  return addToQueue(async () => {
    const res = await axios.post(
      'https://api.pinterest.com/v5/pins',
      {
        board_id: PINTEREST_BOARD_ID,
        media_source: {
          source_type: 'image_url',
          url: imageUrl,
        },
        description,
      },
      {
        headers: {
          Authorization: `Bearer ${PINTEREST_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return { success: true, platform: 'pinterest', pinId: res.data.id };
  }, { platform: 'pinterest', description: description.substring(0, 50) });
}
