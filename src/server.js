/**
 * Rosa 2.0 WhatsApp Bot - Express Server
 * Webhook server for Evolution API integration
 */

require('dotenv').config();

const express = require('express');
const axios = require('axios');
const { initAgent, processMessage, getGreetingMessage, executeMediaActions } = require('./agent');
const { getSession, cleanupStaleSessions, getSessionStats } = require('./sessions');
const { getLeadStats, getAllLeads } = require('./leads');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Environment variables
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-f708.up.railway.app';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'rocha-saude-2024';
const INSTANCE_NAME = process.env.INSTANCE_NAME || 'rocha-saude';
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN || 'rosa-webhook-2024';
const SUPPORT_GROUP_JID = process.env.SUPPORT_GROUP_JID || '';

// Logging utility
function log(level, message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
}

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    uptime: process.uptime()
  });
});

/**
 * Status endpoint with statistics
 */
app.get('/status', (req, res) => {
  const sessionStats = getSessionStats();
  const leadStats = getLeadStats();
  res.status(200).json({
    status: 'running',
    timestamp: new Date().toISOString(),
    sessions: sessionStats,
    leads: leadStats,
    uptime: process.uptime()
  });
});

/**
 * Debugging endpoint - list all active sessions
 */
app.get('/debug/sessions', (req, res) => {
  // Verify token
  if (req.query.token !== WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { getAllSessions, exportSessionData } = require('./sessions');
  const sessions = getAllSessions();

  const sessionsData = sessions.map(session => ({
    userId: session.userId,
    messages: session.conversationHistory.length,
    cartItems: session.cart.length,
    cartTotal: session.getCartTotal(),
    customerName: session.customer.name,
    phase: session.context.conversationPhase,
    duration: session.getDuration()
  }));

  res.status(200).json({
    total: sessions.length,
    sessions: sessionsData
  });
});

/**
 * Debugging endpoint - list all leads
 */
app.get('/debug/leads', (req, res) => {
  // Verify token
  if (req.query.token !== WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const leads = getAllLeads();
  const summary = leads.map(l => l.getSummary());
  res.status(200).json({
    total: leads.length,
    leads: summary
  });
});

/**
 * Extract text from Evolution API v2 message object
 * Handles: conversation, extendedTextMessage, imageMessage, documentMessage, etc.
 */
function extractMessageText(message) {
  if (!message || !message.message) return null;

  const msg = message.message;

  // Plain text message
  if (msg.conversation) {
    return msg.conversation.trim();
  }

  // Extended text (replies, links, etc.)
  if (msg.extendedTextMessage && msg.extendedTextMessage.text) {
    return msg.extendedTextMessage.text.trim();
  }

  // Image with caption
  if (msg.imageMessage && msg.imageMessage.caption) {
    return msg.imageMessage.caption.trim();
  }

  // Video with caption
  if (msg.videoMessage && msg.videoMessage.caption) {
    return msg.videoMessage.caption.trim();
  }

  // Document with caption
  if (msg.documentMessage && msg.documentMessage.caption) {
    return msg.documentMessage.caption.trim();
  }

  // Button response
  if (msg.buttonsResponseMessage) {
    return msg.buttonsResponseMessage.selectedDisplayText || msg.buttonsResponseMessage.selectedButtonId || null;
  }

  // List response
  if (msg.listResponseMessage) {
    return msg.listResponseMessage.title || msg.listResponseMessage.singleSelectReply?.selectedRowId || null;
  }

  return null;
}

/**
 * Main webhook endpoint for Evolution API v2
 */
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    const event = body.event;
    const data = body.data;

    log('INFO', `Webhook received: ${event}`);

    // Handle different event types
    switch (event) {
      case 'messages.upsert': {
        // Evolution API v2 sends message directly in data (not in data.messages array)
        const message = data?.messages?.[0] || data;

        if (!message || !message.key) {
          log('WARN', 'No valid message data in webhook payload');
          return res.status(200).json({ success: false, message: 'No message data' });
        }

        // Only process messages from users (not from bot)
        if (message.key.fromMe) {
          return res.status(200).json({ success: true, skipped: true });
        }

        // Extract text from any message type
        const textContent = extractMessageText(message);

        if (textContent) {
          log('INFO', `Text extracted: "${textContent.substring(0, 60)}"`);
          const result = await handleTextMessage(message, textContent);
          return res.status(200).json(result);
        }

        log('INFO', 'Non-text message received, skipping');
        return res.status(200).json({ success: true, skipped: true, reason: 'non-text' });
      }

      case 'connection.update': {
        const statusMessage = data?.connection || data?.state || 'unknown';
        log('INFO', `Connection status: ${statusMessage}`);
        return res.status(200).json({ success: true });
      }

      default:
        log('WARN', `Unknown event type: ${event}`);
        return res.status(200).json({ success: true });
    }
  } catch (error) {
    log('ERROR', `Webhook error: ${error.message}`);
    log('ERROR', `Stack: ${error.stack}`);
    return res.status(200).json({ error: error.message });
  }
});

