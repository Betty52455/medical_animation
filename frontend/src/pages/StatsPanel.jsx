import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Radio, Table, Tag, Typography, message, Spin } from 'antd';
import { UserOutlined, CloudDownloadOutlined, FileOutlined, WalletOutlined, TeamOutlined, RiseOutlined, LineChartOutlined, PieChartOutlined, FireOutlined, GlobalOutlined } from '@ant-design/icons';
import { Line, Pie } from '@ant-design/charts';
import api from '../api';

const { Text } = Typography;

// ==================== 常量定义 ====================

// 时间范围选项
const TIME_RANGE_OPTIONS = [
    { label: '近7天', value: 7 },
    { label: '近2周', value: 14 },
    { label: '近1月', value: 30 },
    { label: '全部', value: 0 },
];

// 素材类型名称映射
const MATERIAL_TYPE_MAP = {
    0: '其他',
    1: '图片',
    2: '视频',
    3: '音频',
};

// 素材类型颜色映射
const MATERIAL_TYPE_COLOR = {
    0: '#999',
    1: '#1890ff',
    2: '#52c41a',
    3: '#fa8c16',
};

// ==================== 运营统计面板 ====================

const StatsPanel = () => {
    // 时间范围状态
    const [days, setDays] = useState(7);
    // 加载状态
    const [loading, setLoading] = useState(false);
    // 概览数据
    const [overview, setOverview] = useState({});
    // 用户趋势数据
    const [userTrend, setUserTrend] = useState({ login: [], download: [], newUser: [] });
    // 素材趋势数据
    const [materialTrend, setMaterialTrend] = useState({ download: [], top: [] });
    // 素材类型分布
    const [typeDist, setTypeDist] = useState([]);
    // 积分趋势
    const [pointsTrend, setPointsTrend] = useState({ recharge: [], consume: [] });
    // 登录记录
    const [loginRecords, setLoginRecords] = useState([]);

    // 加载所有统计数据
    const fetchAll = async (d = days) => {
        setLoading(true);
        try {
            // 并行请求所有 API
            const [overviewRes, userRes, materialRes, typeRes, pointsRes, loginRes] = await Promise.all([
                api.get('/admin/stats/overview'),
                api.get('/admin/stats/user-trend', { params: { days: d } }),
                api.get('/admin/stats/material-trend', { params: { days: d } }),
                api.get('/admin/stats/material-type-dist'),
                api.get('/admin/stats/points-trend', { params: { days: d } }),
                api.get('/admin/stats/login-records', { params: { days: d } }),
            ]);

            setOverview(overviewRes.data || {});
            setUserTrend({
                login: userRes.data?.login_trend || [],
                download: userRes.data?.download_user_trend || [],
                newUser: userRes.data?.new_user_trend || [],
            });
            setMaterialTrend({
                download: materialRes.data?.download_trend || [],
                top: materialRes.data?.top_materials || [],
            });
            setTypeDist(typeRes.data?.data || []);
            setPointsTrend({
                recharge: pointsRes.data?.recharge_trend || [],
                consume: pointsRes.data?.consume_trend || [],
            });
            setLoginRecords(loginRes.data?.data || []);
        } catch {
            message.error('加载统计数据失败');
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchAll();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // 切换时间范围
    const handleDaysChange = (e) => {
        const d = e.target.value;
        setDays(d);
        fetchAll(d);
    };

    // ==================== 图表数据处理 ====================

    // 用户趋势折线图数据
    const userChartData = [
        ...userTrend.login.map(i => ({ date: i.date, count: i.count, type: '登录用户' })),
        ...userTrend.download.map(i => ({ date: i.date, count: i.count, type: '下载用户' })),
        ...userTrend.newUser.map(i => ({ date: i.date, count: i.count, type: '新增用户' })),
    ];

    // 积分趋势折线图数据
    const pointsChartData = [
        ...pointsTrend.recharge.map(i => ({ date: i.date, count: i.count, type: '积分充值' })),
        ...pointsTrend.consume.map(i => ({ date: i.date, count: i.count, type: '积分消耗' })),
    ];

    // 素材下载趋势数据
    const dlChartData = materialTrend.download.map(i => ({ date: i.date, count: i.count, type: '下载次数' }));

    // 素材类型分布饼图数据
    const pieData = typeDist.map(i => ({
        type: MATERIAL_TYPE_MAP[i.type] || '未知',
        value: i.count,
    }));

    // ==================== 折线图通用配置 ====================
    const lineConfig = (data, title) => ({
        data,
        xField: 'date',
        yField: 'count',
        colorField: 'type',
        height: 300,
        axis: {
            y: { title: '数量' },
            x: { title: '日期' },
        },
        tooltip: { channel: 'y' },
        title: { visible: true, text: title },
        point: { shapeField: 'square', sizeField: 4 },
        interaction: { tooltip: { marker: true } },
        style: { lineWidth: 2 },
    });

    // ==================== 热门素材表格列 ====================
    const topColumns = [
        { title: '排名', key: 'rank', width: 60, render: (_, __, idx) => <Text strong>{idx + 1}</Text> },
        { title: '素材名称', dataIndex: 'material_title', key: 'material_title', ellipsis: true },
        {
            title: '类型', dataIndex: 'material_type', key: 'material_type', width: 80,
            render: v => <Tag color={MATERIAL_TYPE_COLOR[v]}>{MATERIAL_TYPE_MAP[v] || '未知'}</Tag>
        },
        {
            title: '下载次数', dataIndex: 'download_count', key: 'download_count', width: 100,
            sorter: (a, b) => a.download_count - b.download_count,
            render: v => <Text strong style={{ color: '#1890ff' }}>{v}</Text>
        },
        {
            title: '积分单价', dataIndex: 'points_cost', key: 'points_cost', width: 90,
            render: v => v > 0 ? <Tag color="orange">{v}</Tag> : <Tag color="green">免费</Tag>
        },
    ];

    // ==================== 登录记录表格列 ====================
    const loginColumns = [
        { title: '用户', dataIndex: 'username', key: 'username', width: 100 },
        { title: 'IP', dataIndex: 'ip', key: 'ip', width: 140 },
        { title: '城市', dataIndex: 'city', key: 'city', width: 200 },
        {
            title: '登录时间', dataIndex: 'created_at', key: 'created_at', width: 180,
            render: v => v ? new Date(v).toLocaleString('zh-CN') : '-'
        },
    ];

    // 无描边的工作台图表样式由站点样式统一控制。
    const cardStyle = { marginBottom: 16 };

    return (
        <Spin spinning={loading}>
            {/* 时间范围选择器 */}
            <div style={{ marginBottom: 16, textAlign: 'right' }}>
                <Radio.Group value={days} onChange={handleDaysChange} optionType="button" buttonStyle="solid">
                    {TIME_RANGE_OPTIONS.map(opt => (
                        <Radio.Button key={opt.value} value={opt.value}>{opt.label}</Radio.Button>
                    ))}
                </Radio.Group>
            </div>

            {/* 概览卡片 */}
            <Row gutter={[16, 16]} className="stats-overview" style={{ marginBottom: 16 }}>
                <Col xs={12} md={8} xl={4}>
                    <Card>
                        <Statistic title="总用户数" value={overview.total_users || 0} prefix={<TeamOutlined />} />
                    </Card>
                </Col>
                <Col xs={12} md={8} xl={4}>
                    <Card>
                        <Statistic title="今日新增" value={overview.today_new_users || 0} prefix={<UserOutlined />} />
                    </Card>
                </Col>
                <Col xs={12} md={8} xl={4}>
                    <Card>
                        <Statistic title="今日活跃" value={overview.today_active_users || 0} prefix={<RiseOutlined />} />
                    </Card>
                </Col>
                <Col xs={12} md={8} xl={4}>
                    <Card>
                        <Statistic title="素材总量" value={overview.total_materials || 0} prefix={<FileOutlined />} />
                    </Card>
                </Col>
                <Col xs={12} md={8} xl={4}>
                    <Card>
                        <Statistic title="今日下载" value={overview.today_downloads || 0} prefix={<CloudDownloadOutlined />} />
                    </Card>
                </Col>
                <Col xs={12} md={8} xl={4}>
                    <Card>
                        <Statistic title="积分池余额" value={overview.total_points || 0} prefix={<WalletOutlined />} />
                    </Card>
                </Col>
            </Row>

            {/* 用户趋势 + 积分趋势 */}
            <Row gutter={[16, 16]}>
                <Col xs={24} xl={12}>
                    <Card title={<><UserOutlined /> 用户趋势</>} style={cardStyle}>
                        {userChartData.length > 0 ? (
                            <Line {...lineConfig(userChartData, '')} />
                        ) : (
                            <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>暂无数据</div>
                        )}
                    </Card>
                </Col>
                <Col xs={24} xl={12}>
                    <Card title={<><WalletOutlined /> 积分趋势</>} style={cardStyle}>
                        {pointsChartData.length > 0 ? (
                            <Line {...lineConfig(pointsChartData, '')} />
                        ) : (
                            <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>暂无数据</div>
                        )}
                    </Card>
                </Col>
            </Row>

            {/* 素材下载趋势 + 类型分布 */}
            <Row gutter={[16, 16]}>
                <Col xs={24} xl={16}>
                    <Card title={<><LineChartOutlined /> 素材下载趋势</>} style={cardStyle}>
                        {dlChartData.length > 0 ? (
                            <Line {...lineConfig(dlChartData, '')} />
                        ) : (
                            <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>暂无数据</div>
                        )}
                    </Card>
                </Col>
                <Col xs={24} xl={8}>
                    <Card title={<><PieChartOutlined /> 素材类型分布</>} style={cardStyle}>
                        {pieData.length > 0 ? (
                            <Pie
                                data={pieData}
                                angleField='value'
                                colorField='type'
                                height={300}
                                innerRadius={0.6}
                                label={{ text: 'value', style: { fontWeight: 'bold' } }}
                                legend={{ color: { title: false, position: 'bottom', rowPadding: 5 } }}
                            />
                        ) : (
                            <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>暂无数据</div>
                        )}
                    </Card>
                </Col>
            </Row>

            {/* 热门素材排行 + 登录记录 */}
            <Row gutter={[16, 16]}>
                <Col xs={24} xl={12}>
                    <Card title={<><FireOutlined /> 热门素材 TOP 10</>} style={cardStyle}>
                        <Table
                            dataSource={materialTrend.top}
                            columns={topColumns}
                            rowKey="material_id"
                            pagination={false}
                            size="small"
                        />
                    </Card>
                </Col>
                <Col xs={24} xl={12}>
                    <Card title={<><GlobalOutlined /> 登录记录</>} style={cardStyle}>
                        <Table
                            dataSource={loginRecords}
                            columns={loginColumns}
                            rowKey="id"
                            size="small"
                            pagination={{ pageSize: 10, showTotal: t => `共 ${t} 条` }}
                        />
                    </Card>
                </Col>
            </Row>
        </Spin>
    );
};

export default StatsPanel;
