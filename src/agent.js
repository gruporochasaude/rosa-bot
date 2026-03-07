/**
 * Rosa AI Agent using DeepSeek API
 * Handles conversation, function calling, and product recommendations
 * Updated for Wbuy API integration (async operations)
 */

const { OpenAI } = require('openai');
const { TOOLS } = require('./tools');
const { searchProducts, getProductDetails, formatProduct, checkStock, getCategories, getProductPhotoUrl, initializeProducts, getProductCache } = require('./products');
const { validateCoupon, getOrder, getOrderStatus: getWbuyOrderStatus } = require('./wbuy-api');
const { getSession } = require('./sessions');
const { sendProductImage, formatMediaResponse } = require('./media');
const { formatCartForDisplay, formatCheckoutMessage } = require('./cart');
const { captureLead } = require('./leads');

// Initialize DeepSeek client (OpenAI-compatible)
const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || 'sk-6c911742916c4f54a449fa7da1eb8c88',
  baseURL: 'https://api.deepseek.com',
  defaultHeaders: {
    'user-agent': 'Rosa-WhatsApp-Bot/2.0'
  }
});

const MODEL = 'deepseek-chat';
const MAX_TOKENS = 800;

/**
 * Rosa's system prompt in Portuguese
 */
const ROSA_SYSTEM_PROMPT = `VocÃª Ã© Rosa, uma assistente de vendas amigÃ¡vel e expert em produtos naturais para a Grupo Rocha SaÃºde.

**Sua personalidade:**
- Calorosa, entusiasmada e genuinamente interessada em ajudar
- Experiente em saÃºde natural, chÃ¡s, suplementos e produtos organicos
- Recomenda produtos com base nas necessidades especÃ­ficas do cliente
- Faz perguntas para entender melhor o que o cliente procura
- Ã honesta sobre benefÃ­cios e nÃ£o faz promessas exageradas
- Usa emojis com moderaÃ§Ã£o e naturalidade
- Sempre se apresenta como Rosa, da Grupo Rocha SaÃºde

**Sobre a loja:**
- Site: www.gruporochasaude.com
- 7 anos de mercado com marca prÃ³pria
- PrÃ³pria marca de chÃ¡s naturais (Detox, Relaxante, Emagrecedor, Digestivo, Imunidade)
- Suplementos de qualidade (Whey, ColÃ¡geno, Vitaminas, Ãmega-3)
- EmpÃ³rio com produtos premium (castanhas, farinhas, mel, Ã³leo de coco)
- Todos os produtos com fotos e preÃ§os reais do catÃ¡logo

**Capacidades atualizadas:**
1. Buscar produtos reais do catÃ¡logo com preÃ§os atualizados
2. Verificar estoque em tempo real
3. Validar cupons de desconto
4. Consultar status de pedidos
5. Enviar fotos reais dos produtos
6. Montar carrinho e gerar link de checkout
7. Listar categorias disponÃ­veis
8. Capturar dados para follow-up

**Fluxo de vendas:**
1. SaudaÃ§Ã£o calorosa
2. Pergunta sobre necessidades/preferÃªncias
3. Busca e recomendaÃ§Ã£o de produtos (use search_products)
4. Mostra detalhes e fotos (use get_product_details e send_product_image)
5. Verifica estoque se necessÃ¡rio (use check_stock)
6. Adiciona ao carrinho
7. Se cliente tem cupom, valida (use validate_coupon)
8. Gera checkout link
9. Captura dados do cliente naturalmente

**Sobre pedidos:**
- Se o cliente perguntar sobre um pedido, use check_order_status
- Informe o status de forma clara e amigÃ¡vel

**Importante:**
- Sempre respeite a privacidade do cliente
- NÃ£o assuma informaÃ§Ãµes que nÃ£o foram dadas
- Seja honesto sobre disponibilidade de produtos
- OfereÃ§a alternativas quando produto estiver fora de estoque
- Se o cliente nÃ£o quiser comprar, ofereÃ§a informaÃ§Ãµes Ãºteis`;

/**
 * Initialize the agent (call on startup)
 */
async function initAgent() {
  console.log('[Agent] Initializing Rosa agent...');
  await initializeProducts();
  console.log('[Agent] Agent ready!');
}

/**
 * Process message with DeepSeek and handle function calling
 */
