import React from 'react';
import { Form, Input, Button, Card, message } from 'antd';
import { LockOutlined, CrownOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../api';

/**
 * 管理员专用登录页面
 * 独立于普通用户登录，使用专属 URL: /admin-login
 */
const AdminLogin = () => {
    const navigate = useNavigate();

    const onFinish = async (values) => {
        try {
            const res = await api.post('/auth/login', values);
            // 验证是否为管理员
            if (res.data.role !== 'admin') {
                message.error('该账号不是管理员，无法登录管理后台');
                return;
            }
            localStorage.setItem('token', res.data.token);
            localStorage.setItem('username', res.data.username);
            localStorage.setItem('role', res.data.role);
            message.success('管理员登录成功');
            navigate('/admin');
        } catch (err) {
            message.error(err.response?.data?.error || '登录失败');
        }
    };

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        }}>
            <Card
                style={{
                    width: 380,
                    borderRadius: 12,
                    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                }}
            >
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <CrownOutlined style={{ fontSize: 48, color: '#faad14' }} />
                    <h2 style={{ margin: '12px 0 4px', color: '#333' }}>管理后台登录</h2>
                    <p style={{ color: '#999', fontSize: 13 }}>趣味科普网 · 管理员专用</p>
                </div>

                <Form name="admin_login" onFinish={onFinish}>
                    <Form.Item
                        name="username"
                        rules={[{ required: true, message: '请输入管理员用户名' }]}
                    >
                        <Input
                            prefix={<CrownOutlined style={{ color: '#faad14' }} />}
                            placeholder="管理员用户名"
                            size="large"
                        />
                    </Form.Item>
                    <Form.Item
                        name="password"
                        rules={[{ required: true, message: '请输入密码' }]}
                    >
                        <Input.Password
                            prefix={<LockOutlined />}
                            placeholder="密码"
                            size="large"
                        />
                    </Form.Item>
                    <Form.Item>
                        <Button type="primary" htmlType="submit" size="large" block
                            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none', height: 44 }}
                        >
                            登录管理后台
                        </Button>
                    </Form.Item>
                </Form>
            </Card>
        </div>
    );
};

export default AdminLogin;
