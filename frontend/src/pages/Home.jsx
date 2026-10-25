import React, { useState, useEffect, useCallback } from 'react';
import { Pagination, Spin, message, Modal, Button } from 'antd';
import { ArrowDownOutlined, CaretRightOutlined, DownloadOutlined, LeftOutlined, PauseOutlined, RightOutlined, LoginOutlined, CustomerServiceOutlined, FolderOutlined, SoundOutlined } from '@ant-design/icons';
import api from '../api';
import { useSearchParams, useNavigate } from 'react-router-dom';

/* ==================== 常量定义 ==================== */
const DEFAULT_PAGE_SIZE = 20;       // 每页显示数量
const BACKEND_BASE_URL = ''; // 使用相对路径，通过 Vite proxy / Nginx 转发
const MATERIAL_TYPE_OTHER = 0;      // 素材类型：其他
const MATERIAL_TYPE_IMAGE = 1;      // 素材类型：图片
const MATERIAL_TYPE_VIDEO = 2;      // 素材类型：视频
const MATERIAL_TYPE_AUDIO = 3;      // 素材类型：音频
const FREE_DURATION_THRESHOLD = 20; // 视频预览：低于该秒数完整播放
const PREVIEW_RATIO = 0.15;          // 视频预览：超出阈值只能看前 15%

/**
 * Home 首页组件
 * 
 * 功能说明：
 * 1. 蓝色画报封面引导进入素材区
 * 2. 分类与搜索条件筛选素材，移动端网格自动缩列
 * 3. 素材卡片提供预览、积分与版权信息
 * 4. 点击卡片：弹出 Modal 预览（图片显示水印大图 / 视频可播放）
 * 5. Modal 底部：下载按钮（未登录则提示去登录）
 * 6. 底部：分页
 */
