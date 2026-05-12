import axios from 'axios';
import Cookies from 'js-cookie';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:3000/api` : 'http://localhost:3000/api');

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = Cookies.get('token');
    const restaurantId = Cookies.get('restaurantId');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    if (restaurantId) {
      config.headers['X-Restaurant-ID'] = restaurantId;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

export default api;
