/**
 * Product Catalog for Rosa 2.0
 * Fetches products from Wbuy API with intelligent caching
 * Falls back to local cache if API is unavailable
 *
 * Wbuy API field mapping (discovered from live API):
 *   produto = product name
 *   produto_url = URL slug
 *   descricao = HTML description
 *   valores_range = { min, max } price range (detail only)
 *   valores_base = { varejo, comparativo, ... } base prices
 *   estoque[].valores[0].valor = retail price (detail only)
 *   quantidade_total_em_estoque = stock qty (list endpoint)
 *   estoque[].quantidade_em_estoque = stock qty (detail endpoint)
 *   foto / fotos[].foto = photo URL
 *   marca = { nome, url, logo } brand object
 *   pasta = category folder ID
 *   url_absolute = full product URL (detail only)
 *   ativo = active status
 */

const wbuy = require('./wbuy-api');
const { extractData } = require('./wbuy-api');

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
    let products = extractData(result);

    // Fetch additional pages if we got a full page
    if (products.length >= 100) {
      for (let p = 2; p <= 10; p++) {
        try {
          const nextPage = await wbuy.getProducts(p, 100);
          const items = extractData(nextPage);
          if (items.length === 0) break;
          products = products.concat(items);
          if (items.length < 100) break;
        } catch (err) {
          console.error(`[Products] Error fetching page ${p}:`, err.message);
          break;
        }
      }
    }

    // Normalize product data
    productCache = products.map(normalizeProduct).filter(p => p.active);

    // Log sample for debugging
    if (productCache.length > 0) {
      const s = productCache[0];
      console.log(`[Products] Sample: name="${s.name}" price=${s.price} stock=${s.stock}`);
    }

    console.log(`[Products] Loaded ${productCache.length} active products from Wbuy`);

    // Load categories
    try {
      const catsResp = await wbuy.getCategories();
      categoriesCache = extractData(catsResp);
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
 * Extract price from Wbuy product data
 * Tries multiple locations where price might be stored
 */
function extractPrice(raw) {
  // 1. valores_range.min (available in detail queries)
  if (raw.valores_range && raw.valores_range.min) {
    const p = parseFloat(raw.valores_range.min);
    if (!isNaN(p) && p > 0) return p;
  }

  // 2. estoque[0].valores[0].valor (retail price from stock/price table)
  if (Array.isArray(raw.estoque) && raw.estoque.length > 0) {
    const est = raw.estoque[0];
    if (Array.isArray(est.valores) && est.valores.length > 0) {
      // Find "Varejo" (retail) price first
      const varejo = est.valores.find(v =>
        (v.tabela_nome || '').toLowerCase().includes('varejo')
      );
      if (varejo && varejo.valor) {
        const p = parseFloat(varejo.valor);
        if (!isNaN(p) && p > 0) return p;
      }
      // Fallback to first price entry
      const p = parseFloat(est.valores[0].valor);
      if (!isNaN(p) && p > 0) return p;
    }
  }

  // 3. valores_base.varejo
  if (raw.valores_base && raw.valores_base.varejo) {
    const v = String(raw.valores_base.varejo).replace(',', '.');
    const p = parseFloat(v);
    if (!isNaN(p) && p > 0) return p;
  }

  // 4. Legacy field names (backward compatibility)
  const legacy = raw.preco_venda || raw.preco || raw.price || raw.valor;
  if (legacy) {
    const p = parseFloat(String(legacy).replace(',', '.'));
    if (!isNaN(p) && p > 0) return p;
  }

  return 0;
}

/**
 * Extract stock quantity from Wbuy product data
 */
function extractStock(raw) {
  // 1. quantidade_total_em_estoque (list endpoint)
  if (raw.quantidade_total_em_estoque !== undefined && raw.quantidade_total_em_estoque !== null) {
    const q = parseInt(raw.quantidade_total_em_estoque);
    if (!isNaN(q)) return q;
  }

  // 2. estoque array (detail endpoint) - sum quantities
  if (Array.isArray(raw.estoque) && raw.estoque.length > 0) {
    let total = 0;
    for (const est of raw.estoque) {
      const q = parseInt(est.quantidade_em_estoque || 0);
      if (!isNaN(q)) total += q;
    }
    return total;
  }

  // 3. Legacy field names
  if (raw.estoque !== undefined && !Array.isArray(raw.estoque)) {
    const q = parseInt(raw.estoque);
    if (!isNaN(q)) return q;
  }
  if (raw.stock !== undefined) {
    const q = parseInt(raw.stock);
    if (!isNaN(q)) return q;
  }

  return null;
}

/**
 * Extract photo URL from Wbuy product data
 */
function extractPhotoUrl(raw) {
  // 1. fotos array (detail endpoint)
  if (Array.isArray(raw.fotos) && raw.fotos.length > 0) {
    const foto = raw.fotos[0].foto || raw.fotos[0].url || raw.fotos[0].src || '';
    if (foto) return foto;
  }

  // 2. foto field (may be URL or empty)
  if (raw.foto && typeof raw.foto === 'string' && raw.foto.startsWith('http')) {
    return raw.foto;
  }

  // 3. Legacy fields
  return raw.imagem || raw.image || raw.photo || raw.thumbnail || '';
}

/**
 * Normalize product data from Wbuy format to internal format
 * Handles both list and detail endpoint data structures
 */
function normalizeProduct(raw) {
  // Brand can be object { nome, url, logo } or string
  let brandName = '';
  if (raw.marca) {
    if (typeof raw.marca === 'object' && raw.marca.nome) {
      brandName = raw.marca.nome;
    } else if (typeof raw.marca === 'string') {
      brandName = raw.marca;
    }
  }
  if (!brandName) brandName = raw.brand || '';

  // Category from multiple possible sources
  const category = raw.categoria_level1 || raw.categoria_nome || raw.categoria ||
                   raw.category || raw.category_name || '';

  return {
    id: String(raw.id || raw.product_id || ''),
    name: raw.produto || raw.nome || raw.name || 'Produto sem nome',
    sku: raw.cod || raw.sku || '',
    category: typeof category === 'object' ? (category.nome || category.name || '') : String(category),
    categoryId: String(raw.pasta || raw.categoria_id || raw.category_id || ''),
    description: raw.descricao || raw.descricao_curta || raw.description || raw.short_description || '',
    price: extractPrice(raw),
    priceOriginal: parseFloat(raw.valores_base?.comparativo || raw.preco_original || raw.price_original || 0),
    imageUrl: extractPhotoUrl(raw),
    slug: raw.produto_url || raw.url_absolute || raw.slug || raw.url || '',
    active: raw.ativo !== '0' && raw.ativo !== 0 && raw.ativo !== false,
    stock: extractStock(raw),
    weight: parseFloat(raw.peso || raw.weight || 0),
    brand: brandName,
    benefits: raw.benefits || [],
    popularity: parseInt(raw.quantidade_total_visualizacoes || raw.visualizacoes || raw.views || raw.popularity || 0)
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
    // In stock first
    if (a.stock !== null && b.stock !== null) {
      if (a.stock > 0 && b.stock <= 0) return -1;
      if (a.stock <= 0 && b.stock > 0) return 1;
    }
    return (b.popularity || 0) - (a.popularity || 0);
  });

  return results.slice(0, 10);
}

