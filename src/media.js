/**
 * Media Management for Rosa 2.0
 * Handles sending images and videos via Evolution API
 * Updated for Wbuy API integration (async product lookups)
 */

const axios = require('axios');
const { getProductDetails, formatProduct, getProductPhotoUrl } = require('./products');

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-f708.up.railway.app';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'rocha-saude-2024';
const INSTANCE_NAME = process.env.INSTANCE_NAME || 'rocha-saude';

/**
 * Send product image via WhatsApp
 * @param {string} phoneNumber
 * @param {string} productId
 * @param {string} imageUrl - Optional direct image URL (from Wbuy API)
 */
async function sendProductImage(phoneNumber, productId, imageUrl = null) {
  try {
    const product = await getProductDetails(productId);
    if (!product) {
      console.error(`[Media] Produto nÃ£o encontrado: ${productId}`);
      return {
        success: false,
        error: 'Produto nÃ£o encontrado'
      };
    }

    // Use provided URL, product image, or fetch from API
    let mediaUrl = imageUrl || product.imageUrl;
    if (!mediaUrl) {
      mediaUrl = await getProductPhotoUrl(productId);
    }

    if (!mediaUrl) {
      console.warn(`[Media] Sem imagem para produto ${productId}`);
      return {
        success: false,
        error: 'Produto sem imagem disponÃ­vel'
      };
    }

    const desc = (product.description || '').replace(/<[^>]*>/g, '').substring(0, 200);
    let caption = `ð¦ *${product.name}*\nð° R$ ${product.price.toFixed(2)}`;
    if (desc) caption += `\nð¬ ${desc}`;
    if (product.benefits && product.benefits.length > 0) {
      caption += `\nâ¨ ${product.benefits.join(', ')}`;
    }

    const response = await axios.post(
      `${EVOLUTION_API_URL}/message/sendMedia/${INSTANCE_NAME}`,
      {
        number: phoneNumber,
        mediatype: 'image',
        mimetype: 'image/jpeg',
        caption: caption,
        media: mediaUrl
      },
      {
        headers: {
          'apikey': EVOLUTION_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    console.log(`[Media] Imagem do produto ${productId} enviada para ${phoneNumber}`);

    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    console.error(`[Media] Erro ao enviar imagem:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Send product video via WhatsApp
 */
async function sendProductVideo(phoneNumber, productId, videoUrl) {
  try {
    const product = await getProductDetails(productId);
    if (!product) {
      return { success: false, error: 'Produto nÃ£o encontrado' };
    }

    const caption = `VÃ­deo - ${product.name}`;

    const response = await axios.post(
      `${EVOLUTION_API_URL}/message/sendMedia/${INSTANCE_NAME}`,
      {
        number: phoneNumber,
        mediatype: 'video',
        mimetype: 'video/mp4',
        caption: caption,
        media: videoUrl
      },
      {
        headers: {
          'apikey': EVOLUTION_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    console.log(`[Media] VÃ­deo do produto ${productId} enviado para ${phoneNumber}`);
    return { success: true, data: response.data };
  } catch (error) {
    console.error(`[Media] Erro ao enviar vÃ­deo:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send carousel of product images
 */
async function sendProductCarousel(phoneNumber, productIds) {
  try {
    const results = [];

    for (const productId of productIds) {
      const result = await sendProductImage(phoneNumber, productId);
      results.push(result);
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return {
      success: results.every(r => r.success),
      totalSent: results.filter(r => r.success).length,
      totalFailed: results.filter(r => !r.success).length
    };
  } catch (error) {
    console.error(`[Media] Erro ao enviar carrossel:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send generic image message
 */
async function sendImage(phoneNumber, imageUrl, caption = '') {
  try {
    const response = await axios.post(
      `${EVOLUTION_API_URL}/message/sendMedia/${INSTANCE_NAME}`,
      {
        number: phoneNumber,
        mediatype: 'image',
        mimetype: 'image/jpeg',
        caption: caption,
        media: imageUrl
      },
      {
        headers: {
          'apikey': EVOLUTION_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    console.log(`[Media] Imagem enviada para ${phoneNumber}`);
    return { success: true, data: response.data };
  } catch (error) {
    console.error(`[Media] Erro ao enviar imagem genÃ©rica:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send document via WhatsApp
 */
async function sendDocument(phoneNumber, documentUrl, filename = 'documento.pdf') {
  try {
    const response = await axios.post(
      `${EVOLUTION_API_URL}/message/sendMedia/${INSTANCE_NAME}`,
      {
        number: phoneNumber,
        mediatype: 'document',
        mimetype: 'application/pdf',
        caption: filename,
        media: documentUrl
      },
      {
        headers: {
          'apikey': EVOLUTION_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    console.log(`[Media] Documento enviado para ${phoneNumber}`);
    return { success: true, data: response.data };
  } catch (error) {
    console.error(`[Media] Erro ao enviar documento:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Check if media URL is accessible
 */
async function validateMediaUrl(mediaUrl) {
  try {
    const response = await axios.head(mediaUrl, { timeout: 5000 });
    return {
      valid: response.status === 200,
      status: response.status,
      contentType: response.headers['content-type']
    };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Format media response for AI
 */
function formatMediaResponse(success, result) {
  if (success) {
    return `â Imagem enviada com sucesso! O cliente pode visualizar detalhes completos do produto.`;
  }
  return `â ï¸ Houve um problema ao enviar a imagem. Por favor, descreva o produto textualmente.`;
}

module.exports = {
  sendProductImage,
  sendProductVideo,
  sendProductCarousel,
  sendImage,
  sendDocument,
  validateMediaUrl,
  formatMediaResponse
};
