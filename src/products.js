/**
 * Product Catalog for Rosa 2.0
 * Fetches products from Wbuy API with intelligent caching
 * Falls back to local cache if API is unavailable
 */

const wbuy = require('./wbuy-api');

// Local product cache for fast responses
let productCache = [];
let categoriesCache = [];
let lastCacheUpdate = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10 min
let isInitialized = false;

/**
 * Initialize product catalog from Wbuy API
 * Called on startup and periodically refreshes
 */
async function initializeProducts() {
  try {
    console.log('[Products] Initializing product catalog from Wbuy API...');

    const result = await wbuy.getProducts(1, 100);
    let products = [];

    if (Array.isArray(result)) {
      products = result;
    } else if (result && result.data) {
      products = result.data;

      // Fetch additional pages if needed
      if (result.total && result.total > 100) {
        const totalPages = Math.ceil(result.total / 100);
        for (let p = 2; p <= totalPages && p <= 10; p++) {
          try {
            const nextPage = await wbuy.getProducts(p, 100);
            const items = Array.isArray(nextPage) ? nextPage : (nextPage.data || []);
            products = products.concat(items);
          } catch (err) {
            console.error(`[Products] Error fetching page ${p}:`, err.message);
            break;
          }
        }
      }
    }

    // Normalize product data
    productCache = products.map(normalizeProduct).filter(p => p.active);

    console.log(`[Products] Loaded ${productCache.length} active products from Wbuy`);

    // Load categories
    try {
      const cats = await wbuy.getCategories();
      categoriesCache = Array.isArray(cats) ? cats : (cats?.data || []);
      console.log(`[Products] Loaded ${categoriesCache.length} categories`);
    } catch (err) {
      console.error('[Products] Error loading categories:', err.message);
    }

    lastCacheUpdate = Date.now();
    isInitialized = true;
    return true;
  } catch (error) {
    console.error('[Products] Failed to initialize from Wbuy:', error.message);

    if (productCache.length === 0) {
      console.log('[Products] Loading fallback products...');
      productCache = getFallbackProducts();
      isInitialized = true;
    }
    return false;
  }
}

/**
 * Normalize product data from Wbuy format to internal format
 */
function normalizeProduct(raw) {
  return {
    id: String(raw.id || raw.product_id || ''),
    name: raw.name || raw.nome || 'Produto sem nome',
    sku: raw.sku || '',
    category: raw.category || raw.categoria || raw.category_name || '',
    categoryId: raw.category_id || raw.categoria_id || '',
    description: raw.description || raw.descricao || raw.short_description || raw.descricao_curta || '',
    price: parseFloat(raw.price || raw.preco || raw.valor || raw.price_sale || 0),
    priceOriginal: parseFloat(raw.price_original || raw.preco_original || raw.price_compare || 0),
    imageUrl: raw.image || raw.imagem || raw.photo || raw.foto || raw.thumbnail || '',
    slug: raw.slug || raw.url || '',
    active: raw.active !== false && raw.ativo !== false && raw.status !== 'inactive',
    stock: raw.stock || raw.estoque || raw.quantity || null,
    weight: raw.weight || raw.peso || 0,
    brand: raw.brand || raw.marca || '',
    benefits: raw.benefits || [],
    popularity: raw.popularity || raw.views || 0
  };
}

/**
 * Ensure cache is fresh
 */
async function ensureFreshCache() {
  if (!isInitialized || (Date.now() - lastCacheUpdate > CACHE_DURATION)) {
    await initializeProducts();
  }
}

/**
 * Search products by query and optional category
 */
