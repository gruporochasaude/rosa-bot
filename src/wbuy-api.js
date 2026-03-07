/**
 * Wbuy API Client for Rosa Bot 2.0
 * Connects to Wbuy e-commerce platform API
 * Base URL: https://sistema.sistemawbuy.com.br/api/v1
 * Rate limit: 100 requests per 60 seconds
 */

const WBUY_BASE_URL = 'https://sistema.sistemawbuy.com.br/api/v1';
const WBUY_API_USER = process.env.WBUY_API_USER || '';
const WBUY_API_PASSWORD = process.env.WBUY_API_PASSWORD || '';

// Cache configuration
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const cache = new Map();

/**
 * Get Basic Auth header for Wbuy API
 */
function getAuthHeader() {
  const credentials = Buffer.from(`${WBUY_API_USER}:${WBUY_API_PASSWORD}`).toString('base64');
  return `Basic ${credentials}`;
}

/**
 * Generic API call with caching and error handling
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
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Wbuy] API error ${response.status}: ${errorText}`);
      throw new Error(`Wbuy API error: ${response.status} - ${errorText}`);
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
// PRODUCTS API
// ==========================================

/**
 * Get all products (paginated)
 * @param {number} page - Page number (default: 1)
 * @param {number} limit - Items per page (default: 50)
 */
async function getProducts(page = 1, limit = 50) {
  return apiCall('/products', { page, limit });
}

/**
 * Get single product by ID
 */
async function getProduct(productId) {
  return apiCall(`/products/${productId}`);
}

/**
 * Get product photos
 */
async function getProductPhotos(productId) {
  return apiCall(`/products/${productId}/photos`);
}

/**
 * Get product prices
 */
async function getProductPrices(productId) {
  return apiCall(`/products/${productId}/prices`);
}

/**
 * Get product stock
 */
async function getProductStock(productId) {
  return apiCall(`/products/${productId}/stock`);
}

/**
 * Get product reviews/ratings
 */
async function getProductReviews(productId) {
  return apiCall(`/products/${productId}/reviews`);
}

/**
 * Get product brands
 */
async function getProductBrands() {
  return apiCall('/products/brands');
}

/**
 * Get product variations
 */
async function getProductVariations(productId) {
  return apiCall(`/products/${productId}/variations`);
}

// ==========================================
// CATEGORIES API
// ==========================================

/**
 * Get all categories
 */
async function getCategories() {
  return apiCall('/categories');
}

// ==========================================
// COUPONS API
// ==========================================

/**
 * Get all coupons
 */
async function getCoupons() {
  return apiCall('/coupons');
}

/**
 * Validate a coupon code
 */
async function validateCoupon(code) {
  try {
    const coupons = await getCoupons();
    if (Array.isArray(coupons)) {
      const coupon = coupons.find(c =>
        c.code && c.code.toLowerCase() === code.toLowerCase() && c.active
      );
      return coupon || null;
    }
    return null;
  } catch (error) {
    console.error('[Wbuy] Error validating coupon:', error.message);
    return null;
  }
}

// ==========================================
// CUSTOMERS API
// ==========================================

/**
 * Get customer by ID
 */
async function getCustomer(customerId) {
  return apiCall(`/customers/${customerId}`);
}

/**
 * Search customers
 */
async function searchCustomers(query) {
  return apiCall('/customers', { search: query });
}

/**
 * Get customer addresses
 */
async function getCustomerAddresses(customerId) {
  return apiCall(`/customers/${customerId}/addresses`);
}

/**
 * Get customer credits
 */
async function getCustomerCredits(customerId) {
  return apiCall(`/customers/${customerId}/credits`);
}

/**
 * Get customer points
 */
async function getCustomerPoints(customerId) {
  return apiCall(`/customers/${customerId}/points`);
}

// ==========================================
// ORDERS API
// ==========================================

/**
 * Get orders (paginated)
 */
async function getOrders(page = 1, limit = 20) {
  return apiCall('/orders', { page, limit });
}

/**
 * Get single order by ID
 */
async function getOrder(orderId) {
  return apiCall(`/orders/${orderId}`);
}

/**
 * Get order status
 */
