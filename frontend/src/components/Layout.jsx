import React, { useState, useEffect } from 'react';
import { Layout, Input, Button, Avatar, Dropdown, Space, message, Modal, Tag, Table } from 'antd';
import { UserOutlined, LogoutOutlined, UploadOutlined, GiftOutlined, WalletOutlined, HistoryOutlined, DownloadOutlined } from '@ant-design/icons';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import api from '../api';

const { Header, Content, Footer } = Layout;
const { Search } = Input;

const AppLayout = () => {
    const navigate = useNavigate();

    // 从 localStorage 读取用户信息作为初始状态
    const getInitialUser = () => {
        const username = localStorage.getItem('username');
        const role = localStorage.getItem('role');
        return username ? { username, role } : null;
    };
    const [user, setUser] = useState(getInitialUser);
    const [points, setPoints] = useState(0);           // 用户积分余额
    const [redeemVisible, setRedeemVisible] = useState(false); // 兑换弹窗
    const [redeemCode, setRedeemCode] = useState('');   // 兑换码输入
    const [redeeming, setRedeeming] = useState(false);  // 兑换中状态
    const [historyVisible, setHistoryVisible] = useState(false); // 兑换记录弹窗
    const [redeemHistory, setRedeemHistory] = useState([]);       // 兑换记录数据
    const [dlHistoryVisible, setDlHistoryVisible] = useState(false); // 下载记录弹窗
    const [dlHistory, setDlHistory] = useState([]);                   // 下载记录数据
    const [announcementText, setAnnouncementText] = useState('联系客服，可定制视频或角色'); // 公告横幅文字

    // 查询用户积分余额
    const fetchPoints = async () => {
        try {
            const res = await api.get('/my-points');
            setPoints(res.data.points || 0);
        } catch {
            // 未登录或失败时忽略
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
            } else if (res.data && res.data.text) {
                text = res.data.text;
            }
            // 去掉 JSON 引号
            if (text.startsWith('"') && text.endsWith('"')) {
                text = text.slice(1, -1);
            }
            if (text) setAnnouncementText(text);
        } catch {
            // 未配置时使用默认值
        }
    };

    useEffect(() => {
        fetchAnnouncement();
    }, []);

    // 登录状态变化时获取积分
    useEffect(() => {
        if (user) {
            fetchPoints();
        }
    }, [user]);

    const handleLogout = () => {
        localStorage.clear();
        setUser(null);
        setPoints(0);
        message.success('已退出登录');
        navigate('/login');
    };

    const handleSearch = (value) => {
        navigate(`/?q=${value}`);
    };

    // 兑换积分码
    const handleRedeem = async () => {
        if (!redeemCode.trim()) {
            message.warning('请输入兑换码');
            return;
        }
        setRedeeming(true);
        try {
            const res = await api.post('/redeem', { code: redeemCode.trim() });
            message.success(`兑换成功！获得 ${res.data.points} 积分，当前余额 ${res.data.balance} 积分`);
            setPoints(res.data.balance);
            setRedeemCode('');
            setRedeemVisible(false);
        } catch (err) {
            message.error(err.response?.data?.error || '兑换失败');
        } finally {
            setRedeeming(false);
        }
    };

    // 联系客服模态框
    const [contactVisible, setContactVisible] = useState(false);
    const [contactInfo, setContactInfo] = useState({ text: '', image_url: '' });

    const handleOpenContact = async () => {
        setContactVisible(true);
        try {
            const res = await api.get('/public/settings?key=contact_us');
            let data = res.data;
            if (res.data && res.data.value) {
                try {
                    data = JSON.parse(res.data.value);
                } catch {
                    data = {};
                }
            }
            setContactInfo(data || {});
        } catch {
            // ignore
        }
    };

    /* 用户下拉菜单项 */
    const userMenuItems = [
        // 积分余额（不可点击，仅显示）
        {
            key: 'points',
            icon: <WalletOutlined />,
            label: <span>积分余额：<strong style={{ color: '#1890ff' }}>{points}</strong></span>,
            disabled: true,
            style: { cursor: 'default' },
        },
        { type: 'divider' },
        // 兑换积分入口
        {
            key: 'redeem',
            icon: <GiftOutlined />,
            label: '兑换积分',
            onClick: () => setRedeemVisible(true),
        },
        // 兑换记录入口
        {
            key: 'history',
            icon: <HistoryOutlined />,
            label: '兑换记录',
            onClick: async () => {
                setHistoryVisible(true);
                try {
                    const res = await api.get('/my-redeem-history');
                    setRedeemHistory(res.data.data || []);
                } catch {
                    message.error('加载兑换记录失败');
                }
            },
        },
        // 下载记录入口
        {
            key: 'download-history',
            icon: <DownloadOutlined />,
            label: '下载记录',
            onClick: async () => {
                setDlHistoryVisible(true);
                try {
                    const res = await api.get('/my-download-history');
                    setDlHistory(res.data.data || []);
                } catch {
                    message.error('加载下载记录失败');
                }
            },
        },
        // 管理员才显示「管理后台」入口
        ...(user?.role === 'admin' ? [{
            key: 'admin',
            icon: <UploadOutlined />,
            label: <a href="/admin">管理后台</a>,
        }] : []),
        { type: 'divider' },
        {
            key: 'logout',
            icon: <LogoutOutlined />,
            label: '退出登录',
            onClick: handleLogout,
        },
    ];

    return (
        <Layout style={{ minHeight: '100vh' }}>
            {/* 公告横幅 */}
            <div style={{ background: '#fffbe6', padding: '10px', textAlign: 'center', color: '#d46b08', borderBottom: '1px solid #ffe58f' }}>
                {announcementText}
            </div>

            <Header style={{ background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', boxShadow: '0 2px 8px #f0f1f2' }}>
                <div className="logo" style={{ fontSize: '20px', fontWeight: 'bold', marginRight: '40px' }}>
                    <Link to="/" style={{ color: '#333' }}>趣味科普网</Link>
                </div>

                <div style={{ flex: 1, maxWidth: '600px', margin: '0 20px' }}>
                    <Search
                        placeholder="搜索素材..."
                        allowClear
                        onSearch={handleSearch}
                        onChange={(e) => handleSearch(e.target.value)}
                        enterButton
                    />
                </div>

                <div className="user-actions">
                    <Space size="middle">
                        {/* 联系客服按钮 - 放在头像左侧 */}
                        <Button type="text" onClick={handleOpenContact}>联系客服</Button>

                        {user ? (
                            <Dropdown menu={{ items: userMenuItems }} trigger={['click']}>
                                <Space style={{ cursor: 'pointer' }}>
                                    <Avatar icon={<UserOutlined />} />
                                    <span>{user.username}</span>
                                    {/* 顶栏积分标签 */}
                                    <Tag color="blue" style={{ marginLeft: 4, fontSize: 12 }}>
                                        {points} 积分
                                    </Tag>
                                </Space>
                            </Dropdown>
                        ) : (
                            <Space>
                                <Link to="/login"><Button type="primary">登录</Button></Link>
                            </Space>
                        )}
                    </Space>
                </div>
            </Header>

            <Content style={{ padding: '20px 50px' }}>
                <Outlet />
            </Content>

            <Footer style={{ textAlign: 'center', color: '#999', fontSize: 13 }}>
                趣味科普网 ©{new Date().getFullYear()} &nbsp;|&nbsp;
                <a href="https://beian.miit.gov.cn" target="_blank" rel="noopener noreferrer" style={{ color: '#999' }}>
                    津ICP备2026001988号-1
                </a>
                &nbsp;|&nbsp;
                <a href="https://www.beian.gov.cn/portal/registerSystemInfo?recordcode=13040202001092" target="_blank" rel="noopener noreferrer" style={{ color: '#999' }}>
                    冀公网安备13040202001092号
                </a>
            </Footer>

            {/* 兑换积分弹窗 */}
            <Modal
                title="兑换积分"
                open={redeemVisible}
                onCancel={() => { setRedeemVisible(false); setRedeemCode(''); }}
                onOk={handleRedeem}
                okText="兑换"
                cancelText="取消"
                confirmLoading={redeeming}
            >
                <div style={{ marginBottom: 12, color: '#666' }}>
                    请输入管理员提供的积分兑换码：
                </div>
                <Input
                    placeholder="请输入兑换码"
                    value={redeemCode}
                    onChange={e => setRedeemCode(e.target.value)}
                    onPressEnter={handleRedeem}
                    size="large"
                    style={{ fontFamily: 'monospace' }}
                />
                <div style={{ marginTop: 12, fontSize: 13, color: '#999' }}>
                    当前积分余额：<strong style={{ color: '#1890ff' }}>{points}</strong>
                </div>
            </Modal>

            {/* 兑换记录弹窗 */}
            <Modal
                title="兑换记录"
                open={historyVisible}
                onCancel={() => setHistoryVisible(false)}
                footer={null}
                width={600}
            >
                <Table
                    dataSource={redeemHistory}
                    rowKey="id"
                    size="small"
                    pagination={false}
                    columns={[
                        {
                            title: '兑换码', dataIndex: 'code', key: 'code',
                            render: v => v?.startsWith('ADMIN-') ? <Tag color="orange">管理员调整</Tag> : <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>{v}</code>
                        },
                        {
                            title: '积分', dataIndex: 'points', key: 'points',
                            render: v => v < 0 ? <Tag color="red">{v} 积分</Tag> : <Tag color="blue">+{v} 积分</Tag>
                        },
                        {
                            title: '兑换时间', dataIndex: 'used_at', key: 'used_at',
                            render: v => v ? new Date(v).toLocaleString('zh-CN') : '-'
                        },
                    ]}
                />
            </Modal>

            {/* 下载记录弹窗 */}
            <Modal
                title="下载记录"
                open={dlHistoryVisible}
                onCancel={() => setDlHistoryVisible(false)}
                footer={null}
                width={600}
            >
                <Table
                    dataSource={dlHistory}
                    rowKey="id"
                    size="small"
                    pagination={false}
                    columns={[
                        {
                            title: '素材名称', dataIndex: 'material_title', key: 'material_title',
                        },
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
            </Modal>

            {/* 联系客服弹窗 */}
            <Modal
                title="联系客服"
                open={contactVisible}
                onCancel={() => setContactVisible(false)}
                footer={null}
                width={400}
            >
                <div style={{ textAlign: 'center', padding: 20 }}>
                    {contactInfo.text && (
                        <div style={{ fontSize: 16, marginBottom: 20, whiteSpace: 'pre-wrap' }}>
                            {contactInfo.text}
                        </div>
                    )}

                    {contactInfo.image_url ? (
                        <img
                            src={contactInfo.image_url}
                            alt="contact"
                            style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid #eee' }}
                        />
                    ) : (
                        !contactInfo.text && <div style={{ color: '#999' }}>暂无联系方式</div>
                    )}
                </div>
            </Modal>
        </Layout>
    );
};

export default AppLayout;
