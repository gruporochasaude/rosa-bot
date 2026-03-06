const express = require('express');
const { processMessage } = require('./agent');

const app = express();
app.use(express.json());

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const INSTANCE_NAME = process.env.INSTANCE_NAME || 'rocha-saude';
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.json({ status: 'ok', bot: 'Rosa - Grupo Rocha Saude', version: '1.0.0' });
});

app.post('/webhook', async (req, res) => {
    try {
          const body = req.body;
          if (body.event !== 'messages.upsert') return res.status(200).json({ ignored: true });
          const data = body.data;
          if (!data) return res.status(200).json({ ignored: true });
          if (data.key && data.key.fromMe) return res.status(200).json({ ignored: true });
          if (data.key && data.key.remoteJid && data.key.remoteJid.includes('@g.us')) return res.status(200).json({ ignored: true });
          const remoteJid = data.key?.remoteJid;
          if (!remoteJid) return res.status(200).json({ ignored: true });
          let messageText = '';
          if (data.message?.conversation) messageText = data.message.conversation;
          else if (data.message?.extendedTextMessage?.text) messageText = data.message.extendedTextMessage.text;
          else if (data.message?.imageMessage?.caption) messageText = data.message.imageMessage.caption;
          else messageText = '[Cliente enviou uma midia sem texto]';
          const phoneNumber = remoteJid.replace('@s.whatsapp.net', '');
          console.log('Mensagem de ' + phoneNumber + ': ' + messageText.substring(0, 100));
          const reply = await processMessage(phoneNumber, messageText);
          console.log('Rosa respondeu para ' + phoneNumber + ': ' + reply.substring(0, 100));
          await sendMessage(remoteJid, reply);
          res.status(200).json({ success: true });
    } catch (error) {
          console.error('Erro no webhook:', error.message);
          res.status(200).json({ error: error.message });
    }
});

async function sendMessage(remoteJid, text) {
    try {
          const response = await fetch(EVOLUTION_API_URL + '/message/sendText/' + INSTANCE_NAME, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
                  body: JSON.stringify({ number: remoteJid, text: text })
          });
          if (!response.ok) console.error('Erro ao enviar mensagem:', await response.text());
    } catch (error) {
          console.error('Erro ao enviar mensagem via Evolution API:', error.message);
    }
}

app.listen(PORT, '0.0.0.0', () => {
    console.log('Bot Rosa rodando na porta ' + PORT);
    console.log('Evolution API: ' + EVOLUTION_API_URL);
    console.log('Instancia: ' + INSTANCE_NAME);
});
