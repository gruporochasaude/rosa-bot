/**
 * Function Definitions for Gemini Function Calling
 * Tools available for Rosa AI during conversation
 * Updated for Wbuy + Tiny ERP integration + Customer Service Protocol
 */

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_products',
      description: 'Buscar produtos no catálogo por termo ou categoria. Use para encontrar o que o cliente procura.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Termo de busca (ex: "chá", "proteína", "colágeno", "castanha")'
          },
          category: {
            type: 'string',
            description: 'Categoria para filtrar (ex: "chás", "suplementos", "empório")'
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_product_details',
      description: 'Obter informações completas de um produto específico pelo ID',
      parameters: {
        type: 'object',
        properties: {
          product_id: {
            type: 'string',
            description: 'ID do produto'
          }
        },
        required: ['product_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_stock',
      description: 'Verificar estoque disponível de um produto. Use quando o cliente perguntar sobre disponibilidade.',
      parameters: {
        type: 'object',
        properties: {
          product_id: {
            type: 'string',
            description: 'ID do produto para verificar estoque'
          }
        },
        required: ['product_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_product_image',
      description: 'Enviar imagem do produto via WhatsApp. Use quando o cliente mostrar interesse em um produto.',
      parameters: {
        type: 'object',
        properties: {
          product_id: {
            type: 'string',
            description: 'ID do produto cuja imagem será enviada'
          }
        },
        required: ['product_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_to_cart',
      description: 'Adicionar produto ao carrinho do cliente',
      parameters: {
        type: 'object',
        properties: {
          product_id: {
            type: 'string',
            description: 'ID do produto a adicionar'
          },
          quantity: {
            type: 'integer',
            description: 'Quantidade desejada (padrão: 1)',
            default: 1,
            minimum: 1
          }
        },
        required: ['product_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'view_cart',
      description: 'Exibir conteúdo e total do carrinho do cliente',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'remove_from_cart',
      description: 'Remover um produto do carrinho do cliente',
      parameters: {
        type: 'object',
        properties: {
          product_id: {
            type: 'string',
            description: 'ID do produto a remover do carrinho'
          }
        },
        required: ['product_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'validate_coupon',
      description: 'Validar um cupom de desconto fornecido pelo cliente. Verifica se o cupom existe e está ativo.',
      parameters: {
        type: 'object',
        properties: {
          coupon_code: {
            type: 'string',
            description: 'Código do cupom de desconto (ex: "PRIMEIRACOMPRA", "DESCONTO10")'
          }
        },
        required: ['coupon_code']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_order_status',
      description: 'Consultar status de um pedido pelo número. Busca primeiro no Tiny ERP e depois no Wbuy. Use quando cliente perguntar sobre entrega ou pedido.',
      parameters: {
        type: 'object',
        properties: {
          order_number: {
            type: 'string',
            description: 'Número do pedido (ex: "12345", "GRS-001")'
          }
        },
        required: ['order_number']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_order_tracking',
      description: 'Obter código de rastreamento e link dos Correios para um pedido. Use quando cliente perguntar "cadê meu pedido", "onde está minha encomenda", "rastreio".',
      parameters: {
        type: 'object',
        properties: {
          order_number: {
            type: 'string',
            description: 'Número do pedido para buscar rastreamento'
          }
        },
        required: ['order_number']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_checkout_link',
      description: 'Gerar link de checkout para finalizar a compra. Use quando cliente está pronto para comprar.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'capture_lead',
      description: 'Capturar dados do cliente (nome, email, telefone) para CRM e follow-up',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Nome completo do cliente'
          },
          email: {
            type: 'string',
            description: 'Email do cliente'
          },
          phone: {
            type: 'string',
            description: 'Telefone/WhatsApp do cliente'
          }
        },
        required: ['name', 'email']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_recommendations',
      description: 'Obter recomendações personalizadas baseado no perfil do cliente ou restrição alimentar (ex: "sem glúten", "vegano", "diabético", "intolerante a lactose")',
      parameters: {
        type: 'object',
        properties: {
          customer_profile: {
            type: 'string',
            description: 'Perfil/necessidade do cliente (ex: "emagrecimento", "imunidade", "sem glúten", "vegano", "diabético", "digestão")'
          }
        },
        required: ['customer_profile']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_categories',
      description: 'Listar todas as categorias de produtos disponíveis na loja',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_store_info',
      description: 'Obter informações da loja física: endereço, horário de funcionamento, telefone e link do Google Maps. Use quando cliente perguntar sobre loja, endereço, como chegar, horário.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_business_hours',
      description: 'Verificar se estamos em horário de atendimento humano (seg-sex 09:00-16:00). Use antes de transferir para humano.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'classify_customer_issue',
      description: 'Classificar o tipo de problema do cliente para direcionar melhor o atendimento. Categorias: rastreamento, produto errado/danificado, troca/devolução, nota fiscal, pagamento, geral.',
      parameters: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'Descrição do problema do cliente em texto livre'
          }
        },
        required: ['description']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'transfer_to_human',
      description: 'Transferir atendimento para um humano da equipe. Use quando: o cliente pedir explicitamente para falar com uma pessoa/atendente, quando o problema for complexo demais para resolver, quando o cliente estiver insatisfeito ou reclamando, ou quando precisar de suporte humano. SEMPRE verifique horário de atendimento antes.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'Motivo da transferencia (ex: "cliente quer falar com pessoa", "reclamacao", "produto danificado", "troca/devolucao")'
          },
          summary: {
            type: 'string',
            description: 'Resumo breve da conversa ate o momento para o atendente humano entender o contexto'
          },
          issue_type: {
            type: 'string',
            description: 'Tipo do problema: tracking, wrong_or_damaged, return_exchange, invoice, payment, general',
            enum: ['tracking', 'wrong_or_damaged', 'return_exchange', 'invoice', 'payment', 'general']
          }
        },
        required: ['reason', 'summary']
      }
    }
  }
];

/**
 * Get tool definition by name
 */
function getToolDefinition(name) {
  const tool = TOOLS.find(t => t.function.name === name);
  return tool ? tool.function : null;
}

/**
 * Validate function call parameters
 */
function validateFunctionCall(functionName, parameters) {
  const tool = TOOLS.find(t => t.function.name === functionName);
  if (!tool) {
    return { valid: false, error: `Função ${functionName} não existe` };
  }

  const schema = tool.function.parameters;
  const required = schema.required || [];

  for (const field of required) {
    if (!(field in parameters)) {
      return { valid: false, error: `Parâmetro obrigatório faltando: ${field}` };
    }
  }

  return { valid: true };
}

/**
 * Get all available tools
 */
function getAvailableTools() {
  return TOOLS;
}

/**
 * Get tool descriptions for system prompt
 */
function getToolDescriptions() {
  return TOOLS.map(tool => ({
    name: tool.function.name,
    description: tool.function.description
  }));
}

module.exports = {
  TOOLS,
  getToolDefinition,
  validateFunctionCall,
  getAvailableTools,
  getToolDescriptions
};
