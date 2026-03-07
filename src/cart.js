/**
 * Cart Management for Rosa 2.0
 * Handles cart operations and checkout
 */

const { getProductDetails } = require('./products');

/**
 * Format cart for display in WhatsApp
 */
function formatCartForDisplay(session) {
  if (session.cart.length === 0) {
    return 'ð Seu carrinho estÃ¡ vazio\n\nQual produto vocÃª gostaria de adicionar?';
  }

  let message = 'ð *Seu Carrinho*\n\n';

  session.cart.forEach((item, index) => {
    const itemTotal = (item.price * item.quantity).toFixed(2);
    message += `${index + 1}. ${item.name}\n`;
    message += `   ${item.quantity}x R$ ${item.price.toFixed(2)} = R$ ${itemTotal}\n\n`;
  });

  const total = session.getCartTotal();
  message += `âââââââââââââââââââââââ\n`;
  message += `*Total: R$ ${total.toFixed(2)}*\n\n`;
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
 * Generate Wbuy checkout URL
 * Wbuy format: https://wbuy.com.br/checkout/{storeId}/{sessionId}/products
 */
function generateCheckoutLink(session, storeId = 'gruporochasaude') {
  if (session.cart.length === 0) {
    return null;
  }

  // Create product list for URL
  const productList = session.cart
    .map(item => `${item.id}:${item.quantity}`)
    .join(',');

  const checkoutUrl = `https://wbuy.com.br/${storeId}/checkout?products=${encodeURIComponent(productList)}`;

  return checkoutUrl;
}

/**
 * Format checkout message
 */
function formatCheckoutMessage(session) {
  const stats = getCartStats(session);
  const checkoutUrl = generateCheckoutLink(session);

  if (!checkoutUrl) {
    return 'â Seu carrinho estÃ¡ vazio. Adicione produtos antes de finalizar a compra.';
  }

  let message = 'â *Pronto para finalizar!*\n\n';
  message += `ð¦ ${stats.itemCount} tipo(s) de produto\n`;
  message += `ð ${stats.totalQuantity} unidade(s) no total\n`;
  message += `ð° Valor total: *R$ ${stats.totalValue.toFixed(2)}*\n\n`;

  if (session.customer.name) {
    message += `ð¤ Comprador: ${session.customer.name}\n`;
  }

  message += `\nð *Link para finalizar compra:*\n`;
  message += `${checkoutUrl}\n\n`;
  message += `Clique no link acima para pagar de forma segura no Wbuy!`;

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
  formatCheckoutMessage,
  validateCart,
  applyDiscount,
  getCartRecommendations
};
