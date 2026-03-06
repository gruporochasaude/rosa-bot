const sessions = new Map();
const SESSION_TIMEOUT = 2 * 60 * 60 * 1000;

function getSession(phoneNumber) {
    const session = sessions.get(phoneNumber);
    if (session && Date.now() - session.lastActivity < SESSION_TIMEOUT) {
          session.lastActivity = Date.now();
          return session;
    }
    const newSession = { messages: [], lastActivity: Date.now(), phoneNumber };
    sessions.set(phoneNumber, newSession);
    return newSession;
}

function addMessage(phoneNumber, role, content) {
    const session = getSession(phoneNumber);
    session.messages.push({ role, content });
    session.lastActivity = Date.now();
    if (session.messages.length > 20) {
          session.messages = session.messages.slice(-20);
    }
}

function getMessages(phoneNumber) {
    const session = getSession(phoneNumber);
    return session.messages;
}

setInterval(() => {
    const now = Date.now();
    for (const [phone, session] of sessions.entries()) {
          if (now - session.lastActivity > SESSION_TIMEOUT) {
                  sessions.delete(phone);
          }
    }
}, 30 * 60 * 1000);

module.exports = { getSession, addMessage, getMessages };