async function searchProducts(query, category = null) {
  await ensureFreshCache();

  let results = [...productCache];

  // Filter by category
  if (category) {
    const cat = category.toLowerCase();
    results = results.filter(p =>
      p.category.toLowerCase().includes(cat) ||
      p.categoryId.toString() === category
    );
  }

  // Filter by search query
  if (query && query.trim()) {
    const q = query.toLowerCase();
    const terms = q.split(/\s+/);

    results = results.filter(p => {
      const searchText = `${p.name} ${p.description} ${p.category} ${p.brand} ${p.sku} ${p.benefits.join(' ')}`.toLowerCase();
      return terms.every(term => searchText.includes(term));
    });
  }

  // Sort by relevance
  results.sort((a, b) => {
    // Exact name match first
    const aNameMatch = query ? a.name.toLowerCase().includes(query.toLowerCase()) : false;
    const bNameMatch = query ? b.name.toLowerCase().includes(query.toLowerCase()) : false;
    if (aNameMatch && !bNameMatch) return -1;
    if (!aNameMatch && bNameMatch) return 1;

    // Then by popularity/stock
    if (a.stock !== null && b.stock !== null) {
      if (a.stock > 0 && b.stock <= 0) return -1;
      if (a.stock <= 0 && b.stock > 0) return 1;
    }

    return (b.popularity || 0) - (a.popularity || 0);
  });

  return results.slice(0, 10);
}

/**
 * Get product details by ID
 */
async function getProductDetails(productId) {
  await ensureFreshCache();

  // Try local cache first
  let product = productCache.find(p => p.id === productId || p.sku === productId);

  if (!product) {
    // Try fetching from API directly
    try {
      const raw = await wbuy.getProduct(productId);
      if (raw) {
        product = normalizeProduct(raw);
      }
    } catch (error) {
      console.error(`[Products] Error fetching product ${productId}:`, error.message);
    }
  }

  return product || null;
}

/**
 * Get all categories
 */
async function getCategories() {
  await ensureFreshCache();

  if (categoriesCache.length > 0) {
    return categoriesCache.map(c => ({
      id: c.id || c.category_id,
      name: c.name || c.nome || c.category_name
    }));
  }

  // Derive categories from products
  const cats = new Map();
  productCache.forEach(p => {
    if (p.category && !cats.has(p.category)) {
      cats.set(p.category, { id: p.categoryId, name: p.category });
    }
  });

  return Array.from(cats.values());
}

/**
 * Get products by category
 */
async function getProductsByCategory(category) {
  return searchProducts('', category);
}

/**
 * Get top/popular products
 */
async function getTopProducts(limit = 5) {
  await ensureFreshCache();

  return [...productCache]
    .filter(p => p.active && (p.stock === null || p.stock > 0))
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, limit);
}

/**
 * Check product stock
 */
async function checkStock(productId) {
  try {
    const stock = await wbuy.getProductStock(productId);
    return {
      productId,
      inStock: stock ? (stock.quantity || stock.quantidade || stock.estoque || 0) > 0 : false,
      quantity: stock ? (stock.quantity || stock.quantidade || stock.estoque || 0) : 0
    };
  } catch (error) {
    // Try local cache
    const product = productCache.find(p => p.id === productId);
    return {
      productId,
      inStock: product ? product.stock > 0 : false,
      quantity: product ? product.stock : 0
    };
  }
}

/**
 * Get product photo URL
 */
async function getProductPhotoUrl(productId) {
  // Try local cache first
  const product = productCache.find(p => p.id === productId);
  if (product && product.imageUrl) {
    return product.imageUrl;
  }

  // Try API
  return await wbuy.getMainPhotoUrl(productId);
}

/**
 * Format product for display in WhatsApp
 */
