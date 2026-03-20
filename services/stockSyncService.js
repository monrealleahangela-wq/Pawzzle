const Product = require('../models/Product');
const Inventory = require('../models/Inventory');

class StockSyncService {
  /**
   * Update product stock when inventory changes
   * @param {string} productId - Product ID
   * @param {string} storeId - Store ID (optional, for multi-store sync)
   */
  static async updateProductStockFromInventory(productId, storeId = null) {
    try {
      console.log('🔧 Updating product stock from inventory:', { productId, storeId });

      let totalQuantity = 0;

      if (storeId) {
        // Get inventory for specific store
        const inventory = await Inventory.findOne({ product: productId, store: storeId, isActive: true });
        totalQuantity = inventory ? inventory.quantity : 0;
      } else {
        // Sum all inventory across all stores
        const inventories = await Inventory.find({ product: productId, isActive: true });
        totalQuantity = inventories.reduce((sum, inv) => sum + inv.quantity, 0);
      }

      // Update product stock
      await Product.findByIdAndUpdate(productId, { stockQuantity: totalQuantity });
      console.log('✅ Product stock updated:', { productId, totalQuantity });

      return totalQuantity;
    } catch (error) {
      console.error('❌ Error updating product stock from inventory:', error);
      throw error;
    }
  }

  /**
   * Update inventory when product stock changes
   * @param {string} productId - Product ID
   * @param {number} newStock - New stock quantity
   * @param {string} storeId - Store ID (optional)
   */
  static async updateInventoryFromProduct(productId, newStock, storeId = null) {
    try {
      if (storeId) {
        // Update specific store inventory
        const inventory = await Inventory.findOne({ product: productId, store: storeId, isActive: true });

        if (inventory) {
          inventory.quantity = newStock;
          inventory.lastRestocked = new Date();
          await inventory.save();
        } else {
          // Create new inventory record if it doesn't exist
          const product = await Product.findById(productId);
          await Inventory.create({
            product: productId,
            store: storeId,
            quantity: newStock,
            costPrice: product ? product.price : 0,
            isActive: true
          });
        }
      } else {
        // For multi-store, distribute stock proportionally or update first store
        const inventories = await Inventory.find({ product: productId, isActive: true });

        if (inventories.length === 0) {
          // No inventory records exist, create one with default store
          console.warn('No inventory records found for product:', productId);
          return;
        }

        // Update the first inventory record (could be enhanced for multi-store logic)
        inventories[0].quantity = newStock;
        inventories[0].lastRestocked = new Date();
        await inventories[0].save();
      }
    } catch (error) {
      console.error('Error updating inventory from product stock:', error);
      throw error;
    }
  }

  /**
   * Reduce stock when order is placed
   * @param {string} productId - Product ID
   * @param {number} quantity - Quantity to reduce
   * @param {string} storeId - Store ID
   */
  static async reduceStockOnOrder(productId, quantity, storeId) {
    try {
      console.log('🔧 Reducing stock:', { productId, quantity, storeId });

      // Update inventory
      let inventory = await Inventory.findOne({ product: productId, store: storeId, isActive: true });

      if (!inventory) {
        console.warn('⚠️ Inventory record not found, trying to fallback to product stock:', { productId, storeId });
        const product = await Product.findById(productId);
        if (!product || product.stockQuantity < quantity) {
          throw new Error('Insufficient overall stock available');
        }

        // Auto-create basic inventory for this store since product has stock
        inventory = new Inventory({
          product: productId,
          store: storeId,
          quantity: product ? product.stockQuantity : 0,
          costPrice: product ? product.price : 0,
          reorderLevel: 10,
          isActive: true
        });
        await inventory.save();
        console.log('✅ Created missing inventory record during checkout');
      }

      if (inventory.quantity < quantity) {
        console.error('❌ Insufficient stock:', { available: inventory.quantity, requested: quantity });
        throw new Error('Insufficient stock available');
      }

      inventory.quantity -= quantity;
      inventory.lastRestocked = new Date();
      await inventory.save();
      console.log('✅ Inventory updated:', { productId, newQuantity: inventory.quantity });

      // Update product stock (sum across all stores)
      await this.updateProductStockFromInventory(productId);
      console.log('✅ Stock reduction completed for product:', productId);

      return inventory.quantity;
    } catch (error) {
      console.error('❌ Error reducing stock on order:', error);
      throw error;
    }
  }

  /**
   * Add stock when inventory is restocked
   * @param {string} productId - Product ID
   * @param {number} quantity - Quantity to add
   * @param {string} storeId - Store ID
   */
  static async addStockOnRestock(productId, quantity, storeId) {
    try {
      // Update inventory
      const inventory = await Inventory.findOne({ product: productId, store: storeId, isActive: true });

      if (!inventory) {
        throw new Error('Inventory record not found for this product and store');
      }

      inventory.quantity += quantity;
      inventory.lastRestocked = new Date();
      await inventory.save();

      // Update product stock (sum across all stores)
      await this.updateProductStockFromInventory(productId);

      return inventory.quantity;
    } catch (error) {
      console.error('Error adding stock on restock:', error);
      throw error;
    }
  }

  /**
   * Get stock status for a product
   * @param {string} productId - Product ID
   * @param {string} storeId - Store ID (optional)
   */
  static async getStockStatus(productId, storeId = null) {
    try {
      const product = await Product.findById(productId);

      if (!product) {
        throw new Error('Product not found');
      }

      let inventoryQuantity = 0;
      let stockStatus = 'in_stock';

      if (storeId) {
        const inventory = await Inventory.findOne({ product: productId, store: storeId, isActive: true });
        inventoryQuantity = inventory ? inventory.quantity : 0;

        // Determine stock status based on inventory
        if (inventoryQuantity === 0) {
          stockStatus = 'out_of_stock';
        } else if (inventory && inventoryQuantity <= inventory.reorderLevel) {
          stockStatus = 'low_stock';
        } else if (inventory && inventoryQuantity >= inventory.maxStock) {
          stockStatus = 'overstock';
        }
      } else {
        // Use product stock for overall status
        inventoryQuantity = product.stockQuantity;

        if (inventoryQuantity === 0) {
          stockStatus = 'out_of_stock';
        } else if (inventoryQuantity <= 10) { // Default reorder level
          stockStatus = 'low_stock';
        }
      }

      return {
        productId,
        productName: product.name,
        totalStock: product.stockQuantity,
        storeStock: inventoryQuantity,
        stockStatus,
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error('Error getting stock status:', error);
      throw error;
    }
  }

  /**
   * Initialize inventory for a new product
   * @param {string} productId - Product ID
   * @param {string} storeId - Store ID
   * @param {number} initialStock - Initial stock quantity
   */
  static async initializeInventoryForProduct(productId, storeId, initialStock = 0) {
    try {
      // Check if inventory already exists
      const existingInventory = await Inventory.findOne({ product: productId, store: storeId });

      if (existingInventory) {
        // Update existing inventory
        existingInventory.quantity = initialStock;
        existingInventory.lastRestocked = new Date();
        await existingInventory.save();
      } else {
        // Create new inventory record
        const product = await Product.findById(productId);
        await Inventory.create({
          product: productId,
          store: storeId,
          quantity: initialStock,
          costPrice: product ? product.price : 0,
          isActive: true
        });
      }

      // Update product stock
      await this.updateProductStockFromInventory(productId);

      return true;
    } catch (error) {
      console.error('Error initializing inventory for product:', error);
      throw error;
    }
  }
}

module.exports = StockSyncService;
