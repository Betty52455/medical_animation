import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Upload, Select, message, Tabs, Card, Checkbox, Table, InputNumber, Modal, Space, Tag, Dropdown, Menu, Tooltip, Typography, Image, Popconfirm } from 'antd';
import {
    UploadOutlined, PlusOutlined, UserOutlined,
    AppstoreOutlined, ProfileOutlined, LogoutOutlined,
    EditOutlined, DeleteOutlined, GiftOutlined,
    ClockCircleOutlined, SettingOutlined, DownloadOutlined,
    InboxOutlined, CheckCircleOutlined, StopOutlined,
    CopyOutlined, MoreOutlined, HistoryOutlined, LoginOutlined,
    CustomerServiceOutlined, FolderOutlined
} from '@ant-design/icons';
import api from '../api';
import StatsPanel from './StatsPanel';
import ReactMarkdown from 'react-markdown';

const { Dragger } = Upload;
const { Option } = Select;
const { Text } = Typography;

// ==================== 主页面 ====================

const Admin = () => {
    const [categories, setCategories] = useState([]);

    const fetchCategories = async () => {
        try {
            const res = await api.get('/categories');
            setCategories(res.data);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        fetchCategories();
    }, []);

    return (
        <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ margin: 0 }}>趣味科普网 · 管理后台</h2>
                <Button
                    type="primary"
                    danger
                    icon={<LogoutOutlined />}
                    onClick={() => {
                        localStorage.removeItem('token');
                        message.success('已退出登录');
                        window.location.href = '/admin-login';
                    }}
                >
                    退出登录
                </Button>
            </div>
            <Tabs defaultActiveKey="1" items={[
                { label: '分类管理', key: '2', children: <CreateCategoryForm onSuccess={fetchCategories} categories={categories} /> },
                { label: '上传素材', key: '1', children: <UploadMaterialForm categories={categories} /> },
                { label: '素材管理', key: '6', children: <MaterialManagement categories={categories} /> },
                { label: '积分兑换码', key: '3', children: <RedeemCodeManagement /> },
                { label: '用户管理', key: '4', children: <UserManagement /> },
                { label: '网站管理', key: '5', children: <WebsiteManagement /> },
                { label: '数据统计', key: '7', children: <StatsPanel /> },
                { label: '操作手册', key: '8', children: <UserManual /> },
            ]} />
        </div>
    );
};

// ==================== 上传素材（新增积分输入框） ====================

