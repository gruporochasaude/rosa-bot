/**
 * Function Definitions for DeepSeek Function Calling
 * These tools are available for the AI to call during conversation
 */

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_products',
      description: 'Buscar produtos no catÃ¡logo por termo ou categoria. Perfeito para encontrar o que o cliente procura.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Termo de busca (ex: "chÃ¡", "proteÃ­na", "colÃ¡geno")'
          },
          category: {
            type: 'string',
            enum: ['chÃ¡s', 'suplementos', 'empÃ³rio'],
            description: 'Categoria opcional para filtrar: chÃ¡s, suplementos ou empÃ³rio'
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
      description: 'Obter informaÃ§Ãµes completas de um produto especÃ­fico pelo ID',
      parameters: {
        type: 'object',
        properties: {
          product_id: {
            type: 'string',
            description: 'ID Ãºnico do produto (ex: cha-detox-001)'
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
      description: 'Enviar imagem do produto via WhatsApp. Use quando o cliente mostrar interesse em um produto especÃ­fico.',
      parameters: {
        type: 'object',
        properties: {
          product_id: {
            type: 'string',
            description: 'ID do produto cuja imagem serÃ¡ enviada'
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
      description: 'Adicionar produto ao carrinho do cliente com quantidade especificada',
      parameters: {
        type: 'object',
        properties: {
          product_id: {
            type: 'string',
            description: 'ID do produto a adicionar'
          },
          quantity: {
            type: 'integer',
            description: 'Quantidade desejada (padrÃ£o: 1)',
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
      description: 'Exibir conteÃºdo e total do carrinho do cliente',
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
      name: 'generate_checkout_link',
      description: 'Gerar link de checkout no Wbuy para finalizar a compra. Use quando cliente estÃ¡ pronto para comprar.',
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
            description: 'Email do cliente para contato'
          },
          phone: {
            type: 'string',
            description: 'Telefone/WhatsApp do cliente (opcional se jÃ¡ via WhatsApp)'
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
      description: 'Obter recomendaÃ§Ãµes personalizadas baseado no perfil e histÃ³rico do cliente',
      parameters: {
        type: 'object',
        properties: {
          customer_profile: {
            type: 'string',
            description: 'Perfil do cliente (ex: "emagrecimento", "imunidade", "energia", "beleza")'
          }
        },
        required: ['customer_profile']
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
    return { valid: false, error: `FunÃ§Ã£o ${functionName} nÃ£o existe` };
  }

  const schema = tool.function.parameters;
  const required = schema.required || [];

  for (const field of required) {
    if (!(field in parameters)) {
      return { valid: false, error: `ParÃ¢metro obrigatÃ³rio faltando: ${field}` };
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
