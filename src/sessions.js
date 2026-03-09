/**
 * Session Management for Rosa 2.0
 * Stores conversation context, cart, and customer data
 */

const sessions = new Map();

/**
 * Session object structure
 */
class Session {
  constructor(userId) {
    this.userId = userId;
    this.conversationHistory = [];
    this.cart = [];
    this.customer = {
      name: null,
      email: null,
      phone: null,
      capturedAt: null
    };
    this.context = {
      lastProductShown: null,
      recommendationContext: null,
      objectionHandled: null,
      conversationPhase: 'greeting' // greeting, exploration, recommendation, cart, checkout, closed
    };
    this.createdAt = Date.now();
    this.lastInteraction = Date.now();
    this.totalSpent = 0;
    // Human support pause
    this.humanPaused = false;
    this.humanPausedAt = null;
    this.humanPauseReason = '';
  }

  /**
   * Add message to conversation history
   */
  addMessage(role, content) {
    this.conversationHistory.push({
      role,
      content,
      timestamp: Date.now()
    });
    this.lastInteraction = Date.now();
  }

  /**
   * Get conversation history for AI context
   */
  getConversationContext() {
    return this.conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }

  /**
   * Update customer data
   */
  updateCustomer(data) {
    this.customer = {
      ...this.customer,
      ...data,
      capturedAt: this.customer.capturedAt || Date.now()
    };
  }

  /**
   * Get customer summary
   */
  getCustomerSummary() {
    return `Nome: ${this.customer.name || 'NÃ£o informado'} | Email: ${this.customer.email || 'NÃ£o informado'} | Telefone: ${this.customer.phone || 'NÃ£o informado'}`;
  }

  /**
   * Add to cart
   */
  addToCart(product) {
    const existing = this.cart.find(item => item.id === product.id);
    if (existing) {
      existing.quantity += product.quantity || 1;
    } else {
      this.cart.push({
        ...product,
        quantity: product.quantity || 1,
        addedAt: Date.now()
      });
    }
    this.context.conversationPhase = 'cart';
  }

  /**
   * Remove from cart
   */
  removeFromCart(productId) {
    this.cart = this.cart.filter(item => item.id !== productId);
    return this.cart.length > 0;
  }

  /**
   * Clear cart
   */
  clearCart() {
    this.cart = [];
  }

  /**
   * Get cart total
   */
  getCartTotal() {
    return this.cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  }

  /**
   * Get cart summary
   */
  getCartSummary() {
    if (this.cart.length === 0) return 'Carrinho vazio';

    const items = this.cart.map(item => `${item.name} (${item.quantity}x R$ ${item.price.toFixed(2)})`).join('\n');
    const total = this.getCartTotal();
    return `${items}\n\nð° Total: R$ ${total.toFixed(2)}`;
  }


  /**
   * Pause bot for human support (30 min timeout)
   */
  pauseForHuman(reason) {
    this.humanPaused = true;
    this.humanPausedAt = Date.now();
    this.humanPauseReason = reason || 'Cliente solicitou atendimento humano';
    console.log('[Sessions] Bot paused for human support: ' + this.userId + ' - ' + reason);
  }

  /**
   * Resume bot after human support
   */
  resumeBot() {
    this.humanPaused = false;
    this.humanPausedAt = null;
    this.humanPauseReason = '';
    console.log('[Sessions] Bot resumed for: ' + this.userId);
  }

  /**
   * Check if bot is paused for human support (auto-resume after 30 min)
   */
  isHumanPaused() {
    if (!this.humanPaused) return false;
    // Auto-resume after 30 minutes
    const PAUSE_TIMEOUT = 30 * 60 * 1000;
    if (Date.now() - this.humanPausedAt > PAUSE_TIMEOUT) {
      this.resumeBot();
      return false;
    }
    return true;
  }

  /**
   * Get human pause info
   */
  getHumanPauseInfo() {
    if (!this.humanPaused) return null;
    const elapsed = Math.floor((Date.now() - this.humanPausedAt) / 1000 / 60);
    return {
      reason: this.humanPauseReason,
      pausedMinutesAgo: elapsed,
      autoResumeIn: 30 - elapsed
    };
  }

  /**
   * Check if session is stale (30 minutes idle)
   */
  isStale() {
    return Date.now() - this.lastInteraction > 30 * 60 * 1000;
  }

  /**
   * Get session duration in seconds
   */
  getDuration() {
    return Math.floor((Date.now() - this.createdAt) / 1000);
  }
}

/**
 * Get or create session for user
 */
function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, new Session(userId));
  }
  return sessions.get(userId);
}

/**
 * Delete session
 */
function deleteSession(userId) {
  return sessions.delete(userId);
}

/**
 * Get all sessions
 */
function getAllSessions() {
  return Array.from(sessions.values());
}

/**
 * Clean up stale sessions
 */
function cleanupStaleSessions() {
  const staleUsers = [];
  for (const [userId, session] of sessions) {
    if (session.isStale()) {
      staleUsers.push(userId);
    }
  }
  staleUsers.forEach(userId => {
    console.log(`[Sessions] Cleaning up stale session: ${userId}`);
    deleteSession(userId);
  });
  return staleUsers.length;
}

/**
 * Get session statistics
 */
function getSessionStats() {
  const allSessions = getAllSessions();
  return {
    totalActiveSessions: allSessions.length,
    totalMessagesProcessed: allSessions.reduce((sum, s) => sum + s.conversationHistory.length, 0),
    totalCustomersEngaged: allSessions.filter(s => s.customer.name).length,
    totalCartValue: allSessions.reduce((sum, s) => sum + s.getCartTotal(), 0),
    averageSessionDuration: allSessions.length > 0
      ? Math.floor(allSessions.reduce((sum, s) => sum + s.getDuration(), 0) / allSessions.length)
      : 0
  };
}

/**
 * Export session data for analysis
 */
function exportSessionData(userId) {
  const session = sessions.get(userId);
  if (!session) return null;

  return {
    userId,
    customer: session.customer,
    cartItems: session.cart,
    cartTotal: session.getCartTotal(),
    conversationLength: session.conversationHistory.length,
    duration: session.getDuration(),
    createdAt: new Date(session.createdAt).toISOString(),
    phase: session.context.conversationPhase
  };
}

// Cleanup stale sessions every 5 minutes
setInterval(() => {
  cleanupStaleSessions();
}, 5 * 60 * 1000);

module.exports = {
  Session,
  getSession,
  deleteSession,
  getAllSessions,
  cleanupStaleSessions,
  getSessionStats,
  exportSessionData
};
