# DaiP 智能聊天室 (DaiP Chat Room)

## 📖 项目简介
DaiP 智能聊天室是一个基于 **Python Tornado** 框架开发的轻量级、高性能 B/S 架构局域网即时通讯系统。采用 WebSocket 技术实现低延迟的双向通信，前端采用现代化的 **玻璃拟态 (Glassmorphism)** 设计风格，界面简约、炫酷且支持响应式布局。

## ✨ 主要功能
*   **多人实时聊天**：支持局域网内多用户同时在线交流。
*   **智能指令系统**：
    *   `@电影 [url]`：内置视频解析功能，直接在聊天窗口嵌入播放器观看视频（支持 m3u8 等流媒体）。
    *   `@川小农 [内容]`：AI 对话接口预留（目前为模拟回复），支持扩展对接大模型。
*   **现代化 UI 设计**：
    *   炫酷的动态渐变背景与玻璃拟态登录框。
    *   沉浸式聊天界面，美化后的 iOS/Android 风格滚动条。
    *   响应式设计，适配不同屏幕尺寸。
*   **用户体验优化**：
    *   昵称唯一性校验，防止重名冲突。
    *   断线/刷新页面自动重连（基于 LocalStorage 的 Session 持久化）。
    *   在线用户列表实时更新。
    *   内置 Emoji 表情面板，支持点击外部自动关闭。

## 🛠 技术栈
*   **后端**：Python 3.x + Tornado (Web & WebSocket)
*   **前端**：HTML5 + CSS3 (Flexbox/Grid/Animations) + Vanilla JavaScript (ES6+)
*   **数据存储**：内存存储 (当前在线用户) + LocalStorage (客户端会话)

## 🚀 快速启动

### 1. 环境准备
确保本地已安装 **Python 3.8+**。

### 2. 初始化环境
建议使用 Python 虚拟环境运行本项目：

```bash
# Windows
python -m venv venv
.\venv\Scripts\activate

# Linux/macOS
python3 -m venv venv
source venv/bin/activate
```

### 3. 安装依赖
```bash
pip install -r requirements.txt
```
*注：本项目主要依赖 `tornado` 库。*

### 4. 启动服务
```bash
python server.py
```
启动成功后，控制台将输出：
`Server started on http://localhost:8888`

### 5. 访问应用
*   **本机访问**：打开浏览器访问 `http://localhost:8888`
*   **局域网访问**：在登录页面的“服务器”下拉框中，系统会自动识别并提供本机局域网 IP 地址，选择即可连接。

## 📂 项目结构
```text
cnDaiPChatRoomV2/
├── server.py             # 后端入口文件 (Tornado App, WebSocket Handler, 路由配置)
├── config.json           # 配置文件 (服务器列表默认配置)
├── requirements.txt      # Python 项目依赖列表
├── templates/            # HTML 模板目录
│   └── index.html        # 单页应用主入口 (包含登录页和聊天页结构)
└── static/               # 静态资源目录
    ├── css/
    │   ├── style.css     # 核心样式表 (包含玻璃拟态、动画、布局)
    │   └── scrollbar.css # 滚动条美化样式
    └── js/
        └── main.js       # 前端核心逻辑 (WebSocket 通信, DOM 操作, 事件处理)
```

## 👨‍💻 开发指南

### 1. 后端开发 (`server.py`)
*   **消息处理**：核心逻辑在 `ChatWebSocket.on_message` 方法中。
*   **新增指令**：如需增加新的 `@xxx` 指令，请在 `on_message` 中添加 `elif content.startswith("@指令名")` 分支。
*   **用户管理**：`clients` 字典存储了当前所有在线的 WebSocket 连接对象。

### 2. 前端开发 (`static/`)
*   **样式修改**：`style.css` 使用了 CSS 变量定义颜色，修改 `:root` 下的变量可快速更换主题。
*   **逻辑扩展**：`main.js` 中的 `renderUserMessage` 函数负责渲染不同类型的消息（文本、电影卡片、AI消息等）。

### 3. 端口配置
默认运行在 `8888` 端口。如需修改，请同时更新：
1.  `server.py` 中的 `app.listen(8888)`
2.  `config.json` 中的地址配置

## 📦 部署发布说明

### 1. 生产环境部署
建议使用 **Supervisor** 或 **Systemd** 来管理 Python 进程，确保服务在后台稳定运行并具备自动重启能力。

**Supervisor 配置示例 (`/etc/supervisor/conf.d/daip_chat.conf`):**
```ini
[program:daip_chat]
directory=/path/to/cnDaiPChatRoomV2
command=/path/to/cnDaiPChatRoomV2/venv/bin/python server.py
autostart=true
autorestart=true
stderr_logfile=/var/log/daip_chat.err.log
stdout_logfile=/var/log/daip_chat.out.log
```

### 2. 网络配置
*   确保服务器防火墙（Firewall/Security Group）开放 TCP `8888` 端口。
*   如需通过外网域名访问，建议使用 **Nginx** 进行反向代理。

### 3. Nginx 反向代理示例 (支持 WebSocket)
```nginx
server {
    listen 80;
    server_name chat.example.com;

    location / {
        proxy_pass http://127.0.0.1:8888;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

---
**注意**：请定期更新 `cookie_secret` (在 `server.py` 中) 以保证安全性。
