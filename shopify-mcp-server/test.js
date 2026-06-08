/**
 * test.js — Interactive test runner for every MCP tool
 *
 * This lets you test each tool WITHOUT needing Claude connected.
 * It calls the functions directly using your .env credentials.
 *
 * HOW TO RUN:
 *   node test.js                   → runs the default demo test
 *   node test.js getProducts       → test a specific tool
 *   node test.js all               → test all tools in sequence
 *
 * REQUIREMENTS:
 *   - .env file must be configured with real Shopify credentials
 *   - You need at least 1 product, 1 order, and 1 customer in your store
 */

import 'dotenv/config';

// ── Import all tool functions ──────────────────────────────────────────────────
import { getProducts, getOrders, getCustomers } from './tools/shopify.js';
import { generateProductDescription, generateSEOFields, generateOrderEmail, analyzeOrderForTriggers } from './tools/automation.js';
import { generateSocialPost } from './tools/social.js';
import { generateProductImage } from './tools/images.js';
import { forecastInventory } from './tools/inventory.js';
import { generateAdCreative } from './tools/ads.js';
import { generateLandingPage } from './tools/landingPages.js';
import { segmentCustomers } from './tools/segmentation.js';
import { researchProducts } from './tools/productResearch.js';
import { supportAgent } from './tools/supportAgent.js';

// ── Color helpers for terminal output ─────────────────────────────────────────
const green  = (s) => `\x1b[32m${s}\x1b[0m`;
const red    = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const bold   = (s) => `\x1b[1m${s}\x1b[0m`;
const cyan   = (s) => `\x1b[36m${s}\x1b[0m`;

// ── Run a single test ─────────────────────────────────────────────────────────
async function runTest(name, fn, args) {
  process.stdout.write(`\n${bold(`[TEST] ${name}`)} ... `);
  const start = Date.now();
  try {
    const result = await fn(args);
    const ms = Date.now() - start;
    console.log(green(`PASSED`) + ` (${ms}ms)`);
    console.log(cyan('Result preview:'), JSON.stringify(result, null, 2).substring(0, 400) + '...');
    return { name, passed: true, result };
  } catch (err) {
    console.log(red(`FAILED`));
    console.log(red(`Error: ${err.message}`));
    return { name, passed: false, error: err.message };
  }
}

