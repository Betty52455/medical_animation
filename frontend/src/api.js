import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      if (error.response.status === 401) {
        // Token 过期或无效，清除本地存储并重定向到登录页
        localStorage.clear();
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      } else if (error.response.status === 403) {
        // 权限不足 - 当前用户不是管理员
        console.warn('权限不足：当前用户没有管理员权限');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