async function processMessage(userId, userMessage) {
  try {
    const session = getSession(userId);

    // Add user message to history
    session.addMessage('user', userMessage);

    // Get conversation context
    const conversationHistory = session.getConversationContext();

    // Build system message with context
    let systemMessage = ROSA_SYSTEM_PROMPT;

    // Add session context
    if (session.customer.name) {
      systemMessage += `\n\n**Contexto do cliente:**\nNome: ${session.customer.name}`;
      if (session.customer.email) systemMessage += `\nEmail: ${session.customer.email}`;
      if (session.customer.phone) systemMessage += `\nTelefone: ${session.customer.phone}`;
    }

    if (session.cart.length > 0) {
      systemMessage += `\n\n**Carrinho do cliente (${session.cart.length} item(ns)):**`;
      session.cart.forEach(item => {
        systemMessage += `\n- ${item.name} (${item.quantity}x R$ ${item.price.toFixed(2)})`;
      });
      systemMessage += `\nTotal do carrinho: R$ ${session.getCartTotal().toFixed(2)}`;
    }

    // Call DeepSeek with tools
    let response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemMessage },
        ...conversationHistory
      ],
      tools: TOOLS,
      tool_choice: 'auto',
      max_tokens: MAX_TOKENS,
      temperature: 0.7
    });

    let finalResponse = '';
    let toolCalls = [];
    let functionResults = [];

    // Handle response and function calling loop
    while (response.choices[0].finish_reason === 'tool_calls') {
      const toolUseBlock = response.choices[0].message.tool_calls;

      // Process each tool call
      for (const toolCall of toolUseBlock) {
        console.log(`[Agent] Function call: ${toolCall.function.name}`);

        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        let functionResult = '';
        let sendMedia = false;

        // Execute function based on name (all async now)
        switch (functionName) {
          case 'search_products': {
            const results = await searchProducts(functionArgs.query, functionArgs.category);
            if (results.length === 0) {
              functionResult = 'Nenhum produto encontrado. Tente outro termo de busca.';
            } else {
              functionResult = results
                .slice(0, 5)
                .map(p => {
                  let line = `- [ID: ${p.id}] ${p.name}`;
                  if (p.category) line += ` (${p.category})`;
                  line += `: R$ ${p.price.toFixed(2)}`;
                  if (p.stock !== null) {
                    line += p.stock > 0 ? ` [Em estoque: ${p.stock}]` : ' [FORA DE ESTOQUE]';
                  }
                  return line;
                })
                .join('\n');
              functionResult += `\n\nTotal encontrado: ${results.length} produto(s)`;
            }
            break;
          }

          case 'get_product_details': {
            const product = await getProductDetails(functionArgs.product_id);
            if (!product) {
              functionResult = 'Produto nÃ£o encontrado.';
            } else {
              functionResult = formatProduct(product);
            }
            break;
          }

          case 'check_stock': {
            const stockInfo = await checkStock(functionArgs.product_id);
            if (stockInfo.inStock) {
              functionResult = `â Produto em estoque! ${stockInfo.quantity} unidade(s) disponÃ­vel(is).`;
            } else {
              functionResult = 'â Produto fora de estoque no momento. Sugira alternativas ao cliente.';
            }
            break;
          }

          case 'send_product_image': {
            sendMedia = true;
            const photoUrl = await getProductPhotoUrl(functionArgs.product_id);
            if (photoUrl) {
              functionResult = `[Imagem do produto serÃ¡ enviada via WhatsApp]`;
              toolCalls.push({
                type: 'send_image',
                productId: functionArgs.product_id,
                phoneNumber: userId,
                imageUrl: photoUrl
              });
            } else {
              functionResult = '[Produto sem imagem disponÃ­vel no momento]';
            }
            break;
          }

          case 'add_to_cart': {
            const product = await getProductDetails(functionArgs.product_id);
            if (!product) {
              functionResult = 'Produto nÃ£o encontrado.';
            } else {
              session.addToCart({
                ...product,
                quantity: functionArgs.quantity || 1
              });
              functionResult = `â ${product.name} adicionado ao carrinho (${functionArgs.quantity || 1}x R$ ${product.price.toFixed(2)})`;
            }
            break;
          }

          case 'view_cart': {
            functionResult = formatCartForDisplay(session);
            break;
          }

          case 'remove_from_cart': {
            const hasItems = session.removeFromCart(functionArgs.product_id);
            if (hasItems) {
              functionResult = 'Produto removido do carrinho.';
            } else {
              functionResult = 'Produto removido. Seu carrinho estÃ¡ vazio.';
            }
            break;
          }

          case 'validate_coupon': {
            try {
              const coupon = await validateCoupon(functionArgs.coupon_code);
              if (coupon) {
                const discount = coupon.discount || coupon.desconto || coupon.value || coupon.valor || '';
                const type = coupon.type || coupon.tipo || 'percentual';
                functionResult = `â Cupom "${functionArgs.coupon_code}" vÃ¡lido! Desconto: ${discount}${type === 'percentual' || type === 'percent' ? '%' : ' reais'}`;
              } else {
                functionResult = `â Cupom "${functionArgs.coupon_code}" invÃ¡lido ou expirado.`;
              }
            } catch (error) {
              functionResult = 'NÃ£o foi possÃ­vel validar o cupom no momento. Tente novamente.';
            }
            break;
          }

          case 'check_order_status': {
            try {
              const order = await getWbuyOrderStatus(functionArgs.order_id);
              if (order) {
                const status = order.status || order.situacao || 'Desconhecido';
                const date = order.date || order.data || '';
                functionResult = `ð¦ Pedido #${functionArgs.order_id}\nStatus: ${status}`;
                if (date) functionResult += `\nData: ${date}`;
                if (order.tracking || order.rastreio) {
                  functionResult += `\nRastreio: ${order.tracking || order.rastreio}`;
                }
              } else {
                functionResult = `Pedido #${functionArgs.order_id} nÃ£o encontrado. Verifique o nÃºmero do pedido.`;
              }
            } catch (error) {
              functionResult = 'NÃ£o foi possÃ­vel consultar o pedido no momento. Tente novamente.';
            }
            break;
          }

          case 'generate_checkout_link': {
            functionResult = formatCheckoutMessage(session);
            break;
          }

          case 'capture_lead': {
            const result = captureLead(
              userId,
              functionArgs.name,
              functionArgs.email,
              functionArgs.phone
            );
            session.updateCustomer({
              name: functionArgs.name,
              email: functionArgs.email,
              phone: functionArgs.phone
            });
            functionResult = result.message;
            break;
          }

          case 'get_recommendations': {
            const profile = functionArgs.customer_profile.toLowerCase();
            const results = await searchProducts(profile);

            if (results.length === 0) {
              // Fallback to top products
              const { getTopProducts } = require('./products');
              const top = await getTopProducts(3);
              functionResult = 'RecomendaÃ§Ãµes populares:\n' + top
                .map(p => `- ${p.name} - R$ ${p.price.toFixed(2)}`)
                .join('\n');
            } else {
              functionResult = results
                .slice(0, 3)
                .map(p => `- [ID: ${p.id}] ${p.name} - R$ ${p.price.toFixed(2)}`)
                .join('\n');
            }
            break;
          }

          case 'get_categories': {
            try {
              const cats = await getCategories();
              if (cats.length > 0) {
                functionResult = 'Categorias disponÃ­veis:\n' + cats
                  .map(c => `- ${c.name || c}`)
                  .join('\n');
              } else {
                functionResult = 'Categorias: ChÃ¡s, Suplementos, EmpÃ³rio (produtos naturais)';
              }
            } catch (error) {
              functionResult = 'Categorias: ChÃ¡s, Suplementos, EmpÃ³rio (produtos naturais)';
            }
            break;
          }

          default:
            functionResult = `FunÃ§Ã£o ${functionName} nÃ£o implementada.`;
        }

        functionResults.push({
          tool_call_id: toolCall.id,
          function: functionName,
          result: functionResult
        });
      }

      // Add assistant response and tool results to conversation
      const assistantMessage = response.choices[0].message;
      conversationHistory.push({
        role: 'assistant',
        content: assistantMessage.content || '',
        tool_calls: toolUseBlock
      });

      // Add tool results
      for (const result of functionResults) {
        conversationHistory.push({
          role: 'tool',
          tool_call_id: result.tool_call_id,
          content: result.result
        });
      }

      // Call DeepSeek again with results
      response = await client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: systemMessage },
          ...conversationHistory
        ],
        tools: TOOLS,
        tool_choice: 'auto',
        max_tokens: MAX_TOKENS,
        temperature: 0.7
      });

      functionResults = [];
    }

    // Extract final text response
    finalResponse = response.choices[0].message.content || 'Desculpe, houve um problema. Pode repetir?';

    // Add assistant response to session history
    session.addMessage('assistant', finalResponse);

    console.log(`[Agent] Response generated for user ${userId}`);

    return {
      message: finalResponse,
      toolCalls: toolCalls,
      success: true
    };

  } catch (error) {
    console.error('[Agent] Erro ao processar mensagem:', error.message);

    return {
      message: 'Desculpe, estou com dificuldades no momento. Pode tentar novamente?',
      success: false,
      error: error.message
    };
  }
}

/**
 * Get greeting message for new conversation
 */
function getGreetingMessage() {
  const greetings = [
    'OlÃ¡! Bem-vindo(a) Ã  Grupo Rocha SaÃºde! Sou a Rosa, sua assistente de vendas. Como posso ajudar vocÃª com produtos naturais de qualidade? ð',
    'Oi! Bem-vindo(a)! Sou a Rosa, da Grupo Rocha SaÃºde. Posso ajudar vocÃª a encontrar o melhor produto para suas necessidades?',
    'Bem-vindo(a)! Sou a Rosa! Procurando por produtos naturais para saÃºde ou bem-estar? Estou aqui para ajudar! ð¿'
  ];

  return greetings[Math.floor(Math.random() * greetings.length)];
}

/**
 * Handle media sending after response
 */
async function executeMediaActions(phoneNumber, toolCalls) {
  const results = [];

  for (const call of toolCalls) {
    if (call.type === 'send_image') {
      const result = await sendProductImage(phoneNumber, call.productId, call.imageUrl);
      results.push(result);
    }
  }

  return results;
}

module.exports = {
  initAgent,
  processMessage,
  getGreetingMessage,
  executeMediaActions
};
