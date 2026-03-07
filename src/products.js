/**
 * Product Catalog for Rosa 2.0
 * Hardcoded catalog of natural products with details
 */

const PRODUCTS = [
  // ChÃ¡s Naturais (Own Brand - Main Products)
  {
    id: 'cha-detox-001',
    name: 'ChÃ¡ Detox Rosa',
    category: 'chÃ¡s',
    description: 'Mistura natural de ervas para limpeza do organismo. FÃ³rmula exclusiva da Rosa com camomila, gengibre e lemongrass.',
    price: 29.90,
    imageUrl: 'https://via.placeholder.com/400x300?text=Cha+Detox+Rosa',
    checkoutUrl: 'https://wbuy.com.br/gruporochasaude/cha-detox-rosa',
    benefits: ['DesintoxicaÃ§Ã£o', 'DigestÃ£o', 'Energia'],
    popularity: 9
  },
  {
    id: 'cha-relaxante-001',
    name: 'ChÃ¡ Relaxante Rosa',
    category: 'chÃ¡s',
    description: 'Blend calmante com valeriana, passiflora e melissa. Perfeito para noites tranquilas e estresse.',
    price: 27.90,
    imageUrl: 'https://via.placeholder.com/400x300?text=Cha+Relaxante',
    checkoutUrl: 'https://wbuy.com.br/gruporochasaude/cha-relaxante',
    benefits: ['Relaxamento', 'Sono', 'Estresse'],
    popularity: 8
  },
  {
    id: 'cha-emagrecedor-001',
    name: 'ChÃ¡ Emagrecedor Rosa',
    category: 'chÃ¡s',
    description: 'ChÃ¡ termogÃªnico natural com chÃ¡ verde, gengibre e canela. Acelera o metabolismo naturalmente.',
    price: 31.90,
    imageUrl: 'https://via.placeholder.com/400x300?text=Cha+Emagrecedor',
    checkoutUrl: 'https://wbuy.com.br/gruporochasaude/cha-emagrecedor',
    benefits: ['Metabolismo', 'Energia', 'Detox'],
    popularity: 10
  },
  {
    id: 'cha-digestivo-001',
    name: 'ChÃ¡ Digestivo Rosa',
    category: 'chÃ¡s',
    description: 'FÃ³rmula suave com gengibre, hortelÃ£ e funcho. Alivia inchaÃ§o e facilita a digestÃ£o pÃ³s-refeiÃ§Ãµes.',
    price: 25.90,
    imageUrl: 'https://via.placeholder.com/400x300?text=Cha+Digestivo',
    checkoutUrl: 'https://wbuy.com.br/gruporochasaude/cha-digestivo',
    benefits: ['DigestÃ£o', 'InchaÃ§o', 'Conforto'],
    popularity: 7
  },
  {
    id: 'cha-imunidade-001',
    name: 'ChÃ¡ Imunidade Rosa',
    category: 'chÃ¡s',
    description: 'Blend fortalecedor com gengibre, cÃºrcuma, cravo e canela. ReforÃ§a suas defesas naturais.',
    price: 33.90,
    imageUrl: 'https://via.placeholder.com/400x300?text=Cha+Imunidade',
    checkoutUrl: 'https://wbuy.com.br/gruporochasaude/cha-imunidade',
    benefits: ['Imunidade', 'InflamaÃ§Ã£o', 'Antioxidante'],
    popularity: 9
  },

  // Suplementos
  {
    id: 'whey-protein-001',
    name: 'Whey Protein Isolado 900g',
    category: 'suplementos',
    description: 'ProteÃ­na de alto valor biolÃ³gico. Ajuda na recuperaÃ§Ã£o muscular e ganho de massa magra.',
    price: 119.90,
    imageUrl: 'https://via.placeholder.com/400x300?text=Whey+Protein',
    checkoutUrl: 'https://wbuy.com.br/gruporochasaude/whey-protein-isolado',
    benefits: ['ProteÃ­na', 'RecuperaÃ§Ã£o', 'MÃºsculos'],
    popularity: 8
  },
  {
    id: 'colageno-001',
    name: 'ColÃ¡geno Hidrolisado 300g',
    category: 'suplementos',
    description: 'ColÃ¡geno puro para pele, cabelo, unhas e articulaÃ§Ãµes. EficÃ¡cia comprovada.',
    price: 89.90,
    imageUrl: 'https://via.placeholder.com/400x300?text=Colageno',
    checkoutUrl: 'https://wbuy.com.br/gruporochasaude/colageno-hidrolisado',
    benefits: ['Pele', 'Cabelo', 'ArticulaÃ§Ãµes'],
    popularity: 9
  },
  {
    id: 'vitamina-c-001',
    name: 'Vitamina C 1000mg 60 cÃ¡psulas',
    category: 'suplementos',
    description: 'Vitamina C natural para imunidade e colÃ¡geno. AbsorÃ§Ã£o otimizada.',
    price: 45.90,
    imageUrl: 'https://via.placeholder.com/400x300?text=Vitamina+C',
    checkoutUrl: 'https://wbuy.com.br/gruporochasaude/vitamina-c-1000mg',
    benefits: ['Imunidade', 'Antioxidante', 'ColÃ¡geno'],
    popularity: 7
  },
  {
    id: 'vitamina-d-001',
    name: 'Vitamina D3 2000ui 60 cÃ¡psulas',
    category: 'suplementos',
    description: 'Vitamina D3 de alga vermelha. Ossos fortes e imunidade otimizada.',
    price: 52.90,
    imageUrl: 'https://via.placeholder.com/400x300?text=Vitamina+D3',
    checkoutUrl: 'https://wbuy.com.br/gruporochasaude/vitamina-d3-2000ui',
    benefits: ['Ossos', 'Imunidade', 'CÃ¡lcio'],
    popularity: 8
  },
  {
    id: 'omega-3-001',
    name: 'Ãmega 3 Premium 120 cÃ¡psulas',
    category: 'suplementos',
    description: 'Ãmega 3 puro com EPA e DHA. CoraÃ§Ã£o saudÃ¡vel e cÃ©rebro ativo.',
    price: 79.90,
    imageUrl: 'https://via.placeholder.com/400x300?text=Omega+3',
    checkoutUrl: 'https://wbuy.com.br/gruporochasaude/omega-3-premium',
    benefits: ['CoraÃ§Ã£o', 'CÃ©rebro', 'InflamaÃ§Ã£o'],
    popularity: 8
  },

  // EmpÃ³rio (Naturais)
  {
    id: 'farinha-amendoas-001',
    name: 'Farinha de AmÃªndoas 500g',
    category: 'empÃ³rio',
    description: 'Farinha natural de amÃªndoas sem glÃºten. Ideal para receitas saudÃ¡veis e low-carb.',
    price: 35.90,
    imageUrl: 'https://via.placeholder.com/400x300?text=Farinha+Amendoas',
    checkoutUrl: 'https://wbuy.com.br/gruporochasaude/farinha-amendoas-500g',
    benefits: ['ProteÃ­na', 'Sem glÃºten', 'Low-carb'],
    popularity: 6
  },
  {
    id: 'castanha-para-001',
    name: 'Castanha do ParÃ¡ OrgÃ¢nica 200g',
    category: 'empÃ³rio',
    description: 'Castanha do ParÃ¡ premium com selÃªnio e antioxidantes naturais. Superfood autÃªntico.',
    price: 42.90,
    imageUrl: 'https://via.placeholder.com/400x300?text=Castanha+Para',
    checkoutUrl: 'https://wbuy.com.br/gruporochasaude/castanha-para-organica',
    benefits: ['SelÃªnio', 'Antioxidante', 'Energia'],
    popularity: 7
  },
  {
    id: 'granola-artesanal-001',
    name: 'Granola Artesanal 400g',
    category: 'empÃ³rio',
    description: 'Granola caseira com frutas secas, amÃªndoas e mel. Sem aÃ§Ãºcar refinado.',
    price: 38.90,
    imageUrl: 'https://via.placeholder.com/400x300?text=Granola+Artesanal',
    checkoutUrl: 'https://wbuy.com.br/gruporochasaude/granola-artesanal-400g',
    benefits: ['Fibra', 'Energia', 'CafÃ© da manhÃ£'],
    popularity: 7
  },
  {
    id: 'mel-organico-001',
    name: 'Mel OrgÃ¢nico Puro 500g',
    category: 'empÃ³rio',
    description: 'Mel silvestre puro colhido direto do produtor. Sem aditivos ou pasteurizaÃ§Ã£o excessiva.',
    price: 45.90,
    imageUrl: 'https://via.placeholder.com/400x300?text=Mel+Organico',
    checkoutUrl: 'https://wbuy.com.br/gruporochasaude/mel-organico-500g',
    benefits: ['Energia', 'Imunidade', 'AntialÃ©rgico'],
    popularity: 8
  },
  {
    id: 'oleo-coco-001',
    name: 'Ãleo de Coco Extra Virgem 500ml',
    category: 'empÃ³rio',
    description: 'Ãleo de coco prensado a frio. Perfeito para culinÃ¡ria e beleza natural.',
    price: 39.90,
    imageUrl: 'https://via.placeholder.com/400x300?text=Oleo+Coco',
    checkoutUrl: 'https://wbuy.com.br/gruporochasaude/oleo-coco-extra-virgem',
    benefits: ['CulinÃ¡ria', 'Beleza', 'TCM'],
    popularity: 8
  }
];

