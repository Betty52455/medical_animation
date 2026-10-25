import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftOutlined, ArrowRightOutlined } from '@ant-design/icons';

/** AuthShell 用统一的画报版式承载普通用户和管理员表单。 */
const AuthShell = ({ eyebrow, title, subtitle, children }) => (
    <main className="auth-layout">
        <section className="auth-poster" aria-label="趣味科普网">
            <Link className="auth-brand" to="/" viewTransition>趣味<span>/</span>科普</Link>
            <div className="auth-poster-copy">
                <span className="auth-poster-index">SCIENCE MATERIALS / 01</span>
                <h1><span>让知识</span><span>变得看得见</span></h1>
                <p>从一份素材开始<br />把想法讲得更生动</p>
            </div>
            <div className="auth-poster-art" aria-hidden="true">
                <span className="auth-art-ring auth-art-ring-one" />
                <span className="auth-art-ring auth-art-ring-two" />
                <span className="auth-art-core" />
            </div>
            <div className="auth-poster-foot">趣味科普网 <ArrowRightOutlined /></div>
        </section>
        <section className="auth-content">
            <Link className="auth-back" to="/" viewTransition><ArrowLeftOutlined /> 返回首页</Link>
            <div className="auth-form-wrap">
                <span className="auth-eyebrow">{eyebrow}</span>
                <h2>{title}</h2>
                <p className="auth-subtitle">{subtitle}</p>
                {children}
            </div>
            <div className="auth-content-foot">趣味科普网 · 科普素材服务</div>
        </section>
    </main>
);

export default AuthShell;
