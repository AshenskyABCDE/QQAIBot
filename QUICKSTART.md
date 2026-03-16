# 快速参考卡

## 🔑 配置速查表

### config.json 必填字段

```json
{
  "napcat": {
    "accessToken": "从 NapCat 配置文件中复制"
  },
  "bot": {
    "botQQ": "机器人QQ号"
  },
  "ai": {
    "apiKey": "sk-从 Moonshot 平台复制"
  },
  "security": {
    "adminQQ": "你的QQ号"
  }
}
```

## 📋 获取凭证步骤

### 1. 获取 NapCat AccessToken

```
1. 运行 napcat/napcat.bat
2. 扫码登录机器人 QQ
3. 打开 napcat/config/你的QQ号.json
4. 复制 accessToken 的值
```

### 2. 获取 Moonshot API Key

```
1. 访问 https://platform.moonshot.cn
2. 注册并实名认证
3. 充值（10-20元够用很久）
4. 创建 API Key
5. 复制 sk- 开头的密钥
```

## 🚀 常用命令

```bash
# 启动项目
npm start

# 访问界面
http://localhost:3456

# 停止项目
Ctrl + C
```

## 🐛 常见问题速查

| 问题 | 解决方法 |
|-----|---------|
| 找不到 axios | `cd bridge && npm install` |
| NapCat 未找到 | 通过界面「路径设置」选择 |
| API Key 无效 | 检查余额是否充足 |
| 机器人不回复 | 查看 Bridge 日志排查 |

## 📁 文件说明

| 文件 | 作用 | 是否包含敏感信息 |
|-----|------|----------------|
| `bridge/config.json` | 主配置 | ✅ 是，不要上传 |
| `bridge/persona.json` | 人设配置 | ⚠️ 可能包含QQ号 |
| `.napcat-path.json` | NapCat路径 | ❌ 否 |
| `napcat/` | NapCat程序 | ❌ 否，但很大 |

## 🔒 安全提醒

- ❌ **不要**将 config.json 上传到 GitHub
- ❌ **不要**分享你的 API Key
- ❌ **不要**分享你的 AccessToken
- ✅ 已添加到 .gitignore，默认会被忽略

## 💡 省钱技巧

Moonshot API 按用量计费：
- 输入：约 12元/百万字符
- 输出：约 12元/百万字符
- 一般聊天：1分钱可以聊几十条
- 建议充值 10-20 元够用很久

## 📞 需要帮助？

1. 查看 [完整教程](./TUTORIAL.md)
2. 查看 Bridge 日志错误信息
3. 检查配置文件是否正确

---

**保存这份卡片，随时查阅！** 📌
