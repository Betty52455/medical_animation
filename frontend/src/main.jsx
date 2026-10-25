import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import './index.css'
import './site.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConfigProvider theme={{
      token: {
        colorPrimary: '#1554c6',
        colorText: '#101b2d',
        colorBgBase: '#ffffff',
        borderRadius: 4,
        controlHeight: 40,
        fontFamily: '"PingFang SC", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      },
    }}>
      <App />
    </ConfigProvider>
  </StrictMode>,
)
