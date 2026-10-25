import React, { useState } from 'react';
import { Form, Input, Button, message } from 'antd';
import { ArrowRightOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';
import AuthShell from '../components/AuthShell';

/** Register 展示密码长度反馈，所有强度规则仍以服务端校验为准。 */
const Register = () => {
    const navigate = useNavigate();
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);
    const password = Form.useWatch('password', form) || '';
    const passwordLength = Array.from(password).length;
    const lengthProgress = Math.min(passwordLength / 15, 1);

    // onFinish 提交注册，并把服务端密码错误放回对应输入框。
    const onFinish = async (values) => {
        setSubmitting(true);
        try {
            await api.post('/auth/register', values);
            message.success('注册成功，请登录');
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
        <AuthShell eyebrow="JOIN / 01" title="创建账号" subtitle="用一段容易记住的长短语保护你的账号">
            <Form className="auth-form" form={form} name="register" layout="vertical" requiredMark={false} onFinish={onFinish}>
                <Form.Item label="用户名" name="username" rules={[
                    { required: true, message: '请输入用户名' },
                    { pattern: /^[a-zA-Z][a-zA-Z0-9_\u4e00-\u9fa5]*$/, message: '以字母开头，可包含字母、数字、下划线或中文' },
                ]}>
                    <Input prefix={<UserOutlined />} placeholder="以字母开头" autoComplete="username" size="large" />
                </Form.Item>
                <Form.Item label="密码" name="password" rules={[
                    { required: true, message: '请输入密码' },
                    {
                        // 客户端即时检查长度；规律和常见密码由服务端最终判断。
                        validator(_, value) {
                            if (!value) return Promise.resolve();
                            if (Array.from(value).length < 15) return Promise.reject(new Error('密码至少需要 15 个字符'));
                            if (new TextEncoder().encode(value).length > 72) return Promise.reject(new Error('密码的 UTF-8 编码不能超过 72 字节'));
                            return Promise.resolve();
                        },
                    },
                ]}>
                    <Input.Password prefix={<LockOutlined />} placeholder="至少 15 个字符" autoComplete="new-password" size="large" />
                </Form.Item>
                <div className="password-hint" aria-live="polite">
                    <div className="password-meter"><span style={{ transform: `scaleX(${lengthProgress})` }} /></div>
                    <span>{passwordLength < 15 ? `还需 ${15 - passwordLength} 个字符` : '已达到最低长度'}</span>
                    <span>避开重复、连续字符及用户名</span>
                </div>
                <Form.Item label="确认密码" name="confirm_password" dependencies={['password']} hasFeedback rules={[
                    { required: true, message: '请再次输入密码' },
                    ({ getFieldValue }) => ({
                        // 确认密码必须与首次输入一致。
                        validator(_, value) {
                            if (!value || getFieldValue('password') === value) return Promise.resolve();
                            return Promise.reject(new Error('两次输入的密码不一致'));
                        },
                    }),
                ]}>
                    <Input.Password prefix={<LockOutlined />} placeholder="再次输入密码" autoComplete="new-password" size="large" />
                </Form.Item>
                <Button className="auth-submit" type="primary" htmlType="submit" loading={submitting} block size="large">
                    创建账号 <ArrowRightOutlined />
                </Button>
                <p className="auth-switch">已有账号 <Link to="/login" viewTransition>立即登录 <ArrowRightOutlined /></Link></p>
            </Form>
        </AuthShell>
    );
};

export default Register;
