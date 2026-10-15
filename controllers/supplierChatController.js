const chat = require('../services/supplierChatService');

const handle = fn => async (req, res) => {
  try { await fn(req, res); } catch (error) {
    if (!error.status) console.error('Supplier chat request failed:', error.code || error.message);
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Supplier messages are temporarily unavailable.' });
  }
};

const createConversation = handle(async (req, res) => {
  const conversation = await chat.createOrGetConversation(req.user, req.body);
  res.json({ conversation });
});
const listConversations = handle(async (req, res) => {
  res.json({ conversations: await chat.listConversations(req.user) });
});
const listMessages = handle(async (req, res) => {
  res.json(await chat.listMessages(req.user, req.params.id, req.query));
});
const sendMessage = handle(async (req, res) => {
  const result = await chat.sendMessage(req.user, req.params.id, req.body, req.app.get('socketio'));
  res.status(result.created ? 201 : 200).json(result);
});
const markRead = handle(async (req, res) => {
  res.json({ markedRead: await chat.markRead(req.user, req.params.id, req.app.get('socketio')) });
});

module.exports = { createConversation, listConversations, listMessages, sendMessage, markRead };
