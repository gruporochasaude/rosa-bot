/**
 * Cart Management for Rosa 2.0
 * Handles cart operations and checkout
 *
 * FIX: generateCheckoutLinks was calling async getProductDetails() without await,
 * causing all checkout URLs to fallback to store homepage.
 * Cart items already contain full product data (spread during addToCart in agent.js),
 * so we now use item data directly instead of re-fetching.
 */

const { getProductDetails, getCheckoutUrl } = require('./products');

// Store domain
const STORE_URL = 'https://www.gruporochasaude.com';

/**
 * Format cart for display in WhatsApp
 */
function formatCartForDisplay(session) {
  if (session.cart.length === 0) {
    return '🛒 Seu carrinho está vazio\n\nQual produto você gostaria de adicionar?';
  }

  let message = '🛒 *Seu Carrinho*\n\n';

  session.cart.forEach((item, index) => {
    const price = parseFloat(item.price) || 0;
    const itemTotal = (price * item.quantity).toFixed(2).replace('.', ',');
    const unitPrice = price.toFixed(2).replace('.', ',');
    message += `${index + 1}. *${item.name}*\n`;
    message += `   ${item.quantity}x R$ ${unitPrice} = R$ ${itemTotal}\n\n`;
  });

  const total = session.getCartTotal();
  message += `*Total: R$ ${total.toFixed(2).replace('.', ',')}*\n\n`;
  message += `Deseja adicionar mais algum produto ou finalizar a compra?`;

  return message;
}

/**
 * Format product for quick add
 */
function formatProductForQuickAdd(product) {
  const price = parseFloat(product.price) || 0;
  return `${product.name} - R$ ${price.toFixed(2)}`;
}

/**
 * Calculate cart summary statistics
 */
function getCartStats(session) {
  return {
    itemCount: session.cart.length,
    totalQuantity: session.cart.reduce((sum, item) => sum + item.quantity, 0),
    totalValue: session.getCartTotal(),
    averagePrice: session.cart.length > 0 ? session.getCartTotal() / session.cart.length : 0,
    mostExpensiveItem: session.cart.length > 0
      ? session.cart.reduce((max, item) => (parseFloat(item.price) || 0) > (parseFloat(max.price) || 0) ? item : max)
      : null
  };
}

/**
 * Build checkout URL from cart item data
 * Cart items already contain productUrl and slug from when they were added
 */
function getItemCheckoutUrl(item) {
  // 1. Use productUrl if available (full URL from Wbuy url_absolute)
  if (item.productUrl && item.productUrl.startsWith('http')) {
    return item.productUrl;
  }

  // 2. Construct from slug using store domain
  if (item.slug) {
    const cleanSlug = item.slug.replace(/^\/+|\/+$/g, '');
    return `${STORE_URL}/${cleanSlug}/`;
  }

  // 3. Try using getCheckoutUrl from products module as fallback
  try {
    const url = getCheckoutUrl(item);
    if (url && url !== STORE_URL) return url;
  } catch (e) {
    // ignore
  }

  // 4. Fallback to store homepage
  return STORE_URL;
}

/**
 * Generate checkout links using cart item data directly
 * FIX: Previously called async getProductDetails() without await,
 * causing URLs to always fallback to store homepage.
 * Now uses item data directly since cart items contain full product data.
 */
function generateCheckoutLinks(session) {
  if (session.cart.length === 0) {
    return [];
  }

  return session.cart.map(item => {
    const url = getItemCheckoutUrl(item);
    return {
      name: item.name,
      quantity: item.quantity,
      price: parseFloat(item.price) || 0,
      url
    };
  });
}

// Keep backward-compatible single link (returns first product URL or store URL)
function generateCheckoutLink(session) {
  const links = generateCheckoutLinks(session);
  if (links.length === 0) return null;
  return links[0].url;
}

/**
 * Format checkout message with direct product page links
 */
function formatCheckoutMessage(session) {
  const stats = getCartStats(session);
  const links = generateCheckoutLinks(session);

  if (links.length === 0) {
    return '⚠ Seu carrinho está vazio. Adicione produtos antes de finalizar a compra.';
  }

  let message = '✅ *Pronto para finalizar!*\n\n';
  message += `📦 ${stats.itemCount} tipo(s) de produto\n`;
  message += `🔢 ${stats.totalQuantity} unidade(s) no total\n`;
  message += `💰 Valor total: *R$ ${stats.totalValue.toFixed(2).replace('.', ',')}*\n\n`;

  if (session.customer && session.customer.name) {
    message += `👤 Comprador: ${session.customer.name}\n`;
  }

  message += `\n🔗 *Link(s) para compra:*\n`;
  links.forEach((item, i) => {
    const qty = item.quantity > 1 ? ` (${item.quantity}x)` : '';
    message += `${i + 1}. *${item.name}*${qty}\n${item.url}\n\n`;
  });

  message += `Clique no link do produto, escolha a quantidade e finalize sua compra no site! 🛍`;

  return message;
}

/**
 * Validate cart items (check if products still exist)
 * Made async to properly await getProductDetails
 */
async function validateCart(session) {
  const invalidItems = [];
  const validItems = [];

  for (const item of session.cart) {
    try {
      const product = await getProductDetails(item.id);
      if (!product) {
        invalidItems.push(item.id);
      } else {
        validItems.push(item);
      }
    } catch (err) {
      // If we can't verify, keep the item (benefit of the doubt)
      validItems.push(item);
    }
  }

  if (invalidItems.length > 0) {
    session.cart = validItems;
    return {
      valid: validItems.length > 0,
      removedItems: invalidItems,
      message: `⚠️ ${invalidItems.length} produto(s) saíram de estoque e foram removidos do carrinho.`
    };
  }

  return {
    valid: true,
    removedItems: [],
    message: null
  };
}

/**
 * Apply discount to cart
 */
function applyDiscount(session, discountCode) {
  const discounts = {
    'PRIMEIRACOMPRA': 0.10, // 10% off
    'FIDELIDADE': 0.05,     // 5% off
    'ROSA2024': 0.15        // 15% off
  };

  const discountPercent = discounts[discountCode.toUpperCase()];
  if (!discountPercent) {
    return {
      success: false,
      message: '❌ Código de desconto inválido',
      discount: 0
    };
  }

  const currentTotal = session.getCartTotal();
  const discountAmount = currentTotal * discountPercent;

  return {
    success: true,
    message: `✅ Desconto de ${(discountPercent * 100).toFixed(0)}% aplicado! Você economiza R$ ${discountAmount.toFixed(2)}`,
    discount: discountAmount,
    originalTotal: currentTotal,
    newTotal: currentTotal - discountAmount
  };
}

/**
 * Get cart recommendations (what else to add)
 */
function getCartRecommendations(session) {
  if (session.cart.length === 0) {
    return [];
  }

  // Use the product cache getter (avoids stale reference to empty array)
  const { getProductCache } = require('./products');
  const allProducts = getProductCache();

  if (!allProducts || allProducts.length === 0) {
    return [];
  }

  // Recommend products not already in cart
  const recommendations = allProducts.filter(
    product => !session.cart.find(item => String(item.id) === String(product.id))
  );

  // Sort by popularity and return top 3
  return recommendations
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, 3);
}

module.exports = {
  formatCartForDisplay,
  formatProductForQuickAdd,
  getCartStats,
  generateCheckoutLink,
  generateCheckoutLinks,
  formatCheckoutMessage,
  validateCart,
  applyDiscount,
  getCartRecommendations
};