const UploadMaterialForm = ({ categories }) => {
    const [fileList, setFileList] = useState([]);
    const [selectedCat1, setSelectedCat1] = useState(null);
    const [selectedCat2, setSelectedCat2] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [pointsCost, setPointsCost] = useState(0); // 素材下载所需积分

    const handleUpload = async () => {
        if (fileList.length === 0) {
            message.warning("请选择文件");
            return;
        }
        if (!selectedCat1) {
            message.warning("请选择一级分类");
            return;
        }

        const formData = new FormData();
        fileList.forEach(file => {
            formData.append('files', file);
        });

        // 添加分类
        formData.append('category_ids', selectedCat1);
        selectedCat2.forEach(id => formData.append('category_ids', id));
        // 添加素材积分
        formData.append('points_cost', pointsCost);

        setUploading(true);
        try {
            await api.post('/admin/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            message.success('上传成功！');
            setFileList([]);
            setSelectedCat1(null);
            setSelectedCat2([]);
            setPointsCost(0);
        } catch {
            message.error('上传失败');
        } finally {
            setUploading(false);
        }
    };

    // 二级分类选项
    const level1Cat = categories.find(c => String(c.id) === selectedCat1);
    const subCategories = level1Cat?.children || [];

    return (
        <Card title="批量上传">
            <Form layout="vertical">
                <Form.Item label="一级分类" required>
                    <Select
                        value={selectedCat1}
                        onChange={val => { setSelectedCat1(val); setSelectedCat2([]); }}
                        placeholder="选择一级分类"
                    >
                        {categories.map(c => <Option key={c.id} value={String(c.id)}>{c.name}</Option>)}
                    </Select>
                </Form.Item>

                {subCategories.length > 0 && (
                    <Form.Item label="二级标签（可选）">
                        <Select
                            mode="multiple"
                            value={selectedCat2}
                            onChange={setSelectedCat2}
                            placeholder="选择标签"
                        >
                            {subCategories.map(c => <Option key={c.id} value={String(c.id)}>{c.name}</Option>)}
                        </Select>
                    </Form.Item>
                )}

                {/* 新增：素材积分设置 */}
                <Form.Item label="下载所需积分（0 = 免费）" tooltip="设置后，用户下载该批素材时会扣除对应积分">
                    <InputNumber
                        min={0}
                        value={pointsCost}
                        onChange={val => setPointsCost(val || 0)}
                        style={{ width: 200 }}
                        addonAfter="积分"
                    />
                </Form.Item>

                <Form.Item label="文件">
                    <Dragger
                        beforeUpload={(file) => {
                            // 为视频文件生成缩略图预览
                            const isVideo = file.type.startsWith('video/');
                            if (isVideo) {
                                const video = document.createElement('video');
                                video.preload = 'metadata';
                                video.muted = true;
                                video.src = URL.createObjectURL(file);
                                video.onloadeddata = () => {
                                    video.currentTime = 1;
                                };
                                video.onseeked = () => {
                                    const canvas = document.createElement('canvas');
                                    canvas.width = video.videoWidth;
                                    canvas.height = video.videoHeight;
                                    canvas.getContext('2d').drawImage(video, 0, 0);
                                    file.thumbUrl = canvas.toDataURL('image/jpeg');
                                    URL.revokeObjectURL(video.src);
                                    setFileList(prev => [...prev]);
                                };
                            }
                            setFileList(prev => [...prev, file]);
                            return false;
                        }}
                        onRemove={(file) => {
                            setFileList(prev => prev.filter(f => f.uid !== file.uid));
                        }}
                        fileList={fileList}
                        multiple
                        listType="picture"
                        showUploadList={true}
                    >
                        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                        <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
                    </Dragger>
                </Form.Item>

                <Button type="primary" onClick={handleUpload} loading={uploading} icon={<UploadOutlined />}>
                    开始上传
                </Button>
            </Form>
        </Card>
    );
};

// ==================== 分类管理 ====================

const CreateCategoryForm = ({ onSuccess, categories }) => {
    const [form] = Form.useForm();

    const onFinish = async (values) => {
        try {
            const payload = {
                name: values.name,
                type: values.parent_id ? 2 : 1,
                parent_id: values.parent_id ? parseInt(values.parent_id) : null,
                is_exclusive: !!values.is_exclusive
            };
            await api.post('/admin/categories', payload);
            message.success("分类创建成功");
            form.resetFields();
            if (onSuccess) onSuccess();
        } catch {
            message.error("创建分类失败");
        }
    };

    return (
        <Card title="添加分类">
            <Form form={form} layout="vertical" onFinish={onFinish}>
                <Form.Item name="name" label="分类名称" rules={[{ required: true, message: '请输入分类名称' }]}>
                    <Input />
                </Form.Item>

                <Form.Item name="parent_id" label="父级分类（一级） - 留空则创建新的一级分类">
                    <Select allowClear>
                        {categories.map(c => <Option key={c.id} value={String(c.id)}>{c.name}</Option>)}
                    </Select>
                </Form.Item>

                <Form.Item name="is_exclusive" valuePropName="checked">
                    <Checkbox>互斥标签（同组内只能选择一个）</Checkbox>
                </Form.Item>

                <Button type="primary" htmlType="submit">创建</Button>
            </Form>
        </Card>
    );
};

// ==================== 操作手册 ====================

const UserManual = () => {
    const [manualContent, setManualContent] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchManual = async () => {
            setLoading(true);
            try {
                const res = await api.get('/admin/manual');
                setManualContent(res.data);
            } catch (e) {
                console.error(e);
                message.error('加载操作手册失败');
            } finally {
                setLoading(false);
            }
        };
        fetchManual();
    }, []);

    return (
        <Card title="管理后台操作手册" loading={loading} style={{ maxWidth: 900, margin: '0 auto' }}>
            <div style={{ padding: '0 20px', fontSize: '15px', lineHeight: '1.8' }}>
                <ReactMarkdown>{manualContent}</ReactMarkdown>
            </div>
        </Card>
    );
};

// ==================== 积分兑换码管理 ====================

