/**
 * Rosa AI Agent using DeepSeek API
 * Handles conversation, function calling, and product recommendations
 */

const { OpenAI } = require('openai');
const { TOOLS } = require('./tools');
const { searchProducts, getProductDetails, formatProduct } = require('./products');
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
- Especializamos em produtos naturais de qualidade
- PrÃ³pria marca de chÃ¡s (ChÃ¡ Detox, Relaxante, Emagrecedor, Digestivo, Imunidade)
- Suplementos de qualidade (Whey, ColÃ¡geno, Vitaminas, Ãmega-3)
- EmpÃ³rio com produtos premium (castanhas, farinhas, mel, Ã³leo de coco)

**Como ajudar:**
1. Sempre comece entendendo o que o cliente procura
2. Se nÃ£o tiver certeza, use search_products para encontrar o melhor
3. Quando apresentar um produto, use send_product_image para mostrar
4. Se o cliente gostar, use add_to_cart para adicionar
5. Capture dados (nome, email) naturalmente na conversa
6. Ao finalizar, gere checkout_link e envie via get_recommendations

**Fluxo de vendas tÃ­pico:**
1. SaudaÃ§Ã£o calorosa
2. Pergunta sobre necessidades/preferÃªncias
3. Busca e recomendaÃ§Ã£o de produtos
4. Envio de imagens quando apropriado
5. AdiÃ§Ã£o ao carrinho
6. Captura de dados do cliente
7. Checkout com link Wbuy

**Tone of voice:**
- Conversa natural e amigÃ¡vel
- Sem jargÃ£o tÃ©cnico excessivo
- Foca em benefÃ­cios reais para o cliente
- Respeitosa e profissional
- Sabe reconhecer quando o cliente estÃ¡ pronto para comprar

**Importante:**
- Sempre respeite a privacidade do cliente
- NÃ£o assuma informaÃ§Ãµes que nÃ£o foram dadas
- Seja honesto sobre disponibilidade de produtos
- OfereÃ§a alternativas quando apropriado
- Se o cliente nÃ£o quiser comprar, ofereÃ§a informaÃ§Ãµes Ãºteis mesmo assim`;

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

        // Execute function based on name
        switch (functionName) {
          case 'search_products': {
            const results = searchProducts(functionArgs.query, functionArgs.category);
            if (results.length === 0) {
              functionResult = 'Nenhum produto encontrado. Tente outro termo de busca.';
            } else {
              functionResult = results
                .slice(0, 5)
                .map(p => `- ${p.name} (${p.category}): R$ ${p.price.toFixed(2)}`)
                .join('\n');
            }
            break;
          }

          case 'get_product_details': {
            const product = getProductDetails(functionArgs.product_id);
            if (!product) {
              functionResult = 'Produto nÃ£o encontrado.';
            } else {
              functionResult = formatProduct(product);
            }
            break;
          }

          case 'send_product_image': {
            sendMedia = true;
            functionResult = `[SerÃ¡ enviada imagem do produto ${functionArgs.product_id}]`;
            toolCalls.push({
              type: 'send_image',
              productId: functionArgs.product_id,
              phoneNumber: userId
            });
            break;
          }

          case 'add_to_cart': {
            const product = getProductDetails(functionArgs.product_id);
            if (!product) {
              functionResult = 'Produto nÃ£o encontrado.';
            } else {
              session.addToCart({
                ...product,
                quantity: functionArgs.quantity || 1
              });
              functionResult = `â ${product.name} adicionado ao carrinho (${functionArgs.quantity || 1}x)`;
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
            const { PRODUCTS } = require('./products');
            const profile = functionArgs.customer_profile.toLowerCase();
            let recommendations = PRODUCTS.filter(p => {
              const text = `${p.name} ${p.description} ${p.benefits.join(' ')}`.toLowerCase();
              return text.includes(profile);
            });

            if (recommendations.length === 0) {
              recommendations = PRODUCTS.slice(0, 3);
            } else {
              recommendations = recommendations.slice(0, 3);
            }

            functionResult = recommendations
              .map(p => `${p.name} - R$ ${p.price.toFixed(2)}`)
              .join('\n');
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
      const result = await sendProductImage(phoneNumber, call.productId);
      results.push(result);
    }
  }

  return results;
}

module.exports = {
  processMessage,
  getGreetingMessage,
  executeMediaActions
};
