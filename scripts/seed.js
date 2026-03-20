const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import models
const User = require('../models/User');
const Pet = require('../models/Pet');
const Product = require('../models/Product');

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const seedData = async () => {
  try {
    // Clear existing data
    await User.deleteMany({});
    await Pet.deleteMany({});
    await Product.deleteMany({});

    console.log('Cleared existing data');

    // Create users
    const users = [
      {
        username: 'superadmin',
        email: 'super@test.com',
        password: 'password123',
        firstName: 'Super',
        lastName: 'Admin',
        role: 'super_admin'
      },
      {
        username: 'admin',
        email: 'admin@test.com',
        password: 'password123',
        firstName: 'Store',
        lastName: 'Admin',
        role: 'admin'
      },
      {
        username: 'customer',
        email: 'customer@test.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
        role: 'customer',
        address: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zipCode: '12345',
          country: 'USA'
        }
      }
    ];

    const createdUsers = await User.create(users);
    console.log('Created users:', createdUsers.length);

    // Get admin user for adding pets/products
    const adminUser = createdUsers.find(u => u.role === 'admin');

    // Create pets
    const pets = [
      {
        name: 'Buddy',
        species: 'dog',
        breed: 'Golden Retriever',
        age: 2,
        ageUnit: 'years',
        gender: 'male',
        size: 'large',
        color: 'Golden',
        description: 'Friendly and energetic Golden Retriever looking for a loving home. Great with kids and other pets.',
        price: 800,
        vaccinationStatus: 'fully_vaccinated',
        healthStatus: 'excellent',
        addedBy: adminUser._id
      },
      {
        name: 'Luna',
        species: 'cat',
        breed: 'Persian',
        age: 1,
        ageUnit: 'years',
        gender: 'female',
        size: 'small',
        color: 'White',
        description: 'Beautiful Persian cat with calm temperament. Perfect for indoor living.',
        price: 600,
        vaccinationStatus: 'fully_vaccinated',
        healthStatus: 'excellent',
        addedBy: adminUser._id
      },
      {
        name: 'Max',
        species: 'dog',
        breed: 'German Shepherd',
        age: 3,
        ageUnit: 'years',
        gender: 'male',
        size: 'large',
        color: 'Black and Tan',
        description: 'Loyal and intelligent German Shepherd. Well-trained and protective.',
        price: 1000,
        vaccinationStatus: 'fully_vaccinated',
        healthStatus: 'excellent',
        addedBy: adminUser._id
      },
      {
        name: 'Bella',
        species: 'cat',
        breed: 'Siamese',
        age: 2,
        ageUnit: 'years',
        gender: 'female',
        size: 'medium',
        color: 'Cream',
        description: 'Playful Siamese cat with striking blue eyes. Very social and vocal.',
        price: 500,
        vaccinationStatus: 'fully_vaccinated',
        healthStatus: 'good',
        addedBy: adminUser._id
      },
      {
        name: 'Charlie',
        species: 'dog',
        breed: 'Beagle',
        age: 1,
        ageUnit: 'years',
        gender: 'male',
        size: 'medium',
        color: 'Tricolor',
        description: 'Adorable Beagle puppy with lots of energy. Great family dog.',
        price: 700,
        vaccinationStatus: 'partially_vaccinated',
        healthStatus: 'good',
        addedBy: adminUser._id
      }
    ];

    const createdPets = await Pet.create(pets);
    console.log('Created pets:', createdPets.length);

    // Create products
    const products = [
      {
        name: 'Premium Dog Food',
        category: 'food',
        description: 'High-quality dog food with all essential nutrients for adult dogs.',
        price: 45.99,
        stockQuantity: 50,
        brand: 'PremiumPet',
        weight: 10,
        weightUnit: 'kg',
        suitableFor: ['dog'],
        addedBy: adminUser._id
      },
      {
        name: 'Interactive Cat Toy',
        category: 'toys',
        description: 'Electronic interactive toy to keep your cat entertained for hours.',
        price: 12.99,
        stockQuantity: 100,
        brand: 'FunPets',
        suitableFor: ['cat'],
        addedBy: adminUser._id
      },
      {
        name: 'Dog Leash and Collar Set',
        category: 'accessories',
        description: 'Durable leash and collar set with reflective material for night safety.',
        price: 25.99,
        stockQuantity: 75,
        brand: 'SafeWalk',
        suitableFor: ['dog'],
        addedBy: adminUser._id
      },
      {
        name: 'Cat Grooming Kit',
        category: 'grooming',
        description: 'Complete grooming kit for cats including brush, nail clippers, and shampoo.',
        price: 35.99,
        stockQuantity: 60,
        brand: 'GroomPro',
        suitableFor: ['cat'],
        addedBy: adminUser._id
      },
      {
        name: 'Pet Carrier',
        category: 'housing',
        description: 'Comfortable and secure pet carrier for travel. Available in multiple sizes.',
        price: 89.99,
        stockQuantity: 30,
        brand: 'TravelPet',
        suitableFor: ['dog', 'cat'],
        addedBy: adminUser._id
      },
      {
        name: 'Dog Training Treats',
        category: 'training',
        description: 'Delicious training treats perfect for rewarding good behavior.',
        price: 8.99,
        stockQuantity: 200,
        brand: 'TrainWell',
        suitableFor: ['dog'],
        addedBy: adminUser._id
      }
    ];

    const createdProducts = await Product.create(products);
    console.log('Created products:', createdProducts.length);

    console.log('\n=== Database Seeded Successfully ===');
    console.log('\nDemo Accounts:');
    console.log('Super Admin: super@test.com / password123');
    console.log('Admin (Store Owner): admin@test.com / password123');
    console.log('Customer: customer@test.com / password123');
    
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    mongoose.disconnect();
  }
};

seedData();