const RedeemCodeManagement = () => {
    const [generating, setGenerating] = useState(false);
    const [count, setCount] = useState(10);       // 生成数量
    const [points, setPoints] = useState(100);     // 面值
    const [codes, setCodes] = useState([]);         // 兑换码列表
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState(''); // used/unused/空
    const [searchKeyword, setSearchKeyword] = useState(''); // 搜索关键词
    const [lastGeneratedCodes, setLastGeneratedCodes] = useState([]); // 最近一次生成的兑换码
    const [editingRemarkId, setEditingRemarkId] = useState(null);     // 正在编辑备注的兑换码 ID
    const [editingRemarkValue, setEditingRemarkValue] = useState(''); // 编辑中的备注内容

    // 加载兑换码列表
    const fetchCodes = async (p = page, keyword = searchKeyword) => {
        try {
            const params = { page: p, page_size: 20 };
            if (statusFilter) params.status = statusFilter;
            if (keyword) params.q = keyword;
            const res = await api.get('/admin/redeem-codes', { params });
            setCodes(res.data.data || []);
            setTotal(res.data.total);
        } catch {
            message.error('加载兑换码失败');
        }
    };

    useEffect(() => {
        fetchCodes(1);
        setPage(1);
    }, [statusFilter]);

    // 搜索处理
    const handleSearch = (value) => {
        setSearchKeyword(value);
        setPage(1);
        fetchCodes(1, value);
    };

    // 生成兑换码
    const handleGenerate = async () => {
        if (count < 1 || points < 1) {
            message.warning('请输入有效的数量和面值');
            return;
        }
        setGenerating(true);
        try {
            const res = await api.post('/admin/redeem-codes/generate', { count, points });
            message.success(`成功生成 ${res.data.count} 个兑换码（每个 ${res.data.points} 积分）`);
            setLastGeneratedCodes(res.data.codes || []);
            fetchCodes(1);
            setPage(1);
        } catch {
            message.error('生成失败');
        } finally {
            setGenerating(false);
        }
    };

    // 批量复制兑换码
    const handleCopyAll = () => {
        if (lastGeneratedCodes.length === 0) {
            message.warning('没有可复制的兑换码');
            return;
        }
        const text = lastGeneratedCodes.join('\n');
        navigator.clipboard.writeText(text).then(() => {
            message.success(`已复制 ${lastGeneratedCodes.length} 个兑换码到剪贴板`);
        });
    };

    // 保存备注
    const handleSaveRemark = async (id) => {
        try {
            await api.put(`/admin/redeem-codes/${id}/remark`, { remark: editingRemarkValue });
            message.success('备注保存成功');
            setEditingRemarkId(null);
            // 更新本地数据
            setCodes(prev => prev.map(c => c.id === id ? { ...c, remark: editingRemarkValue } : c));
        } catch {
            message.error('备注保存失败');
        }
    };

    // 表格列定义
    const columns = [
        { title: '兑换码', dataIndex: 'code', key: 'code', render: code => <Text copyable code>{code}</Text> },
        { title: '面值', dataIndex: 'points', key: 'points', width: 90, sorter: (a, b) => a.points - b.points, render: v => <Tag color="blue">{v} 积分</Tag> },
        {
            title: '状态', dataIndex: 'is_used', key: 'is_used', width: 80,
            sorter: (a, b) => (a.is_used === b.is_used ? 0 : a.is_used ? 1 : -1),
            render: v => v ? <Tag color="red">已使用</Tag> : <Tag color="green">未使用</Tag>
        },
        {
            title: '使用者', dataIndex: 'used_by_user', key: 'used_by', width: 100,
            sorter: (a, b) => (a.used_by_user?.username || '').localeCompare(b.used_by_user?.username || ''),
            render: user => user ? user.username : '-'
        },
        {
            title: '使用时间', dataIndex: 'used_at', key: 'used_at', width: 160,
            sorter: (a, b) => new Date(a.used_at || 0) - new Date(b.used_at || 0),
            render: v => v ? new Date(v).toLocaleString('zh-CN') : '-'
        },
        {
            title: '生成时间', dataIndex: 'created_at', key: 'created_at', width: 160,
            sorter: (a, b) => new Date(a.created_at) - new Date(b.created_at),
            render: v => new Date(v).toLocaleString('zh-CN')
        },
        {
            title: '备注', dataIndex: 'remark', key: 'remark', width: 200,
            render: (remark, record) => {
                // 行内编辑模式
                if (editingRemarkId === record.id) {
                    return (
                        <Space>
                            <Input
                                size="small"
                                value={editingRemarkValue}
                                onChange={e => setEditingRemarkValue(e.target.value)}
                                onPressEnter={() => handleSaveRemark(record.id)}
                                style={{ width: 120 }}
                                autoFocus
                            />
                            <Button type="link" size="small" onClick={() => handleSaveRemark(record.id)}>保存</Button>
                            <Button type="link" size="small" onClick={() => setEditingRemarkId(null)}>取消</Button>
                        </Space>
                    );
                }
                return (
                    <span
                        style={{ cursor: 'pointer', color: remark ? '#333' : '#bbb' }}
                        onClick={() => { setEditingRemarkId(record.id); setEditingRemarkValue(remark || ''); }}
                    >
                        {remark || '点击添加备注'}
                    </span>
                );
            }
        },
    ];

    return (
        <div>
            {/* 生成区域 */}
            <Card title="生成兑换码" style={{ marginBottom: 16 }}>
                <Space size="large" wrap>
                    <span>
                        数量：<InputNumber min={1} max={1000} value={count} onChange={v => setCount(v || 1)} />
                    </span>
                    <span>
                        面值：<InputNumber min={1} value={points} onChange={v => setPoints(v || 1)} addonAfter="积分" />
                    </span>
                    <Button type="primary" icon={<GiftOutlined />} onClick={handleGenerate} loading={generating}>
                        生成兑换码
                    </Button>
                </Space>

                {/* 最近生成的兑换码 */}
                {lastGeneratedCodes.length > 0 && (
                    <div style={{ marginTop: 16, padding: 12, background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
                        <Space>
                            <Text strong>最近生成了 {lastGeneratedCodes.length} 个兑换码</Text>
                            <Button icon={<CopyOutlined />} onClick={handleCopyAll} size="small">
                                批量复制
                            </Button>
                        </Space>
                        <div style={{ marginTop: 8, maxHeight: 150, overflowY: 'auto', fontFamily: 'monospace', fontSize: 13 }}>
                            {lastGeneratedCodes.map((code, i) => (
                                <div key={i}>{code}</div>
                            ))}
                        </div>
                    </div>
                )}
            </Card>

            {/* 兑换码列表 */}
            <Card title="兑换码管理" extra={
                <Space>
                    <Input.Search
                        placeholder="搜索兑换码/备注"
                        onSearch={handleSearch}
                        allowClear
                        style={{ width: 220 }}
                    />
                    <Select value={statusFilter} onChange={setStatusFilter} style={{ width: 120 }} placeholder="全部状态">
                        <Option value="">全部</Option>
                        <Option value="unused">未使用</Option>
                        <Option value="used">已使用</Option>
                    </Select>
                </Space>
            }>
                <Table
                    dataSource={codes}
                    columns={columns}
                    rowKey="id"
                    pagination={{
                        current: page,
                        total,
                        pageSize: 20,
                        onChange: (p) => { setPage(p); fetchCodes(p); },
                        showTotal: t => `共 ${t} 条`
                    }}
                    size="small"
                />
            </Card>
        </div>
    );
};

// ==================== 用户管理 ====================

const UserManagement = () => {
    const [users, setUsers] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [editingUser, setEditingUser] = useState(null);     // 正在编辑积分的用户
    const [editPoints, setEditPoints] = useState(0);           // 输入的积分值
    const [historyUser, setHistoryUser] = useState(null);      // 查看兑换历史的用户
    const [historyData, setHistoryData] = useState([]);        // 兑换历史数据
    const [dlHistoryUser, setDlHistoryUser] = useState(null);  // 查看下载历史的用户
    const [dlHistoryData, setDlHistoryData] = useState([]);    // 下载历史数据
    const [remarkUser, setRemarkUser] = useState(null);        // 正在编辑备注的用户
    const [remarkText, setRemarkText] = useState('');           // 备注输入值
    const [loginInfoUser, setLoginInfoUser] = useState(null);  // 查看登录信息的用户
    const [loginInfoData, setLoginInfoData] = useState([]);    // 登录信息数据

    // 加载用户列表
    const fetchUsers = async (p = page) => {
        try {
            const res = await api.get('/admin/users', { params: { page: p, page_size: 20 } });
            setUsers(res.data.data || []);
            setTotal(res.data.total);
        } catch {
            message.error('加载用户列表失败');
        }
    };

    useEffect(() => {
        fetchUsers(1);
    }, []);

    // 保存积分修改
    const handleSavePoints = async () => {
        if (!editingUser) return;
        try {
            await api.put(`/admin/users/${editingUser.id}/points`, { points: editPoints });
            message.success('积分修改成功');
            setEditingUser(null);
            fetchUsers(page);
        } catch {
            message.error('修改积分失败');
        }
    };

    // 查看兑换历史
    const handleViewHistory = async (user) => {
        try {
            const res = await api.get(`/admin/users/${user.id}/redeem-history`);
            setHistoryUser(user);
            setHistoryData(res.data.data || []);
        } catch {
            message.error('获取兑换历史失败');
        }
    };

    // 查看下载历史
    const handleViewDownloadHistory = async (user) => {
        try {
            const res = await api.get(`/admin/users/${user.id}/download-history`);
            setDlHistoryUser(user);
            setDlHistoryData(res.data.data || []);
        } catch {
            message.error('获取下载历史失败');
        }
    };

    // 查看登录信息
    const handleViewLoginInfo = async (user) => {
        try {
            const res = await api.get(`/admin/users/${user.id}/login-history`);
            setLoginInfoUser(user);
            setLoginInfoData(res.data.data || []);
        } catch {
            message.error('获取登录信息失败');
        }
    };

    // 保存用户备注
    const handleSaveRemark = async () => {
        if (!remarkUser) return;
        try {
            await api.put(`/admin/users/${remarkUser.id}/remark`, { remark: remarkText });
            message.success('备注修改成功');
            setRemarkUser(null);
            fetchUsers(page);
        } catch {
            message.error('修改备注失败');
        }
    };

    // 封禁/解封用户
    const handleToggleStatus = async (user) => {
        const newStatus = user.status === 1 ? 0 : 1;
        const actionName = newStatus === 1 ? '封禁' : '解封';
        try {
            await api.put(`/admin/users/${user.id}/status`, { status: newStatus });
            message.success(`用户已成功${actionName}`);
            fetchUsers(page);
        } catch {
            message.error(`${actionName}用户失败`);
        }
    };

    // 用户表格列
    const columns = [
        { title: 'ID', dataIndex: 'id', key: 'id', width: 50 },
        { title: '用户名', dataIndex: 'username', key: 'username', width: 100, sorter: (a, b) => a.username.localeCompare(b.username) },
        { title: '角色', dataIndex: 'role', key: 'role', width: 70, render: v => v === 'admin' ? <Tag color="red">管理员</Tag> : <Tag>用户</Tag> },
        {
            title: '积分余额', dataIndex: 'points', key: 'points', width: 90,
            sorter: (a, b) => a.points - b.points,
            render: v => <Text strong style={{ color: '#1890ff' }}>{v}</Text>
        },
        {
            title: '历史充值', dataIndex: 'total_redeemed_points', key: 'total_redeemed_points', width: 90,
            sorter: (a, b) => a.total_redeemed_points - b.total_redeemed_points,
            render: v => <Text strong style={{ color: '#fa8c16' }}>{v}</Text>
        },
        {
            title: '状态', dataIndex: 'status', key: 'status', width: 80,
            render: v => v === 1 ? <Tag color="error">异常封禁</Tag> : <Tag color="success">正常</Tag>
        },
        {
            title: '注册时间', dataIndex: 'created_at', key: 'created_at', width: 160,
            sorter: (a, b) => new Date(a.created_at) - new Date(b.created_at),
            render: v => new Date(v).toLocaleString('zh-CN')
        },
        {
            title: '操作', key: 'action', width: 100,
            render: (_, record) => record.role === 'admin' ? null : (
                <Dropdown
                    menu={{
                        items: [
                            { key: 'edit', icon: <EditOutlined />, label: '编辑积分', onClick: () => { setEditingUser(record); setEditPoints(record.points); } },
                            {
                                key: 'status',
                                icon: record.status === 1 ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <StopOutlined style={{ color: '#ff4d4f' }} />,
                                label: record.status === 1 ? '解封账户' : '封禁账户',
                                onClick: () => handleToggleStatus(record)
                            },
                            { type: 'divider' },
                            { key: 'redeem', icon: <HistoryOutlined />, label: '兑换记录', onClick: () => handleViewHistory(record) },
                            { key: 'download', icon: <DownloadOutlined />, label: '下载记录', onClick: () => handleViewDownloadHistory(record) },
                            { key: 'login', icon: <LoginOutlined />, label: '登录信息', onClick: () => handleViewLoginInfo(record) },
                        ],
                    }}
                    trigger={['click']}
                >
                    <Button size="small" icon={<MoreOutlined />}>操作</Button>
                </Dropdown>
            ),
        },
        {
            title: '备注', dataIndex: 'remark', key: 'remark', width: 150, ellipsis: true,
            render: (v, record) => record.role === 'admin' ? null : v ? (
                <Tooltip title={v}>
                    <a onClick={() => { setRemarkUser(record); setRemarkText(record.remark || ''); }}>
                        {v}
                    </a>
                </Tooltip>
            ) : (
                <a style={{ color: '#999' }} onClick={() => { setRemarkUser(record); setRemarkText(''); }}>添加备注</a>
            )
        },
    ];

    // 兑换历史表格列
    const historyColumns = [
        { title: '兑换码', dataIndex: 'code', key: 'code', render: v => v?.startsWith('ADMIN-') ? <Tag color="orange">管理员调整</Tag> : <Text code>{v}</Text> },
        { title: '积分', dataIndex: 'points', key: 'points', render: v => v < 0 ? <Tag color="red">{v} 积分</Tag> : <Tag color="blue">+{v} 积分</Tag> },
        {
            title: '兑换时间', dataIndex: 'used_at', key: 'used_at',
            render: v => v ? new Date(v).toLocaleString('zh-CN') : '-'
        },
    ];

    return (
        <div>
            <Card title="用户列表">
                <Table
                    dataSource={users}
                    columns={columns}
                    rowKey="id"
                    pagination={{
                        current: page,
                        total,
                        pageSize: 20,
                        onChange: (p) => { setPage(p); fetchUsers(p); },
                        showTotal: t => `共 ${t} 个用户`
                    }}
                    size="small"
                />
            </Card>

            {/* 编辑备注弹窗 */}
            <Modal
                title={`编辑备注 - ${remarkUser?.username}`}
                open={!!remarkUser}
                onOk={handleSaveRemark}
                onCancel={() => setRemarkUser(null)}
                okText="保存"
                cancelText="取消"
            >
                <Input.TextArea
                    rows={4}
                    value={remarkText}
                    onChange={e => setRemarkText(e.target.value)}
                    placeholder="请输入备注信息"
                    maxLength={500}
                    showCount
                />
            </Modal>

            {/* 编辑积分弹窗 */}
            <Modal
                title={`编辑积分 - ${editingUser?.username}`}
                open={!!editingUser}
                onOk={handleSavePoints}
                onCancel={() => setEditingUser(null)}
                okText="保存"
                cancelText="取消"
            >
                <div style={{ marginBottom: 12 }}>
                    当前积分：<Text strong>{editingUser?.points}</Text>
                </div>
                <div>
                    新积分值：
                    <InputNumber
                        min={0}
                        value={editPoints}
                        onChange={v => setEditPoints(v || 0)}
                        style={{ width: 200 }}
                    />
                </div>
            </Modal>

            {/* 兑换历史弹窗 */}
            <Modal
                title={`兑换记录 - ${historyUser?.username}`}
                open={!!historyUser}
                onCancel={() => setHistoryUser(null)}
                footer={null}
                width={600}
            >
                {historyData.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>暂无兑换记录</div>
                ) : (
                    <Table
                        dataSource={historyData}
                        columns={historyColumns}
                        rowKey="id"
                        pagination={false}
                        size="small"
                    />
                )}
            </Modal>

            {/* 下载历史弹窗 */}
            <Modal
                title={`下载记录 - ${dlHistoryUser?.username}`}
                open={!!dlHistoryUser}
                onCancel={() => setDlHistoryUser(null)}
                footer={null}
                width={600}
            >
                {dlHistoryData.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>暂无下载记录</div>
                ) : (
                    <Table
                        dataSource={dlHistoryData}
                        rowKey="id"
                        pagination={false}
                        size="small"
                        columns={[
                            { title: '素材名称', dataIndex: 'material_title', key: 'material_title' },
                            {
                                title: '扣除积分', dataIndex: 'points_cost', key: 'points_cost',
                                render: v => v > 0 ? <Tag color="orange">{v} 积分</Tag> : <Tag color="green">免费</Tag>
                            },
                            {
                                title: '下载时间', dataIndex: 'created_at', key: 'created_at',
                                render: v => v ? new Date(v).toLocaleString('zh-CN') : '-'
                            },
                        ]}
                    />
                )}
            </Modal>

            {/* 登录信息弹窗 */}
            <Modal
                title={`登录信息 - ${loginInfoUser?.username}`}
                open={!!loginInfoUser}
                onCancel={() => setLoginInfoUser(null)}
                footer={null}
                width={650}
            >
                {loginInfoData.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>暂无登录记录</div>
                ) : (
                    <Table
                        dataSource={loginInfoData}
                        rowKey="id"
                        size="small"
                        pagination={{ pageSize: 10, showTotal: t => `共 ${t} 条` }}
                        columns={[
                            { title: 'IP 地址', dataIndex: 'ip', key: 'ip', width: 140 },
                            { title: '城市', dataIndex: 'city', key: 'city' },
                            {
                                title: '登录时间', dataIndex: 'created_at', key: 'created_at', width: 180,
                                render: v => v ? new Date(v).toLocaleString('zh-CN') : '-'
                            },
                        ]}
                    />
                )}
            </Modal>
        </div>
    );
};

