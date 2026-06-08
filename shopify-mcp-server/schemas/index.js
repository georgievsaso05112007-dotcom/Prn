/**
 * schemas/index.js
 * JSON Schema definitions for every MCP tool.
 * These tell Claude what parameters each tool accepts.
 */

export const schemas = {
  // ── Core Shopify tools ──────────────────────────────────────────────────────
  getProducts: {
    type: 'object',
    properties: {
      limit:  { type: 'number', description: 'Max products to return (default 10, max 250)' },
      status: { type: 'string', enum: ['active', 'draft', 'archived'], description: 'Filter by status' },
    },
  },

  updateProduct: {
    type: 'object',
    required: ['productId'],
    properties: {
      productId:   { type: 'string', description: 'Shopify product ID' },
      title:       { type: 'string', description: 'New product title' },
      bodyHtml:    { type: 'string', description: 'New product description (HTML)' },
      tags:        { type: 'string', description: 'Comma-separated tags' },
      status:      { type: 'string', enum: ['active', 'draft', 'archived'] },
      vendor:      { type: 'string', description: 'Product vendor/brand' },
      productType: { type: 'string', description: 'Product type/category' },
    },
  },

  getOrders: {
    type: 'object',
    properties: {
      limit:        { type: 'number', description: 'Max orders to return (default 10)' },
      status:       { type: 'string', enum: ['open', 'closed', 'cancelled', 'any'], description: 'Order status filter' },
      financialStatus: { type: 'string', enum: ['paid', 'pending', 'refunded', 'any'], description: 'Payment status filter' },
    },
  },

  getCustomers: {
    type: 'object',
    properties: {
      limit:  { type: 'number', description: 'Max customers to return (default 10)' },
      query:  { type: 'string', description: 'Search customers by name or email' },
    },
  },

  createMetafield: {
    type: 'object',
    required: ['resourceType', 'resourceId', 'namespace', 'key', 'value', 'type'],
    properties: {
      resourceType: { type: 'string', enum: ['products', 'orders', 'customers'], description: 'Shopify resource type' },
      resourceId:   { type: 'string', description: 'ID of the resource' },
      namespace:    { type: 'string', description: 'Metafield namespace (e.g. "custom")' },
      key:          { type: 'string', description: 'Metafield key (e.g. "ai_description")' },
      value:        { type: 'string', description: 'Metafield value' },
      type:         { type: 'string', description: 'Metafield type (e.g. "single_line_text_field")' },
    },
  },

  updateMetafield: {
    type: 'object',
    required: ['metafieldId', 'value'],
    properties: {
      metafieldId: { type: 'string', description: 'ID of the metafield to update' },
      value:       { type: 'string', description: 'New value' },
      type:        { type: 'string', description: 'Metafield value type' },
    },
  },

  // ── Automation tools ────────────────────────────────────────────────────────
  generateProductDescription: {
    type: 'object',
    required: ['productId'],
    properties: {
      productId: { type: 'string', description: 'Shopify product ID' },
      tone:      { type: 'string', enum: ['professional', 'casual', 'luxury', 'playful'], description: 'Writing tone' },
      saveToShopify: { type: 'boolean', description: 'If true, updates the product in Shopify automatically' },
    },
  },

  generateSEOFields: {
    type: 'object',
    required: ['productId'],
    properties: {
      productId:     { type: 'string', description: 'Shopify product ID' },
      saveToShopify: { type: 'boolean', description: 'If true, saves SEO fields to Shopify' },
    },
  },

  generateOrderEmail: {
    type: 'object',
    required: ['orderId'],
    properties: {
      orderId:   { type: 'string', description: 'Shopify order ID' },
      emailType: { type: 'string', enum: ['confirmation', 'thankyou', 'followup', 'vip', 'loyalty'], description: 'Type of email to generate' },
    },
  },

  generateAbandonedCartEmail: {
    type: 'object',
    required: ['customerEmail', 'cartItems'],
    properties: {
      customerEmail: { type: 'string', description: 'Customer email address' },
      customerName:  { type: 'string', description: 'Customer first name' },
      cartItems:     { type: 'array', description: 'Array of cart item objects with title and price' },
      discountCode:  { type: 'string', description: 'Optional discount code to include in email' },
    },
  },

  analyzeOrderForTriggers: {
    type: 'object',
    required: ['orderId'],
    properties: {
      orderId: { type: 'string', description: 'Shopify order ID to analyze for automation triggers' },
    },
  },

  // ── Social media tools ──────────────────────────────────────────────────────
  generateSocialPost: {
    type: 'object',
    required: ['productId'],
    properties: {
      productId: { type: 'string', description: 'Shopify product ID' },
      platform:  { type: 'string', enum: ['instagram', 'tiktok', 'facebook', 'pinterest', 'all'], description: 'Target social platform' },
      style:     { type: 'string', enum: ['promotional', 'educational', 'entertaining', 'story'], description: 'Post style' },
    },
  },

  scheduleSocialPost: {
    type: 'object',
    required: ['platform', 'content', 'scheduledTime'],
    properties: {
      platform:      { type: 'string', enum: ['instagram', 'facebook', 'tiktok', 'pinterest'] },
      content:       { type: 'string', description: 'Post caption/text' },
      imageUrl:      { type: 'string', description: 'URL of image to post' },
      scheduledTime: { type: 'string', description: 'ISO 8601 datetime string (e.g. "2025-01-15T14:30:00Z")' },
    },
  },

  getSocialQueue: {
    type: 'object',
    properties: {},
  },

  // ── Image generation tools ──────────────────────────────────────────────────
  generateProductImage: {
    type: 'object',
    required: ['productId'],
    properties: {
      productId:   { type: 'string', description: 'Shopify product ID' },
      imageType:   { type: 'string', enum: ['lifestyle', 'white-background', 'social-media'], description: 'Type of image to generate' },
      style:       { type: 'string', description: 'Additional style instructions (e.g. "outdoors, sunny day")' },
      saveToShopify: { type: 'boolean', description: 'If true, upload image to Shopify product' },
    },
  },

  // ── Inventory forecasting ───────────────────────────────────────────────────
  forecastInventory: {
    type: 'object',
    properties: {
      productId:   { type: 'string', description: 'Specific product ID to forecast (omit for all products)' },
      daysAhead:   { type: 'number', description: 'Number of days to forecast ahead (default 30)' },
      writeToShopify: { type: 'boolean', description: 'If true, write forecast results to product metafields' },
    },
  },

  // ── Ad generation ───────────────────────────────────────────────────────────
  generateAdCreative: {
    type: 'object',
    required: ['productId'],
    properties: {
      productId:  { type: 'string', description: 'Shopify product ID' },
      platform:   { type: 'string', enum: ['facebook', 'instagram', 'tiktok', 'google-shopping', 'all'], description: 'Ad platform' },
      goal:       { type: 'string', enum: ['awareness', 'traffic', 'conversions', 'sales'], description: 'Campaign goal' },
      variations: { type: 'number', description: 'Number of A/B test variations to generate (default 3)' },
    },
  },

  // ── Landing page generation ─────────────────────────────────────────────────
  generateLandingPage: {
    type: 'object',
    required: ['productId'],
    properties: {
      productId: { type: 'string', description: 'Shopify product ID' },
      style:     { type: 'string', enum: ['minimal', 'bold', 'luxury', 'playful'], description: 'Design style' },
      sections:  { type: 'array', description: 'Sections to include: ["hero", "features", "testimonials", "cta"]' },
    },
  },

  // ── Customer segmentation ───────────────────────────────────────────────────
  segmentCustomers: {
    type: 'object',
    properties: {
      limit:         { type: 'number', description: 'Max customers to analyze (default 100)' },
      writeToShopify: { type: 'boolean', description: 'If true, write segment tags to customer profiles' },
    },
  },

  // ── Product research ────────────────────────────────────────────────────────
  researchProducts: {
    type: 'object',
    required: ['niche'],
    properties: {
      niche:        { type: 'string', description: 'Product niche or category to research (e.g. "yoga mats", "phone cases")' },
      targetMarket: { type: 'string', description: 'Target market (e.g. "US millennials", "fitness enthusiasts")' },
      priceRange:   { type: 'string', description: 'Target price range (e.g. "$20-$50")' },
    },
  },

  // ── Customer support agent ──────────────────────────────────────────────────
  supportAgent: {
    type: 'object',
    required: ['customerQuestion'],
    properties: {
      customerQuestion: { type: 'string', description: 'The customer question or support ticket' },
      customerEmail:    { type: 'string', description: 'Customer email (to look up their order history)' },
      orderId:          { type: 'string', description: 'Related order ID if known' },
      tone:             { type: 'string', enum: ['professional', 'friendly', 'empathetic', 'formal'], description: 'Response tone' },
    },
  },
};
