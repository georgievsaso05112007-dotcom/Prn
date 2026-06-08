/**
 * server-http.js — HTTP Transport Version of the MCP Server
 *
 * Use this instead of server.js when:
 *   - You want to deploy to Render / Railway / Fly.io
 *   - You want to call tools via REST API (curl, Postman)
 *   - You want webhooks + MCP in the same process
 *
 * HOW TO RUN:
 *   node server-http.js
 *
 * HOW TO CALL A TOOL via curl:
 *   curl -X POST http://localhost:3000/tools/getProducts \
 *     -H "Content-Type: application/json" \
 *     -d '{"limit": 5}'
 *
 * HOW TO LIST ALL TOOLS:
 *   curl http://localhost:3000/tools
 */

import 'dotenv/config';
import express from 'express';
import { startWebhookServer } from './webhooks/handler.js';

// Import all tool handlers
import * as shopifyTools    from './tools/shopify.js';
import * as automationTools from './tools/automation.js';
import * as socialTools     from './tools/social.js';
import * as imageTools      from './tools/images.js';
import * as inventoryTools  from './tools/inventory.js';
import * as adsTools        from './tools/ads.js';
import * as landingTools    from './tools/landingPages.js';
import * as segmentTools    from './tools/segmentation.js';
import * as researchTools   from './tools/productResearch.js';
import * as supportTools    from './tools/supportAgent.js';
import { schemas }          from './schemas/index.js';

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ── Tool registry (same as server.js) ─────────────────────────────────────────
const TOOLS = {
  // Core Shopify
  getProducts:         { fn: shopifyTools.getProducts,         description: 'Get products from Shopify' },
  updateProduct:       { fn: shopifyTools.updateProduct,       description: 'Update a product in Shopify' },
  getOrders:           { fn: shopifyTools.getOrders,           description: 'Get orders from Shopify' },
  getCustomers:        { fn: shopifyTools.getCustomers,        description: 'Get customers from Shopify' },
  createMetafield:     { fn: shopifyTools.createMetafield,     description: 'Create a Shopify metafield' },
  updateMetafield:     { fn: shopifyTools.updateMetafield,     description: 'Update a Shopify metafield' },
  // Automation
  generateProductDescription: { fn: automationTools.generateProductDescription, description: 'AI-generate a product description' },
  generateSEOFields:          { fn: automationTools.generateSEOFields,          description: 'AI-generate SEO fields' },
  generateOrderEmail:         { fn: automationTools.generateOrderEmail,         description: 'AI-generate an order email' },
  generateAbandonedCartEmail: { fn: automationTools.generateAbandonedCartEmail, description: 'AI-generate abandoned cart email' },
  analyzeOrderForTriggers:    { fn: automationTools.analyzeOrderForTriggers,    description: 'Detect automation triggers in an order' },
  // Social
  generateSocialPost:  { fn: socialTools.generateSocialPost,  description: 'AI-generate a social media post' },
  scheduleSocialPost:  { fn: socialTools.scheduleSocialPost,  description: 'Schedule a social media post' },
  getSocialQueue:      { fn: socialTools.getSocialQueue,      description: 'View scheduled posts' },
  // Images
  generateProductImage: { fn: imageTools.generateProductImage, description: 'AI-generate a product image' },
  // Inventory
  forecastInventory:   { fn: inventoryTools.forecastInventory, description: 'AI inventory forecasting' },
  // Ads
  generateAdCreative:  { fn: adsTools.generateAdCreative,     description: 'AI-generate ad creatives' },
  // Landing pages
  generateLandingPage: { fn: landingTools.generateLandingPage, description: 'AI-generate a landing page' },
  // Segmentation
  segmentCustomers:    { fn: segmentTools.segmentCustomers,   description: 'AI customer segmentation' },
  // Research
  researchProducts:    { fn: researchTools.researchProducts,  description: 'AI product market research' },
  // Support
  supportAgent:             { fn: supportTools.supportAgent,             description: 'AI customer support agent' },
  summarizeSupportTicket:   { fn: supportTools.summarizeSupportTicket,   description: 'Summarize a support ticket' },
};

// ── GET /tools — list all available tools ─────────────────────────────────────
app.get('/tools', (req, res) => {
  const toolList = Object.entries(TOOLS).map(([name, { description }]) => ({
    name,
    description,
    schema: schemas[name] || {},
    endpoint: `POST /tools/${name}`,
  }));
  res.json({ count: toolList.length, tools: toolList });
});

// ── POST /tools/:toolName — execute any tool ──────────────────────────────────
app.post('/tools/:toolName', async (req, res) => {
  const { toolName } = req.params;
  const tool = TOOLS[toolName];

  if (!tool) {
    return res.status(404).json({
      error: `Tool "${toolName}" not found`,
      availableTools: Object.keys(TOOLS),
    });
  }

  try {
    console.log(`[HTTP] Calling tool: ${toolName}`);
    const result = await tool.fn(req.body || {});
    res.json({ success: true, tool: toolName, result });
  } catch (err) {
    console.error(`[HTTP] Tool "${toolName}" failed:`, err.message);
    res.status(500).json({ success: false, tool: toolName, error: err.message });
  }
});

// ── GET /health ───────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    server: 'Shopify AI MCP HTTP Server',
    toolCount: Object.keys(TOOLS).length,
    aiProvider: process.env.AI_PROVIDER || 'groq',
    shopifyStore: process.env.SHOPIFY_STORE_URL || 'not configured',
    timestamp: new Date().toISOString(),
  });
});

// ── Start both HTTP API + Webhook listener ────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║   Shopify AI MCP HTTP Server                     ║`);
  console.log(`║   Tools API:   http://localhost:${PORT}/tools         ║`);
  console.log(`║   Health:      http://localhost:${PORT}/health        ║`);
  console.log(`║   Tools count: ${Object.keys(TOOLS).length.toString().padEnd(34)}║`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);
});

// Also start the webhook listener on a separate port
startWebhookServer();