async function getOrderStatus(orderId) {
  return apiCall(`/orders/${orderId}/status`);
}

/**
 * Get order customer info
 */
async function getOrderCustomer(orderId) {
  return apiCall(`/orders/${orderId}/customer`);
}

/**
 * Get all order statuses available
 */
async function getOrderStatuses() {
  return apiCall('/orders/statuses');
}

// ==========================================
// ACCOUNT & GLOBAL
// ==========================================

/**
 * Get basic account data
 */
async function getAccountData() {
  return apiCall('/account');
}

/**
 * Get visitor counter
 */
async function getVisitorCount() {
  return apiCall('/global/visitors');
}

// ==========================================
// NEWSLETTER
// ==========================================

/**
 * Get newsletter subscribers
 */
async function getNewsletterSubscribers(page = 1) {
  return apiCall('/newsletter', { page });
}

// ==========================================
// AFFILIATES
// ==========================================

/**
 * Get affiliates/sellers
 */
async function getAffiliates() {
  return apiCall('/affiliates');
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
    let page = 1;
    let hasMore = true;

    // Get first page
    const firstPage = await getProducts(1, 100);
    if (Array.isArray(firstPage)) {
      allProducts = firstPage;
    } else if (firstPage && firstPage.data) {
      allProducts = firstPage.data;
      // Check if there are more pages
      if (firstPage.total && firstPage.total > 100) {
        // Fetch remaining pages
        const totalPages = Math.ceil(firstPage.total / 100);
        for (let p = 2; p <= totalPages && p <= 5; p++) {
          const nextPage = await getProducts(p, 100);
          const items = Array.isArray(nextPage) ? nextPage : (nextPage.data || []);
          allProducts = allProducts.concat(items);
        }
      }
    }

    // Filter by category if specified
    if (category) {
      allProducts = allProducts.filter(p => {
        const cat = (p.category || p.categoria || '').toLowerCase();
        return cat.includes(category.toLowerCase());
      });
    }

    // Filter by search query
    if (query && query.trim()) {
      const q = query.toLowerCase();
      allProducts = allProducts.filter(p => {
        const name = (p.name || p.nome || '').toLowerCase();
        const desc = (p.description || p.descricao || '').toLowerCase();
        const sku = (p.sku || '').toLowerCase();
        return name.includes(q) || desc.includes(q) || sku.includes(q);
      });
    }

    // Sort by relevance (active products first, then by name)
    allProducts.sort((a, b) => {
      const aActive = a.active !== false && a.ativo !== false ? 1 : 0;
      const bActive = b.active !== false && b.ativo !== false ? 1 : 0;
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
    const [product, photos, stock] = await Promise.all([
      getProduct(productId),
      getProductPhotos(productId).catch(() => []),
      getProductStock(productId).catch(() => null)
    ]);

    return {
      ...product,
      photos: Array.isArray(photos) ? photos : (photos?.data || []),
      stock: stock
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
    const stock = await getProductStock(productId);
    if (!stock) return false;
    const qty = stock.quantity || stock.quantidade || stock.estoque || 0;
    return qty > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Format product for WhatsApp display
 */
function formatProductForWhatsApp(product) {
  const name = product.name || product.nome || 'Produto';
  const price = product.price || product.preco || product.valor || 0;
  const desc = product.description || product.descricao || '';
  const sku = product.sku || '';

  let text = `*${name}*\n`;
  if (desc) text += `${desc.substring(0, 200)}\n`;
  text += `R$ ${parseFloat(price).toFixed(2)}`;
  if (sku) text += ` | SKU: ${sku}`;

  return text;
}

/**
 * Get main photo URL for a product
 */
async function getMainPhotoUrl(productId) {
  try {
    const photos = await getProductPhotos(productId);
    const photoList = Array.isArray(photos) ? photos : (photos?.data || []);
    if (photoList.length > 0) {
      return photoList[0].url || photoList[0].src || photoList[0].image || null;
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
  getProductBrands,
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
  getOrderStatuses,

  // Account & Global
  getAccountData,
  getVisitorCount,

  // Newsletter
  getNewsletterSubscribers,

  // Affiliates
  getAffiliates,

  // Cache management
  clearCache
};