// ── Test definitions ──────────────────────────────────────────────────────────
async function runAllTests() {
  console.log(bold('\n===================================================='));
  console.log(bold('  Shopify AI MCP Server — Tool Test Suite'));
  console.log(bold('===================================================='));
  console.log(yellow(`Store: ${process.env.SHOPIFY_STORE_URL}`));
  console.log(yellow(`AI Provider: ${process.env.AI_PROVIDER || 'groq'}`));

  const results = [];

  // ── Step 1: Get real IDs from the store ────────────────────────────────────
  console.log('\n' + bold('─── Fetching store data for test IDs ───'));

  let productId, orderId, customerId;

  try {
    const products = await getProducts({ limit: 1 });
    productId = products.products[0]?.id?.toString();
    console.log(green(`✓ Product ID: ${productId} (${products.products[0]?.title})`));
  } catch (e) {
    console.log(red('✗ Could not fetch products: ' + e.message));
  }

  try {
    const orders = await getOrders({ limit: 1 });
    orderId = orders.orders[0]?.id?.toString();
    console.log(green(`✓ Order ID: ${orderId} (#${orders.orders[0]?.orderNumber})`));
  } catch (e) {
    console.log(red('✗ Could not fetch orders: ' + e.message));
  }

  try {
    const customers = await getCustomers({ limit: 1 });
    customerId = customers.customers[0]?.id?.toString();
    console.log(green(`✓ Customer ID: ${customerId} (${customers.customers[0]?.name})`));
  } catch (e) {
    console.log(red('✗ Could not fetch customers: ' + e.message));
  }

  if (!productId) {
    console.log(red('\nERROR: No products found. Add at least 1 product to your Shopify store before testing.'));
    process.exit(1);
  }

  // ── Core Shopify tests ─────────────────────────────────────────────────────
  console.log('\n' + bold('─── Core Shopify Tools ───'));

  results.push(await runTest('getProducts', getProducts, { limit: 3 }));
  if (orderId)    results.push(await runTest('getOrders',    getOrders,    { limit: 3 }));
  if (customerId) results.push(await runTest('getCustomers', getCustomers, { limit: 3 }));

  // ── Automation tests ───────────────────────────────────────────────────────
  console.log('\n' + bold('─── AI Automation Tools ───'));

  results.push(await runTest(
    'generateProductDescription',
    generateProductDescription,
    { productId, tone: 'professional', saveToShopify: false }
  ));

  results.push(await runTest(
    'generateSEOFields',
    generateSEOFields,
    { productId, saveToShopify: false }
  ));

  if (orderId) {
    results.push(await runTest(
      'generateOrderEmail (thankyou)',
      generateOrderEmail,
      { orderId, emailType: 'thankyou' }
    ));

    results.push(await runTest(
      'analyzeOrderForTriggers',
      analyzeOrderForTriggers,
      { orderId }
    ));
  }

  // ── Social media tests ─────────────────────────────────────────────────────
  console.log('\n' + bold('─── Social Media Tools ───'));

  results.push(await runTest(
    'generateSocialPost (instagram)',
    generateSocialPost,
    { productId, platform: 'instagram', style: 'promotional' }
  ));

  // ── Image tests ────────────────────────────────────────────────────────────
  console.log('\n' + bold('─── Image Generation Tools ───'));

  results.push(await runTest(
    'generateProductImage (white-background)',
    generateProductImage,
    { productId, imageType: 'white-background', saveToShopify: false }
  ));

  // ── Inventory test ─────────────────────────────────────────────────────────
  console.log('\n' + bold('─── Inventory Forecasting ───'));

  results.push(await runTest(
    'forecastInventory',
    forecastInventory,
    { productId, daysAhead: 30, writeToShopify: false }
  ));

  // ── Ads test ───────────────────────────────────────────────────────────────
  console.log('\n' + bold('─── Ad Creative Generation ───'));

  results.push(await runTest(
    'generateAdCreative (facebook)',
    generateAdCreative,
    { productId, platform: 'facebook', goal: 'conversions', variations: 2 }
  ));

  // ── Landing page test ──────────────────────────────────────────────────────
  console.log('\n' + bold('─── Landing Page Generation ───'));

  results.push(await runTest(
    'generateLandingPage',
    generateLandingPage,
    { productId, style: 'minimal', sections: ['hero', 'features', 'cta'] }
  ));

  // ── Segmentation test ──────────────────────────────────────────────────────
  console.log('\n' + bold('─── Customer Segmentation ───'));

  results.push(await runTest(
    'segmentCustomers',
    segmentCustomers,
    { limit: 20, writeToShopify: false }
  ));

  // ── Product research test ──────────────────────────────────────────────────
  console.log('\n' + bold('─── Product Research ───'));

  results.push(await runTest(
    'researchProducts',
    researchProducts,
    { niche: 'phone accessories', targetMarket: 'Gen Z', priceRange: '$15-$40' }
  ));

  // ── Support agent test ─────────────────────────────────────────────────────
  console.log('\n' + bold('─── Customer Support Agent ───'));

  results.push(await runTest(
    'supportAgent',
    supportAgent,
    {
      customerQuestion: 'Where is my order? I placed it 3 days ago and haven\'t received tracking info.',
      tone: 'friendly',
      orderId: orderId || undefined,
    }
  ));

  // ── Summary ────────────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('\n' + bold('===================================================='));
  console.log(bold('  TEST SUMMARY'));
  console.log(bold('===================================================='));
  console.log(green(`  Passed: ${passed}/${results.length}`));
  if (failed > 0) {
    console.log(red(`  Failed: ${failed}/${results.length}`));
    console.log(red('\n  Failed tests:'));
    results.filter((r) => !r.passed).forEach((r) => {
      console.log(red(`    ✗ ${r.name}: ${r.error}`));
    });
  }
  console.log(bold('====================================================\n'));
}

// ── Run a single named test ────────────────────────────────────────────────────
async function runSingleTest(toolName) {
  const tests = {
    getProducts:               () => runTest('getProducts', getProducts, { limit: 5 }),
    getOrders:                 () => runTest('getOrders', getOrders, { limit: 5 }),
    getCustomers:              () => runTest('getCustomers', getCustomers, { limit: 5 }),
    generateProductDescription: async () => {
      const { products } = await getProducts({ limit: 1 });
      return runTest('generateProductDescription', generateProductDescription, { productId: products[0].id.toString() });
    },
    generateSEOFields: async () => {
      const { products } = await getProducts({ limit: 1 });
      return runTest('generateSEOFields', generateSEOFields, { productId: products[0].id.toString() });
    },
    forecastInventory: () => runTest('forecastInventory', forecastInventory, { daysAhead: 30 }),
    researchProducts:  () => runTest('researchProducts', researchProducts, { niche: process.argv[3] || 'fitness products' }),
    supportAgent:      () => runTest('supportAgent', supportAgent, {
      customerQuestion: process.argv[3] || 'How do I return my order?',
      tone: 'friendly',
    }),
  };

  const test = tests[toolName];
  if (!test) {
    console.log(red(`Unknown tool: "${toolName}"`));
    console.log('Available:', Object.keys(tests).join(', '));
    process.exit(1);
  }
  await test();
}

// ── Entry point ───────────────────────────────────────────────────────────────
const arg = process.argv[2];

if (!arg || arg === 'all') {
  runAllTests().catch(console.error);
} else {
  runSingleTest(arg).catch(console.error);
}
