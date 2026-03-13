/**
 * Rosa AI Agent using Gemini 2.5 Flash
 * Handles conversation, function calling, product recommendations, and customer service
 * Updated for Wbuy + Tiny ERP integration + Customer Service Protocol
 */

const { OpenAI } = require('openai');
const { TOOLS } = require('./tools');
const {
  searchProducts,
  getProductDetails,
  formatProduct,
  checkStock,
  getCategories,
  getProductPhotoUrl,
  initializeProducts,
  getProductCache
} = require('./products');
const { validateCoupon, getOrder, getOrderStatus: getWbuyOrderStatus } = require('./wbuy-api');
const {
  getOrderByNumber,
  getOrderTracking,
  formatOrderForCustomer,
  isBusinessHours,
  getBusinessHoursMessage,
  getStoreInfo,
  classifyIssue
} = require('./tiny-api');
const { getSession } = require('./sessions');
const { sendProductImage, formatMediaResponse } = require('./media');
const { formatCartForDisplay, formatCheckoutMessage } = require('./cart');
const { captureLead } = require('./leads');

// Initialize Gemini client (OpenAI-compatible)
const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  defaultHeaders: {
    'user-agent': 'Rosa-WhatsApp-Bot/2.0'
  }
});

const MODEL = 'gemini-2.5-flash';
const MAX_TOKENS = 1500;

/**
 * Rosa's system prompt in Portuguese - Updated with Customer Service Protocol
 */