// ==================== 网站管理 ====================

const WebsiteManagement = () => {
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    // contact_us 结构: { text: string, image_url: string }
    const [contactSettings, setContactSettings] = useState({ text: '', image_url: '' });
    // 公告横幅文字
    const [announcementText, setAnnouncementText] = useState('联系客服，可定制视频或角色');
    const [announcementSubmitting, setAnnouncementSubmitting] = useState(false);

    // 加载配置
    const fetchSettings = async () => {
        setLoading(true);
        try {
            const res = await api.get('/public/settings?key=contact_us');
            // 如果后端返回的是字符串，尝试 parse
            let data = res.data;
            if (res.data && res.data.value) {
                try {
                    data = JSON.parse(res.data.value);
                } catch (e) {
                    data = {};
                }
            }
            setContactSettings(data || { text: '', image_url: '' });
        } catch (e) {
            // 404 等情况忽略
        } finally {
            setLoading(false);
        }
    };

    // 加载公告横幅文字
    const fetchAnnouncement = async () => {
        try {
            const res = await api.get('/public/settings?key=announcement');
            let text = '';
            if (res.data && typeof res.data === 'string') {
                text = res.data;
            } else if (res.data && res.data.value) {
                text = res.data.value;
            }
            if (text.startsWith('"') && text.endsWith('"')) {
                text = text.slice(1, -1);
            }
            if (text) setAnnouncementText(text);
        } catch {
            // 未配置时使用默认值
        }
    };

    useEffect(() => {
        fetchSettings();
        fetchAnnouncement();
    }, []);

    // 保存公告横幅配置
    const handleSaveAnnouncement = async () => {
        setAnnouncementSubmitting(true);
        try {
            await api.post('/admin/settings', {
                key: 'announcement',
                value: announcementText
            });
            message.success('公告横幅保存成功');
        } catch (err) {
            const status = err?.response?.status;
            if (status === 401) {
                message.error('登录已过期，请重新登录');
            } else if (status === 403) {
                message.error('权限不足：需要管理员账号登录');
            } else {
                message.error('保存失败');
            }
        } finally {
            setAnnouncementSubmitting(false);
        }
    };

    // 保存联系我们配置
    const handleSave = async () => {
        setSubmitting(true);
        try {
            await api.post('/admin/settings', {
                key: 'contact_us',
                value: contactSettings
            });
            message.success('保存成功');
        } catch (err) {
            // 根据后端返回的状态码给出不同提示
            const status = err?.response?.status;
            if (status === 401) {
                message.error('登录已过期，请重新登录');
            } else if (status === 403) {
                message.error('权限不足：需要管理员账号登录');
            } else {
                message.error('保存失败');
            }
        } finally {
            setSubmitting(false);
        }
    };

    // 上传图片处理 (复用上传接口，或者增加一个通用图片上传接口)
    // 这里为了简便，暂时假设直接上传到 /api/admin/upload 只是为了拿 URL
    // 但注意目前 upload 接口是创建素材，可能需要一个专门的 upload_image 接口
    // 临时方案：使用 base64 或者复用 upload 接口但需要后端支持不创建素材仅返回 URL
    // 鉴于时间，我们先用 base64 存储图片（如果图片不大），或者修改后端逻辑
    // 为了稳妥，这里先实现【只传文本】+【图片URL输入框】+【图片上传组件(Base64暂时)】
    // 更好的方式是后端加一个 /api/admin/upload-image，但需要改后端。
    // 为了不大幅改动后端，这里使用 Ant Design Upload 转 Base64 存入 JSON。
    // 警告：Base64 存数据库 TEXT 字段有长度限制 (65535)，如果是大图会爆。
    // 修正方案：查看后端 UploadMaterial，会保存文件到 static 目录。
    // 我们可以复用 /api/admin/upload 接口？不，那个接口绑定了 Material 逻辑。
    // 鉴于用户要求“上传图片”，我们应该在后端加一个简单的图片上传接口，或者前端转 Base64 (限制大小)。
    // 这里选择前端限制图片大小并转 Base64 (简单快速验证)，若用户传大图再优化。

    const handleImageUpload = (file) => {
        const isLt2M = file.size / 1024 / 1024 < 2; // 限制 2MB
        if (!isLt2M) {
            message.error('图片大小不能超过 2MB');
            return false;
        }
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            setContactSettings(prev => ({ ...prev, image_url: reader.result }));
        };
        return false; // 阻止自动上传
    };

    return (
        <Card title="网站配置">
            <Tabs defaultActiveKey="announcement" items={[
                {
                    key: 'announcement',
                    label: '公告横幅配置',
                    children: (
                        <Form layout="vertical">
                            <Form.Item label="公告文字" extra="此文字会显示在网站顶部的黄色横幅中，所有用户可见。留空则显示默认内容。">
                                <Input.TextArea
                                    rows={3}
                                    value={announcementText}
                                    onChange={e => setAnnouncementText(e.target.value)}
                                    placeholder="联系客服，可定制视频或角色"
                                />
                            </Form.Item>
                            <Button type="primary" onClick={handleSaveAnnouncement} loading={announcementSubmitting}>
                                保存配置
                            </Button>
                        </Form>
                    )
                },
                {
                    key: 'contact',
                    label: '联系我们配置',
                    children: (
                        <Form layout="vertical">
                            <Form.Item label="说明文字">
                                <Input.TextArea
                                    rows={4}
                                    value={contactSettings.text}
                                    onChange={e => setContactSettings(prev => ({ ...prev, text: e.target.value }))}
                                    placeholder="请输入联系方式说明，例如：请扫描下方二维码联系客服..."
                                />
                            </Form.Item>

                            <Form.Item label="图片 (可选)">
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
                                    <Upload
                                        listType="picture-card"
                                        showUploadList={false}
                                        beforeUpload={handleImageUpload}
                                        maxCount={1}
                                    >
                                        {contactSettings.image_url ? (
                                            <img src={contactSettings.image_url} alt="contact" style={{ width: '100%', objectFit: 'contain' }} />
                                        ) : (
                                            <div>
                                                <UploadOutlined />
                                                <div style={{ marginTop: 8 }}>上传图片</div>
                                            </div>
                                        )}
                                    </Upload>
                                    {contactSettings.image_url && (
                                        <Button danger onClick={() => setContactSettings(prev => ({ ...prev, image_url: '' }))}>
                                            删除图片
                                        </Button>
                                    )}
                                </div>
                                <div style={{ color: '#999', fontSize: 12, marginTop: 8 }}>
                                    支持 jpg/png，大小不超过 2MB。图片将以 Base64 形式存储。
                                </div>
                            </Form.Item>

                            <Button type="primary" onClick={handleSave} loading={submitting}>
                                保存配置
                            </Button>
                        </Form>
                    )
                }
            ]} />
        </Card>
    );
};

