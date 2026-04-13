require('dotenv').config();
// Server main entry point - Updated: 2026-04-14
const express = require('express');
const mongoose = require('mongoose');
const dns = require('dns');

// CRITICAL: Ensure DNS resolution works for Email/DB on restricted networks
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {
  console.warn('[Server] DNS override failed');
}

const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PATCH"]
  }
});

// Make io accessible to our routers/controllers
app.set('socketio', io);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Trust proxy for Render/Heroku and Enforce HTTPS in production
app.set('trust proxy', 1);
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

// Passport initialization
const passport = require('./config/passport');
app.use(passport.initialize());

// Database Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch((error) => console.error('❌ MongoDB connection error:', error));

// Debug Env (Temporal for checking Resend Key)
app.get('/api/auth/debug-env', (req, res) => {
  res.json({
    status: 'online',
    resend_key_present: !!process.env.RESEND_API_KEY,
    resend_key_length: process.env.RESEND_API_KEY ? process.env.RESEND_API_KEY.length : 0,
    node_env: process.env.NODE_ENV,
    time: new Date().toISOString()
  });
});

// Public Audit Link (Temporal)
app.get('/api/public-audit-apps', async (req, res) => {
  try {
    const StoreApplication = require('./models/StoreApplication');
    const total = await StoreApplication.countDocuments({});
    const deleted = await StoreApplication.countDocuments({ isDeleted: true });
    const statuses = await StoreApplication.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]);
    res.json({ total, deleted, statuses });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Deep Dump (Temporal)
app.get('/api/dump-apps', async (req, res) => {
  try {
    const StoreApplication = require('./models/StoreApplication');
    const apps = await StoreApplication.find({ isDeleted: false }).limit(50).select('_id status businessName createdAt');
    res.json({ count: apps.length, data: apps });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Database Debug (Temporal)
app.get('/api/db-debug', (req, res) => {
  const mongoose = require('mongoose');
  res.json({
    db_name: mongoose.connection.name,
    is_connected: mongoose.connection.readyState === 1,
    host: mongoose.connection.host
  });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/deliveries', require('./routes/delivery'));
app.use('/api/admin/chats', require('./middleware/auth').authenticate, require('./routes/adminChats'));
app.use('/api/admin/pets', require('./routes/adminPets'));
app.use('/api/admin/products', require('./routes/adminProducts'));
app.use('/api/admin/services', require('./routes/adminServices'));
app.use('/api/admin/orders', require('./routes/adminOrders'));
app.use('/api/admin/bookings', require('./routes/adminBookings'));
app.use('/api/admin/vouchers', require('./routes/adminVouchers'));
app.use('/api/admin/reports', require('./routes/adminReports'));
app.use('/api/pets', require('./routes/pets'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/store-applications', require('./routes/storeApplications'));
app.use('/api/stores', require('./routes/stores'));
app.use('/api/services', require('./routes/services'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/chats', require('./routes/chats'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/adoption', require('./routes/adoption'));
app.use('/api/payment', require('./routes/payment'));
app.use('/api/archive', require('./routes/archive'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/vouchers', require('./routes/vouchers'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/support', require('./routes/support'));
app.use('/api/dss', require('./routes/dss'));
app.use('/api/payouts', require('./routes/payout'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/social', require('./routes/social'));
app.use('/api/pet-profiles', require('./routes/petProfiles'));

// Socket.io Real-Time Handler
io.on('connection', (socket) => {
  console.log('⚡ Client connected:', socket.id);

  socket.on('joinDelivery', (deliveryId) => {
    socket.join(`delivery_${deliveryId}`);
    console.log(`📡 Client joined delivery room: delivery_${deliveryId}`);
  });

  socket.on('joinConversation', (conversationId) => {
    socket.join(`conversation_${conversationId}`);
    console.log(`📡 Client joined conversation room: conversation_${conversationId}`);
  });

  socket.on('joinStore', (storeId) => {
    socket.join(`store_${storeId}`);
    console.log(`🏠 Client joined store room: store_${storeId}`);
  });

  socket.on('joinAdmin', () => {
    socket.join('admin_global');
    console.log(`🛡️ Client joined global admin room`);
  });

  socket.on('typing', (data) => {
    // data: { conversationId, userId, userName }
    socket.to(`conversation_${data.conversationId}`).emit('userTyping', data);
  });

  socket.on('stopTyping', (data) => {
    // data: { conversationId, userId }
    socket.to(`conversation_${data.conversationId}`).emit('userStopTyping', data);
  });

  socket.on('updateLocation', (data) => {
    // data: { deliveryId, lat, lng, heading, speed }
    io.to(`delivery_${data.deliveryId}`).emit('locationUpdate', data);
  });

  socket.on('statusUpdate', (data) => {
    // data: { deliveryId, status }
    io.to(`delivery_${data.deliveryId}`).emit('statusChanged', data);
  });

  socket.on('sendMessage', (data) => {
    // data: { deliveryId, sender, content, timestamp }
    io.to(`delivery_${data.deliveryId}`).emit('newMessage', data);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected');
  });
});

// Serve static files
const buildPaths = [path.join(__dirname, 'client/build'), path.join(__dirname, 'client/dist'), path.join(__dirname, 'build'), path.join(__dirname, 'dist')];
let buildPath = buildPaths.find(p => require('fs').existsSync(p));
const isProduction = process.env.NODE_ENV && process.env.NODE_ENV.toLowerCase() === 'production';

if (isProduction && buildPath) {
  app.use(express.static(buildPath));
  app.get('*', (req, res) => res.sendFile(path.join(buildPath, 'index.html')));
} else {
  app.get('/', (req, res) => res.send('PAWZZLE API is ACTIVE. Sockets ready. Real-time enabled.'));
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 [MASTER V3] SERVER STARTUP`);
    console.log(`✅ RESEND_API_KEY: ${process.env.RESEND_API_KEY ? 'IS CONFIGURED (Length: ' + process.env.RESEND_API_KEY.length + ')' : 'MISSING'}`);
    console.log(`✅ PORT: ${PORT}\n`);
});
