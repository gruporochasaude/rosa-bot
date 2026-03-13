/**
 * Tiny ERP API Client for Rosa Bot
 * Integrates with Tiny ERP for order tracking and customer service
 * API Docs: https://tiny.com.br/api-docs
 */

const TINY_API_URL = 'https://api.tiny.com.br/api2';
const TINY_TOKEN = process.env.TINY_API_TOKEN || '';

// Cache for Tiny API responses
const tinyCache = new Map();
const TINY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Generic Tiny API call
 * Tiny uses POST with form data (token + formato=JSON)
 */
async function tinyApiCall(endpoint, params = {}, cacheTTL = TINY_CACHE_TTL) {
  const cacheKey = `${endpoint}:${JSON.stringify(params)}`;

  if (cacheTTL > 0 && tinyCache.has(cacheKey)) {
    const cached = tinyCache.get(cacheKey);
    if (Date.now() - cached.timestamp < cacheTTL) {
      console.log(`[Tiny] Cache hit: ${endpoint}`);
      return cached.data;
    }
    tinyCache.delete(cacheKey);
  }

  try {
    console.log(`[Tiny] API call: ${endpoint}`);

    const formData = new URLSearchParams();
    formData.append('token', TINY_TOKEN);
    formData.append('formato', 'JSON');
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, value);
      }
    });

    const response = await fetch(`${TINY_API_URL}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    });

    if (!response.ok) {
      throw new Error(`Tiny API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.retorno && data.retorno.status === 'Erro') {
      const erros = data.retorno.erros || [];
      const errorMsg = erros.map(e => e.erro || e).join(', ');
      console.error(`[Tiny] API error: ${errorMsg}`);
      return { error: true, message: errorMsg, retorno: data.retorno };
    }

    if (cacheTTL > 0) {
      tinyCache.set(cacheKey, { data, timestamp: Date.now() });
    }

    return data;
  } catch (error) {
    console.error(`[Tiny] Request failed for ${endpoint}:`, error.message);
    throw error;
  }
}

// ==========================================
// ORDERS - Pedidos
// ==========================================

/**
 * Search orders by number, customer name, or date range
 */
async function searchOrders(query) {
  try {
    const response = await tinyApiCall('pedidos.pesquisa.php', {
      pesquisa: query
    });

    if (response.error) return [];

    const pedidos = response.retorno?.pedidos || [];
    return pedidos.map(p => p.pedido || p);
  } catch (error) {
    console.error('[Tiny] searchOrders error:', error.message);
    return [];
  }
}

/**
 * Get full order details by Tiny order ID
 */
async function getOrderById(orderId) {
  try {
    const response = await tinyApiCall('pedido.obter.php', { id: orderId });

    if (response.error) return null;

    const pedido = response.retorno?.pedido || null;
    return pedido;
  } catch (error) {
    console.error('[Tiny] getOrderById error:', error.message);
    return null;
  }
}

/**
 * Get order by order number (numero)
 * First searches, then gets full details
 */
async function getOrderByNumber(orderNumber) {
  try {
    const results = await searchOrders(String(orderNumber));

    if (results.length === 0) return null;

    // Find exact match by number - DO NOT fallback to results[0]
    // The Tiny search is fuzzy and can return unrelated orders
    const normalizedQuery = String(orderNumber).trim();
    const match = results.find(p =>
      String(p.numero).trim() === normalizedQuery ||
      String(p.numero_ecommerce).trim() === normalizedQuery ||
      String(p.id).trim() === normalizedQuery
    );

    if (!match) {
      console.log(`[Tiny] No exact match for order ${orderNumber}. Search returned ${results.length} results but none matched exactly.`);
      // Log what was returned to help debug
      results.slice(0, 3).forEach((r, i) => {
        console.log(`[Tiny] Result ${i}: numero=${r.numero}, numero_ecommerce=${r.numero_ecommerce}, id=${r.id}, situacao=${r.situacao}`);
      });
      return null;
    }

    // Get full details
    const fullOrder = await getOrderById(match.id);
    return fullOrder;
  } catch (error) {
    console.error('[Tiny] getOrderByNumber error:', error.message);
    return null;
  }
}

