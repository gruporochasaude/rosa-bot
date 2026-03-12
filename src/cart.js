/**
 * Cart Management for Rosa 2.0
 * Handles cart operations and checkout
 */

const { getProductDetails, getCheckoutUrl } = require('./products');

/**
 * Format cart for display in WhatsApp
 */
function formatCartForDisplay(session) {
  if (session.cart.length === 0) {
    return 'ð Seu carrinho estÃ¡ vazio\n\nQual produto vocÃª gostaria de adicionar?';
  }

  let message = 'ð *Seu Carrinho*\n\n';

  session.cart.forEach((item, index) => {
    const itemTotal = (item.price * item.quantity).toFixed(2).replace('.', ',');
    const unitPrice = item.price.toFixed(2).replace('.', ',');
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
  return `${product.name} - R$ ${product.price.toFixed(2)}`;
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
      ? session.cart.reduce((max, item) => item.price > max.price ? item : max)
      : null
  };
}

/**
 * Generate checkout links using actual product page URLs
 * Wbuy uses session-based cart (no URL-based add-to-cart),
 * so we link directly to product pages where the customer can add to cart.
 */
const STORE_URL = 'https://www.gruporochasaude.com';

function generateCheckoutLinks(session) {
  if (session.cart.length === 0) {
    return [];
  }

  return session.cart.map(item => {
    const product = getProductDetails(item.id);
    const url = product ? getCheckoutUrl(product) : `${STORE_URL}`;
    return {
      name: item.name,
      quantity: item.quantity,
      price: item.price,
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
    return 'â Seu carrinho estÃ¡ vazio. Adicione produtos antes de finalizar a compra.';
  }

  let message = 'â *Pronto para finalizar!*\n\n';
  message += `ð¦ ${stats.itemCount} tipo(s) de produto\n`;
  message += `ð ${stats.totalQuantity} unidade(s) no total\n`;
  message += `ð° Valor total: *R$ ${stats.totalValue.toFixed(2).replace('.', ',')}*\n\n`;

  if (session.customer.name) {
    message += `ð¤ Comprador: ${session.customer.name}\n`;
  }

  message += `\nð *Link(s) para compra:*\n`;
  links.forEach((item, i) => {
    const qty = item.quantity > 1 ? ` (${item.quantity}x)` : '';
    message += `${i + 1}. *${item.name}*${qty}\n${item.url}\n\n`;
  });

  message += `Clique no link do produto, escolha a quantidade e finalize sua compra!`;

  return message;
}

/**
 * Validate cart items (check if products still exist)
 */
function validateCart(session) {
  const invalidItems = [];
  const validItems = [];

  session.cart.forEach(item => {
    const product = getProductDetails(item.id);
    if (!product) {
      invalidItems.push(item.id);
    } else {
      validItems.push(item);
    }
  });

  if (invalidItems.length > 0) {
    session.cart = validItems;
    return {
      valid: validItems.length > 0,
      removedItems: invalidItems,
      message: `â ï¸ ${invalidItems.length} produto(s) saÃ­ram de estoque e foram removidos do carrinho.`
    };
  }

  return {
    valid: true,
    removedItems: [],
    message: null
  };
}

/**
 * Apply discount to cart (for future use)
 */
function applyDiscount(session, discountCode) {
  // Placeholder for discount logic
  const discounts = {
    'PRIMEIRACOMPRA': 0.10, // 10% off
    'FIDELIDADE': 0.05,     // 5% off
    'ROSA2024': 0.15        // 15% off
  };

  const discountPercent = discounts[discountCode.toUpperCase()];
  if (!discountPercent) {
    return {
      success: false,
      message: 'â CÃ³digo de desconto invÃ¡lido',
      discount: 0
    };
  }

  const currentTotal = session.getCartTotal();
  const discountAmount = currentTotal * discountPercent;

  return {
    success: true,
    message: `â Desconto de ${(discountPercent * 100).toFixed(0)}% aplicado! VocÃª economiza R$ ${discountAmount.toFixed(2)}`,
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

  // Get categories already in cart
  const cartCategories = session.cart.map(item => item.category);

  // Recommend from categories not in cart
  const { PRODUCTS } = require('./products');
  const recommendations = PRODUCTS.filter(
    product => !session.cart.find(item => item.id === product.id)
  );

  // Sort by popularity and return top 3
  return recommendations.sort((a, b) => b.popularity - a.popularity).slice(0, 3);
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