/**
 * Handle incoming text message
 */
async function handleTextMessage(message, textContent) {
  try {
    const phoneNumber = message.key.remoteJid.replace('@s.whatsapp.net', '');
    const pushName = message.pushName || '';

    log('INFO', `Message from ${phoneNumber} (${pushName}): ${textContent.substring(0, 50)}`);

    // Get or create session
    const session = getSession(phoneNumber);
    const isFirstMessage = session.conversationHistory.length === 0;

    // Store customer name from pushName if available
    if (pushName && !session.customer.name) {
      session.customer.name = pushName;
    }

    // Process message with AI
    const response = await processMessage(phoneNumber, textContent);

    // Check if bot is paused for human support
    if (response.humanPaused) {
      log('INFO', `Bot paused for ${phoneNumber} - skipping response`);
      return { success: true, phoneNumber, humanPaused: true };
    }

    if (!response.success) {
      log('ERROR', `Failed to process message: ${response.error}`);
      // Send a fallback message
      await sendTextMessage(phoneNumber, 'Desculpe, estou com uma dificuldade tecnica no momento. Pode tentar novamente em alguns instantes?');
      return { success: false, error: response.error };
    }

    // Send response via Evolution API
    await sendTextMessage(phoneNumber, response.message);

    // Execute any media sends and handle transfers
    if (response.toolCalls && response.toolCalls.length > 0) {
      // Handle transfer to human notifications
      for (const call of response.toolCalls) {
        if (call.type === 'transfer_to_human') {
          await sendGroupNotification(call.phoneNumber, call.customerName, call.reason, call.summary);
        }
      }
      await executeMediaActions(phoneNumber, response.toolCalls);
    }

    log('INFO', `Response sent to ${phoneNumber}`);
    return { success: true, phoneNumber, messageProcessed: true };

  } catch (error) {
    log('ERROR', `Error handling text message: ${error.message}`);
    log('ERROR', `Stack: ${error.stack}`);
    return { success: false, error: error.message };
  }
}

/**
 * Send text message via Evolution API
 */
