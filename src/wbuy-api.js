/**
 * Wbuy API Client for Rosa Bot 2.0
 * Connects to Wbuy e-commerce platform API
 * Base URL: https://sistema.sistemawbuy.com.br/api/v1
 * Auth: Bearer BASE64(user:pass)
 * Rate limit: 100 requests per 60 seconds
 * Docs: https://documenter.getpostman.com/view/4141833/RWTsquyN/
 */

const WBUY_BASE_URL = 'https://sistema.sistemawbuy.com.br/api/v1';
const WBUY_API_USER = process.env.WBUY_API_USER || '';
const WBUY_API_PASSWORD = process.env.WBUY_API_PASSWORD || '';

// Cache configuration
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const cache = new Map();

/**
 * Get Bearer token for Wbuy API
 * Format: Bearer BASE64(usuario_api:senha_api)
 */
function getAuthHeader() {
  const credentials = Buffer.from(`${WBUY_API_USER}:${WBUY_API_PASSWORD}`).toString('base64');
  return `Bearer ${credentials}`;
}

/**
 * Generic API call with caching and error handling
 * Wbuy API returns: { code, message, responseCode, data: [...] }
 */
async function apiCall(endpoint, params = {}, cacheTTL = CACHE_TTL) {
  // Build URL with query params
  const url = new URL(`${WBUY_BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value);
    }
  });

  const cacheKey = url.toString();

  // Check cache
  if (cacheTTL > 0 && cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (Date.now() - cached.timestamp < cacheTTL) {
      console.log(`[Wbuy] Cache hit: ${endpoint}`);
      return cached.data;
    }
    cache.delete(cacheKey);
  }

  try {
    console.log(`[Wbuy] API call: ${endpoint}`);
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'RosaBot (contato@gruporochasaude.com)'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Wbuy] API error ${response.status}: ${errorText.substring(0, 200)}`);
      throw new Error(`Wbuy API error: ${response.status}`);
    }

    const data = await response.json();

    // Store in cache
    if (cacheTTL > 0) {
      cache.set(cacheKey, { data, timestamp: Date.now() });
    }

    return data;
  } catch (error) {
    console.error(`[Wbuy] Request failed for ${endpoint}:`, error.message);
    throw error;
  }
}

/**
 * Extract data array from Wbuy API response
 * Wbuy returns { code: "010", message: "success", responseCode: "200", data: [...] }
 */
function extractData(response) {
  if (!response) return [];
  if (Array.isArray(response)) return response;
  if (response.data && Array.isArray(response.data)) return response.data;
  return [];
}

/**
 * Clear all cache or specific endpoint cache
 */
function clearCache(endpoint = null) {
  if (endpoint) {
    for (const key of cache.keys()) {
      if (key.includes(endpoint)) cache.delete(key);
    }
  } else {
    cache.clear();
  }
  console.log(`[Wbuy] Cache cleared${endpoint ? ` for ${endpoint}` : ''}`);
}

// ==========================================
// PRODUCTS API - endpoint: /product/
// ==========================================

/**
 * Get all products (paginated)
 * Wbuy uses limit=offset,count format (e.g. limit=0,100)
 */
async function getProducts(page = 1, limit = 100) {
  const offset = (page - 1) * limit;
  return apiCall('/product/', { limit: `${offset},${limit}`, ativo: 1 });
}

/**
 * Get single product by ID
 */
async function getProduct(productId) {
  return apiCall(`/product/`, { id: productId });
}

/**
 * Get product photos
 * Wbuy: /product/{id}/photo/
 */
async function getProductPhotos(productId) {
  return apiCall(`/product/${productId}/photo/`);
}

/**
 * Get product prices
 */
async function getProductPrices(productId) {
  return apiCall(`/product/${productId}/price/`);
}

/**
 * Get product stock
 * Wbuy: /product/{id}/stock/
 */
async function getProductStock(productId) {
  return apiCall(`/product/${productId}/stock/`);
}

/**
 * Get product reviews/ratings
 * Wbuy: /product/review/
 */
async function getProductReviews(productId) {
  return apiCall(`/product/review/`, { product_id: productId });
}

/**
 * Get product variations
 */
async function getProductVariations(productId) {
  return apiCall(`/product/${productId}/variation/`);
}

// ==========================================
// CATEGORIES API - endpoint: /category/
// ==========================================

/**
 * Get all categories
 */
async function getCategories() {
  return apiCall('/category/');
}

// ==========================================
// COUPONS API - endpoint: /coupon/
// ==========================================

/**
 * Get all coupons
 */
async function getCoupons() {
  return apiCall('/coupon/');
}

/**
 * Validate a coupon code
 */