const Home = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const [categories, setCategories] = useState([]);
    const [materials, setMaterials] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);

    // 筛选状态
    const [selectedLevel1, setSelectedLevel1] = useState(searchParams.get('cat1') || '');
    const [selectedLevel2, setSelectedLevel2] = useState(searchParams.get('cat2') || '');
    const [page, setPage] = useState(parseInt(searchParams.get('page')) || 1);
    const searchQuery = searchParams.get('q') || '';

    // 预览弹窗状态
    const [previewVisible, setPreviewVisible] = useState(false);  // 弹窗是否显示
    const [previewIndex, setPreviewIndex] = useState(0);          // 当前预览的素材索引
    const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

    // 加载分类数据
    useEffect(() => {
        const loadCategories = async () => {
            try {
                const res = await api.get('/categories');
                setCategories(res.data || []);
                // 默认选中第一个一级分类
                if (!selectedLevel1 && res.data && res.data.length > 0 && !searchQuery) {
                    setSelectedLevel1(String(res.data[0].id));
                }
            } catch (err) {
                console.error('加载分类失败:', err);
            }
        };
        loadCategories();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // 加载素材数据（当筛选条件变化时触发）
    const fetchMaterials = useCallback(async () => {
        if (!selectedLevel1 && !searchQuery) return;
        setLoading(true);
        try {
            const catId = selectedLevel2 || selectedLevel1;
            const params = {
                page,
                page_size: DEFAULT_PAGE_SIZE,
                category_id: catId,
                q: searchQuery,
            };
            const res = await api.get('/materials', { params });
            setMaterials(res.data.data || []);
            setTotal(res.data.total || 0);
        } catch (err) {
            console.error('加载素材失败:', err);
        } finally {
            setLoading(false);
        }
    }, [selectedLevel1, selectedLevel2, page, searchQuery]);

    useEffect(() => {
        fetchMaterials();
        // 同步 URL 参数
        const params = {};
        if (selectedLevel1) params.cat1 = selectedLevel1;
        if (selectedLevel2) params.cat2 = selectedLevel2;
        if (page > 1) params.page = String(page);
        if (searchQuery) params.q = searchQuery;
        setSearchParams(params);
    }, [fetchMaterials]); // eslint-disable-line react-hooks/exhaustive-deps

    // 切换一级分类
    const handleLevel1Change = (id) => {
        setSelectedLevel1(String(id));
        setSelectedLevel2('');
        setPage(1);
    };

    // 切换二级分类
    const handleLevel2Change = (id) => {
        setSelectedLevel2(selectedLevel2 === String(id) ? '' : String(id));
        setPage(1);
    };

    /**
     * 打开预览弹窗
     * @param {number} index - 素材在当前列表中的索引
     */
    const openPreview = (index) => {
        setPreviewIndex(index);
        setPreviewVisible(true);
    };

    /** 关闭预览弹窗 */
    const closePreview = () => {
        setPreviewVisible(false);
    };

    /** 切换到上一个素材 */
    const goToPrev = (e) => {
        e.stopPropagation();
        setPreviewIndex((prev) => (prev > 0 ? prev - 1 : materials.length - 1));
    };

    /** 切换到下一个素材 */
    const goToNext = (e) => {
        e.stopPropagation();
        setPreviewIndex((prev) => (prev < materials.length - 1 ? prev + 1 : 0));
    };

    /**
     * 下载原文件
     * 1. 检查登录状态
     * 2. 未登录 → 提示并跳转登录页
     * 3. 已登录 → AJAX 请求后端前置校验（积分/封禁）
     * 4. 校验通过 → window.open 触发浏览器原生下载
     */
    const handleDownload = async (material) => {
        const token = localStorage.getItem('token');
        if (!token) {
            message.warning('请先登录后才能下载原文件');
            navigate('/login');
            return;
        }

        try {
            // 前置检查是否允许下载（拦截 402积分不足 或 403封禁）
            await api.get(`/materials/${material.id}/download/check`);
            // 校验通过，使用浏览器原生下载
            window.open(`/api/materials/${material.id}/download?token=${encodeURIComponent(token)}`, '_blank');
        } catch (err) {
            if (err.response && err.response.data && err.response.data.error) {
                message.error(err.response.data.error);
            } else {
                message.error('下载校验失败，请稍后重试');
            }
        }
    };

    /**
     * 判断素材是否是视频类型
     * 1. 优先通过 type 字段判断（2=视频）
     * 2. 兜底通过文件扩展名判断
     */
    const isVideoMaterial = (material) => {
        if (material.type === MATERIAL_TYPE_VIDEO) return true;
        const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
        const title = (material.title || '').toLowerCase();
        return videoExtensions.some(ext => title.endsWith(ext));
    };

    // 当前一级分类下的二级分类
    const currentLevel1 = categories.find(c => String(c.id) === selectedLevel1);
    const subCategories = currentLevel1?.children || [];

    // 当前预览的素材
    const currentPreviewMaterial = materials[previewIndex] || null;
    const isLoggedIn = !!localStorage.getItem('token');

    return (
        <div className="home-page">
            <section className="home-hero" aria-labelledby="home-title">
                <div className="home-hero-copy">
                    <span className="home-kicker">SCIENCE MATERIALS / 01</span>
                    <h1 id="home-title"><span>把知识</span><span>变得看得见</span></h1>
                    <p>从角色到场景<br />寻找适合表达想法的科普素材</p>
                    <a className="home-hero-action" href="#materials">探索素材 <ArrowDownOutlined /></a>
                </div>
                <div className="home-hero-art" aria-hidden="true">
                    <span className="home-art-ring home-art-ring-one" />
                    <span className="home-art-ring home-art-ring-two" />
                    <span className="home-art-core" />
                    <span className="home-art-caption">IDEAS IN MOTION</span>
                </div>
                <span className="home-hero-number" aria-hidden="true">01 / COVER</span>
            </section>

            <section className="home-library" id="materials" aria-labelledby="materials-title">
                <div className="home-library-heading">
                    <div>
                        <span className="home-section-index">02 / RESOURCE LIBRARY</span>
                        <h2 id="materials-title">探索素材</h2>
                    </div>
                    <p>按主题浏览<br />或在上方直接搜索</p>
                </div>
            {/* ========== 一级分类 Tab 导航 ========== */}
            <div className="home-categories" role="group" aria-label="素材分类">
                {categories.map(cat => (
                    <button
                        key={cat.id}
                        type="button"
                        className={`home-category ${selectedLevel1 === String(cat.id) ? 'is-active' : ''}`}
                        aria-pressed={selectedLevel1 === String(cat.id)}
                        onClick={() => handleLevel1Change(cat.id)}
                    >
                        {cat.name}
                    </button>
                ))}
            </div>

            {/* ========== 二级分类标签行 ========== */}
            {subCategories.length > 0 && (
                <div className="home-subcategories" role="group" aria-label="细分分类">
                    <button
                        type="button"
                        className={`home-subcategory ${selectedLevel2 === '' ? 'is-active' : ''}`}
                        aria-pressed={selectedLevel2 === ''}
                        onClick={() => { setSelectedLevel2(''); setPage(1); }}
                    >
                        全部
                    </button>
                    {subCategories.map(sub => (
                        <button
                            key={sub.id}
                            type="button"
                            className={`home-subcategory ${selectedLevel2 === String(sub.id) ? 'is-active' : ''}`}
                            aria-pressed={selectedLevel2 === String(sub.id)}
                            onClick={() => handleLevel2Change(sub.id)}
                        >
                            {sub.name}
                        </button>
                    ))}
                </div>
            )}

            {/* ========== 素材网格 ========== */}
            {loading ? (
                <div className="home-loading" aria-label="正在加载素材">
                    <Spin size="large" />
                </div>
            ) : materials.length === 0 ? (
                <div className="home-empty">
                    <div className="home-empty-mark" aria-hidden="true"><span /></div>
                    <span className="home-empty-index">NO MATERIALS / 00</span>
                    <h3>{searchQuery ? '没有找到相关素材' : categories.length ? '这一分类暂无素材' : '素材即将上线'}</h3>
                    <p>{searchQuery ? '试试更短的关键词或浏览其他分类' : categories.length ? '可以先看看其他分类，新的内容会在这里出现' : '分类和素材准备好后，会在这里展示'}</p>
                </div>
            ) : (
                <div className="home-grid">
                    {materials.map((m, index) => (
                        <button type="button" key={m.id} className="home-material" style={{ '--i': index }} onClick={() => openPreview(index)} aria-label={`预览${m.title}`}>
                            {/* 图片容器 */}
                            <div className="home-material-image" style={styles.imageWrapper}>
                                {/* 缩略图分发：图片/视频渲染 img，音频/其他渲染居中图标 */}
                                {m.type === MATERIAL_TYPE_AUDIO ? (
                                    <div style={{ ...styles.image, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eaf2ff' }}>
                                        <CustomerServiceOutlined style={{ fontSize: 64, color: '#1554c6' }} />
                                    </div>
                                ) : m.type === MATERIAL_TYPE_OTHER ? (
                                    <div style={{ ...styles.image, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
                                        <FolderOutlined style={{ fontSize: 64, color: '#bbb' }} />
                                    </div>
                                ) : (
                                    <img
                                        src={`${BACKEND_BASE_URL}/${m.preview_url}`}
                                        alt={m.title}
                                        style={styles.image}
                                        loading="lazy"
                                    />
                                )}
                                {/* 版权标签 */}
                                <div style={styles.copyrightBadge}>版权</div>
                                {/* 积分标签 */}
                                <div style={styles.pointsBadge}>
                                    {m.points_cost > 0 ? `${m.points_cost}积分` : '免费'}
                                </div>
                            </div>
                            {/* 标题 */}
                            <div className="home-material-title">{m.title}</div>
                        </button>
                    ))}
                </div>
            )}

            {/* ========== 分页 ========== */}
            {total > 0 && (
                <div style={{ textAlign: 'center', padding: '20px 0 40px' }}>
                    <Pagination
                        current={page}
                        total={total}
                        pageSize={DEFAULT_PAGE_SIZE}
                        onChange={(p) => setPage(p)}
                        showQuickJumper
                        showTotal={(t) => `共 ${t} 个素材`}
                    />
                </div>
            )}

            {/* ========== 素材预览弹窗 ========== */}
            <Modal
                open={previewVisible}
                onCancel={closePreview}
                footer={null}
                width={800}
                centered
                destroyOnHidden
                title={currentPreviewMaterial?.title || '素材预览'}
                styles={{ body: { padding: '20px 24px 16px' } }}
            >
                {currentPreviewMaterial && (
                    <div style={styles.modalContent}>
                        {/* 预览区域：图片 or 视频 */}
                        <div style={styles.previewArea}>
                            {/* 左箭头导航 */}
                            {materials.length > 1 && (
                                <button type="button" aria-label="上一项素材" style={{ ...styles.navArrow, left: 8 }} onClick={goToPrev}>
                                    <LeftOutlined style={{ fontSize: 22, color: '#fff' }} />
                                </button>
                            )}

                            {isVideoMaterial(currentPreviewMaterial) ? (
                                /* ---- 视频播放器（自定义控件，无全屏按钮） ---- */
                                <div style={styles.videoContainer}>
                                    <video
                                        key={currentPreviewMaterial.id}
                                        id="preview-video"
                                        src={`/api/materials/${currentPreviewMaterial.id}/stream`}
                                        playsInline
                                        disablePictureInPicture
                                        onContextMenu={(e) => e.preventDefault()}
                                        style={styles.previewVideo}
                                        poster={`${BACKEND_BASE_URL}/${currentPreviewMaterial.preview_url}`}
                                        onTimeUpdate={(e) => {
                                            const v = e.target;
                                            if (!v.duration) return;
                                            /* 1. 计算允许观看的最大时间 */
                                            const maxTime = v.duration <= FREE_DURATION_THRESHOLD
                                                ? v.duration
                                                : v.duration * PREVIEW_RATIO;
                                            /* 2. 超过限制 → 暂停并回退到限制点 */
                                            if (v.currentTime >= maxTime) {
                                                v.pause();
                                                v.currentTime = maxTime;
                                                const hint = document.getElementById('preview-limit-hint');
                                                if (hint) hint.style.display = 'block';
                                            }
                                            /* 3. 同步进度条和时间显示 */
                                            const bar = document.getElementById('custom-progress');
                                            const timeEl = document.getElementById('custom-time');
                                            if (bar) bar.value = (v.currentTime / v.duration) * 100;
                                            if (timeEl) {
                                                const fmt = (s) => { const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
                                                timeEl.textContent = `${fmt(v.currentTime)} / ${fmt(v.duration)}`;
                                            }
                                        }}
                                        onPlay={() => setIsPreviewPlaying(true)}
                                        onPause={() => setIsPreviewPlaying(false)}
                                    >
                                        您的浏览器不支持视频播放
                                    </video>
                                    {/* 水印遮罩层 */}
                                    <div style={{ ...styles.watermarkOverlay, pointerEvents: 'none' }}>
                                        {Array.from({ length: 20 }).map((_, i) => (
                                            <span key={i} style={styles.watermarkText}>下载后无水印</span>
                                        ))}
                                    </div>
                                    {/* 预览结束提示（默认隐藏） */}
                                    <div id="preview-limit-hint" style={{
                                        display: 'none', position: 'absolute', top: '50%', left: '50%',
                                        transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.75)',
                                        color: '#fff', padding: '12px 24px', borderRadius: 8,
                                        fontSize: 14, zIndex: 4, textAlign: 'center', pointerEvents: 'none',
                                    }}>
                                        预览结束，下载后可观看完整内容
                                    </div>
                                    {/* 自定义控件栏 */}
                                    <div style={{
                                        position: 'absolute', bottom: 0, left: 0, right: 0,
                                        background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center',
                                        padding: '6px 10px', gap: 8, zIndex: 3,
                                    }}>
                                        <button
                                            id="custom-play-btn"
                                            type="button"
                                            aria-label={isPreviewPlaying ? '暂停预览' : '播放预览'}
                                            onClick={() => { const v = document.getElementById('preview-video'); if (v) v.paused ? v.play() : v.pause(); }}
                                            style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', width: 28 }}
                                        >{isPreviewPlaying ? <PauseOutlined /> : <CaretRightOutlined />}</button>
                                        <input
                                            id="custom-progress"
                                            type="range" min="0" max="100" defaultValue="0"
                                            onChange={(e) => {
                                                const v = document.getElementById('preview-video');
                                                if (!v || !v.duration) return;
                                                /* 限制进度条拖拽不能超过预览上限 */
                                                const maxTime = v.duration <= FREE_DURATION_THRESHOLD
                                                    ? v.duration
                                                    : v.duration * PREVIEW_RATIO;
                                                const targetTime = (e.target.value / 100) * v.duration;
                                                v.currentTime = Math.min(targetTime, maxTime);
                                            }}
                                            style={{ flex: 1, height: 4, cursor: 'pointer', accentColor: '#1890ff' }}
                                        />
                                        <span id="custom-time" style={{ color: '#fff', fontSize: 12, minWidth: 80, textAlign: 'center' }}>0:00 / 0:00</span>
                                        <button type="button"
                                            onClick={() => { const v = document.getElementById('preview-video'); if (v) v.muted = !v.muted; }}
                                            style={{ background: 'none', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer' }}
                                            aria-label="切换静音"
                                        ><SoundOutlined /></button>
                                    </div>
                                </div>
                            ) : currentPreviewMaterial.type === MATERIAL_TYPE_AUDIO ? (
                                /* ---- 音频播放器 ---- */
                                <div style={{ ...styles.imagePreviewContainer, width: '100%', minHeight: 400, background: '#eaf2ff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
                                    <CustomerServiceOutlined style={{ fontSize: 100, color: '#1554c6' }} />
                                    <audio
                                        controls
                                        src={`/api/materials/${currentPreviewMaterial.id}/stream`}
                                        controlsList="nodownload"
                                        style={{ width: '80%', marginTop: 20 }}
                                    />
                                </div>
                            ) : currentPreviewMaterial.type === MATERIAL_TYPE_OTHER ? (
                                /* ---- 其他文件占位 ---- */
                                <div style={{ ...styles.imagePreviewContainer, width: '100%', minHeight: 400, background: '#f5f5f5', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
                                    <FolderOutlined style={{ fontSize: 100, color: '#bbb' }} />
                                    <h3 style={{ color: '#666', margin: 0 }}>{currentPreviewMaterial.title}</h3>
                                    <p style={{ color: '#999', margin: 0 }}>该类型文件暂不支持在线预览，请下载后查看</p>
                                </div>
                            ) : (
                                /* ---- 图片大图（带水印预览图） ---- */
                                <div style={styles.imagePreviewContainer}>
                                    <img
                                        src={`${BACKEND_BASE_URL}/${currentPreviewMaterial.preview_url}`}
                                        alt={currentPreviewMaterial.title}
                                        style={styles.previewImage}
                                    />
                                    {/* 水印遮罩层 */}
                                    <div style={{ ...styles.watermarkOverlay, pointerEvents: 'none' }}>
                                        {Array.from({ length: 20 }).map((_, i) => (
                                            <span key={i} style={styles.watermarkText}>下载后无水印</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 右箭头导航 */}
                            {materials.length > 1 && (
                                <button type="button" aria-label="下一项素材" style={{ ...styles.navArrow, right: 8 }} onClick={goToNext}>
                                    <RightOutlined style={{ fontSize: 22, color: '#fff' }} />
                                </button>
                            )}
                        </div>

                        {/* 底部操作区 */}
                        <div style={styles.modalFooter}>
                            {isLoggedIn ? (
                                <Button
                                    type="primary"
                                    icon={<DownloadOutlined />}
                                    size="large"
                                    onClick={() => handleDownload(currentPreviewMaterial)}
                                    style={styles.downloadBtn}
                                >
                                    {currentPreviewMaterial.points_cost > 0
                                        ? `下载文件（${currentPreviewMaterial.points_cost} 积分）`
                                        : '免费下载'
                                    }
                                </Button>
                            ) : (
                                <Button
                                    type="primary"
                                    icon={<LoginOutlined />}
                                    size="large"
                                    onClick={() => { closePreview(); navigate('/login'); }}
                                    style={styles.loginBtn}
                                >
                                    登录下载完整素材
                                </Button>
                            )}
                            <div style={styles.downloadTip}>
                                * 提示：下载文件一般在浏览器右上角查看。<strong style={{ color: '#1554c6' }}>付费素材在首次下载后的7天内可以免费重复下载。</strong>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
            </section>
        </div>
    );
};

/* ==================== 样式常量 ==================== */
const styles = {
    /* 图片容器 - 4:3 宽高比 */
    imageWrapper: {
        position: 'relative',
        width: '100%',
        paddingBottom: '75%',
        background: '#f5f8fd',
        overflow: 'hidden',
    },
    /* 缩略图 */
    image: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
    },
    /* 版权角标 */
    copyrightBadge: {
        position: 'absolute',
        top: 8,
        left: 8,
        background: '#101b2d',
        color: '#fff',
        fontSize: 12,
        padding: '2px 10px',
        borderRadius: 3,
        fontWeight: 600,
        zIndex: 1,
    },
    /* 积分标签（卡片右上角） */
    pointsBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        background: '#1554c6',
        color: '#fff',
        fontSize: 11,
        padding: '2px 8px',
        borderRadius: 3,
        fontWeight: 600,
        zIndex: 1,
    },
    /* ==================== 预览弹窗样式 ==================== */
    modalContent: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },
    /* 预览区域（包含左右箭头） */
    previewArea: {
        position: 'relative',
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 300,
        background: '#f5f5f5',
        borderRadius: 2,
        overflow: 'hidden',
    },
    /* 预览大图 */
    previewImage: {
        maxWidth: '100%',
        maxHeight: '60vh',
        objectFit: 'contain',
        display: 'block',
    },
    /* 图片预览容器（用于定位水印遮罩） */
    imagePreviewContainer: {
        position: 'relative',
        display: 'inline-block',
        maxWidth: '100%',
        overflow: 'hidden',
    },
    /* 视频播放器 */
    previewVideo: {
        maxWidth: '100%',
        maxHeight: '60vh',
        outline: 'none',
        display: 'block',
        background: '#000',
    },
    /* 视频容器（用于定位水印遮罩） */
    videoContainer: {
        position: 'relative',
        display: 'inline-block',
        maxWidth: '100%',
    },
    /* 水印遮罩层 - 覆盖在视频上方，不阻止点击事件 */
    watermarkOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',  // 让鼠标事件穿透，视频控件仍可操作
        overflow: 'hidden',
        display: 'flex',
        flexWrap: 'wrap',
        alignContent: 'center',
        justifyContent: 'center',
        gap: '40px 60px',
        transform: 'rotate(-30deg)',
        transformOrigin: 'center center',
        zIndex: 5,
        /* 扩大范围以覆盖旋转后的空白区域 */
        padding: '80px',
        margin: '-80px',
    },
    /* 单个水印文字 */
    watermarkText: {
        fontSize: 22,
        fontWeight: 600,
        color: 'rgba(255, 255, 255, 0.35)',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        textShadow: '1px 1px 2px rgba(0,0,0,0.3)',
    },
    /* 左右导航箭头 */
    navArrow: {
        position: 'absolute',
        top: '50%',
        transform: 'translateY(-50%)',
        width: 40,
        height: 40,
        borderRadius: '50%',
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        zIndex: 10,
        transition: 'background 0.2s',
    },
    /* 底部操作区 */
    modalFooter: {
        marginTop: 20,
        textAlign: 'center',
    },
    /* 下载按钮 */
    downloadBtn: {
        minWidth: 160,
        height: 44,
        fontSize: 16,
        borderRadius: 22,
        background: '#1554c6',
    },
    /* 登录按钮 */
    loginBtn: {
        minWidth: 160,
        height: 44,
        fontSize: 16,
        borderRadius: 22,
        background: '#1554c6',
        borderColor: '#1554c6',
    },
    /* 底部提示 */
    downloadTip: {
        marginTop: 10,
        fontSize: 12,
        color: '#999',
    },
};

export default Home;