async function sendTextMessage(phoneNumber, message) {
  try {
    const response = await axios.post(
      `${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`,
      {
        number: phoneNumber,
        text: message
      },
      {
        headers: {
          'apikey': EVOLUTION_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    log('INFO', `Text message sent to ${phoneNumber}`);
    return response.data;
  } catch (error) {
    log('ERROR', `Failed to send text message to ${phoneNumber}: ${error.message}`);
    if (error.response) {
      log('ERROR', `Evolution API response: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}



/**
 * Send notification to WhatsApp support group
 */
async function sendGroupNotification(phoneNumber, customerName, reason, summary) {
  if (!SUPPORT_GROUP_JID) {
    log('WARN', 'SUPPORT_GROUP_JID not set - cannot send group notification');
    return;
  }

  try {
    const message = '\u{1F514} *Atendimento Humano Solicitado*\n\n' +
      '\u{1F464} Cliente: ' + customerName + '\n' +
      '\u{1F4F1} Telefone: ' + phoneNumber + '\n' +
      '\u{1F4DD} Motivo: ' + reason + '\n' +
      '\u{1F4AC} Resumo: ' + summary + '\n\n' +
      '\u{23F0} Bot pausado por 30 min.\n' +
      'Para retomar o bot manualmente: POST /resume-bot/' + phoneNumber;

    await axios.post(
      `${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`,
      {
        number: SUPPORT_GROUP_JID,
        text: message
      },
      {
        headers: {
          'apikey': EVOLUTION_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    log('INFO', `Group notification sent for ${phoneNumber}`);
  } catch (error) {
    log('ERROR', `Failed to send group notification: ${error.message}`);
  }
}

/**
 * Test endpoint - Send greeting message
 */
app.post('/test/send-message', async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;

    if (!phoneNumber || !message) {
      return res.status(400).json({ error: 'phoneNumber and message required' });
    }

    await sendTextMessage(phoneNumber, message);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Test endpoint - Start conversation
 */
app.post('/test/start-conversation', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ error: 'phoneNumber required' });
    }

    // Get greeting
    const greeting = getGreetingMessage();

    // Initialize session
    const session = getSession(phoneNumber);
    session.addMessage('assistant', greeting);

    // Send message
    await sendTextMessage(phoneNumber, greeting);

    res.status(200).json({
      success: true,
      message: 'Conversation started',
      greeting: greeting
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


/**
 * Resume bot for a specific phone number (after human support)
 */
app.post('/resume-bot/:phoneNumber', (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const session = getSession(phoneNumber);
    
    if (!session.isHumanPaused()) {
      return res.status(200).json({ success: true, message: 'Bot already active for this number' });
    }
    
    session.resumeBot();
    log('INFO', `Bot manually resumed for ${phoneNumber}`);
    
    res.status(200).json({ 
      success: true, 
      message: `Bot resumed for ${phoneNumber}` 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Setup endpoint - Create WhatsApp support group
 */
app.post('/setup/create-support-group', async (req, res) => {
  try {
    const { participants } = req.body;
    
    const response = await axios.post(
      `${EVOLUTION_API_URL}/group/create/${INSTANCE_NAME}`,
      {
        subject: 'Suporte Rosa Bot - Grupo Rocha',
        description: 'Grupo para receber notificacoes de clientes que pedem atendimento humano via WhatsApp Bot Rosa.',
        participants: participants || []
      },
      {
        headers: {
          'apikey': EVOLUTION_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );
    
    log('INFO', `Support group created: ${JSON.stringify(response.data)}`);
    
    res.status(200).json({ 
      success: true, 
      message: 'Support group created! Set the group JID as SUPPORT_GROUP_JID env var on Railway.',
      data: response.data
    });
  } catch (error) {
    log('ERROR', `Failed to create support group: ${error.message}`);
    res.status(500).json({ error: error.message, details: error.response?.data });
  }
});

/**
 * Scheduled cleanup of stale sessions
 */
setInterval(() => {
  const cleaned = cleanupStaleSessions();
  if (cleaned > 0) {
    log('INFO', `Cleaned up ${cleaned} stale sessions`);
  }
}, 5 * 60 * 1000); // Every 5 minutes

/**
 * Error handling middleware
 */
app.use((err, req, res, next) => {
  log('ERROR', `Unhandled error: ${err.message}`);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path
  });
});

/**
 * Start server
 */
app.listen(PORT, async () => {
  log('INFO', `Rosa 2.0 WhatsApp Bot started on port ${PORT}`);
  log('INFO', `Webhook URL: http://localhost:${PORT}/webhook`);
  log('INFO', `Status URL: http://localhost:${PORT}/status`);
  log('INFO', `Environment: ${process.env.NODE_ENV || 'development'}`);

  // Initialize Wbuy product catalog
  try {
    await initAgent();
    log('INFO', 'Wbuy product catalog loaded successfully');
  } catch (error) {
    log('WARN', `Failed to load Wbuy catalog: ${error.message}. Using fallback products.`);
  }
});

/**
 * Graceful shutdown
 */
process.on('SIGTERM', () => {
  log('INFO', 'SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  log('INFO', 'SIGINT received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;
