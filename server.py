import os
import json
import socket
import tornado.ioloop
import tornado.web
import tornado.websocket
import tornado.escape

# Store connected users: {nickname: WebSocketHandler}
clients = {}

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
                # Future AI integration here
                response = {
                    "type": "ai_chat",
                    "sender": self.nickname,
                    "content": content, # Keep original for now
                    "timestamp": data.get("timestamp")
                }
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