/**
 * Format order for customer display
 * Returns a structured object with relevant info
 */
function formatOrderForCustomer(order) {
  if (!order) return null;

  // Extract status
  const situacao = order.situacao || 'Desconhecido';

  // Extract tracking
  const codigoRastreamento = order.codigo_rastreamento || '';

  // Extract items
  const itens = order.itens || [];
  const formattedItems = itens.map(item => {
    const i = item.item || item;
    return {
      name: i.descricao || i.produto || 'Produto',
      quantity: parseInt(i.quantidade) || 1,
      price: parseFloat(i.valor_unitario) || 0,
      total: parseFloat(i.valor_total) || 0
    };
  });

  // Extract dates
  const dataPedido = order.data_pedido || order.data_criacao || '';
  const dataPrevista = order.data_prevista || '';

  // Extract totals
  const totalProdutos = parseFloat(order.total_produtos) || 0;
  const totalPedido = parseFloat(order.total_pedido) || 0;
  const valorFrete = parseFloat(order.valor_frete) || 0;

  // Extract shipping info
  const formaEnvio = order.forma_envio || '';
  const formaPagamento = order.forma_pagamento || '';

  // Customer info
  const cliente = order.cliente || {};

  return {
    numero: order.numero || order.id || '',
    numeroecommerce: order.numero_ecommerce || '',
    situacao,
    dataPedido,
    dataPrevista,
    totalProdutos,
    totalPedido,
    valorFrete,
    formaEnvio,
    formaPagamento,
    codigoRastreamento,
    items: formattedItems,
    itemCount: formattedItems.length,
    cliente: {
      nome: cliente.nome || '',
      cpf: cliente.cpf_cnpj || '',
      email: cliente.email || ''
    }
  };
}

/**
 * Get tracking info from order
 */
async function getOrderTracking(orderNumber) {
  const order = await getOrderByNumber(orderNumber);
  if (!order) return null;

  const formatted = formatOrderForCustomer(order);
  return {
    numero: formatted.numero,
    situacao: formatted.situacao,
    codigoRastreamento: formatted.codigoRastreamento,
    formaEnvio: formatted.formaEnvio,
    dataPrevista: formatted.dataPrevista
  };
}

// ==========================================
// NOTA FISCAL
// ==========================================

/**
 * Get invoice (nota fiscal) for an order
 */
async function getInvoiceByOrder(orderId) {
  try {
    const response = await tinyApiCall('notas.fiscais.pesquisa.php', {
      idPedido: orderId
    });

    if (response.error) return null;

    const notas = response.retorno?.notas_fiscais || [];
    return notas.length > 0 ? (notas[0].nota_fiscal || notas[0]) : null;
  } catch (error) {
    console.error('[Tiny] getInvoiceByOrder error:', error.message);
    return null;
  }
}

// ==========================================
// CUSTOMER SERVICE HELPERS
// ==========================================

/**
 * Check business hours
 * Mon-Fri 09:00-16:00 BRT (UTC-3)
 */
function isBusinessHours() {
  const now = new Date();
  // Convert to BRT (UTC-3)
  const brt = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const day = brt.getDay(); // 0=Sun, 6=Sat
  const hour = brt.getHours();
  const minutes = brt.getMinutes();
  const timeInMinutes = hour * 60 + minutes;

  // Mon-Fri (1-5), 09:00-16:00
  const isWeekday = day >= 1 && day <= 5;
  const isInHours = timeInMinutes >= 540 && timeInMinutes < 960; // 9*60=540, 16*60=960

  return isWeekday && isInHours;
}

/**
 * Get current business hours status message
 */
