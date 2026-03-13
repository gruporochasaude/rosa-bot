/**
 * Product Catalog for Rosa 2.0
 * Fetches products from Wbuy API with intelligent caching
 * Falls back to local cache if API is unavailable
 *
 * Wbuy API field mapping (discovered from live API):
 *   produto = product name
 *   produto_url = URL slug
 *   url_absolute = full product URL (both list and detail endpoints)
 *   descricao = HTML description
 *   valores_range = { min, max } price range
 *   valores_base = { varejo, comparativo, valorpromo, ... } base prices
 *   estoque[].valores[].valor = price per price table
 *   estoque[].valores[].valor_comparativo = original/compare price
 *   estoque[].valores[].valor_promo = promotional price
 *   estoque[].valores[].isPromo = "1" if promo active
 *   quantidade_total_em_estoque = stock qty (list endpoint)
 *   estoque[].quantidade_em_estoque = stock qty (detail endpoint)
 *   foto / fotos[].foto = photo URL
 *   marca = { nome, url, logo } brand object
 *   pasta = category folder ID
 *   ativo = active status
 */

const wbuy = require('./wbuy-api');
const { extractData } = require('./wbuy-api');

// Store domain
const STORE_URL = 'https://www.gruporochasaude.com';

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

    // Fetch ALL pages until no more products (pagination fix)
    if (products.length >= 100) {
      let page = 2;
          while (true) {
        try {
          const nextPage = await wbuy.getProducts(page, 100);
          const items = extractData(nextPage);
          if (items.length === 0) break;
          products = products.concat(items);
              console.log(`[Products] Page ${page}: +${items.length} products (total: ${products.length})`);
          if (items.length < 100) break; // Last page
              page++;
        } catch (err) {
          console.error(`[Products] Error fetching page ${page}:`, err.message);
          break;
        }
      }
    }

    // Normalize product data
    productCache = products.map(normalizeProduct).filter(p => p.active);

    // Log sample for debugging
    if (productCache.length > 0) {
      const s = productCache[0];
      console.log(`[Products] Sample: name="${s.name}" price=${s.price} priceOriginal=${s.priceOriginal} stock=${s.stock} url=${s.productUrl}`);
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
 * Extract retail price from Wbuy product data
 * Tries multiple locations where price might be stored
 */
function extractPrice(raw) {
  // 1. valores_range.min (most reliable - available in both list and detail)
  if (raw.valores_range && raw.valores_range.min) {
    const p = parseFloat(raw.valores_range.min);
    if (!isNaN(p) && p > 0) return p;
  }

  // 2. estoque[0].valores[] - find Varejo (retail) price
  if (Array.isArray(raw.estoque) && raw.estoque.length > 0) {
    const est = raw.estoque[0];
    if (Array.isArray(est.valores) && est.valores.length > 0) {
      const varejo = est.valores.find(v =>
        (v.tabela_nome || '').toLowerCase().includes('varejo')
      );
      if (varejo && varejo.valor) {
        const p = parseFloat(varejo.valor);
        if (!isNaN(p) && p > 0) return p;
      }
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

  // 4. Legacy field names
  const legacy = raw.preco_venda || raw.preco || raw.price || raw.valor;
  if (legacy) {
    const p = parseFloat(String(legacy).replace(',', '.'));
    if (!isNaN(p) && p > 0) return p;
  }

  return 0;
}

/**
 * Extract original/compare price for discount calculation
 * Checks valor_comparativo, valor_promo, and valores_base.comparativo
 */
function extractOriginalPrice(raw) {
  // 1. estoque[].valores[] - check valor_comparativo and valor_promo
  if (Array.isArray(raw.estoque) && raw.estoque.length > 0) {
    const est = raw.estoque[0];
    if (Array.isArray(est.valores) && est.valores.length > 0) {
      const varejo = est.valores.find(v =>
        (v.tabela_nome || '').toLowerCase().includes('varejo')
      ) || est.valores[0];

      // If isPromo is active and valor_promo exists, the current price is promo
      // and valor is the original
      if (varejo.isPromo === '1' || varejo.isPromo === 1) {
        const orig = parseFloat(varejo.valor);
        if (!isNaN(orig) && orig > 0) return orig;
      }

      // valor_comparativo is the "De:" price (original before discount)
      const comp = parseFloat(varejo.valor_comparativo);
      if (!isNaN(comp) && comp > 0) return comp;
    }
  }

  // 2. valores_base.comparativo
  if (raw.valores_base && raw.valores_base.comparativo) {
    const v = String(raw.valores_base.comparativo).replace(',', '.');
    const p = parseFloat(v);
    if (!isNaN(p) && p > 0) return p;
  }

  // 3. valor_promo field (top-level) - if > 0, it means there's a promo price
  // In this case valor_promo IS the discounted price, not the original
  // So we skip this

  // 4. Legacy fields
  const legacy = raw.preco_original || raw.price_original || raw.preco_de;
  if (legacy) {
    const p = parseFloat(String(legacy).replace(',', '.'));
    if (!isNaN(p) && p > 0) return p;
  }

  return 0;
}

/**
 * Extract the actual selling price considering promotions
 * If there's an active promo, return the promo price
 */
function extractSellingPrice(raw) {
  // Check if there's an active promotion
  if (Array.isArray(raw.estoque) && raw.estoque.length > 0) {
    const est = raw.estoque[0];
    if (Array.isArray(est.valores) && est.valores.length > 0) {
      const varejo = est.valores.find(v =>
        (v.tabela_nome || '').toLowerCase().includes('varejo')
      ) || est.valores[0];

      if (varejo.isPromo === '1' || varejo.isPromo === 1) {
        const promo = parseFloat(varejo.valor_promo);
        if (!isNaN(promo) && promo > 0) return promo;
      }
    }
  }

  // No active promo, return regular price
  return extractPrice(raw);
}

/**
 * Extract stock quantity from Wbuy product data
 */
function extractStock(raw) {
  if (raw.quantidade_total_em_estoque !== undefined && raw.quantidade_total_em_estoque !== null) {
    const q = parseInt(raw.quantidade_total_em_estoque);
    if (!isNaN(q)) return q;
  }

  if (Array.isArray(raw.estoque) && raw.estoque.length > 0) {
    let total = 0;
    for (const est of raw.estoque) {
      const q = parseInt(est.quantidade_em_estoque || 0);
      if (!isNaN(q)) total += q;
    }
    return total;
  }

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
  if (Array.isArray(raw.fotos) && raw.fotos.length > 0) {
    const foto = raw.fotos[0].foto || raw.fotos[0].url || raw.fotos[0].src || '';
    if (foto) return foto;
  }

  if (raw.foto && typeof raw.foto === 'string' && raw.foto.startsWith('http')) {
    return raw.foto;
  }

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

  // Get the selling price (considers promo if active)
  const sellingPrice = extractSellingPrice(raw);
  const originalPrice = extractOriginalPrice(raw);

  // If no explicit original price but regular price > selling price, use regular
  const regularPrice = extractPrice(raw);
  let finalOriginal = originalPrice;
  if (!finalOriginal && regularPrice > sellingPrice) {
    finalOriginal = regularPrice;
  }

  // Build product URL - prefer url_absolute, then construct from slug
  const urlAbsolute = raw.url_absolute || '';
  const slug = raw.produto_url || raw.slug || raw.url || '';

  return {
    id: String(raw.id || raw.product_id || ''),
    name: raw.produto || raw.nome || raw.name || 'Produto sem nome',
    sku: raw.cod || raw.sku || '',
    category: typeof category === 'object' ? (category.nome || category.name || '') : String(category),
    categoryId: String(raw.pasta || raw.categoria_id || raw.category_id || ''),
    description: raw.descricao || raw.descricao_curta || raw.description || raw.short_description || '',
    price: sellingPrice,
    priceOriginal: finalOriginal,
    imageUrl: extractPhotoUrl(raw),
    productUrl: urlAbsolute || (slug ? `${STORE_URL}/${slug}/` : ''),
    slug: slug,
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
 * Normalize text for search: remove accents, lowercase, strip HTML tags
 * "Chá de Dente de Leão" -> "cha de dente de leao"
 * "açaí" -> "acai", "maçã" -> "maca"
 */
function normalizeForSearch(text) {
  if (!text) return '';
  return String(text)
    .normalize('NFD')                    // decompose accents
    .replace(/[\u0300-\u036f]/g, '')     // remove diacritical marks
    .replace(/<[^>]*>/g, ' ')            // strip HTML tags
    .replace(/&[^;]+;/g, ' ')           // strip HTML entities
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')       // keep only alphanumeric + spaces
    .replace(/\s+/g, ' ')               // collapse whitespace
    .trim();
}

/**
 * Search products by query and optional category
 * Uses accent-normalized matching for Brazilian Portuguese
 */
async function searchProducts(query, category = null) {
  await ensureFreshCache();
  let results = [...productCache];

  if (category) {
    const catNorm = normalizeForSearch(category);
    results = results.filter(p =>
      normalizeForSearch(p.category).includes(catNorm) ||
      p.categoryId.toString() === category
    );
  }

  if (query && query.trim()) {
    const qNorm = normalizeForSearch(query);
    // Filter out very short common words that add noise (Portuguese stop words)
    const stopWords = ['de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas', 'um', 'uma', 'o', 'a', 'os', 'as', 'e', 'ou', 'com', 'por', 'para'];
    const terms = qNorm.split(/\s+/).filter(t => t.length > 0);
    // Keep meaningful terms (non-stopwords), but if ALL terms are stopwords, keep them all
    const meaningfulTerms = terms.filter(t => !stopWords.includes(t));
    const searchTerms = meaningfulTerms.length > 0 ? meaningfulTerms : terms;

    results = results.filter(p => {
      const searchText = normalizeForSearch(
        `${p.name} ${p.description} ${p.category} ${p.brand} ${p.sku} ${(p.benefits || []).join(' ')}`
      );
      return searchTerms.every(term => searchText.includes(term));
    });

    // If no results with ALL terms, try with ANY term (partial match fallback)
    if (results.length === 0 && searchTerms.length > 1) {
      results = [...productCache].filter(p => {
        const searchText = normalizeForSearch(
          `${p.name} ${p.description} ${p.category} ${p.brand} ${p.sku} ${(p.benefits || []).join(' ')}`
        );
        // At least half the meaningful terms must match
        const matchCount = searchTerms.filter(term => searchText.includes(term)).length;
        return matchCount >= Math.ceil(searchTerms.length / 2);
      });
    }
  }

  // Sort: name matches first, then in-stock, then by popularity
  const qNormSort = query ? normalizeForSearch(query) : '';
  results.sort((a, b) => {
    const aNameMatch = qNormSort ? normalizeForSearch(a.name).includes(qNormSort) : false;
    const bNameMatch = qNormSort ? normalizeForSearch(b.name).includes(qNormSort) : false;
    if (aNameMatch && !bNameMatch) return -1;
    if (!aNameMatch && bNameMatch) return 1;
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
  try {
    const raw = await wbuy.getFullProductDetails(String(productId));
    if (raw) {
      return normalizeProduct(raw);
    }
  } catch (error) {
    console.error(`[Products] Error fetching product ${productId}:`, error.message);
  }

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
  const product = productCache.find(p => p.id === String(productId));
  if (product && product.imageUrl) {
    return product.imageUrl;
  }
  return await wbuy.getMainPhotoUrl(productId);
}

/**
 * Safe price formatting - handles NaN, undefined, null
 */
function safePrice(val) {
  const p = parseFloat(val);
  if (isNaN(p) || p <= 0) return null;
  return p.toFixed(2).replace('.', ',');
}

/**
 * Format product for display in WhatsApp
 * Clean formatting without bullet points - natural text style
 */
function formatProduct(product) {
  if (!product) return 'Produto nÃ£o encontrado.';

  let text = `*${product.name}*\n`;

  const price = safePrice(product.price);
  if (price) {
    const origPrice = safePrice(product.priceOriginal);
    if (origPrice && product.priceOriginal > product.price) {
      const discount = Math.round((1 - product.price / product.priceOriginal) * 100);
      text += `\n~De: R$ ${origPrice}~`;
      text += `\n*Por: R$ ${price}* (-${discount}%)`;
    } else {
      text += `\n*R$ ${price}*`;
    }
  } else {
    text += '\nConsulte o preÃ§o';
  }

  if (product.brand) {
    text += `\nMarca: ${product.brand}`;
  }

  if (product.stock !== null) {
    text += product.stock > 0
      ? `\nâ DisponÃ­vel (${product.stock} un.)`
      : '\nâ IndisponÃ­vel';
  }

  // Add product link
  const url = getCheckoutUrl(product);
  if (url) {
    text += `\n\nð Comprar: ${url}`;
  }

  return text;
}

/**
 * Get product page URL (corrected - uses store domain)
 */
function getCheckoutUrl(product) {
  if (!product) return STORE_URL;

  // 1. Use productUrl if available (full URL from url_absolute)
  if (product.productUrl && product.productUrl.startsWith('http')) {
    return product.productUrl;
  }

  // 2. Construct from slug using store domain
  if (product.slug) {
    const cleanSlug = product.slug.replace(/^\/+|\/+$/g, '');
    return `${STORE_URL}/${cleanSlug}/`;
  }

  // 3. Fallback to store homepage (Wbuy has no URL-based add-to-cart)
  return STORE_URL;
}

/**
 * Fallback products when API is unavailable
 */
function getFallbackProducts() {
  return [
    { id: 'cha-detox-001', name: 'ChÃ¡ Detox Rosa', sku: '', category: 'chÃ¡s', categoryId: '', description: 'Mistura natural de ervas para limpeza do organismo.', price: 29.90, priceOriginal: 0, imageUrl: '', productUrl: `${STORE_URL}/cha-detox-rosa/`, slug: 'cha-detox-rosa', active: true, stock: null, weight: 0, brand: 'Rosa', benefits: ['DesintoxicaÃ§Ã£o', 'DigestÃ£o', 'Energia'], popularity: 9 },
    { id: 'cha-emagrecedor-001', name: 'ChÃ¡ Emagrecedor Rosa', sku: '', category: 'chÃ¡s', categoryId: '', description: 'ChÃ¡ termogÃªnico natural com chÃ¡ verde, gengibre e canela.', price: 31.90, priceOriginal: 0, imageUrl: '', productUrl: `${STORE_URL}/cha-emagrecedor/`, slug: 'cha-emagrecedor', active: true, stock: null, weight: 0, brand: 'Rosa', benefits: ['Metabolismo', 'Energia', 'Detox'], popularity: 10 },
    { id: 'cha-relaxante-001', name: 'ChÃ¡ Relaxante Rosa', sku: '', category: 'chÃ¡s', categoryId: '', description: 'Blend calmante com valeriana, passiflora e melissa.', price: 27.90, priceOriginal: 0, imageUrl: '', productUrl: `${STORE_URL}/cha-relaxante/`, slug: 'cha-relaxante', active: true, stock: null, weight: 0, brand: 'Rosa', benefits: ['Relaxamento', 'Sono', 'Estresse'], popularity: 8 },
    { id: 'colageno-001', name: 'ColÃ¡geno Hidrolisado 300g', sku: '', category: 'suplementos', categoryId: '', description: 'ColÃ¡geno puro para pele, cabelo, unhas e articulaÃ§Ãµes.', price: 89.90, priceOriginal: 0, imageUrl: '', productUrl: `${STORE_URL}/colageno-hidrolisado/`, slug: 'colageno-hidrolisado', active: true, stock: null, weight: 0, brand: '', benefits: ['Pele', 'Cabelo', 'ArticulaÃ§Ãµes'], popularity: 9 },
    { id: 'whey-protein-001', name: 'Whey Protein Isolado 900g', sku: '', category: 'suplementos', categoryId: '', description: 'ProteÃ­na de alto valor biolÃ³gico para recuperaÃ§Ã£o muscular.', price: 119.90, priceOriginal: 0, imageUrl: '', productUrl: `${STORE_URL}/whey-protein-isolado/`, slug: 'whey-protein-isolado', active: true, stock: null, weight: 0, brand: '', benefits: ['ProteÃ­na', 'RecuperaÃ§Ã£o', 'MÃºsculos'], popularity: 8 }
  ];
}

/**
 * DIETARY FILTER SYSTEM
 * Maps common dietary needs to search terms that match product descriptions
 * Each dietary need has multiple search terms (OR logic between terms, products matching ANY qualify)
 */
const DIETARY_FILTERS = {
  'zero_acucar': {
    label: 'Zero Açúcar / Sem Açúcar',
    searchTerms: ['zero acucar', 'sem acucar', 'sem adicao de acucar', 'sugar free', 'diet', 'zero sugar'],
    description: 'Produtos sem adição de açúcar, adoçados naturalmente ou diet'
  },
  'sem_gluten': {
    label: 'Sem Glúten',
    searchTerms: ['sem gluten', 'gluten free', 'livre de gluten', 'sem trigo'],
    description: 'Produtos livres de glúten, seguros para celíacos'
  },
  'sem_lactose': {
    label: 'Sem Lactose',
    searchTerms: ['sem lactose', 'lactose free', 'livre de lactose', 'vegetal', 'plant based'],
    description: 'Produtos sem lactose ou derivados do leite'
  },
  'vegano': {
    label: 'Vegano / Plant-Based',
    searchTerms: ['vegano', 'vegan', 'plant based', 'vegetal', 'sem origem animal'],
    description: 'Produtos 100% vegetais, sem ingredientes de origem animal'
  },
  'low_carb': {
    label: 'Low Carb / Cetogênico',
    searchTerms: ['low carb', 'lowcarb', 'cetogenico', 'keto', 'baixo carboidrato'],
    description: 'Produtos com baixo teor de carboidratos'
  },
  'proteico': {
    label: 'Rico em Proteína',
    searchTerms: ['proteina', 'protein', 'whey', 'proteico', 'high protein'],
    description: 'Produtos com alto teor proteico'
  },
  'organico': {
    label: 'Orgânico',
    searchTerms: ['organico', 'organic', 'selo organico'],
    description: 'Produtos com certificação orgânica'
  },
  'integral': {
    label: 'Integral',
    searchTerms: ['integral', 'grao inteiro', 'fibra', 'rico em fibras'],
    description: 'Produtos integrais e ricos em fibras'
  },
  'diabetico': {
    label: 'Para Diabéticos',
    searchTerms: ['zero acucar', 'sem acucar', 'diet', 'diabetico', 'baixo indice glicemico', 'adocante natural', 'stevia', 'xilitol'],
    description: 'Produtos adequados para controle glicêmico'
  },
  'energia': {
    label: 'Energia e Disposição',
    searchTerms: ['energia', 'termogenico', 'cafeina', 'guarana', 'maca peruana', 'pre treino', 'disposicao'],
    description: 'Produtos para energia, foco e disposição'
  },
  'imunidade': {
    label: 'Imunidade',
    searchTerms: ['imunidade', 'vitamina c', 'zinco', 'propolis', 'equinacea', 'imune'],
    description: 'Produtos para fortalecer o sistema imunológico'
  },
  'emagrecimento': {
    label: 'Emagrecimento',
    searchTerms: ['emagrecimento', 'emagrecer', 'termogenico', 'queima gordura', 'seca barriga', 'detox', 'drenagem'],
    description: 'Produtos auxiliares no processo de emagrecimento'
  },
  'digestao': {
    label: 'Digestão e Intestino',
    searchTerms: ['digestao', 'digestivo', 'probiotico', 'fibra', 'intestino', 'regulador', 'sene', 'boldo'],
    description: 'Produtos para saúde digestiva e regulação intestinal'
  }
};

/**
 * Filter products by dietary need
 * Uses the DIETARY_FILTERS mapping for intelligent multi-term search
 * @param {string} dietaryNeed - Key from DIETARY_FILTERS or free text
 * @returns {Array} Matching products sorted by relevance
 */
async function filterByDietaryNeeds(dietaryNeed) {
  await ensureFreshCache();

  const needNorm = normalizeForSearch(dietaryNeed);

  // Try to match a known filter key
  let filter = DIETARY_FILTERS[needNorm.replace(/\s+/g, '_')];

  // If no exact key match, search through labels and terms
  if (!filter) {
    for (const [key, f] of Object.entries(DIETARY_FILTERS)) {
      const labelNorm = normalizeForSearch(f.label);
      if (labelNorm.includes(needNorm) || needNorm.includes(labelNorm)) {
        filter = f;
        break;
      }
      // Check if any search term matches
      if (f.searchTerms.some(t => needNorm.includes(t) || t.includes(needNorm))) {
        filter = f;
        break;
      }
    }
  }

  let searchTerms;
  let filterLabel;
  let filterDescription;

  if (filter) {
    searchTerms = filter.searchTerms;
    filterLabel = filter.label;
    filterDescription = filter.description;
  } else {
    // Fallback: use the raw input as search term
    searchTerms = [needNorm];
    filterLabel = dietaryNeed;
    filterDescription = `Produtos relacionados a "${dietaryNeed}"`;
  }

  // Search products: match ANY of the search terms (OR logic)
  const results = productCache.filter(p => {
    if (!p.active) return false;
    const searchText = normalizeForSearch(
      `${p.name} ${p.description} ${p.category} ${p.brand} ${(p.benefits || []).join(' ')}`
    );
    return searchTerms.some(term => searchText.includes(normalizeForSearch(term)));
  });

  // Sort: in-stock first, then by how many terms match (more = better), then popularity
  results.sort((a, b) => {
    // Stock priority
    if (a.stock > 0 && (b.stock === null || b.stock <= 0)) return -1;
    if ((a.stock === null || a.stock <= 0) && b.stock > 0) return 1;

    // Term match count (more matches = more relevant)
    const aText = normalizeForSearch(`${a.name} ${a.description} ${a.category} ${a.brand} ${(a.benefits || []).join(' ')}`);
    const bText = normalizeForSearch(`${b.name} ${b.description} ${b.category} ${b.brand} ${(b.benefits || []).join(' ')}`);
    const aMatches = searchTerms.filter(t => aText.includes(normalizeForSearch(t))).length;
    const bMatches = searchTerms.filter(t => bText.includes(normalizeForSearch(t))).length;
    if (aMatches !== bMatches) return bMatches - aMatches;

    return (b.popularity || 0) - (a.popularity || 0);
  });

  return {
    filterLabel,
    filterDescription,
    totalFound: results.length,
    products: results.slice(0, 10)
  };
}

/**
 * Get all available dietary filters
 * Returns the list of pre-configured dietary categories
 */
function getAvailableDietaryFilters() {
  return Object.entries(DIETARY_FILTERS).map(([key, f]) => ({
    key,
    label: f.label,
    description: f.description
  }));
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
  filterByDietaryNeeds,
  getAvailableDietaryFilters,
  DIETARY_FILTERS,
  // Expose for agent
  PRODUCTS: productCache,
  getProductCache: () => productCache
};