/**
 * Get product details by ID - fetches fresh from API for full data
 */
async function getProductDetails(productId) {
  // Try fetching full details from API (has prices, photos, stock)
  try {
    const raw = await wbuy.getFullProductDetails(String(productId));
    if (raw) {
      return normalizeProduct(raw);
    }
  } catch (error) {
    console.error(`[Products] Error fetching product ${productId}:`, error.message);
  }

  // Fallback to cache
  await ensureFreshCache();
  return productCache.find(p => p.id === String(productId) || p.sku === String(productId)) || null;
}

/**
 * Get all categories
 */
async function getCategories() {
  await ensureFreshCache();
  if (categoriesCache.length > 0) {
    return categoriesCache.map(c => ({
      id: c.id || c.categoria_id || c.category_id,
      name: c.nome || c.name || c.categoria_nome || c.category_name
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
    const stockResp = await wbuy.getProductStock(productId);
    const stockItems = extractData(stockResp);
    if (stockItems.length > 0) {
      const qty = parseInt(stockItems[0].quantidade_em_estoque || stockItems[0].quantidade || stockItems[0].estoque || stockItems[0].quantity || 0);
      return { productId, inStock: qty > 0, quantity: qty };
    }
    // Fallback to local cache
    const product = productCache.find(p => p.id === String(productId));
    return { productId, inStock: product ? product.stock > 0 : false, quantity: product ? product.stock : 0 };
  } catch (error) {
    const product = productCache.find(p => p.id === String(productId));
    return { productId, inStock: product ? product.stock > 0 : false, quantity: product ? product.stock : 0 };
  }
}

/**
 * Get product photo URL
 */
async function getProductPhotoUrl(productId) {
  // Try local cache first
  const product = productCache.find(p => p.id === String(productId));
  if (product && product.imageUrl) {
    return product.imageUrl;
  }
  // Try API
  return await wbuy.getMainPhotoUrl(productId);
}

/**
 * Safe price formatting - handles NaN, undefined, null
 */
function safePrice(val) {
  const p = parseFloat(val);
  if (isNaN(p) || p <= 0) return null;
  return p.toFixed(2);
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

  const price = safePrice(product.price);
  if (price) {
    text += `\n*R$ ${price}*`;
    const origPrice = safePrice(product.priceOriginal);
    if (origPrice && parseFloat(origPrice) > parseFloat(price)) {
      const discount = Math.round((1 - product.price / product.priceOriginal) * 100);
      text += ` ~R$ ${origPrice}~ (-${discount}%)`;
    }
  } else {
    text += '\n*Consulte o preÃ§o*';
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
  if (product.slug && product.slug.startsWith('http')) return product.slug;
  if (product.slug) return `https://www.gruporochasaude.com/${product.slug}`;
  return wbuy.getCheckoutUrl(product);
}

/**
 * Fallback products when API is unavailable
 */
function getFallbackProducts() {
  return [
    { id: 'cha-detox-001', name: 'ChÃ¡ Detox Rosa', sku: '', category: 'chÃ¡s', categoryId: '', description: 'Mistura natural de ervas para limpeza do organismo.', price: 29.90, priceOriginal: 0, imageUrl: '', slug: 'cha-detox-rosa', active: true, stock: null, weight: 0, brand: 'Rosa', benefits: ['DesintoxicaÃ§Ã£o', 'DigestÃ£o', 'Energia'], popularity: 9 },
    { id: 'cha-emagrecedor-001', name: 'ChÃ¡ Emagrecedor Rosa', sku: '', category: 'chÃ¡s', categoryId: '', description: 'ChÃ¡ termogÃªnico natural com chÃ¡ verde, gengibre e canela.', price: 31.90, priceOriginal: 0, imageUrl: '', slug: 'cha-emagrecedor', active: true, stock: null, weight: 0, brand: 'Rosa', benefits: ['Metabolismo', 'Energia', 'Detox'], popularity: 10 },
    { id: 'cha-relaxante-001', name: 'ChÃ¡ Relaxante Rosa', sku: '', category: 'chÃ¡s', categoryId: '', description: 'Blend calmante com valeriana, passiflora e melissa.', price: 27.90, priceOriginal: 0, imageUrl: '', slug: 'cha-relaxante', active: true, stock: null, weight: 0, brand: 'Rosa', benefits: ['Relaxamento', 'Sono', 'Estresse'], popularity: 8 },
    { id: 'colageno-001', name: 'ColÃ¡geno Hidrolisado 300g', sku: '', category: 'suplementos', categoryId: '', description: 'ColÃ¡geno puro para pele, cabelo, unhas e articulaÃ§Ãµes.', price: 89.90, priceOriginal: 0, imageUrl: '', slug: 'colageno-hidrolisado', active: true, stock: null, weight: 0, brand: '', benefits: ['Pele', 'Cabelo', 'ArticulaÃ§Ãµes'], popularity: 9 },
    { id: 'whey-protein-001', name: 'Whey Protein Isolado 900g', sku: '', category: 'suplementos', categoryId: '', description: 'ProteÃ­na de alto valor biolÃ³gico para recuperaÃ§Ã£o muscular.', price: 119.90, priceOriginal: 0, imageUrl: '', slug: 'whey-protein-isolado', active: true, stock: null, weight: 0, brand: '', benefits: ['ProteÃ­na', 'RecuperaÃ§Ã£o', 'MÃºsculos'], popularity: 8 }
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
