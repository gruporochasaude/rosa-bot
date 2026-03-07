/**
 * Rosa 2.0 WhatsApp Bot - Express Server
 * Webhook server for Evolution API integration
 */

require('dotenv').config();

const express = require('express');
const axios = require('axios');
const { processMessage, getGreetingMessage, executeMediaActions } = require('./agent');
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
  if (req.query.token !== WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { getAllSessions } = require('./sessions');
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
 * Extract text from various WhatsApp message formats
 */
function extractMessageText(message) {
  if (!message || !message.message) return null;

  const msg = message.message;

  // Plain text conversation
  if (msg.conversation) return msg.conversation;

  // Extended text message (replies, links, etc)
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;

  // Image with caption
  if (msg.imageMessage?.caption) return msg.imageMessage.caption;

  // Video with caption
  if (msg.videoMessage?.caption) return msg.videoMessage.caption;

  // Document with caption
  if (msg.documentMessage?.caption) return msg.documentMessage.caption;

  // Button response
  if (msg.buttonsResponseMessage?.selectedDisplayText) return msg.buttonsResponseMessage.selectedDisplayText;

  // List response
  if (msg.listResponseMessage?.title) return msg.listResponseMessage.title;

  return null;
}

/**
 * Extract message data from various Evolution API payload formats
 */
function extractMessageFromWebhook(body) {
  // Log full payload for debugging
  log('DEBUG', `Webhook body keys: ${Object.keys(body).join(', ')}`);

  const event = body.event;
  let messageData = null;

  // Format 1: { event, data: { messages: [...] } }
  if (body.data?.messages && Array.isArray(body.data.messages)) {
    messageData = body.data.messages[0];
    log('DEBUG', 'Format: data.messages[]');
  }
  // Format 2: { event, data: [...] } (data is the array)
  else if (Array.isArray(body.data)) {
    messageData = body.data[0];
    log('DEBUG', 'Format: data[]');
  }
  // Format 3: { event, data: { key, message, ... } } (data is the message)
  else if (body.data?.key) {
    messageData = body.data;
    log('DEBUG', 'Format: data as message');
  }
  // Format 4: { event, instance, data: [...] } (Evolution v2 common)
  else if (body.instance && body.data) {
    if (Array.isArray(body.data)) {
      messageData = body.data[0];
    } else if (body.data.key) {
      messageData = body.data;
    }
    log('DEBUG', `Format: with instance, data type: ${typeof body.data}`);
  }

  if (messageData) {
    log('DEBUG', `Message key: ${JSON.stringify(messageData.key || {})}`);
    log('DEBUG', `Message types: ${Object.keys(messageData.message || {}).join(', ')}`);
  } else {
    log('WARN', `Could not extract message. Body: ${JSON.stringify(body).substring(0, 500)}`);
  }

  return { event, messageData };
}

/**
 * Main webhook endpoint for Evolution API
 */
app.post('/webhook', async (req, res) => {
  try {
    const { event, messageData } = extractMessageFromWebhook(req.body);

    log('INFO', `Webhook received: ${event}`);

    // Handle different event types
    switch (event) {
      case 'messages.upsert': {
        if (!messageData) {
          log('WARN', 'No message data found in webhook payload');
          return res.status(200).json({ success: false, message: 'No message data' });
        }

        // Skip messages sent by the bot itself
        if (messageData.key?.fromMe) {
          log('DEBUG', 'Skipping own message');
          return res.status(200).json({ success: true, skipped: true });
        }

        // Extract text from message
        const text = extractMessageText(messageData);
        if (!text) {
          log('DEBUG', `No text content in message. Types: ${Object.keys(messageData.message || {}).join(', ')}`);
          return res.status(200).json({ success: true, noText: true });
        }

        // Process the text message
        const phoneNumber = messageData.key.remoteJid.replace('@s.whatsapp.net', '');
        log('INFO', `Message from ${phoneNumber}: ${text.substring(0, 100)}`);

        // Respond to webhook immediately, process in background
        res.status(200).json({ success: true, processing: true });

        // Process message asynchronously (don't await in the response)
        handleTextMessage(phoneNumber, text).catch(err => {
          log('ERROR', `Background message processing failed: ${err.message}`);
        });
        return;
      }

      case 'connection.update': {
        const status = req.body.data?.state || req.body.data?.connection || 'unknown';
        log('INFO', `Connection status: ${status}`);
        return res.status(200).json({ success: true });
      }

      default:
        log('DEBUG', `Event type: ${event}`);
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
async function handleTextMessage(phoneNumber, text) {
  try {
    log('INFO', `Processing message from ${phoneNumber}...`);

    // Get or create session
    const session = getSession(phoneNumber);

    // Process message with AI
    const response = await processMessage(phoneNumber, text);

    if (!response.success) {
      log('ERROR', `Failed to process message: ${response.error}`);
      // Send error message to user
      await sendTextMessage(phoneNumber, 'Desculpe, estou com um probleminha tÃ©cnico. Pode tentar novamente em alguns instantes? ð');
      return;
    }

    // Send response via Evolution API
    await sendTextMessage(phoneNumber, response.message);
    log('INFO', `Response sent to ${phoneNumber}: ${response.message.substring(0, 100)}...`);

    // Execute any media sends (images)
    if (response.toolCalls && response.toolCalls.length > 0) {
      await executeMediaActions(phoneNumber, response.toolCalls);
    }

  } catch (error) {
    log('ERROR', `Error handling text message from ${phoneNumber}: ${error.message}`);
    log('ERROR', `Stack: ${error.stack}`);
    // Try to send error message
    try {
      await sendTextMessage(phoneNumber, 'Ops! Tive um probleminha aqui. Tenta de novo? ð');
    } catch (sendError) {
      log('ERROR', `Failed to send error message: ${sendError.message}`);
    }
  }
}

/**
 * Send text message via Evolution API
 */
async function sendTextMessage(phoneNumber, message) {
  try {
    const url = `${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`;
    log('DEBUG', `Sending message to ${phoneNumber} via ${url}`);

    const response = await axios.post(
      url,
      {
        number: phoneNumber,
        text: message
      },
      {
        headers: {
          'apikey': EVOLUTION_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    log('INFO', `Text message sent to ${phoneNumber} (status: ${response.status})`);
    return response.data;

  } catch (error) {
    const errDetails = error.response
      ? `Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data).substring(0, 200)}`
      : error.message;
    log('ERROR', `Failed to send text message to ${phoneNumber}: ${errDetails}`);
    throw error;
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

    const greeting = getGreetingMessage();
    const session = getSession(phoneNumber);
    session.addMessage('assistant', greeting);

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
 * Scheduled cleanup of stale sessions
 */
setInterval(() => {
  const cleaned = cleanupStaleSessions();
  if (cleaned > 0) {
    log('INFO', `Cleaned up ${cleaned} stale sessions`);
  }
}, 5 * 60 * 1000);

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
app.listen(PORT, () => {
  log('INFO', `Rosa 2.0 WhatsApp Bot started on port ${PORT}`);
  log('INFO', `Webhook URL: http://localhost:${PORT}/webhook`);
  log('INFO', `Status URL: http://localhost:${PORT}/status`);
  log('INFO', `Environment: ${process.env.NODE_ENV || 'development'}`);
  log('INFO', `Evolution API: ${EVOLUTION_API_URL}`);
  log('INFO', `Instance: ${INSTANCE_NAME}`);
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

// Catch unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  log('ERROR', `Unhandled Rejection: ${reason}`);
});

module.exports = app;