/**
 * Search products by query and optional category
 * @param {string} query - Search term
 * @param {string} category - Optional category filter
 * @returns {Array} Matching products
 */
function searchProducts(query, category = null) {
  let results = PRODUCTS;

  if (category) {
    results = results.filter(p => p.category.toLowerCase() === category.toLowerCase());
  }

  if (query && query.trim()) {
    const q = query.toLowerCase();
    results = results.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.benefits.some(b => b.toLowerCase().includes(q))
    );
  }

  // Sort by popularity
  return results.sort((a, b) => b.popularity - a.popularity);
}

/**
 * Get product details by ID
 * @param {string} productId - Product ID
 * @returns {Object|null} Product object or null if not found
 */
function getProductDetails(productId) {
  return PRODUCTS.find(p => p.id === productId) || null;
}

/**
 * Get all categories
 * @returns {Array} Unique categories
 */
function getCategories() {
  return [...new Set(PRODUCTS.map(p => p.category))];
}

/**
 * Get products by category
 * @param {string} category - Category name
 * @returns {Array} Products in category
 */
function getProductsByCategory(category) {
  return PRODUCTS.filter(p => p.category === category).sort((a, b) => b.popularity - a.popularity);
}

/**
 * Get top products (most popular)
 * @param {number} limit - Number of top products
 * @returns {Array} Top products
 */
function getTopProducts(limit = 5) {
  return [...PRODUCTS].sort((a, b) => b.popularity - a.popularity).slice(0, limit);
}

/**
 * Format product for display
 * @param {Object} product - Product object
 * @returns {string} Formatted product string
 */
function formatProduct(product) {
  return `ð¦ *${product.name}*\nð¬ ${product.description}\nð° R$ ${product.price.toFixed(2)}\nâ¨ BenefÃ­cios: ${product.benefits.join(', ')}`;
}

module.exports = {
  PRODUCTS,
  searchProducts,
  getProductDetails,
  getCategories,
  getProductsByCategory,
  getTopProducts,
  formatProduct
};