function formatProduct(product) {
  if (!product) return 'Produto nÃ£o encontrado.';

  let text = `*${product.name}*\n`;

  if (product.description) {
    const desc = product.description.replace(/<[^>]*>/g, '').substring(0, 250);
    text += `${desc}\n`;
  }

  text += `\n*R$ ${product.price.toFixed(2)}*`;

  if (product.priceOriginal && product.priceOriginal > product.price) {
    const discount = Math.round((1 - product.price / product.priceOriginal) * 100);
    text += ` ~R$ ${product.priceOriginal.toFixed(2)}~ (-${discount}%)`;
  }

  if (product.brand) {
    text += `\nMarca: ${product.brand}`;
  }

  if (product.benefits && product.benefits.length > 0) {
    text += `\nBenefÃ­cios: ${product.benefits.join(', ')}`;
  }

  if (product.stock !== null) {
    text += product.stock > 0
      ? `\nâ Em estoque (${product.stock} unidades)`
      : '\nâ Fora de estoque';
  }

  return text;
}

/**
 * Get checkout URL for product
 */
function getCheckoutUrl(product) {
  if (!product) return 'https://www.gruporochasaude.com';
  return wbuy.getCheckoutUrl(product);
}

/**
 * Fallback products when API is unavailable
 */
function getFallbackProducts() {
  return [
    {
      id: 'cha-detox-001', name: 'ChÃ¡ Detox Rosa', sku: '', category: 'chÃ¡s',
      categoryId: '', description: 'Mistura natural de ervas para limpeza do organismo.',
      price: 29.90, priceOriginal: 0, imageUrl: '', slug: 'cha-detox-rosa',
      active: true, stock: null, weight: 0, brand: 'Rosa',
      benefits: ['DesintoxicaÃ§Ã£o', 'DigestÃ£o', 'Energia'], popularity: 9
    },
    {
      id: 'cha-emagrecedor-001', name: 'ChÃ¡ Emagrecedor Rosa', sku: '', category: 'chÃ¡s',
      categoryId: '', description: 'ChÃ¡ termogÃªnico natural com chÃ¡ verde, gengibre e canela.',
      price: 31.90, priceOriginal: 0, imageUrl: '', slug: 'cha-emagrecedor',
      active: true, stock: null, weight: 0, brand: 'Rosa',
      benefits: ['Metabolismo', 'Energia', 'Detox'], popularity: 10
    },
    {
      id: 'cha-relaxante-001', name: 'ChÃ¡ Relaxante Rosa', sku: '', category: 'chÃ¡s',
      categoryId: '', description: 'Blend calmante com valeriana, passiflora e melissa.',
      price: 27.90, priceOriginal: 0, imageUrl: '', slug: 'cha-relaxante',
      active: true, stock: null, weight: 0, brand: 'Rosa',
      benefits: ['Relaxamento', 'Sono', 'Estresse'], popularity: 8
    },
    {
      id: 'colageno-001', name: 'ColÃ¡geno Hidrolisado 300g', sku: '', category: 'suplementos',
      categoryId: '', description: 'ColÃ¡geno puro para pele, cabelo, unhas e articulaÃ§Ãµes.',
      price: 89.90, priceOriginal: 0, imageUrl: '', slug: 'colageno-hidrolisado',
      active: true, stock: null, weight: 0, brand: '',
      benefits: ['Pele', 'Cabelo', 'ArticulaÃ§Ãµes'], popularity: 9
    },
    {
      id: 'whey-protein-001', name: 'Whey Protein Isolado 900g', sku: '', category: 'suplementos',
      categoryId: '', description: 'ProteÃ­na de alto valor biolÃ³gico para recuperaÃ§Ã£o muscular.',
      price: 119.90, priceOriginal: 0, imageUrl: '', slug: 'whey-protein-isolado',
      active: true, stock: null, weight: 0, brand: '',
      benefits: ['ProteÃ­na', 'RecuperaÃ§Ã£o', 'MÃºsculos'], popularity: 8
    }
  ];
}

module.exports = {
  initializeProducts,
  searchProducts,
  getProductDetails,
  getCategories,
  getProductsByCategory,
  getTopProducts,
  checkStock,
  getProductPhotoUrl,
  formatProduct,
  getCheckoutUrl,
  getFallbackProducts,
  // Expose for agent
  PRODUCTS: productCache,
  getProductCache: () => productCache
};
