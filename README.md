# NapCat Web Manager

🐱 一个用于可视化管理和部署 NapCat QQ Bot 的 Web 界面工具。

> 📖 **零基础？** 查看 [完整图文教程](./TUTORIAL.md)

## 🚀 快速开始（5分钟上手）

### 0. 准备材料

开始前，你需要准备：
- [ ] **QQ 小号**（作为机器人，建议新注册）
- [ ] **你的 QQ 号**（作为管理员）
- [ ] **Moonshot API Key**（[如何获取？](./TUTORIAL.md#四第三步获取-moonshot-api-key)）
- [ ] **NapCat AccessToken**（[如何获取？](./TUTORIAL.md#三第二步获取-accesstoken)）

### 1. 下载 NapCat

```bash
# 1. 下载 NapCat
# 地址：https://github.com/NapNeko/NapCatQQ/releases
# 下载后解压到 napcat/ 文件夹

# 2. 首次运行 NapCat（获取 AccessToken）
napcat/napcat.bat
# 扫码登录你的 QQ 小号
# 在 napcat/config/你的QQ号.json 中找到 accessToken
```

### 2. 克隆项目并安装依赖

```bash
git clone https://github.com/yourusername/napcat-web-manager.git
cd napcat-web-manager

# 安装依赖
npm install
cd bridge && npm install && cd ..
```

### 3. 填写配置

编辑 `bridge/config.json`：

```json
{
  "napcat": {
    "accessToken": "从这里复制你的 AccessToken"
  },
  "bot": {
    "botQQ": "你的机器人QQ号"
  },
  "ai": {
    "apiKey": "sk-从这里复制你的Moonshot-API-Key"
  },
  "security": {
    "adminQQ": "你的QQ号"
  }
}
```

### 4. 启动！

```bash
npm start
```

访问 http://localhost:3456，点击「一键启动」！

### 1. 克隆项目

```bash
git clone https://github.com/yourusername/napcat-web-manager.git
cd napcat-web-manager
```

### 2. 安装依赖

```bash
npm install
cd bridge && npm install && cd ..
```

### 3. 配置 NapCat

**方式一：自动检测（推荐）**
将 NapCat 放在项目目录的 `napcat/` 文件夹中：
```
napcat-web-manager/
├── napcat/          <-- 放在这里
│   ├── napcat.bat
│   └── ...
├── bridge/
├── public/
└── server.js
```

**方式二：通过界面设置**
1. 启动服务器: `npm start`
2. 打开 http://localhost:3456
3. 进入「🔧 路径设置」页面
4. 点击「选择 NapCat 文件夹」

**方式三：环境变量**
```bash
set NAPCAT_PATH=F:\下载\NapCat.44498.Shell
```

### 4. 配置 Bridge

编辑 `bridge/config.json`，填入你的信息：

```json
{
  "napcat": {
    "wsUrl": "ws://127.0.0.1:3001",
    "accessToken": "你的NapCat-AccessToken"
  },
  "bot": {
    "botQQ": "你的机器人QQ号",
    "replyPrivate": true,
    "replyGroupAt": true
  },
  "ai": {
    "provider": "moonshot",
    "model": "kimi-k2.5",
    "apiKey": "sk-你的Moonshot-API-Key",
    "baseUrl": "https://api.moonshot.cn/v1"
  },
  "security": {
    "adminQQ": "你的QQ号",
    "creatorQQ": "你的QQ号",
    "mode": "relaxed"
  }
}
```

### 5. 启动

```bash
npm start
```

访问 http://localhost:3456

---

## 📁 项目结构

```
napcat-web-manager/
├── bridge/                  # Bridge 代码
│   ├── bridge.js           # 主程序
│   ├── config.json         # 配置文件（需自行填写）
│   ├── persona.json        # 人设配置
│   └── package.json
├── public/                 # 前端文件
│   ├── index.html
│   ├── css/
│   └── js/
├── server.js               # 后端服务器
├── package.json
├── start.bat               # Windows 启动脚本
└── README.md
```

---

## 🔧 配置说明

### 获取 NapCat AccessToken

1. 启动 NapCat
2. 在 NapCat 的配置文件中查看 accessToken
3. 或留空（如果 NapCat 未设置 token）

### 获取 Moonshot API Key

1. 访问 https://platform.moonshot.cn
2. 登录账号
3. 进入「API Key 管理」
4. 创建新的 API Key
5. 复制以 `sk-` 开头的密钥

### 获取 QQ 号

- **机器人QQ号**: 你的 QQ Bot 账号
- **管理员QQ号**: 你自己的 QQ 号（拥有最高权限）

---

## 🎭 人设配置

编辑 `bridge/persona.json` 来自定义机器人的性格：

```json
{
  "bot": {
    "name": "小K",
    "identity": "AI助手",
    "traits": ["友善", "聪明"]
  },
  "contacts": {
    "master": {
      "qq": "你的QQ号",
      "name": "主人",
      "interaction": {
        "proactive": true
      }
    }
  }
}
```

---

## 🖥️ 界面功能

| 功能 | 说明 |
|------|------|
| 📋 Bridge 日志 | 实时显示 AI 调用日志 |
| 💬 消息监控 | 查看收到的 QQ 消息 |
| 🔧 路径设置 | 配置 NapCat 位置 |
| 🛠️ Skills | 管理 OpenClaw 技能 |
| ⚙️ 配置 | 编辑 config.json |
| 🎭 人设 | 编辑 persona.json |
| 📝 代码 | 编辑 bridge.js |

---

## ⚠️ 注意事项

1. **config.json 和 persona.json 包含敏感信息，不要上传到 GitHub！**
2. 已在 `.gitignore` 中忽略这些文件
3. 首次使用需要配置 API Key 才能正常回复
4. 修改配置后需要重启 Bridge

---

## 🐛 故障排除

### NapCat 未找到
```
⚠️ NapCat 未找到！
```
**解决**: 通过「🔧 路径设置」页面选择 NapCat 文件夹

### API Key 无效
```
[AI] 请求失败: 401
```
**解决**: 检查 config.json 中的 apiKey 是否正确

### 无法连接 NapCat
```
[WebSocket] 错误: connect ECONNREFUSED
```
**解决**: 确保 NapCat 已启动并显示二维码

---

## 📄 许可证

MIT

---

Made with ❤️ for NapCat
