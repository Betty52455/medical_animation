import React from 'react';
import { Form, Input, Button, Card, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';

const Login = () => {
    const navigate = useNavigate();

    const onFinish = async (values) => {
        try {
            const res = await api.post('/auth/login', values);
            localStorage.setItem('token', res.data.token);
            localStorage.setItem('username', res.data.username);
            localStorage.setItem('role', res.data.role);
            message.success('登录成功');
            navigate('/');
        } catch (err) {
            message.error(err.response?.data?.error || '登录失败');
        }
    };

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f0f2f5' }}>
            <Card title="用户登录" style={{ width: 300 }}>
                <Form
                    name="login"
                    onFinish={onFinish}
                >
                    <Form.Item
                        name="username"
                        rules={[{ required: true, message: '请输入用户名！' }]}
                    >
                        <Input prefix={<UserOutlined />} placeholder="用户名" />
                    </Form.Item>
                    <Form.Item
                        name="password"
                        rules={[{ required: true, message: '请输入密码！' }]}
                    >
                        <Input.Password prefix={<LockOutlined />} placeholder="密码" />
                    </Form.Item>

                    <Form.Item>
                        <Button type="primary" htmlType="submit" style={{ width: '100%' }}>
                            登录
                        </Button>
                    </Form.Item>
                    <div style={{ textAlign: 'center' }}>
                        <span style={{ color: '#666' }}>还没有账号？</span>
                        <Link to="/register">
                            <Button type="link" style={{ fontSize: 16, fontWeight: 600, padding: '0 4px' }}>
                                立即注册
                            </Button>
                        </Link>
                    </div>
                </Form>
            </Card>
        </div>
    );
};

export default Login;
