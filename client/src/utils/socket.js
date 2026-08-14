import { io } from 'socket.io-client';

const SOCKET_URL = process.env.REACT_APP_API_URL || `${window.location.origin}/api`;
const socket = io(SOCKET_URL.replace('/api', ''), {
  autoConnect: false,
  auth: (callback) => callback({ token: localStorage.getItem('token') }),
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

export const setDeliveryCapability = (deliveryToken) => {
  socket.auth = { token: localStorage.getItem('token'), deliveryToken };
};

export const clearDeliveryCapability = () => {
  socket.auth = (callback) => callback({ token: localStorage.getItem('token') });
};

export default socket;
