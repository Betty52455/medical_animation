import React, { useState } from 'react';
import { Form, Input, Button, message } from 'antd';
import { ArrowRightOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import AuthShell from '../components/AuthShell';

/** Login 保留原有登录接口和跳转，只更新表单的反馈与版式。 */
const Login = () => {
    const navigate = useNavigate();
    const [submitting, setSubmitting] = useState(false);

    // onFinish 完成登录并在请求期间锁定提交按钮。
    const onFinish = async (values) => {
        setSubmitting(true);
        try {
            const res = await api.post('/auth/login', values);
            localStorage.setItem('token', res.data.token);
            localStorage.setItem('username', res.data.username);
            localStorage.setItem('role', res.data.role);
            message.success('登录成功');
            navigate('/');
        } catch (err) {
            message.error(err.response?.data?.error || '登录失败');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AuthShell eyebrow="ACCOUNT / 01" title="欢迎回来" subtitle="登录后继续浏览和下载科普素材">
            <Form className="auth-form" name="login" layout="vertical" requiredMark={false} onFinish={onFinish}>
                <Form.Item label="用户名" name="username" rules={[{ required: true, message: '请输入用户名' }]}>
                    <Input prefix={<UserOutlined />} placeholder="请输入用户名" autoComplete="username" size="large" />
                </Form.Item>
                <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
                    <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="current-password" size="large" />
                </Form.Item>
                <Button className="auth-submit" type="primary" htmlType="submit" loading={submitting} block size="large">
                    登录 <ArrowRightOutlined />
                </Button>
                <p className="auth-switch">还没有账号 <Link to="/register" viewTransition>立即注册 <ArrowRightOutlined /></Link></p>
            </Form>
        </AuthShell>
    );
};

export default Login;
