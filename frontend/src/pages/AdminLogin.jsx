import React, { useState } from 'react';
import { Form, Input, Button, message } from 'antd';
import { ArrowRightOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import AuthShell from '../components/AuthShell';

/** AdminLogin 通过同一个认证接口核对管理员角色后进入后台。 */
const AdminLogin = () => {
    const navigate = useNavigate();
    const [submitting, setSubmitting] = useState(false);

    // onFinish 仅在服务端确认管理员角色后保存登录状态。
    const onFinish = async (values) => {
        setSubmitting(true);
        try {
            const res = await api.post('/auth/login', values);
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
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AuthShell eyebrow="ADMIN / 02" title="管理后台" subtitle="使用管理员账号维护素材与网站内容">
            <Form className="auth-form" name="admin_login" layout="vertical" requiredMark={false} onFinish={onFinish}>
                <Form.Item label="管理员用户名" name="username" rules={[{ required: true, message: '请输入管理员用户名' }]}>
                    <Input prefix={<UserOutlined />} placeholder="请输入管理员用户名" autoComplete="username" size="large" />
                </Form.Item>
                <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
                    <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="current-password" size="large" />
                </Form.Item>
                <Button className="auth-submit" type="primary" htmlType="submit" loading={submitting} block size="large">
                    进入后台 <ArrowRightOutlined />
                </Button>
            </Form>
        </AuthShell>
    );
};

export default AdminLogin;
