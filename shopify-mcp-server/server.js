/**
 * server.js — Main MCP Server Entry Point
 *
 * This file starts the MCP server and registers all 25+ tools.
 * It communicates via stdio (standard input/output), which is how
 * Claude Desktop and other MCP clients connect to it.
 *
 * QUICK START:
 *   1. cp .env.example .env && fill in your credentials
 *   2. npm install
 *   3. node server.js
 */

import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Import all tool modules
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

// Import schemas for all tools
import { schemas } from './schemas/index.js';

// ── Tool registry ─────────────────────────────────────────────────────────────
// Maps tool name → { handler function, description }
const TOOLS = {
  // Core Shopify
  getProducts: {
    fn:          shopifyTools.getProducts,
    description: 'Get a list of products from your Shopify store',
  },
  updateProduct: {
    fn:          shopifyTools.updateProduct,
    description: 'Update a product in Shopify (title, description, tags, status)',
  },
  getOrders: {
    fn:          shopifyTools.getOrders,
    description: 'Get orders from your Shopify store with optional filters',
  },
  getCustomers: {
    fn:          shopifyTools.getCustomers,
    description: 'Get customers from your Shopify store, optionally search by name/email',
  },
  createMetafield: {
    fn:          shopifyTools.createMetafield,
    description: 'Create a new metafield on a Shopify product, order, or customer',
  },
  updateMetafield: {
    fn:          shopifyTools.updateMetafield,
    description: 'Update an existing Shopify metafield value',
  },

  // Automation
  generateProductDescription: {
    fn:          automationTools.generateProductDescription,
    description: 'AI-generate a compelling product description and optionally save it to Shopify',
  },
  generateSEOFields: {
    fn:          automationTools.generateSEOFields,
    description: 'AI-generate SEO title, description, and tags for a product',
  },
  generateOrderEmail: {
    fn:          automationTools.generateOrderEmail,
    description: 'AI-generate an email for an order (thank-you, VIP, loyalty, follow-up)',
  },
  generateAbandonedCartEmail: {
    fn:          automationTools.generateAbandonedCartEmail,
    description: 'AI-generate an abandoned cart recovery email',
  },
  analyzeOrderForTriggers: {
    fn:          automationTools.analyzeOrderForTriggers,
    description: 'Analyze an order to detect automation triggers (VIP, new customer, loyalty)',
  },

  // Social Media
  generateSocialPost: {
    fn:          socialTools.generateSocialPost,
    description: 'AI-generate social media captions, hashtags, and highlights for a product',
  },
  scheduleSocialPost: {
    fn:          socialTools.scheduleSocialPost,
    description: 'Schedule a social media post for later automatic posting',
  },
  getSocialQueue: {
    fn:          socialTools.getSocialQueue,
    description: 'View all scheduled and queued social media posts',
  },

  // Images
  generateProductImage: {
    fn:          imageTools.generateProductImage,
    description: 'Generate AI product images (lifestyle, white-background, social-media) using free Pollinations.ai',
  },

  // Inventory
  forecastInventory: {
    fn:          inventoryTools.forecastInventory,
    description: 'AI-powered inventory forecasting: predict low-stock, reorder dates, sales velocity',
  },

  // Ads
  generateAdCreative: {
    fn:          adsTools.generateAdCreative,
    description: 'AI-generate ad creatives for Facebook, Instagram, TikTok, or Google Shopping with A/B variations',
  },

  // Landing Pages
  generateLandingPage: {
    fn:          landingTools.generateLandingPage,
    description: 'AI-generate a complete HTML+CSS landing page for a product, ready to embed in Shopify',
  },

  // Segmentation
  segmentCustomers: {
    fn:          segmentTools.segmentCustomers,
    description: 'AI-powered customer segmentation by LTV, purchase frequency, interests, and behavior',
  },

  // Product Research
  researchProducts: {
    fn:          researchTools.researchProducts,
    description: 'AI-powered product research: market trends, winning products, pricing, competitor analysis',
  },

  // Support
  supportAgent: {
    fn:          supportTools.supportAgent,
    description: 'AI customer support agent: answer questions, generate replies for shipping/refunds/product issues',
  },
  summarizeSupportTicket: {
    fn:          supportTools.summarizeSupportTicket,
    description: 'Summarize a customer support ticket and suggest a response',
  },
};

// ── Create MCP Server ─────────────────────────────────────────────────────────
const server = new Server(
  {
    name:    'shopify-ai-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: { tools: {} },
  }
);

// ── Handle: list all available tools ─────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = Object.entries(TOOLS).map(([name, { description }]) => ({
    name,
    description,
    inputSchema: schemas[name] || { type: 'object', properties: {} },
  }));

  console.error(`[MCP] Listed ${tools.length} tools`);
  return { tools };
});

// ── Handle: execute a tool ────────────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  console.error(`[MCP] Calling tool: ${name}`);

  const tool = TOOLS[name];
  if (!tool) {
    return {
      content: [{ type: 'text', text: `Unknown tool: "${name}". Available tools: ${Object.keys(TOOLS).join(', ')}` }],
      isError: true,
    };
  }

  try {
    const result = await tool.fn(args || {});
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    console.error(`[MCP] Tool "${name}" failed:`, err.message);
    return {
      content: [{ type: 'text', text: `Tool "${name}" failed: ${err.message}` }],
      isError: true,
    };
  }
});

// ── Start the server ──────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (not stdout!) so it doesn't interfere with MCP protocol
  console.error('╔════════════════════════════════════════════╗');
  console.error('║   Shopify AI MCP Server — Running          ║');
  console.error(`║   Tools registered: ${Object.keys(TOOLS).length.toString().padEnd(23)}║`);
  console.error(`║   AI Provider: ${(process.env.AI_PROVIDER || 'groq').padEnd(27)}║`);
  console.error(`║   Shopify Store: ${(process.env.SHOPIFY_STORE_URL || 'not set').substring(0, 24).padEnd(25)}║`);
  console.error('╚════════════════════════════════════════════╝');
}

main().catch((err) => {
  console.error('[MCP] Server crashed:', err);
  process.exit(1);
});