function getBusinessHoursMessage() {
  if (isBusinessHours()) {
    return 'Estamos em horario de atendimento! Um atendente pode ajudar agora.';
  }

  const now = new Date();
  const brt = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const day = brt.getDay();
  const hour = brt.getHours();

  if (day === 0) {
    return 'Nosso atendimento humano funciona de segunda a sexta, das 09:00 as 16:00. Retornamos na segunda-feira!';
  } else if (day === 6) {
    return 'Nosso atendimento humano funciona de segunda a sexta, das 09:00 as 16:00. Retornamos na segunda-feira!';
  } else if (hour < 9) {
    return 'Nosso atendimento humano funciona das 09:00 as 16:00. Abrimos em breve!';
  } else {
    return 'Nosso atendimento humano funciona das 09:00 as 16:00. Retornamos amanha!';
  }
}

/**
 * Get store info with Google Maps link
 */
function getStoreInfo() {
  return {
    name: 'Rocha Saude Emporio',
    endereco: 'Av. Fagundes Filho, 141 - loja 7 - Sao Judas, Sao Paulo - SP, 04304-010',
    telefone: '(11) 98697-5204',
    email: 'contato@gruporochasaude.com',
    horario: 'Segunda a Sexta: 09:00 - 19:00, Sabado: 09:00 - 15:00',
    googleMapsUrl: 'https://maps.app.goo.gl/dEBhFB2U2sdsc8jdA',
    website: 'https://www.gruporochasaude.com'
  };
}

/**
 * Determine the type of customer issue and suggest protocol
 */
function classifyIssue(description) {
  const desc = (description || '').toLowerCase();

  if (desc.includes('rastreio') || desc.includes('rastrear') || desc.includes('entrega') ||
      desc.includes('correio') || desc.includes('frete') || desc.includes('transportadora') ||
      desc.includes('onde esta') || desc.includes('chegou') || desc.includes('prazo')) {
    return {
      type: 'tracking',
      priority: 'medium',
      action: 'check_tracking',
      message: 'Vou verificar o rastreamento do seu pedido.'
    };
  }

  if (desc.includes('errado') || desc.includes('diferente') || desc.includes('danificado') ||
      desc.includes('quebrado') || desc.includes('defeito') || desc.includes('avariado') ||
      desc.includes('produto errado') || desc.includes('veio errado')) {
    return {
      type: 'wrong_or_damaged',
      priority: 'high',
      action: 'transfer_to_human',
      message: 'Entendo sua frustacao. Vou encaminhar para nossa equipe resolver isso o mais rapido possivel.'
    };
  }

  if (desc.includes('troca') || desc.includes('trocar') || desc.includes('devolver') ||
      desc.includes('devolucao') || desc.includes('reembolso') || desc.includes('estorno') ||
      desc.includes('arrependimento') || desc.includes('cancelar')) {
    return {
      type: 'return_exchange',
      priority: 'high',
      action: 'transfer_to_human',
      message: 'Vou encaminhar seu pedido de troca/devolucao para nossa equipe.'
    };
  }

  if (desc.includes('nota fiscal') || desc.includes('nf') || desc.includes('nfe') ||
      desc.includes('cupom fiscal')) {
    return {
      type: 'invoice',
      priority: 'low',
      action: 'check_invoice',
      message: 'Vou buscar a nota fiscal do seu pedido.'
    };
  }

  if (desc.includes('pagar') || desc.includes('pagamento') || desc.includes('boleto') ||
      desc.includes('pix') || desc.includes('cartao') || desc.includes('parcela')) {
    return {
      type: 'payment',
      priority: 'medium',
      action: 'transfer_to_human',
      message: 'Vou encaminhar sua questao sobre pagamento para a equipe financeira.'
    };
  }

  return {
    type: 'general',
    priority: 'medium',
    action: 'gather_info',
    message: 'Vou verificar seu pedido para ajudar.'
  };
}

/**
 * Clear Tiny cache
 */
function clearTinyCache() {
  tinyCache.clear();
  console.log('[Tiny] Cache cleared');
}

module.exports = {
  // Orders
  searchOrders,
  getOrderById,
  getOrderByNumber,
  formatOrderForCustomer,
  getOrderTracking,

  // Invoice
  getInvoiceByOrder,

  // Customer Service
  isBusinessHours,
  getBusinessHoursMessage,
  getStoreInfo,
  classifyIssue,

  // Cache
  clearTinyCache
};
