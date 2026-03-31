// Server main entry point - Updated: 2026-03-01 13:51
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();


const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const petRoutes = require('./routes/pets');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const storeApplicationRoutes = require('./routes/storeApplications');
const storeRoutes = require('./routes/stores');
const serviceRoutes = require('./routes/services');
const bookingRoutes = require('./routes/bookings');
const uploadRoutes = require('./routes/uploads');
const inventoryRoutes = require('./routes/inventory');
const chatRoutes = require('./routes/chats');
const cartRoutes = require('./routes/cart');
const adoptionRoutes = require('./routes/adoption');
const notificationRoutes = require('./routes/notifications');
const dssRoutes = require('./routes/dss');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Passport initialization
const passport = require('./config/passport');
app.use(passport.initialize());

// Database Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected successfully');
    if (process.env.NODE_ENV !== 'production') {
      console.log('📧 Database URI:', process.env.MONGODB_URI);
    }

    // Check if users exist
    const User = require('./models/User');
    User.countDocuments()
      .then(count => {
        console.log('👥 Total users in database:', count);
        if (count === 0) {
          console.log('⚠️ No users found in database - need to create users');
        } else {
          console.log('✅ Users found in database');
        }
      })
      .catch(err => {
        console.log('❌ Error counting users:', err);
      });
  })
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error.message);
    if (!isProduction) {
      console.log('📧 Attempted to connect to:', process.env.MONGODB_URI);
    }
    // Don't kill the server here - let it listen anyway so Render can at least check the port!
  });

// Routes - Admin routes first to prevent conflicts
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin/chats', require('./middleware/auth').authenticate, require('./routes/adminChats'));
app.use('/api/admin/pets', require('./routes/adminPets'));
app.use('/api/admin/products', require('./routes/adminProducts'));
app.use('/api/admin/services', require('./routes/adminServices'));
app.use('/api/admin/orders', require('./routes/adminOrders'));
app.use('/api/admin/bookings', require('./routes/adminBookings'));
app.use('/api/admin/vouchers', require('./routes/adminVouchers'));
app.use('/api/admin/reports', require('./routes/adminReports'));
app.use('/api/pets', petRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/store-applications', storeApplicationRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/adoption', adoptionRoutes);
app.use('/api/payment', require('./routes/payment'));
app.use('/api/archive', require('./routes/archive'));
app.use('/api/notifications', notificationRoutes);
app.use('/api/vouchers', require('./routes/vouchers'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/support', require('./routes/support'));
app.use('/api/dss', dssRoutes);
app.use('/api/payouts', require('./routes/payout'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/social', require('./routes/social'));
app.use('/api/pet-profiles', require('./routes/petProfiles'));

// Serve static files from React app
const buildPaths = [
  path.join(__dirname, 'client/build'),
  path.join(__dirname, 'client/dist'),
  path.join(__dirname, 'build'),
  path.join(__dirname, 'dist')
];

let buildPath = buildPaths.find(p => require('fs').existsSync(p));

const isProduction = process.env.NODE_ENV && process.env.NODE_ENV.toLowerCase() === 'production';
console.log(`🚀 Mode: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
console.log(`📂 Working Dir: ${process.cwd()}`);

if (isProduction) {
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
  
  if (buildPath) {
    console.log('✅ Found build folder at:', buildPath);
    app.use(express.static(buildPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(buildPath, 'index.html'));
    });
  } else {
    // List files to find where they went!
    const filesInRoot = require('fs').readdirSync(__dirname);
    console.log('❌ Build folder NOT found. Files in root:', filesInRoot.join(', '));
    if (require('fs').existsSync(path.join(__dirname, 'client'))) {
      const clientFiles = require('fs').readdirSync(path.join(__dirname, 'client'));
      console.log('📂 Files in client folder:', clientFiles.join(', '));
    }
    
    app.get('/', (req, res) => {
      res.status(200).send('Server is running, but UI build folder was not found. Please check logs.');
    });
  }
} else {
  app.get('/', (req, res) => {
    res.send('API is running. If you are on Render, set NODE_ENV to production.');
  });
}

// Ensure we prioritize Render's PORT environment variable
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server is running on port ${PORT}`);
    console.log(`🌐 Bound to 0.0.0.0 for deployment visibility`);
});

server.on('error', (err) => {
    console.error('❌ Server startup error:', err);
    process.exit(1);
});
