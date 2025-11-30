import os
import json
import socket
import uuid
import tornado.ioloop
import tornado.web
import tornado.websocket
import tornado.escape
from openai import AsyncOpenAI

# Store connected users: {nickname: WebSocketHandler}
clients = {}

# AI Config
AI_API_KEY = "sk-orxlsmelhexcosqumhchsiabeasxhwkmvcfzqqjakwhqoaqv"
AI_BASE_URL = "https://api.siliconflow.cn/v1"
AI_MODEL = "Qwen/Qwen2.5-7B-Instruct"

# Initialize AsyncOpenAI client
ai_client = AsyncOpenAI(
    api_key=AI_API_KEY,
    base_url=AI_BASE_URL
)

class BaseHandler(tornado.web.RequestHandler):
    def get_current_user(self):
        return self.get_secure_cookie("user")

class MainHandler(BaseHandler):
    def get(self):
        self.render("index.html")

class ConfigHandler(BaseHandler):
    def get(self):
        # Load config and return it
        try:
            with open("config.json", "r", encoding="utf-8") as f:
                config = json.load(f)
            
            # Dynamically add LAN IP
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                s.connect(("8.8.8.8", 80))
                ip = s.getsockname()[0]
                s.close()
                
                # Check if already in config to avoid duplicates (simple check)
                has_ip = any(ip in srv["address"] for srv in config.get("servers", []))
                if not has_ip:
                    config["servers"].append({
                        "name": f"局域网 ({ip})",
                        "address": f"ws://{ip}:8888/ws"
                    })
            except:
                pass

            self.write(config)
        except Exception as e:
            self.write({"servers": []})

class ChatWebSocket(tornado.websocket.WebSocketHandler):
    def check_origin(self, origin):
        return True

    def open(self):
        self.nickname = self.get_argument("nickname", None)
        if not self.nickname:
            self.close(code=1008, reason="Nickname required")
            return
        
        if self.nickname in clients:
            self.close(code=1008, reason="Nickname already taken")
            return
        
        clients[self.nickname] = self
        print(f"User connected: {self.nickname}")
        
        # Broadcast join message
        self.broadcast({
            "type": "system",
            "content": f"{self.nickname} 加入了聊天室",
            "online_users": list(clients.keys())
        })

    def on_message(self, message):
        try:
            data = json.loads(message)
            msg_type = data.get("type", "text")
            content = data.get("content", "")
            
            # Handle commands
            if content.startswith("@电影 "):
                # Format: @电影 https://example.com/video.mp4
                url = content.split(" ", 1)[1]
                response = {
                    "type": "movie",
                    "sender": self.nickname,
                    "content": url,
                    "raw_content": content,
                    "timestamp": data.get("timestamp")
                }
            elif content.startswith("@川小农"):
                # Format: @川小农 hello
                # Broadcast user's message first so everyone sees the question
                user_msg = {
                    "type": "text",
                    "sender": self.nickname,
                    "content": content,
                    "timestamp": data.get("timestamp")
                }
                self.broadcast(user_msg)

                # Prepare for AI response
                user_query = content.replace("@川小农", "").strip()
                if not user_query:
                    user_query = "你好"

                # Generate a unique ID for this AI response session
                response_id = str(uuid.uuid4())
                
                # Send initial "AI thinking" placeholder
                init_response = {
                    "type": "ai_chat",
                    "sender": "川小农",
                    "content": user_query, # Pass original query to display context if needed
                    "id": response_id,
                    "timestamp": data.get("timestamp")
                }
                self.broadcast(init_response)

                # Spawn async task to stream AI response
                tornado.ioloop.IOLoop.current().spawn_callback(
                    self.stream_ai_response, user_query, response_id
                )
                return # Return here to avoid double broadcasting

            else:
                response = {
                    "type": "text",
                    "sender": self.nickname,
                    "content": content,
                    "timestamp": data.get("timestamp")
                }
            
            self.broadcast(response)
            
        except Exception as e:
            print(f"Error handling message: {e}")

    async def stream_ai_response(self, query, response_id):
        try:
            stream = await ai_client.chat.completions.create(
                model=AI_MODEL,
                messages=[
                    {"role": "system", "content": """角色：你是一名计算机科学与技术专业的方案编写助手
功能：
1、你可以接收用户输入的信息或关键字，通过信息或关键字，你可以分析生成与之有关的10个文案主题，以供用户选择。主题列表形式如下：
[1]xxxxxxx
[2]uuuuuuuuu
……
2、你需要提示用户选择主题编号，并通过该主题编号对应的主题内容，生成两种风格的大纲，大纲需要包含一级、二级标题，风格如下：
风格一：专业风
风格二：学生风
3、你需要提示用户选择风格，并按风格生成与之对应的详细内容。"""},
                    {"role": "user", "content": query}
                ],
                stream=True
            )

            async for chunk in stream:
                if chunk.choices[0].delta.content is not None:
                    content = chunk.choices[0].delta.content
                    # Broadcast chunk to all clients
                    update_msg = {
                        "type": "ai_stream_update",
                        "id": response_id,
                        "content": content
                    }
                    self.broadcast(update_msg)
            
            # Optional: Send completion message if needed, or just stop
            
        except Exception as e:
            print(f"AI Error: {e}")
            # Send error message to UI
            error_msg = {
                "type": "ai_stream_update",
                "id": response_id,
                "content": "\n[系统错误: AI连接失败]"
            }
            self.broadcast(error_msg)

    def on_close(self):
        # Only remove from clients if THIS specific connection is the one registered
        if hasattr(self, 'nickname') and self.nickname in clients:
            if clients[self.nickname] == self:
                del clients[self.nickname]
                print(f"User disconnected: {self.nickname}")
                self.broadcast({
                    "type": "system",
                    "content": f"{self.nickname} 离开了聊天室",
                    "online_users": list(clients.keys())
                })
            else:
                print(f"Duplicate connection closed for {self.nickname}, keeping original.")

    def broadcast(self, message_dict):
        for nickname, client in clients.items():
            try:
                client.write_message(json.dumps(message_dict))
            except:
                print(f"Error sending to {nickname}")

def make_app():
    return tornado.web.Application([
        (r"/", MainHandler),
        (r"/api/config", ConfigHandler),
        (r"/ws", ChatWebSocket),
    ],
    template_path=os.path.join(os.path.dirname(__file__), "templates"),
    static_path=os.path.join(os.path.dirname(__file__), "static"),
    cookie_secret="__TODO:_GENERATE_YOUR_OWN_RANDOM_VALUE_HERE__",
    debug=True)

if __name__ == "__main__":
    app = make_app()
    print("Server started on http://localhost:8888")
    app.listen(8888, "0.0.0.0")
    tornado.ioloop.IOLoop.current().start()