async function validateCoupon(code) {
  try {
    const response = await getCoupons();
    const coupons = extractData(response);
    if (coupons.length > 0) {
      const coupon = coupons.find(c => {
        const couponCode = c.code || c.codigo || c.cupom || '';
        const isActive = c.active !== false && c.ativo !== '0' && c.ativo !== 0;
        return couponCode.toLowerCase() === code.toLowerCase() && isActive;
      });
      return coupon || null;
    }
    return null;
  } catch (error) {
    console.error('[Wbuy] Error validating coupon:', error.message);
    return null;
  }
}

// ==========================================
// CUSTOMERS API - endpoint: /customer/
// ==========================================

/**
 * Get customer by ID
 */
async function getCustomer(customerId) {
  return apiCall('/customer/', { id: customerId });
}

/**
 * Search customers by name/email/city
 */
async function searchCustomers(query) {
  return apiCall('/customer/', { q: query });
}

/**
 * Get customer addresses (included in customer data)
 */
async function getCustomerAddresses(customerId) {
  const response = await getCustomer(customerId);
  const data = extractData(response);
  return data.length > 0 ? (data[0].enderecos || []) : [];
}

/**
 * Get customer credits
 */
async function getCustomerCredits(customerId) {
  const response = await getCustomer(customerId);
  const data = extractData(response);
  return data.length > 0 ? (data[0].credito_valor || 0) : 0;
}

/**
 * Get customer points
 */
async function getCustomerPoints(customerId) {
  return apiCall(`/customer/${customerId}/points/`);
}

// ==========================================
// ORDERS API - endpoint: /order/
// ==========================================

/**
 * Get orders (paginated)
 */
async function getOrders(page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  return apiCall('/order/', { limit: `${offset},${limit}` });
}

/**
 * Get single order by ID
 */
async function getOrder(orderId) {
  return apiCall('/order/', { id: orderId });
}

/**
 * Get order status
 * Handles Wbuy API returning situacao as object {id, nome} or string
 */
async function getOrderStatus(orderId) {
  const response = await getOrder(orderId);
  const data = extractData(response);
  if (data.length > 0) {
    const order = data[0];

    // Extract status - Wbuy may return situacao as object {id, nome} or string
    const rawStatus = order.situacao || order.status;
    let status;
    if (typeof rawStatus === 'object' && rawStatus !== null) {
      status = rawStatus.nome || rawStatus.descricao || rawStatus.name || JSON.stringify(rawStatus);
    } else {
      status = rawStatus || 'Desconhecido';
    }

    // Extract payment - may also be object
    const rawPayment = order.pagamento || order.forma_pagamento || '';
    const payment = typeof rawPayment === 'object' && rawPayment !== null
      ? (rawPayment.nome || rawPayment.descricao || '')
      : rawPayment;

    // Extract items
    const items = order.itens || order.produtos || order.items || [];

    return {
      id: orderId,
      status: status,
      date: order.data || order.cadastro || '',
      tracking: order.rastreio || order.tracking || '',
      total: order.total || order.valor_total || '',
      payment: payment,
      items: Array.isArray(items) ? items.map(i => ({
        name: i.produto || i.nome || i.name || 'Produto',
        quantity: i.quantidade || i.qty || 1,
        price: i.valor || i.preco || i.price || 0
      })) : [],
      itemCount: Array.isArray(items) ? items.length : 0
    };
  }
  return null;
}

/**
 * Get order customer info
 */
async function getOrderCustomer(orderId) {
  const response = await getOrder(orderId);
  const data = extractData(response);
  return data.length > 0 ? (data[0].cliente || null) : null;
}

// ==========================================
// NEWSLETTER - endpoint: /newsletter/
// ==========================================

/**
 * Get newsletter subscribers
 */
async function getNewsletterSubscribers(page = 1) {
  const offset = (page - 1) * 100;
  return apiCall('/newsletter/', { limit: `${offset},100` });
}

// ==========================================
// AFFILIATES - endpoint: /partnerstore/
// ==========================================

/**
 * Get affiliates/sellers
 */
async function getAffiliates() {
  return apiCall('/partnerstore/');
}

// ==========================================
// HIGH-LEVEL HELPER FUNCTIONS
// ==========================================

/**
 * Search products by name/description
 * Fetches from API and filters locally
 */
