# NapCat Web Manager - 完整使用教程

🐱 零基础教程：从下载到运行，手把手教你部署 QQ AI 机器人

---

## 📋 目录

1. [准备工作](#一准备工作)
2. [第一步：下载 NapCat](#二第一步下载-napcat)
3. [第二步：获取 AccessToken](#三第二步获取-accesstoken)
4. [第三步：获取 Moonshot API Key](#四第三步获取-moonshot-api-key)
5. [第四步：配置项目](#五第四步配置项目)
6. [第五步：启动运行](#六第五步启动运行)
7. [常见问题](#七常见问题)

---

## 一、准备工作

在开始之前，你需要准备：

- [ ] 一台 Windows 电脑
- [ ] 一个 QQ 小号（作为机器人）
- [ ] 你的主力 QQ 号（作为管理员）
- [ ] 网络连接

---

## 二、第一步：下载 NapCat

### 什么是 NapCat？

NapCat 是一个让 QQ 变成机器人的工具。你可以理解为它是 QQ 的"外挂"，让 QQ 能接收和发送消息。

### 下载步骤

1. **打开下载页面**
   - 访问：https://github.com/NapNeko/NapCatQQ/releases
   
2. **下载最新版本**
   - 找到最新的 Release
   - 下载文件名类似：`NapCat.44498.Shell.zip`
   - 这是一个压缩包，需要解压

3. **解压到项目目录**
   ```
   你的项目文件夹/
   ├── napcat/          <-- 解压到这里
   │   ├── napcat.bat
   │   ├── QQ.exe
   │   └── ...
   └── ...
   ```

---

## 三、第二步：获取 AccessToken

### 什么是 AccessToken？

AccessToken 是 NapCat 的"密码"。Bridge 需要这个密码才能连接到 NapCat。

### 获取步骤

#### 方法1：通过 NapCat 配置文件（推荐）

1. **首次启动 NapCat**
   - 双击运行 `napcat/napcat.bat`
   - 会弹出一个黑色窗口（这是 NapCat）
   - 等待几秒，会显示一个二维码

2. **扫码登录**
   - 用手机 QQ 扫描窗口中的二维码
   - 登录你的**机器人 QQ 号**（不是主号！）
   - 登录成功后，窗口会显示很多日志

3. **找到配置文件**
   - 打开文件夹：`napcat/config/`
   - 找到一个 `.json` 文件（文件名是一串数字，是你的 QQ 号）
   - 用记事本打开这个文件

4. **复制 AccessToken**
   ```json
   {
     "accessToken": "605df68dbe0515c7dea345218b98faaae2cde47e6b257c30",
     ...
   }
   ```
   - 复制 `accessToken` 后面的值（引号里的内容）
   - **保存好这个值，后面要用！**

#### 方法2：如果没有配置文件

1. 在 NapCat 窗口中输入命令：
   ```
   /get_token
   ```
2. 窗口会显示当前的 accessToken
3. 复制保存

---

## 四、第三步：获取 Moonshot API Key

### 什么是 Moonshot？

Moonshot（月之暗面）是 Kimi AI 的提供商。你的机器人需要调用他们的 API 才能"思考"和回复。

### 注册和获取 API Key

1. **打开官网**
   - 访问：https://platform.moonshot.cn

2. **注册账号**
   - 点击「注册」
   - 用手机号注册
   - 完成实名认证（需要身份证）

3. **充值（需要花钱）**
   - 点击左侧「充值"
   - 充值金额：建议 10-20 元（够用很久）
   - 支持支付宝/微信

4. **创建 API Key**
   - 点击左侧「API Key 管理"
   - 点击「创建 API Key"
   - 给 Key 起个名字，比如 "QQ机器人"
   - 点击确定

5. **复制 API Key**
   - 创建成功后，会显示一串字符
   - 格式：`sk-xxxxxxxxxxxxxxxxxxxxxxxx`
   - **⚠️ 这个 Key 只显示一次！立即复制保存！**
   - 如果丢失了，只能重新创建

---

## 五、第四步：配置项目

### 1. 安装依赖

打开命令提示符（CMD）或 PowerShell：

```bash
# 进入项目目录
cd F:\NapCatManager

# 安装主项目依赖
npm install

# 安装 Bridge 依赖
cd bridge
npm install
cd ..
```

### 2. 配置 config.json

打开文件：`bridge/config.json`

把模板中的占位符替换成你的真实信息：

**修改前（模板）：**
```json
{
  "napcat": {
    "accessToken": "你的NapCat-AccessToken"
  },
  "bot": {
    "botQQ": "你的机器人QQ号"
  },
  "ai": {
    "apiKey": "sk-你的Moonshot-API-Key"
  },
  "security": {
    "adminQQ": "你的QQ号"
  }
}
```

**修改后（示例）：**
```json
{
  "napcat": {
    "wsUrl": "ws://127.0.0.1:3001",
    "accessToken": "605df68dbe0515c7dea345218b98faaae2cde47e6b257c30"
  },
  "bot": {
    "botQQ": "2651740032",
    "replyPrivate": true,
    "replyGroupAt": true,
    "requireAtInGroup": false
  },
  "ai": {
    "provider": "moonshot",
    "model": "kimi-k2.5",
    "apiKey": "sk-tSvPeATdcsxs8CQytqgk0cz2YPahlrdM04bbv3eooYus356t",
    "baseUrl": "https://api.moonshot.cn/v1",
    "temperature": 1,
    "maxTokens": 2048
  },
  "security": {
    "adminQQ": "251902756",
    "creatorQQ": "251902756",
    "mode": "relaxed"
  }
}
```

**字段说明：**

| 字段 | 说明 | 怎么填 |
|-----|------|--------|
| `accessToken` | NapCat 的密码 | 从 NapCat 配置文件中复制 |
| `botQQ` | 机器人 QQ 号 | 你的机器人小号 |
| `apiKey` | Moonshot API 密钥 | 从 Moonshot 平台复制 |
| `adminQQ` | 管理员 QQ 号 | 你自己的 QQ 号 |

### 3. 配置 persona.json（可选）

这个文件决定机器人的性格。可以不改，先用默认的。

如果想改，打开 `bridge/persona.json`：

```json
{
  "bot": {
    "name": "小K",
    "identity": "AI助手"
  },
  "contacts": {
    "master": {
      "qq": "251902756",
      "name": "主人"
    }
  }
}
```

把 `master.qq` 改成你的 QQ 号。

---

## 六、第五步：启动运行

### 启动 Web 管理器

```bash
cd F:\NapCatManager
npm start
```

看到以下输出说明成功：
```
╔══════════════════════════════════════════════════════════╗
║        NapCat Web Manager 已启动                         ║
║   访问地址: http://localhost:3456                        ║
╚══════════════════════════════════════════════════════════╝
```

### 使用界面启动

1. **打开浏览器**
   - 访问：http://localhost:3456

2. **设置 NapCat 路径（首次使用）**
   - 点击「🔧 路径设置」标签
   - 点击「选择 NapCat 文件夹"
   - 选择你的 `napcat/` 文件夹
   - 点击确定

3. **一键启动**
   - 点击左侧「🚀 一键启动"
   - 等待 NapCat 窗口弹出
   - 如果显示二维码，用手机 QQ 扫描登录

4. **开始聊天**
   - 在 QQ 上给机器人发消息
   - 切换到「📋 Bridge 日志」查看回复过程

---

## 七、常见问题

### Q1: 提示 "Cannot find module 'axios'"

**原因**: Bridge 缺少依赖

**解决**:
```bash
cd bridge
npm install
cd ..
```

### Q2: 提示 "NapCat 未找到"

**原因**: 项目找不到 NapCat

**解决**:
1. 确保 NapCat 解压到了 `napcat/` 文件夹
2. 或通过界面「🔧 路径设置」手动选择

### Q3: 提示 "API Key 无效" 或 401 错误

**原因**: Moonshot API Key 错误或余额不足

**解决**:
1. 检查 `config.json` 中的 `apiKey` 是否正确
2. 登录 https://platform.moonshot.cn 查看余额
3. 如果余额为 0，需要充值

### Q4: 机器人不回复消息

**排查步骤**:
1. 查看「📋 Bridge 日志」是否有错误
2. 检查 NapCat 是否已登录（显示在线）
3. 检查 config.json 中的 `botQQ` 是否填对
4. 检查是否配置了 `apiKey`

### Q5: 如何查看 Moonshot 余额？

1. 访问 https://platform.moonshot.cn
2. 登录账号
3. 右上角显示剩余额度
4. 如果为 0，点击「充值"

---

## 📞 需要帮助？

如果还有问题：
1. 查看 Bridge 日志中的错误信息
2. 检查配置文件是否正确
3. 确保 NapCat 已正常登录

---

**祝你使用愉快！** 🎉
