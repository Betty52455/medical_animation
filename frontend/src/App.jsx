import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/Layout';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Admin from './pages/Admin';
import AdminLogin from './pages/AdminLogin';

// 需要登录才能访问的路由守卫
const PrivateRoute = ({ children, adminOnly = false }) => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  
  if (!token) return <Navigate to={adminOnly ? "/admin-login" : "/login"} replace />;
  if (adminOnly && role !== 'admin') return <Navigate to="/" replace />;
  
  return children;
};

function App() {
  return (
    <Router>
      <Routes>
        {/* 用户登录/注册 */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        
        {/* 管理员专用登录页面 */}
        <Route path="/admin-login" element={<AdminLogin />} />
        
        {/* 管理员后台（独立页面，不嵌套在主布局中） */}
        <Route 
          path="/admin" 
          element={
            <PrivateRoute adminOnly={true}>
              <Admin />
            </PrivateRoute>
          } 
        />

        {/* 主站布局 */}
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Home />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
