document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const loginScreen = document.getElementById('login-screen');
    const chatScreen = document.getElementById('chat-screen');
    const serverSelect = document.getElementById('server-select');
    const refreshServerBtn = document.getElementById('refresh-server-btn');
    const loginBtn = document.getElementById('login-btn');
    const nicknameInput = document.getElementById('nickname-input');
    const loginError = document.getElementById('login-error');
    
    const myAvatar = document.getElementById('my-avatar');
    const myNickname = document.getElementById('my-nickname');
    const onlineUsersList = document.getElementById('online-users');
    const userCount = document.getElementById('user-count');
    const logoutBtn = document.getElementById('logout-btn');
    
    const chatMessages = document.getElementById('chat-messages');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const emojiBtn = document.getElementById('emoji-btn');
    const emojiPicker = document.getElementById('emoji-picker');
    
    let ws = null;
    let currentUser = '';

    // 1. Load Config
    function loadServerConfig() {
        // Add loading animation or visual feedback if needed
        refreshServerBtn.classList.add('rotating'); // Assuming we might add a rotation class later
        serverSelect.innerHTML = '<option value="" disabled selected>加载中...</option>';
        serverSelect.disabled = true;

        fetch('/api/config')
            .then(response => response.json())
            .then(data => {
                serverSelect.innerHTML = '';
                if (data.servers && data.servers.length > 0) {
                    data.servers.forEach(server => {
                        const option = document.createElement('option');
                        option.value = server.address; // Use 'address' from JSON
                        option.textContent = server.name;
                        serverSelect.appendChild(option);
                    });

                    // Auto Login Check
                    const session = localStorage.getItem('chat_session');
                    if (session) {
                        try {
                            const { nickname, serverUrl } = JSON.parse(session);
                            if (nickname && serverUrl) {
                                nicknameInput.value = nickname;
                                serverSelect.value = serverUrl;
                                // If server not in list (e.g. IP changed), value might be empty, so check
                                if (!serverSelect.value) {
                                    // Fallback: add option or just clear session
                                    // For now, clear session if server unavailable
                                    localStorage.removeItem('chat_session');
                                } else {
                                    // Only auto-login on initial load, not on manual refresh
                                    // We can distinguish if needed, but for now keep it simple
                                    // Or maybe we shouldn't auto-login on refresh? 
                                    // Let's just restore selection.
                                }
                            }
                        } catch (e) {
                            localStorage.removeItem('chat_session');
                        }
                    }

                } else {
                    const option = document.createElement('option');
                    option.text = "无法加载服务器列表";
                    serverSelect.appendChild(option);
                }
            })
            .catch(err => {
                console.error('Error loading config:', err);
                serverSelect.innerHTML = '<option>加载失败</option>';
            })
            .finally(() => {
                serverSelect.disabled = false;
                refreshServerBtn.classList.remove('rotating');
                
                // Try to restore session if we are on the login screen
                const session = localStorage.getItem('chat_session');
                if (session && !ws) {
                     try {
                        const { nickname, serverUrl } = JSON.parse(session);
                        if (serverUrl && Array.from(serverSelect.options).some(opt => opt.value === serverUrl)) {
                             serverSelect.value = serverUrl;
                             if (nickname) nicknameInput.value = nickname;
                        }
                     } catch(e) {}
                }
            });
    }

    // Initial Load
    loadServerConfig();

    // Refresh Button Event
    refreshServerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        loadServerConfig();
    });

    // 2. Login Logic
    loginBtn.addEventListener('click', performLogin);
    nicknameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performLogin();
    });

    function performLogin() {
        const nickname = nicknameInput.value.trim();
        const serverUrl = serverSelect.value;

        if (!nickname) {
            showError('请输入昵称');
            return;
        }
        if (!serverUrl) {
            showError('请选择服务器');
            return;
        }

        loginError.textContent = '正在连接...';
        
        // Connect to WebSocket
        try {
            // Append nickname to URL
            const url = new URL(serverUrl);
            url.searchParams.append('nickname', nickname);
            
            ws = new WebSocket(url.toString());

            ws.onopen = () => {
                currentUser = nickname;
                // Save session
                localStorage.setItem('chat_session', JSON.stringify({
                    nickname: nickname,
                    serverUrl: serverUrl
                }));
                showError(''); // Clear error
                enterChat();
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                handleMessage(data);
            };

            ws.onclose = (event) => {
                if (event.code === 1008) {
                    showError('连接断开: ' + event.reason);
                    exitChat();
                } else {
                    // Normal close or unexpected
                    console.log('Disconnected', event);
                    // Only show error if we were in chat
                    if (loginScreen.style.display === 'none') {
                        alert('与服务器断开连接');
                        exitChat();
                    }
                }
            };

            ws.onerror = (error) => {
                console.error('WebSocket Error:', error);
                showError('连接发生错误，请检查服务器地址');
            };

        } catch (e) {
            showError('无法连接到服务器: ' + e.message);
        }
    }

    function showError(msg) {
        loginError.textContent = msg;
    }

    function enterChat() {
        loginScreen.classList.remove('active');
        chatScreen.classList.add('active');
        myNickname.textContent = currentUser;
        myAvatar.textContent = currentUser.substring(0, 1).toUpperCase();
        
        // Focus input
        messageInput.focus();
    }

    function exitChat() {
        if (ws) {
            ws.close();
            ws = null;
        }
        chatScreen.classList.remove('active');
        loginScreen.classList.add('active');
        chatMessages.innerHTML = ''; // Clear history
        onlineUsersList.innerHTML = '';
        currentUser = '';
    }

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('chat_session');
        exitChat();
    });

    // 3. Chat Logic
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    function sendMessage() {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        
        const content = messageInput.value.trim();
        if (!content) return;

        const message = {
            type: 'text', // Server will re-classify if command
            content: content,
            timestamp: new Date().toISOString()
        };

        ws.send(JSON.stringify(message));
        messageInput.value = '';
        
        // Hide emoji picker if open
        emojiPicker.classList.add('hidden');
    }

    function handleMessage(data) {
        // Scroll to bottom logic
        const shouldScroll = chatMessages.scrollTop + chatMessages.clientHeight === chatMessages.scrollHeight;

        if (data.type === 'system') {
            renderSystemMessage(data);
            if (data.online_users) {
                updateOnlineUsers(data.online_users);
            }
        } else if (data.type === 'ai_stream_update') {
            // Handle streaming AI response
            const contentDiv = document.getElementById(`ai-content-${data.id}`);
            if (contentDiv) {
                // Check if it's the first chunk (still has "AI thinking" text)
                if (contentDiv.dataset.streaming === "false") {
                    contentDiv.textContent = ""; // Clear "Thinking..."
                    contentDiv.dataset.streaming = "true";
                    contentDiv.style.color = "#2d3436"; // Reset color to normal text
                    contentDiv.style.borderTop = "none";
                    contentDiv.style.paddingTop = "0";
                }
                // Append chunk
                // Simple text append. For markdown, we'd need a parser.
                // We'll preserve whitespace by using textContent + style="white-space: pre-wrap" in CSS or inline
                contentDiv.textContent += data.content;
                
                // Auto scroll if near bottom
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        } else {
            renderUserMessage(data);
        }

        // Auto scroll
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function renderSystemMessage(data) {
        const div = document.createElement('div');
        div.className = 'message system';
        div.innerHTML = `<div class="content">${escapeHtml(data.content)}</div>`;
        chatMessages.appendChild(div);
    }

    function renderUserMessage(data) {
        const isSelf = data.sender === currentUser;
        const div = document.createElement('div');
        div.className = `message ${isSelf ? 'self' : 'other'}`;
        
        const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        let contentHtml = '';
        
        if (data.type === 'movie') {
            // Video Player with Iframe
            const parseUrl = "https://jx.m3u8.tv/jiexi/?url=" + data.content;
            contentHtml = `
                <div class="message-card" style="width: 420px; max-width: 100%;">
                    <div style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 5px;">
                        <span>🎬</span> 电影分享
                    </div>
                    <div style="position: relative; width: 100%; padding-top: 100%;">
                        <iframe 
                            src="${escapeHtml(parseUrl)}" 
                            style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;" 
                            allowfullscreen
                            allow="autoplay; encrypted-media"
                        ></iframe>
                    </div>
                    <div style="padding: 8px; font-size: 0.8rem; color: #666; word-break: break-all;">
                        源地址: ${escapeHtml(data.content)}
                    </div>
                </div>
            `;
        } else if (data.type === 'ai_chat') {
            // AI Message Style - Initial State
            // data.content here is the original user query, or empty
            // data.id is the unique ID for this session
            contentHtml = `
                <div class="content">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <div class="avatar-small" style="background: #00cec9;">AI</div>
                        <span style="color: #00cec9; font-weight: bold;">川小农</span>
                    </div>
                    <div id="ai-content-${data.id}" data-streaming="false" style="font-size: 0.95rem; line-height: 1.6; color: #666; white-space: pre-wrap;">
                        🤖 AI 正在思考中...
                    </div>
                </div>
            `;
        } else {
            // Text (support simple emoji rendering if needed, but browser handles unicode)
            contentHtml = `<div class="content">${escapeHtml(data.content)}</div>`;
        }

        div.innerHTML = `
            <div class="meta">${escapeHtml(data.sender)} • ${time}</div>
            ${contentHtml}
        `;
        
        chatMessages.appendChild(div);
    }

    function updateOnlineUsers(users) {
        userCount.textContent = users.length;
        onlineUsersList.innerHTML = '';
        
        users.forEach(user => {
            const div = document.createElement('div');
            div.className = 'user-list-item';
            div.innerHTML = `
                <div class="avatar-small">${user.substring(0,1).toUpperCase()}</div>
                <span>${escapeHtml(user)}</span>
            `;
            onlineUsersList.appendChild(div);
        });
    }

    // Utility
    function escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Emoji Picker
    emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        emojiPicker.classList.toggle('hidden');
    });
    
    document.addEventListener('click', (e) => {
        if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
            emojiPicker.classList.add('hidden');
        }
    });

    // Delegate emoji clicks
    emojiPicker.addEventListener('click', (e) => {
        if (e.target.tagName === 'SPAN') {
            messageInput.value += e.target.textContent;
            messageInput.focus();
        }
    });

    // Global command helper
    window.insertCommand = function(cmd) {
        messageInput.value = cmd;
        messageInput.focus();
    };
});