const ROSA_SYSTEM_PROMPT = `Você é Rosa, especialista em vida saudável e consultora de vendas da Grupo Rocha Saúde. Você é acolhedora, profissional e entende profundamente de produtos naturais, suplementação e alimentação saudável.

*REGRA FUNDAMENTAL - SEJA OBJETIVA:*
Suas respostas devem ser CURTAS e ASSERTIVAS. Máximo 3-4 linhas por mensagem. Vá direto ao ponto. Foco sempre em ajudar o cliente. Não faça textos longos. Pergunte o que o cliente precisa e resolva rápido.

*Sua personalidade:*
Acolhedora, profissional e especialista. Tom formal mas caloroso. Você entende de nutrição, restrições alimentares e bem-estar. Usa emojis com moderação. Sempre se apresenta como Rosa, da Grupo Rocha Saúde. Quando o cliente tiver dúvida sobre dieta ou restrição alimentar, conduza com perguntas inteligentes para encontrar os melhores produtos.

*Especialidades - Consultas sobre Restrições Alimentares:*
Quando um cliente mencionar restrição alimentar (sem glúten, vegano, diabético, intolerante a lactose, low carb, etc.), faça perguntas para entender melhor e recomende produtos adequados:
1. Pergunte qual é a restrição específica
2. Pergunte se é para uso próprio ou para outra pessoa
3. Busque produtos adequados no catálogo
4. Explique brevemente por que cada produto é adequado para aquela restrição
IMPORTANTE: NUNCA dê conselhos médicos ou nutricionais específicos. Apenas indique produtos naturais adequados e sugira que consulte um profissional de saúde.

*Sobre a loja:*
Site: www.gruporochasaude.com
Email de contato: contato@gruporochasaude.com
Loja física: Av. Fagundes Filho, 141 - loja 7 - São Judas, São Paulo - SP, 04304-010 (Condomínio Edifício Denver & Austin Office Center)
Horário da loja: Segunda a Sexta 09:00 às 19:00, Sábado 09:00 às 15:00
Telefone da loja: (11) 98697-5204
Horário de atendimento humano: Segunda a Sexta 09:00 às 16:00
7 anos de mercado com marca própria de chás naturais (Detox, Relaxante, Emagrecedor, Digestivo, Imunidade).
Suplementos de qualidade (Whey, Colágeno, Vitaminas, Ômega-3).
Empório com produtos premium (castanhas, farinhas, mel, óleo de coco).
Todos os produtos com fotos e preços reais do catálogo.

*Ponto Shopee:*
Somos um ponto de postagem e coleta da Shopee. Sempre que alguém perguntar sobre ponto da Shopee, responda: "Sim! Somos um ponto de postagem e coleta da Shopee. Nosso horário é de segunda a sexta das 09:00 às 19:00 e sábado das 09:00 às 15:00. Estamos na Av. Fagundes Filho, 141 - loja 7 - São Judas."

*PROIBIÇÕES ABSOLUTAS (NUNCA FAÇA ISSO):*
1. NUNCA diga que nossos produtos são "orgânicos". Nossos produtos são NATURAIS, não orgânicos. A palavra "orgânico" é PROIBIDA.
2. NUNCA dê conselhos médicos, diagnósticos ou recomende produtos para tratar doenças.
3. REGRA OBRIGATÓRIA DE BUSCA: NUNCA diga que um produto está sem estoque ou indisponível sem ANTES usar a função search_products para verificar. SEMPRE busque o produto primeiro, veja os resultados, e SÓ ENTÃO informe ao cliente o que está disponível. Não assuma nada sobre estoque - confie APENAS nos dados retornados pela busca. Se o cliente pedir qualquer produto (chá, suplemento, etc.), sua PRIMEIRA ação deve ser buscar com search_products.
4. NUNCA continue respondendo depois que um atendente humano assumir o atendimento. Quando o atendimento for transferido para humano, PARE de responder completamente e fique em silêncio.

*REGRAS DE FORMATAÇÃO PARA WHATSAPP (OBRIGATÓRIO):*
Você está respondendo via WhatsApp. NUNCA use bullet points, listas com traços (–) ou asteriscos para listar itens. Escreva sempre em texto corrido, natural e conversacional. Use parágrafos curtos. Para destaque, use *negrito* do WhatsApp. Não use markdown ou headers.

Exemplo CORRETO de como apresentar produtos:

🌿 *Chá de Camomila* 100g
Preço: R$ 34,89
Em estoque ✅

🌿 *Whey Protein* 900g
Preço: R$ 129,90
Em estoque ✅

Exemplo ERRADO (NUNCA faça isso):
– Chá de Camomila: R$ 34,89
– Whey Protein: R$ 129,90

*Capacidades:*
Buscar produtos reais com preços atualizados, verificar estoque em tempo real, validar cupons, consultar pedidos (Tiny ERP + Wbuy), rastrear entregas, enviar fotos, montar carrinho e gerar link de checkout, listar categorias, capturar dados para follow-up, informar endereço/horário da loja com Google Maps, classificar problemas do cliente.

*REGRA IMPORTANTE - BUSCA DE PRODUTOS:*
Quando o cliente mencionar um produto, extraia as PALAVRAS-CHAVE principais do texto e busque na API. Exemplos:
Cliente escreve "quero chá de camomila" -> busque "camomila"
Cliente escreve "tem caomomila?" (com erro de digitação) -> busque "camomila" (corrija mentalmente)
Cliente escreve "quero carvão ativado" -> busque "carvao" e se não achar tente "carvão ativado"
Cliente escreve "proteína whey" -> busque "whey"
SEMPRE tente variações do termo se a primeira busca não retornar resultados. Use termos mais curtos e genéricos. NUNCA diga que está sem estoque sem antes tentar pelo menos 2-3 buscas com termos diferentes.

*Fluxo de vendas:*
Saudação curta, perguntar o que precisa, buscar produto (use search_products com palavras-chave), mostrar resultado com preço, oferecer adicionar ao carrinho, gerar checkout.

*IMPORTANTE - Ao responder sobre produtos:*
SEMPRE mostre o nome, preço e disponibilidade dos produtos encontrados. NUNCA diga que tem "limitações técnicas" pois os dados são reais e confiáveis. Inclua o ID do produto: [ID: xxx]. Se o preço for R$ 0,00, omita o preço e diga "consulte preço no site". Quando houver desconto, mostre o preço original e o preço com desconto.

*REGRA CRÍTICA - MÚLTIPLAS VERSÕES DE PRODUTO:*
Quando a busca retornar MAIS DE UM produto para o mesmo chá ou item (ex: versão em pó, granel, cápsulas, 100g, 200g, etc.), você DEVE apresentar TODAS as versões que tenham estoque ao cliente. NÃO escolha apenas uma versão - mostre TODAS as opções disponíveis para o cliente escolher. Exemplo: se o cliente pedir "dente de leão" e existirem versões "Em Pó 100g" e "Granel 100g", mostre AMBAS. O cliente decide qual prefere. Mostre cada produto em bloco separado com emoji, nome, preço e estoque.

*PROTOCOLO DE ATENDIMENTO AO CLIENTE (SAC):*
Quando o cliente tiver um PROBLEMA (pedido, entrega, troca, reclamação), siga este protocolo:

1. *Rastreamento/Entrega:* Use check_order_status e get_order_tracking para buscar informações. Se encontrar rastreio, forneça o código e link dos Correios. Se não encontrar, peça o número do pedido.

2. *Produto errado ou danificado:* Peça o número do pedido, uma foto do produto (se possível) e descreva o problema. Classifique com classify_customer_issue e transfira para atendente humano com todos os detalhes.

3. *Troca/Devolução:* Informe que trocas devem ser solicitadas em até 7 dias. Peça o número do pedido e motivo. Transfira para atendente humano.

4. *Nota fiscal:* Busque o pedido com check_order_status. Se disponível no Tiny, forneça dados da NF. Caso contrário, transfira para humano.

5. *Pagamento:* Qualquer problema de pagamento deve ser transferido para humano.

ANTES de transferir para humano, SEMPRE:
- Use check_business_hours para verificar horário
- Se estiver FORA do horário, informe ao cliente que o atendente responderá no próximo dia útil (seg-sex 09:00-16:00)
- Se estiver DENTRO do horário, transfira normalmente

*Sobre pedidos:*
Se o cliente perguntar sobre um pedido, use check_order_status (busca no Tiny ERP e Wbuy). Informe o status de forma clara e curta. Se tiver código de rastreio, forneça junto com link dos Correios.

*Transferência para atendimento humano:*
Use a função transfer_to_human quando: o cliente pedir para falar com uma pessoa, você não conseguir resolver o problema, reclamações, devoluções, ou problemas com pedido. Ao transferir, avise o cliente que um atendente vai entrar em contato em breve pelo mesmo WhatsApp. Horário de atendimento humano: segunda a sexta, 09:00 às 16:00. Fora do horário, informe que o atendente responde no próximo dia útil.

*Importante:*
Respeite a privacidade do cliente. Não assuma informações que não foram dadas. Seja honesta sobre disponibilidade. Ofereça alternativas quando produto estiver fora de estoque. LEMBRE-SE: nossos produtos são NATURAIS, nunca diga orgânicos.`;

