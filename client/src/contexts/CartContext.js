import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { cartService } from '../services/apiService';

const CartContext = createContext();

const cartReducer = (state, action) => {
  switch (action.type) {
    case 'ADD_TO_CART':
      const existingItem = state.items.find(item =>
        item.itemId === action.payload.itemId && item.itemType === action.payload.itemType
      );

      if (existingItem) {
        return {
          ...state,
          items: state.items.map(item =>
            item.itemId === action.payload.itemId && item.itemType === action.payload.itemType
              ? {
                ...item,
                quantity: item.quantity + action.payload.quantity,
                selected: action.payload.selected !== undefined ? action.payload.selected : item.selected
              }
              : item
          )
        };
      }

      return {
        ...state,
        items: [...state.items, {
          ...action.payload,
          selected: action.payload.selected !== undefined ? action.payload.selected : false,
          userId: action.payload.userId || null,
          addedAt: new Date().toISOString()
        }]
      };

    case 'BUY_NOW':
      // Deselect ALL other items, then add/select this one
      const itemsAfterDeselect = state.items.map(item => ({ ...item, selected: false }));
      const itemToBuy = action.payload;

      const existingInDeselected = itemsAfterDeselect.find(item =>
        item.itemId === itemToBuy.itemId && item.itemType === itemToBuy.itemType
      );

      if (existingInDeselected) {
        return {
          ...state,
          items: itemsAfterDeselect.map(item =>
            item.itemId === itemToBuy.itemId && item.itemType === itemToBuy.itemType
              ? { ...item, quantity: item.quantity + itemToBuy.quantity, selected: true }
              : item
          )
        };
      }

      return {
        ...state,
        items: [...itemsAfterDeselect, {
          ...itemToBuy,
          selected: true,
          userId: itemToBuy.userId || null,
          addedAt: new Date().toISOString()
        }]
      };

    case 'REMOVE_FROM_CART':
      return {
        ...state,
        items: state.items.filter(item =>
          !(item.itemId === action.payload.itemId && item.itemType === action.payload.itemType)
        )
      };

    case 'UPDATE_QUANTITY':
      return {
        ...state,
        items: state.items.map(item =>
          item.itemId === action.payload.itemId && item.itemType === action.payload.itemType
            ? { ...item, quantity: action.payload.quantity }
            : item
        ).filter(item => item.quantity > 0)
      };

    case 'CLEAR_CART':
      return {
        ...state,
        items: []
      };

    case 'SET_CART':
      return {
        ...state,
        items: action.payload.map(item => ({ ...item, selected: item.selected || false }))
      };

    case 'TOGGLE_ITEM_SELECTION':
      console.log('TOGGLE_ITEM_SELECTION action:', action.payload);
      const updatedItems = state.items.map(item =>
        item.itemId === action.payload.itemId && item.itemType === action.payload.itemType
          ? { ...item, selected: !item.selected }
          : item
      );
      console.log('Updated items:', updatedItems);
      return {
        ...state,
        items: updatedItems
      };

    case 'SELECT_ALL_ITEMS':
      return {
        ...state,
        items: state.items.map(item => ({ ...item, selected: true }))
      };

    case 'DESELECT_ALL_ITEMS':
      return {
        ...state,
        items: state.items.map(item => ({ ...item, selected: false }))
      };

    case 'CLEAR_SELECTED_ITEMS':
      return {
        ...state,
        items: state.items.filter(item => !item.selected)
      };

    default:
      return state;
  }
};

const initialState = {
  items: []
};

export const CartProvider = ({ children }) => {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(cartReducer, initialState);
  const loadingCartRef = React.useRef(false);

  // Get user-specific cart key
  const getUserCartKey = () => {
    if (!user) return 'guest_cart';
    const userId = user._id || user.id;
    return userId ? `cart_${userId}` : 'guest_cart';
  };

  useEffect(() => {
    loadingCartRef.current = true;
    if (user) {
      console.log('CartContext - User logged in, fetching cart from database');
      cartService.getCart()
        .then(response => {
          const dbItems = response.data.items || [];
          console.log('CartContext - Loaded user cart from API:', dbItems);

          // Optionally, we could merge guest_cart items here, but to keep it simple and safe,
          // we just use the DB items as the single source of truth for logged-in users.
          dispatch({ type: 'SET_CART', payload: dbItems });
        })
        .catch(error => {
          console.error('Error fetching cart from database:', error);
          // Fallback to local storage if API fails
          const savedCart = localStorage.getItem(getUserCartKey());
          if (savedCart) {
            try {
              dispatch({ type: 'SET_CART', payload: JSON.parse(savedCart) });
            } catch (e) {
              dispatch({ type: 'CLEAR_CART' });
            }
          }
        })
        .finally(() => {
          setTimeout(() => { loadingCartRef.current = false; }, 100);
        });
    } else {
      console.log('CartContext - No user logged in, using guest_cart');
      const savedCart = localStorage.getItem('guest_cart');
      if (savedCart) {
        try {
          dispatch({ type: 'SET_CART', payload: JSON.parse(savedCart) });
        } catch (e) {
          dispatch({ type: 'CLEAR_CART' });
        }
      } else {
        dispatch({ type: 'CLEAR_CART' });
      }
      setTimeout(() => { loadingCartRef.current = false; }, 100);
    }
  }, [user]);

  useEffect(() => {
    if (!loadingCartRef.current) {
      const cartKey = getUserCartKey();
      console.log('CartContext - Saving cart to localStorage:', state.items);
      localStorage.setItem(cartKey, JSON.stringify(state.items));

      // If user is logged in, securely sync their cart to their isolated database
      if (user) {
        cartService.syncCart(state.items).catch(err => {
          console.error('Failed to sync cart to database:', err);
        });
      }
    }
  }, [state.items, user]);

  const addToCart = (item) => {
    if (item.itemType === 'pet') {
      const { toast } = require('react-toastify');
      toast.info('Pets cannot be added to cart. Please use the adoption request in chat.');
      return;
    }
    dispatch({ type: 'ADD_TO_CART', payload: item });
  };

  const removeFromCart = (itemId, itemType) => {
    dispatch({ type: 'REMOVE_FROM_CART', payload: { itemId, itemType } });
  };

  const updateQuantity = (itemId, itemType, quantity) => {
    dispatch({ type: 'UPDATE_QUANTITY', payload: { itemId, itemType, quantity } });
  };

  const toggleItemSelection = (itemId, itemType) => {
    console.log('Toggling item selection:', { itemId, itemType });
    console.log('Current items:', state.items);
    dispatch({ type: 'TOGGLE_ITEM_SELECTION', payload: { itemId, itemType } });
  };

  const selectAllItems = () => {
    dispatch({ type: 'SELECT_ALL_ITEMS' });
  };

  const deselectAllItems = () => {
    dispatch({ type: 'DESELECT_ALL_ITEMS' });
  };

  const clearCart = () => {
    dispatch({ type: 'CLEAR_CART' });
  };

  const clearSelectedItems = () => {
    dispatch({ type: 'CLEAR_SELECTED_ITEMS' });
  };

  const buyNow = (item) => {
    dispatch({ type: 'BUY_NOW', payload: item });
  };

  const getSelectedItems = () => {
    return state.items.filter(item => item.selected);
  };

  const getTotalItems = () => {
    return state.items.length;
  };

  const getTotalPrice = () => {
    return state.items
      .filter(item => item.selected)
      .reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const value = {
    ...state,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    clearSelectedItems,
    toggleItemSelection,
    selectAllItems,
    deselectAllItems,
    getSelectedItems,
    getTotalItems,
    getTotalPrice,
    buyNow
  };

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