async function searchProductsByQuery(query, category = null) {
  try {
    // Fetch all products (cached)
    let allProducts = [];

    // Get first page
    const firstPage = await getProducts(1, 100);
    allProducts = extractData(firstPage);

    // Check if there are more pages (based on getting full 100 results)
    if (allProducts.length >= 100) {
      for (let p = 2; p <= 5; p++) {
        const nextPage = await getProducts(p, 100);
        const items = extractData(nextPage);
        if (items.length === 0) break;
        allProducts = allProducts.concat(items);
        if (items.length < 100) break;
      }
    }

    // Filter by category if specified
    if (category) {
      allProducts = allProducts.filter(p => {
        const cat = (p.category || p.categoria || p.categoria_nome || '').toLowerCase();
        return cat.includes(category.toLowerCase());
      });
    }

    // Filter by search query
    if (query && query.trim()) {
      const q = query.toLowerCase();
      allProducts = allProducts.filter(p => {
        const name = (p.name || p.nome || '').toLowerCase();
        const desc = (p.description || p.descricao || p.descricao_curta || '').toLowerCase();
        const sku = (p.sku || '').toLowerCase();
        return name.includes(q) || desc.includes(q) || sku.includes(q);
      });
    }

    // Sort by relevance (active products first, then by name)
    allProducts.sort((a, b) => {
      const aActive = a.ativo !== '0' && a.ativo !== 0 ? 1 : 0;
      const bActive = b.ativo !== '0' && b.ativo !== 0 ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return (a.name || a.nome || '').localeCompare(b.name || b.nome || '');
    });

    return allProducts.slice(0, 10);
  } catch (error) {
    console.error('[Wbuy] Search error:', error.message);
    return [];
  }
}

/**
 * Get full product details with photos and stock
 */
async function getFullProductDetails(productId) {
  try {
    const [productResp, photosResp, stockResp] = await Promise.all([
      getProduct(productId),
      getProductPhotos(productId).catch(() => null),
      getProductStock(productId).catch(() => null)
    ]);

    const products = extractData(productResp);
    if (products.length === 0) return null;

    const product = products[0];
    const photos = photosResp ? extractData(photosResp) : [];
    const stock = stockResp ? extractData(stockResp) : [];

    return {
      ...product,
      photos: photos,
      stock: stock.length > 0 ? stock[0] : null
    };
  } catch (error) {
    console.error(`[Wbuy] Error getting full product ${productId}:`, error.message);
    return null;
  }
}

/**
 * Check if product is in stock
 */
async function isProductInStock(productId) {
  try {
    const stockResp = await getProductStock(productId);
    const stock = extractData(stockResp);
    if (stock.length === 0) return false;
    const qty = stock[0].quantidade || stock[0].estoque || stock[0].quantity || 0;
    return parseInt(qty) > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Format product for WhatsApp display
 */
function formatProductForWhatsApp(product) {
  const name = product.name || product.nome || 'Produto';
  const price = product.price || product.preco || product.valor || product.preco_venda || 0;
  const desc = product.description || product.descricao || product.descricao_curta || '';
  const sku = product.sku || '';

  let text = `*${name}*\n`;
  if (desc) text += `${desc.replace(/<[^>]*>/g, '').substring(0, 200)}\n`;
  text += `R$ ${parseFloat(price).toFixed(2)}`;
  if (sku) text += ` | SKU: ${sku}`;

  return text;
}

/**
 * Get main photo URL for a product
 */
async function getMainPhotoUrl(productId) {
  try {
    const photosResp = await getProductPhotos(productId);
    const photos = extractData(photosResp);
    if (photos.length > 0) {
      return photos[0].url || photos[0].src || photos[0].image || photos[0].link || null;
    }

    // Try getting from product data directly
    const productResp = await getProduct(productId);
    const products = extractData(productResp);
    if (products.length > 0) {
      return products[0].foto || products[0].imagem || products[0].image || null;
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Get checkout URL for a product
 */
function getCheckoutUrl(product) {
  const slug = product.slug || product.url || '';
  if (slug.startsWith('http')) return slug;
  return `https://www.gruporochasaude.com/${slug}`;
}

module.exports = {
  // Products
  getProducts,
  getProduct,
  getProductPhotos,
  getProductPrices,
  getProductStock,
  getProductReviews,
  getProductVariations,
  searchProductsByQuery,
  getFullProductDetails,
  isProductInStock,
  formatProductForWhatsApp,
  getMainPhotoUrl,
  getCheckoutUrl,

  // Categories
  getCategories,

  // Coupons
  getCoupons,
  validateCoupon,

  // Customers
  getCustomer,
  searchCustomers,
  getCustomerAddresses,
  getCustomerCredits,
  getCustomerPoints,

  // Orders
  getOrders,
  getOrder,
  getOrderStatus,
  getOrderCustomer,

  // Newsletter
  getNewsletterSubscribers,

  // Affiliates
  getAffiliates,

  // Helpers
  extractData,
  clearCache
};
