/**
 * shopifyClient.js
 * Creates a pre-configured axios instance for all Shopify Admin API calls.
 * All tools import this so they don't have to repeat auth setup.
 */

import axios from 'axios';
import 'dotenv/config';

// Validate that required env vars are present on startup
const { SHOPIFY_STORE_URL, SHOPIFY_ACCESS_TOKEN, SHOPIFY_API_VERSION = '2024-01' } = process.env;

if (!SHOPIFY_STORE_URL || !SHOPIFY_ACCESS_TOKEN) {
  console.error('WARNING: SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN not set in .env');
  console.error('The server will start but Shopify API calls will fail until you configure these.');
}

// Build the base URL for every API call
const BASE_URL = `https://${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}`;

// Create an axios instance with Shopify auth baked in
const shopify = axios.create({
  baseURL: BASE_URL,
  headers: {
    'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  timeout: 30000, // 30 second timeout
});

// Log outgoing requests in dev mode
shopify.interceptors.request.use((config) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Shopify] ${config.method?.toUpperCase()} ${config.url}`);
  }
  return config;
});

// Handle Shopify API errors gracefully
shopify.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.errors || error.message;

    if (status === 429) {
      // Shopify rate limit hit — wait and retry
      const retryAfter = parseInt(error.response.headers['retry-after'] || '2', 10);
      console.warn(`[Shopify] Rate limited. Retry after ${retryAfter}s`);
      return new Promise((resolve) =>
        setTimeout(() => resolve(shopify.request(error.config)), retryAfter * 1000)
      );
    }

    console.error(`[Shopify] Error ${status}:`, message);
    throw new Error(`Shopify API error (${status}): ${JSON.stringify(message)}`);
  }
);

export default shopify;