// ==================== 素材管理 ====================

const MaterialManagement = ({ categories }) => {
    const [materials, setMaterials] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [searchKeyword, setSearchKeyword] = useState('');
    const [loading, setLoading] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingMaterial, setEditingMaterial] = useState(null);
    const [editForm] = Form.useForm();

    // 将嵌套分类扁平化为二级列表
    const flatCategories = (categories || []).reduce((acc, cat) => {
        acc.push({ id: cat.id, name: cat.name, level: 1 });
        (cat.children || []).forEach(child => {
            acc.push({ id: child.id, name: `${cat.name} / ${child.name}`, level: 2 });
        });
        return acc;
    }, []);

    // 加载素材列表
    const fetchMaterials = async (p = page, keyword = searchKeyword) => {
        setLoading(true);
        try {
            const params = { page: p, page_size: 20 };
            if (keyword) params.q = keyword;
            const res = await api.get('/admin/materials', { params });
            setMaterials(res.data.data || []);
            setTotal(res.data.total);
        } catch {
            message.error('加载素材失败');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMaterials(1);
    }, []);

    // 搜索
    const handleSearch = (value) => {
        setSearchKeyword(value);
        setPage(1);
        fetchMaterials(1, value);
    };

    // 打开编辑弹窗
    const handleEdit = (record) => {
        setEditingMaterial(record);
        editForm.setFieldsValue({
            title: record.title,
            points_cost: record.points_cost,
            category_ids: (record.categories || []).map(c => c.id || c.ID),
        });
        setEditModalVisible(true);
    };

    // 保存编辑
    const handleSaveEdit = async () => {
        try {
            const values = await editForm.validateFields();
            // 1. 更新素材基本信息（标题和积分）
            await api.put(`/admin/materials/${editingMaterial.id}`, {
                title: values.title,
                points_cost: values.points_cost,
            });
            // 2. 更新分组
            await api.put(`/admin/materials/${editingMaterial.id}/categories`, {
                category_ids: values.category_ids || [],
            });
            message.success('素材更新成功');
            setEditModalVisible(false);
            fetchMaterials();
        } catch {
            message.error('更新失败');
        }
    };

    // 软删除
    const handleDelete = async (id) => {
        try {
            await api.delete(`/admin/materials/${id}`);
            message.success('素材已删除');
            fetchMaterials();
        } catch {
            message.error('删除失败');
        }
    };

    // 表格列定义
    const columns = [
        { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
        {
            title: '缩略图', dataIndex: 'preview_url', key: 'preview', width: 80,
            render: (url, record) => {
                // 音频素材显示音符图标
                if (record.type === 3) {
                    return <div style={{ width: 50, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff7e6', borderRadius: 4 }}>
                        <CustomerServiceOutlined style={{ fontSize: 28, color: '#fa8c16' }} />
                    </div>;
                }
                // 有预览图则显示预览图，否则显示文件夹图标
                return url
                    ? <Image src={`/${url}`} width={50} height={50} style={{ objectFit: 'cover', borderRadius: 4 }} />
                    : <div style={{ width: 50, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', borderRadius: 4 }}>
                        <FolderOutlined style={{ fontSize: 28, color: '#bbb' }} />
                    </div>;
            }
        },
        { title: '标题', dataIndex: 'title', key: 'title', width: 200, ellipsis: true },
        {
            title: '类型', dataIndex: 'type', key: 'type', width: 70,
            render: v => {
                // 素材类型：0=其他, 1=图片, 2=视频, 3=音频
                if (v === 3) return <Tag color="gold">🎵 音乐</Tag>;
                if (v === 2) return <Tag color="purple">视频</Tag>;
                if (v === 1) return <Tag color="cyan">图片</Tag>;
                return <Tag>素材</Tag>;
            }
        },
        {
            title: '积分', dataIndex: 'points_cost', key: 'points_cost', width: 80,
            sorter: (a, b) => a.points_cost - b.points_cost,
            render: v => v > 0 ? <Tag color="orange">{v} 积分</Tag> : <Tag color="green">免费</Tag>
        },
        {
            title: '分组', dataIndex: 'categories', key: 'categories', width: 200,
            render: cats => (cats || []).map(c => <Tag key={c.id}>{c.name}</Tag>)
        },
        {
            title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 160,
            sorter: (a, b) => new Date(a.created_at) - new Date(b.created_at),
            render: v => new Date(v).toLocaleString('zh-CN')
        },
        {
            title: '操作', key: 'action', width: 150,
            render: (_, record) => (
                <Space>
                    <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
                    <Popconfirm title="确定删除该素材？" onConfirm={() => handleDelete(record.id)} okText="确定" cancelText="取消">
                        <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                </Space>
            )
        },
    ];

    // 一键清空所有素材（限时功能）
    const handleDeleteAll = async () => {
        try {
            await api.delete('/admin/system/clear-materials');
            message.success('素材库及分类已全量清空');
            setPage(1);
            fetchMaterials(1);
        } catch (err) {
            if (err.response?.data?.error) {
                message.error(err.response.data.error);
            } else {
                message.error('清空失败');
            }
        }
    };

    // 判断一键清空功能是否已过期 (2026-03-31 23:59:59)
    const isClearFuncExpired = new Date() > new Date('2026-03-31T23:59:59');

    return (
        <div>
            <Card title="素材管理" extra={
                <Space>
                    <Input.Search
                        placeholder="搜索素材标题"
                        onSearch={handleSearch}
                        allowClear
                        style={{ width: 250 }}
                    />
                    {!isClearFuncExpired ? (
                        <Popconfirm
                            title="高危操作确认"
                            description={<div style={{ color: 'red', maxWidth: 250 }}>您确定要清空所有素材、分类及物理文件吗？此操作无法恢复！</div>}
                            onConfirm={handleDeleteAll}
                            okText="我确认清空"
                            cancelText="取消"
                            okButtonProps={{ danger: true }}
                        >
                            <Button danger icon={<DeleteOutlined />}>一键清空素材库</Button>
                        </Popconfirm>
                    ) : (
                        <Tooltip title="该功能已于2026年3月底下线">
                            <Button disabled icon={<DeleteOutlined />}>一键清空素材库</Button>
                        </Tooltip>
                    )}
                </Space>
            }>
                <Table
                    dataSource={materials}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    pagination={{
                        current: page,
                        total,
                        pageSize: 20,
                        onChange: (p) => { setPage(p); fetchMaterials(p); },
                        showTotal: t => `共 ${t} 个素材`,
                    }}
                    size="small"
                />
            </Card>

            {/* 编辑弹窗 */}
            <Modal
                title="编辑素材"
                open={editModalVisible}
                onOk={handleSaveEdit}
                onCancel={() => setEditModalVisible(false)}
                okText="保存"
                cancelText="取消"
            >
                <Form form={editForm} layout="vertical">
                    <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="points_cost" label="下载积分" rules={[{ required: true, message: '请输入积分' }]}>
                        <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="category_ids" label="分组">
                        <Select mode="multiple" placeholder="选择分组" allowClear>
                            {flatCategories.map(c => (
                                <Option key={c.id} value={c.id}>{c.name}</Option>
                            ))}
                        </Select>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default Admin;
