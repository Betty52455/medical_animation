import React, { useState } from 'react';
import { Form, Input, Button, Card, message, Alert } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';

/**
 * 用户注册页面
 *
 * 注册规则：
 * 1. 用户名：以字母开头，只能包含字母、数字、下划线、中文字符
 * 2. 密码：至少 15 个字符，不能是常见或规律性密码
 * 3. 需要二次确认密码
 */
const Register = () => {
    const navigate = useNavigate();
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);

    // onFinish 提交注册请求，并将服务端的密码错误显示在密码输入框下方。
    const onFinish = async (values) => {
        setSubmitting(true);
        try {
            await api.post('/auth/register', values);
            message.success('注册成功！请登录。');
            navigate('/login');
        } catch (err) {
            const error = err.response?.data?.error || '注册失败';
            if (err.response?.data?.field === 'password') {
                form.setFields([{ name: 'password', errors: [error] }]);
            } else {
                message.error(error);
            }
        } finally {
            setSubmitting(false);
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
                            <li>密码至少 <strong>15 个字符</strong>，不要用连续或重复字符；推荐容易记住的长短语</li>
                        </ul>
                    }
                    type="info"
                    showIcon
                    style={{ marginBottom: 20 }}
                />

                <Form
                form={form}
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
                        <Input prefix={<UserOutlined />} placeholder="用户名（字母开头）" autoComplete="username" />
                    </Form.Item>
                    <Form.Item
                        name="password"
                        rules={[
                            { required: true, message: '请输入密码！' },
                            {
                                // 客户端只做即时长度检查，最终规则始终由服务端决定。
                                validator(_, value) {
                                    if (!value) return Promise.resolve();
                                    if (Array.from(value).length < 15) return Promise.reject(new Error('密码至少需要15个字符'));
                                    if (new TextEncoder().encode(value).length > 72) return Promise.reject(new Error('密码的 UTF-8 编码不能超过72字节'));
                                    return Promise.resolve();
                                },
                            },
                        ]}
                    >
                        <Input.Password prefix={<LockOutlined />} placeholder="密码（至少15个字符）" autoComplete="new-password" />
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
                        <Input.Password prefix={<LockOutlined />} placeholder="确认密码" autoComplete="new-password" />
                    </Form.Item>

                    <Form.Item>
                        <Button type="primary" htmlType="submit" loading={submitting} style={{ width: '100%' }}>
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
