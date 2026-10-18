import React from 'react';
import { Form, Input, Button, Card, message, Alert } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';

/**
 * 用户注册页面
 * 
 * 注册规则：
 * 1. 用户名：以字母开头，只能包含字母、数字、下划线、中文字符
 * 2. 密码：6 位以上
 * 3. 需要二次确认密码
 */
const Register = () => {
    const navigate = useNavigate();

    const onFinish = async (values) => {
        try {
            await api.post('/auth/register', values);
            message.success('注册成功！请登录。');
            navigate('/login');
        } catch (err) {
            message.error(err.response?.data?.error || '注册失败');
        }
    };

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f0f2f5' }}>
            <Card title="用户注册" style={{ width: 400 }}>
                {/* 注册规则提示 */}
                <Alert
                    message="注册说明"
                    description={
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                            <li>用户名以<strong>字母开头</strong>，可包含字母、数字、下划线、中文</li>
                            <li>密码至少 <strong>6 位</strong></li>
                        </ul>
                    }
                    type="info"
                    showIcon
                    style={{ marginBottom: 20 }}
                />

                <Form
                    name="register"
                    onFinish={onFinish}
                >
                    <Form.Item
                        name="username"
                        rules={[
                            { required: true, message: '请输入用户名！' },
                            {
                                pattern: /^[a-zA-Z][a-zA-Z0-9_\u4e00-\u9fa5]*$/,
                                message: '用户名必须以字母开头，只能包含字母、数字、下划线或中文',
                            },
                        ]}
                    >
                        <Input prefix={<UserOutlined />} placeholder="用户名（字母开头）" />
                    </Form.Item>
                    <Form.Item
                        name="password"
                        rules={[
                            { required: true, message: '请输入密码！' },
                            { min: 6, message: '密码至少6位！' },
                        ]}
                    >
                        <Input.Password prefix={<LockOutlined />} placeholder="密码（至少6位）" />
                    </Form.Item>
                    <Form.Item
                        name="confirm_password"
                        dependencies={['password']}
                        hasFeedback
                        rules={[
                            { required: true, message: '请确认密码！' },
                            ({ getFieldValue }) => ({
                                validator(_, value) {
                                    if (!value || getFieldValue('password') === value) {
                                        return Promise.resolve();
                                    }
                                    return Promise.reject(new Error('两次输入的密码不一致！'));
                                },
                            }),
                        ]}
                    >
                        <Input.Password prefix={<LockOutlined />} placeholder="确认密码" />
                    </Form.Item>

                    <Form.Item>
                        <Button type="primary" htmlType="submit" style={{ width: '100%' }}>
                            注册
                        </Button>
                        已有账号？ <Link to="/login">立即登录</Link>
                    </Form.Item>
                </Form>
            </Card>
        </div>
    );
};

export default Register;