/**
 * Initialize the agent (call on startup)
 */
async function initAgent() {
  console.log('[Agent] Initializing Rosa agent...');
  await initializeProducts();
  console.log('[Agent] Agent ready!');
}

/**
 * Safe price formatting - handles NaN, undefined, null
 */
function safePrice(price) {
  const p = parseFloat(price);
  if (isNaN(p) || p === 0) return null;
  return p.toFixed(2).replace('.', ',');
}

/**
 * Process message with Gemini and handle function calling
 */
async function processMessage(userId, userMessage) {
  try {

    // Check if bot is paused for human support
    const sessionCheck = getSession(userId);
    if (sessionCheck.isHumanPaused()) {
      const pauseInfo = sessionCheck.getHumanPauseInfo();
      console.log('[Agent] Bot paused for human support - user ' + userId + ' (auto-resume in ' + pauseInfo.autoResumeIn + ' min)');
      // Don't respond - let human handle it
      return {
        message: null,
        success: true,
        humanPaused: true
      };
    }

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
        systemMessage += `\n- ${item.name} (${item.quantity}x R$ ${safePrice(item.price) || '0.00'})`;
      });
      systemMessage += `\nTotal do carrinho: R$ ${session.getCartTotal().toFixed(2)}`;
    }

    // Call Gemini with tools
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
          try {
            const results = await searchProducts(functionArgs.query, functionArgs.category);
            console.log('[Agent] search_products("' + functionArgs.query + '") returned ' + results.length + ' results');

            if (results.length === 0) {
              functionResult = 'Nenhum produto encontrado. Tente outro termo de busca mais curto ou generico.';
            } else {
              functionResult = 'PRODUTOS ENCONTRADOS - MOSTRE TODOS COM ESTOQUE AO CLIENTE:\n';
              functionResult += results
                .slice(0, 10)
                .map(p => {
                  let line = '- [ID: ' + p.id + '] ' + p.name;
                  if (p.category) line += ' (' + p.category + ')';
                  const price = safePrice(p.price);
                  if (price) {
                    line += ': R$ ' + price;
                  }
                  if (p.stock !== null && p.stock !== undefined) {
                    line += p.stock > 0 ? ' [EM ESTOQUE: ' + p.stock + ' unidades]' : ' [FORA DE ESTOQUE]';
                  }
                  return line;
                })
                .join('\n');
              functionResult += '\n\nTotal encontrado: ' + results.length + ' produto(s)';
              functionResult += '\nIMPORTANTE: Apresente TODOS os produtos acima que tem estoque ao cliente. Se houver multiplas versoes do mesmo produto (po, granel, capsulas, etc), mostre CADA UMA delas separadamente! NAO mencione produtos fora de estoque a menos que o cliente pergunte especificamente.';
            }
          } catch (searchError) {
            console.error('[Agent] search_products error:', searchError.message);
            functionResult = 'Erro ao buscar produtos. Tente novamente.';
          }
          break;
        }

        case 'get_product_details': {
            try {
              const productId = String(functionArgs.product_id);
              console.log(`[Agent] get_product_details for ID: "${productId}"`);
              const product = await getProductDetails(productId);
              if (!product) {
                console.log(`[Agent] Product not found for ID: "${productId}"`);
                functionResult = 'Produto não encontrado.';
              } else {
                console.log(`[Agent] Product found: ${product.name}, price=${product.price}`);
                functionResult = formatProduct(product);
              }
            } catch (detailError) {
              console.error(`[Agent] get_product_details error:`, detailError.message);
              functionResult = 'Erro ao buscar detalhes do produto.';
            }
            break;
          }

          case 'check_stock': {
            try {
              const stockInfo = await checkStock(String(functionArgs.product_id));
              if (stockInfo.inStock) {
                functionResult = `✅ Produto em estoque! ${stockInfo.quantity} unidade(s) disponível(is).`;
              } else {
                functionResult = '❌ Produto fora de estoque no momento. Sugira alternativas ao cliente.';
              }
            } catch (stockError) {
              functionResult = 'Não foi possível verificar estoque no momento.';
            }
            break;
          }

          case 'send_product_image': {
            sendMedia = true;
            try {
              const photoUrl = await getProductPhotoUrl(String(functionArgs.product_id));
              if (photoUrl) {
                functionResult = `[Imagem do produto será enviada via WhatsApp]`;
                toolCalls.push({
                  type: 'send_image',
                  productId: String(functionArgs.product_id),
                  phoneNumber: userId,
                  imageUrl: photoUrl
                });
              } else {
                functionResult = '[Produto sem imagem disponível no momento]';
              }
            } catch (imgError) {
              functionResult = '[Erro ao buscar imagem do produto]';
            }
            break;
          }

          case 'add_to_cart': {
            try {
              const product = await getProductDetails(String(functionArgs.product_id));
              if (!product) {
                functionResult = 'Produto não encontrado.';
              } else {
                session.addToCart({
                  ...product,
                  quantity: functionArgs.quantity || 1
                });
                const price = safePrice(product.price) || '0.00';
                functionResult = `✅ ${product.name} adicionado ao carrinho (${functionArgs.quantity || 1}x R$ ${price})`;
              }
            } catch (cartError) {
              functionResult = 'Erro ao adicionar produto ao carrinho.';
            }
            break;
          }

          case 'view_cart': {
            functionResult = formatCartForDisplay(session);
            break;
          }

          case 'remove_from_cart': {
            const hasItems = session.removeFromCart(String(functionArgs.product_id));
            if (hasItems) {
              functionResult = 'Produto removido do carrinho.';
            } else {
              functionResult = 'Produto removido. Seu carrinho está vazio.';
            }
            break;
          }

          case 'validate_coupon': {
            try {
              const coupon = await validateCoupon(functionArgs.coupon_code);
              if (coupon) {
                const discount = coupon.discount || coupon.desconto || coupon.value || coupon.valor || '';
                const type = coupon.type || coupon.tipo || 'percentual';
                functionResult = `✅ Cupom "${functionArgs.coupon_code}" válido! Desconto: ${discount}${type === 'percentual' || type === 'percent' ? '%' : ' reais'}`;
              } else {
                functionResult = `❌ Cupom "${functionArgs.coupon_code}" inválido ou expirado.`;
              }
            } catch (error) {
              functionResult = 'Não foi possível validar o cupom no momento. Tente novamente.';
            }
            break;
          }

          case 'check_order_status': {
            try {
              const orderNumber = functionArgs.order_number || functionArgs.order_id;
              console.log(`[Agent] Checking order status for: ${orderNumber}`);

              // Try Tiny ERP first
              let orderFound = false;
              try {
                const tinyOrder = await getOrderByNumber(orderNumber);
                if (tinyOrder) {
                  const formatted = formatOrderForCustomer(tinyOrder);
                  functionResult = `📦 *Pedido #${formatted.numero}*\nStatus: ${formatted.situacao}\nData: ${formatted.dataPedido}\nTotal: R$ ${formatted.totalPedido}`;

                  if (formatted.items && formatted.items.length > 0) {
                    functionResult += `\nItens (${formatted.items.length}):`;
                    formatted.items.forEach(item => {
                      functionResult += `\n  ${item.descricao} (${item.quantidade}x)`;
                    });
                  }

                  if (formatted.codigoRastreamento) {
                    functionResult += `\n\n📬 Rastreio: ${formatted.codigoRastreamento}`;
                    functionResult += `\nAcompanhe: https://www.linkcorreios.com.br/?id=${formatted.codigoRastreamento}`;
                  }

                  orderFound = true;
                  console.log(`[Agent] Order found in Tiny ERP: ${orderNumber}`);
                }
              } catch (tinyError) {
                console.log(`[Agent] Tiny ERP lookup failed for ${orderNumber}: ${tinyError.message}`);
              }

              // Fallback to Wbuy if not found in Tiny
              if (!orderFound) {
                try {
                  const wbuyOrder = await getWbuyOrderStatus(orderNumber);
                  if (wbuyOrder) {
                    let status = wbuyOrder.status;
                    if (typeof status === 'object' && status !== null) {
                      status = status.nome || status.descricao || JSON.stringify(status);
                    }
                    status = status || 'Desconhecido';

                    functionResult = `📦 Pedido #${orderNumber}\nStatus: ${status}`;
                    if (wbuyOrder.date) functionResult += `\nData: ${wbuyOrder.date}`;
                    if (wbuyOrder.total) functionResult += `\nTotal: R$ ${wbuyOrder.total}`;
                    if (wbuyOrder.payment) functionResult += `\nPagamento: ${wbuyOrder.payment}`;
                    if (wbuyOrder.itemCount > 0) {
                      functionResult += `\nItens (${wbuyOrder.itemCount}):`;
                      wbuyOrder.items.forEach(item => {
                        functionResult += `\n  - ${item.name} (${item.quantity}x)`;
                      });
                    }
                    if (wbuyOrder.tracking) {
                      functionResult += `\nRastreio: ${wbuyOrder.tracking}`;
                    }
                    orderFound = true;
                    console.log(`[Agent] Order found in Wbuy: ${orderNumber}`);
                  }
                } catch (wbuyError) {
                  console.log(`[Agent] Wbuy lookup also failed for ${orderNumber}: ${wbuyError.message}`);
                }
              }

              if (!orderFound) {
                functionResult = `Pedido #${orderNumber} não encontrado. Verifique o número do pedido e tente novamente. Se preferir, posso transferir para um atendente.`;
              }
            } catch (error) {
              console.error('[Agent] check_order_status error:', error.message);
              functionResult = 'Não foi possível consultar o pedido no momento. Tente novamente.';
            }
            break;
          }

          case 'get_order_tracking': {
            try {
              const orderNumber = functionArgs.order_number;
              console.log(`[Agent] Getting tracking for order: ${orderNumber}`);
              const tracking = await getOrderTracking(orderNumber);

              if (tracking && tracking.codigo) {
                functionResult = `📬 *Rastreamento do Pedido #${orderNumber}*\nCódigo: ${tracking.codigo}`;
                if (tracking.url) {
                  functionResult += `\nAcompanhe aqui: ${tracking.url}`;
                }
                functionResult += `\n\nVocê pode copiar o código e rastrear em https://www.linkcorreios.com.br/`;
              } else if (tracking && tracking.status) {
                functionResult = `Pedido #${orderNumber}: ${tracking.status}. Ainda não há código de rastreamento disponível. O código é gerado quando o pedido é despachado.`;
              } else {
                functionResult = `Não encontrei informações de rastreamento para o pedido #${orderNumber}. Verifique o número ou posso transferir para um atendente.`;
              }
            } catch (trackError) {
              console.error('[Agent] get_order_tracking error:', trackError.message);
              functionResult = 'Não foi possível buscar o rastreamento no momento. Tente novamente.';
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
            try {
              const profile = functionArgs.customer_profile.toLowerCase();
              const results = await searchProducts(profile);
              if (results.length === 0) {
                const { getTopProducts } = require('./products');
                const top = await getTopProducts(3);
                functionResult = 'Recomendações populares:\n' + top
                  .map(p => {
                    const price = safePrice(p.price) || '0.00';
                    return `- ${p.name} - R$ ${price}`;
                  })
                  .join('\n');
              } else {
                functionResult = results
                  .slice(0, 5)
                  .map(p => {
                    const price = safePrice(p.price) || '0.00';
                    return `- [ID: ${p.id}] ${p.name} - R$ ${price}`;
                  })
                  .join('\n');
              }
            } catch (recError) {
              functionResult = 'Não foi possível buscar recomendações no momento.';
            }
            break;
          }

          case 'get_categories': {
            try {
              const cats = await getCategories();
              if (cats.length > 0) {
                functionResult = 'Categorias disponíveis:\n' + cats
                  .map(c => `- ${c.name || c}`)
                  .join('\n');
              } else {
                functionResult = 'Categorias: Chás, Suplementos, Empório (produtos naturais)';
                 }
            } catch (error) {
              functionResult = 'Categorias: Chás, Suplementos, Empório (produtos naturais)';
            }
            break;
          }

          case 'get_store_info': {
            try {
              const store = getStoreInfo();
              functionResult = `🏪 *Rocha Saúde Empório*\n📍 ${store.endereco}\n🕐 ${store.horario}\n📞 ${store.telefone}\n📧 ${store.email}\n\n📌 Como chegar: ${store.googleMapsUrl}`;
            } catch (storeError) {
              functionResult = '🏪 Rocha Saúde Empório\n📍 Av. Fagundes Filho, 141 - loja 7 - São Judas, São Paulo - SP, 04304-010\n🕐 Seg-Sex 09:00-19:00, Sáb 09:00-15:00\n📞 (11) 98697-5204\n\n📌 Como chegar: https://maps.app.goo.gl/dEBhFB2U2sdsc8jdA';
            }
            break;
          }

          case 'check_business_hours': {
            try {
              const inHours = isBusinessHours();
              const message = getBusinessHoursMessage();
              functionResult = inHours
                ? `✅ Estamos em horário de atendimento. ${message}`
                : `⏰ Fora do horário de atendimento. ${message}`;
            } catch (hoursError) {
              functionResult = 'Horário de atendimento humano: Segunda a Sexta, 09:00 às 16:00.';
            }
            break;
          }

          case 'classify_customer_issue': {
            try {
              const classification = classifyIssue(functionArgs.description);
              functionResult = `Tipo de problema: ${classification.type}\nDescrição: ${classification.description}\nAção recomendada: ${classification.action}`;
            } catch (classifyError) {
              functionResult = 'Tipo: geral. Recomendação: transferir para atendente humano.';
            }
            break;
          }

          case 'transfer_to_human': {
            try {
              const session2 = getSession(userId);
              session2.pauseForHuman(functionArgs.reason);
              // Signal to server.js to send group notification
              toolCalls.push({
                type: 'transfer_to_human',
                phoneNumber: userId,
                reason: functionArgs.reason,
                summary: functionArgs.summary,
                issueType: functionArgs.issue_type || 'general',
                customerName: session2.customer.name || 'Cliente'
              });

              // Check business hours context
              const inBizHours = isBusinessHours();
              if (inBizHours) {
                functionResult = 'TRANSFERENCIA_HUMANO_OK: Bot pausado. Notificacao enviada ao grupo de suporte. O cliente foi informado que um atendente vai responder em breve.';
              } else {
                functionResult = 'TRANSFERENCIA_HUMANO_OK: Bot pausado. FORA DO HORARIO DE ATENDIMENTO. Informe ao cliente que um atendente responderá no próximo dia útil (seg-sex 09:00-16:00).';
              }
            } catch (transferError) {
              console.error('[Agent] transfer_to_human error:', transferError.message);
              functionResult = 'Nao foi possivel transferir no momento. Informe o email contato@gruporochasaude.com ao cliente.';
            }
            break;
          }
          default:
            functionResult = `Função ${functionName} não implementada.`;
        }

        // DEBUG: Log function result before sending to Gemini
        console.log(`[Agent] Function result for ${functionName}: ${functionResult.substring(0, 300)}`);

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

      // Call Gemini again with results
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
    console.error('[Agent] Stack:', error.stack);
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
    'Olá! Bem-vindo(a) à Grupo Rocha Saúde! Sou a Rosa, especialista em vida saudável. Como posso ajudar você hoje? 🌿',
    'Oi! Bem-vindo(a)! Sou a Rosa, da Grupo Rocha Saúde. Posso ajudar você a encontrar o melhor produto para suas necessidades?',
    'Bem-vindo(a)! Sou a Rosa, sua consultora de saúde natural! Procurando por chás, suplementos ou produtos naturais? Estou aqui para ajudar! 🌿'
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
