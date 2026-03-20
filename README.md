# PetStore Platform

A comprehensive petstore platform with role-based access control (Super Admin, Admin, Customer) built with Node.js, Express, MongoDB, and React.

## Features

### Role-Based Access Control
- **Super Admin**: Full system access, user management, system configuration
- **Admin**: Pet and product management, order processing
- **Customer**: Browse pets/products, place orders, manage profile

### Core Functionality
- **Pet Management**: Add, edit, delete pets with detailed information
- **Product Management**: Inventory management with stock tracking
- **Order Processing**: Complete order lifecycle from cart to delivery
- **User Authentication**: Secure login/registration with JWT
- **Responsive Design**: Mobile-friendly SPA with modern UI

### Technical Features
- MVC Architecture
- RESTful API
- JWT Authentication
- Role-based Authorization
- Real-time Cart Management
- Search & Filtering
- Pagination
- Form Validation
- Error Handling

## Tech Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database
- **Mongoose** - ODM
- **JWT** - Authentication
- **bcryptjs** - Password hashing
- **express-validator** - Input validation

### Frontend
- **React** - UI library
- **React Router** - Navigation
- **Tailwind CSS** - Styling
- **Lucide React** - Icons
- **React Toastify** - Notifications
- **Axios** - HTTP client

## Installation

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (running locally or connection string)
- npm or yarn

### Backend Setup

1. Clone the repository
2. Navigate to project root
3. Install dependencies:
```bash
npm install
```

4. Create `.env` file in root:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/petstore
JWT_SECRET=your_jwt_secret_key_here_change_in_production
NODE_ENV=development
```

5. Start the backend server:
```bash
npm run server
```

### Frontend Setup

1. Navigate to client directory:
```bash
cd client
```

2. Install dependencies:
```bash
npm install
```

3. Start the frontend development server:
```bash
npm start
```

### Quick Start

Install all dependencies at once:
```bash
npm run install-all
```

Start both backend and frontend:
```bash
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update profile
- `PUT /api/auth/change-password` - Change password

### Pets
- `GET /api/pets` - Get all pets (with filtering)
- `GET /api/pets/:id` - Get pet by ID
- `POST /api/pets` - Create pet (Admin only)
- `PUT /api/pets/:id` - Update pet (Admin only)
- `DELETE /api/pets/:id` - Delete pet (Admin only)

### Products
- `GET /api/products` - Get all products (with filtering)
- `GET /api/products/:id` - Get product by ID
- `POST /api/products` - Create product (Admin only)
- `PUT /api/products/:id` - Update product (Admin only)
- `DELETE /api/products/:id` - Delete product (Admin only)
- `PATCH /api/products/:id/stock` - Update stock (Admin only)

### Orders
- `GET /api/orders` - Get orders (filtered by role)
- `GET /api/orders/:id` - Get order by ID
- `POST /api/orders` - Create order (Customer only)
- `PATCH /api/orders/:id/status` - Update order status (Admin only)
- `PATCH /api/orders/:id/cancel` - Cancel order

### Users
- `GET /api/users` - Get all users (Admin only)
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user (Super Admin only)
- `PATCH /api/users/:id/toggle-status` - Toggle user status (Super Admin only)

## Database Schema

### Users
- Basic user information with roles
- Address and contact details
- Account status management

### Pets
- Pet details (species, breed, age, etc.)
- Health and vaccination status
- Pricing and availability
- Image storage support

### Products
- Product information and categorization
- Inventory and stock management
- Pricing and specifications
- Suitable pet types

### Orders
- Order items (pets and products)
- Customer and shipping information
- Payment and order status tracking
- Order history

## Default Demo Accounts

After setting up the database, you can create these demo accounts:

### Customer Account
- Email: customer@test.com
- Password: password123
- Role: customer

### Admin Account
- Email: admin@test.com
- Password: password123
- Role: admin

### Super Admin Account
- Email: super@test.com
- Password: password123
- Role: super_admin

## Project Structure

```
petshop_platform/
├── models/                 # Database models
├── controllers/            # API controllers
├── routes/                # API routes
├── middleware/            # Custom middleware
├── client/                # React frontend
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   ├── contexts/      # React contexts
│   │   ├── pages/         # Page components
│   │   ├── services/      # API services
│   │   └── utils/         # Utility functions
│   └── public/            # Static files
├── server.js              # Express server
├── package.json           # Dependencies
└── README.md             # This file
```

## Features Implementation

### Authentication & Authorization
- JWT-based authentication
- Role-based access control middleware
- Protected routes and API endpoints
- Password hashing with bcrypt

### Shopping Cart
- Client-side cart management with localStorage
- Add/remove items with quantity controls
- Real-time price calculations
- Cart persistence across sessions

### Order Management
- Complete order lifecycle
- Order status tracking
- Payment method support
- Shipping address management

### Admin Features
- Dashboard with statistics
- Pet and product CRUD operations
- Order management and status updates
- User management (Super Admin)

### Customer Features
- Browse and search pets/products
- Shopping cart functionality
- Order placement and tracking
- Profile management

## Development

### Running Tests
```bash
npm test
```

### Building for Production
```bash
npm run build
```

### Environment Variables
Make sure to set these environment variables:

- `PORT` - Server port (default: 5000)
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - JWT secret key
- `NODE_ENV` - Environment (development/production)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support and questions, please open an issue in the repository.
