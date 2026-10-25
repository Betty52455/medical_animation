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
  // 登录和注册自己的 401 应交给页面展示，只有受保护接口的 401 才清除会话。
  (error) => {
    if (error.response) {
      const isAuthRequest = error.config?.url?.startsWith('/auth/');
      if (error.response.status === 401 && !isAuthRequest) {
        // Token 过期或无效，清除本地存储并重定向到登录页
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        localStorage.removeItem('role');
        const loginPath = window.location.pathname.startsWith('/admin') ? '/admin-login' : '/login';
        if (window.location.pathname !== loginPath) {
          window.location.href = loginPath;
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
