/**
 * tools/shopify.js
 * Core Shopify Admin API tools:
 *   - getProducts, updateProduct
 *   - getOrders, getCustomers
 *   - createMetafield, updateMetafield
 */

import shopify from '../utils/shopifyClient.js';

// ── getProducts ───────────────────────────────────────────────────────────────
export async function getProducts({ limit = 10, status } = {}) {
  const params = { limit: Math.min(limit, 250) };
  if (status) params.status = status;

  const response = await shopify.get('/products.json', { params });
  const products = response.data.products;

  return {
    count: products.length,
    products: products.map((p) => ({
      id:          p.id,
      title:       p.title,
      status:      p.status,
      vendor:      p.vendor,
      productType: p.product_type,
      tags:        p.tags,
      price:       p.variants?.[0]?.price,
      inventory:   p.variants?.[0]?.inventory_quantity,
      bodyHtml:    p.body_html?.substring(0, 200) + '...', // truncate for readability
      updatedAt:   p.updated_at,
    })),
  };
}

// ── updateProduct ─────────────────────────────────────────────────────────────
export async function updateProduct({ productId, title, bodyHtml, tags, status, vendor, productType }) {
  const updateData = { product: { id: productId } };

  if (title)       updateData.product.title = title;
  if (bodyHtml)    updateData.product.body_html = bodyHtml;
  if (tags)        updateData.product.tags = tags;
  if (status)      updateData.product.status = status;
  if (vendor)      updateData.product.vendor = vendor;
  if (productType) updateData.product.product_type = productType;

  const response = await shopify.put(`/products/${productId}.json`, updateData);
  const p = response.data.product;

  return {
    success: true,
    product: {
      id:     p.id,
      title:  p.title,
      status: p.status,
      tags:   p.tags,
      updatedAt: p.updated_at,
    },
  };
}

// ── getOrders ─────────────────────────────────────────────────────────────────
export async function getOrders({ limit = 10, status = 'any', financialStatus } = {}) {
  const params = { limit: Math.min(limit, 250), status };
  if (financialStatus) params.financial_status = financialStatus;

  const response = await shopify.get('/orders.json', { params });
  const orders = response.data.orders;

  return {
    count: orders.length,
    orders: orders.map((o) => ({
      id:               o.id,
      orderNumber:      o.order_number,
      email:            o.email,
      totalPrice:       o.total_price,
      currency:         o.currency,
      financialStatus:  o.financial_status,
      fulfillmentStatus: o.fulfillment_status,
      customerName:     `${o.customer?.first_name || ''} ${o.customer?.last_name || ''}`.trim(),
      itemCount:        o.line_items?.length,
      createdAt:        o.created_at,
    })),
  };
}

// ── getCustomers ──────────────────────────────────────────────────────────────
export async function getCustomers({ limit = 10, query } = {}) {
  const params = { limit: Math.min(limit, 250) };
  if (query) params.query = query;

  const response = await shopify.get('/customers.json', { params });
  const customers = response.data.customers;

  return {
    count: customers.length,
    customers: customers.map((c) => ({
      id:            c.id,
      name:          `${c.first_name} ${c.last_name}`,
      email:         c.email,
      ordersCount:   c.orders_count,
      totalSpent:    c.total_spent,
      currency:      c.currency,
      tags:          c.tags,
      createdAt:     c.created_at,
    })),
  };
}

// ── createMetafield ───────────────────────────────────────────────────────────
export async function createMetafield({ resourceType, resourceId, namespace, key, value, type }) {
  const response = await shopify.post(`/${resourceType}/${resourceId}/metafields.json`, {
    metafield: { namespace, key, value, type },
  });
  const m = response.data.metafield;

  return {
    success: true,
    metafield: { id: m.id, namespace: m.namespace, key: m.key, value: m.value, type: m.type },
  };
}

// ── updateMetafield ───────────────────────────────────────────────────────────
export async function updateMetafield({ metafieldId, value, type }) {
  const updateData = { metafield: { id: metafieldId, value } };
  if (type) updateData.metafield.type = type;

  const response = await shopify.put(`/metafields/${metafieldId}.json`, updateData);
  const m = response.data.metafield;

  return {
    success: true,
    metafield: { id: m.id, key: m.key, value: m.value, updatedAt: m.updated_at },
  };
}
