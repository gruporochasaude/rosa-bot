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
 * Main webhook endpoint for Evolution API
 */
app.post('/webhook', async (req, res) => {
  try {
    const { event, data } = req.body;

    log('INFO', `Webhook received: ${event}`);

    // Handle different event types
    switch (event) {
      case 'messages.upsert': {
        const message = data.messages?.[0];
        if (!message) {
          return res.status(200).json({ success: false, message: 'No message data' });
        }

        // Only process text messages from users (not from bot)
        if (message.key.fromMe) {
          return res.status(200).json({ success: true, skipped: true });
        }

        if (message.message?.conversation) {
          return await handleTextMessage(message);
        }

        return res.status(200).json({ success: true });
      }

      case 'connection.update': {
        const statusMessage = data?.connection || 'unknown';
        log('INFO', `Connection status: ${statusMessage}`);
        return res.status(200).json({ success: true });
      }

      default:
        log('WARN', `Unknown event type: ${event}`);
        return res.status(200).json({ success: true });
    }

  } catch (error) {
    log('ERROR', `Webhook error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }

  // Always return 200 to acknowledge receipt
  res.status(200).json({ success: true });
});

/**
 * Handle incoming text message
 */
async function handleTextMessage(message) {
  try {
    const phoneNumber = message.key.remoteJid.replace('@s.whatsapp.net', '');
    const userMessage = message.message.conversation.trim();

    log('INFO', `Message from ${phoneNumber}: ${userMessage.substring(0, 50)}`);

    // Get or create session
    const session = getSession(phoneNumber);
    const isFirstMessage = session.conversationHistory.length === 0;

    // Process message with AI
    const response = await processMessage(phoneNumber, userMessage);

    if (!response.success) {
      log('ERROR', `Failed to process message: ${response.error}`);
    }

    // Send response via Evolution API
    await sendTextMessage(phoneNumber, response.message);

    // Execute any media sends (images)
    if (response.toolCalls && response.toolCalls.length > 0) {
      await executeMediaActions(phoneNumber, response.toolCalls);
    }

    log('INFO', `Response sent to ${phoneNumber}`);

    return {
      success: true,
      phoneNumber,
      messageProcessed: true
    };

  } catch (error) {
    log('ERROR', `Error handling text message: ${error.message}`);
    throw error;
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
    log('ERROR', `Failed to send text message: ${error.message}`);
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
