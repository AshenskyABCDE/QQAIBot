/**
 * NapCat ↔ OpenClaw 桥接脚本 v1.1
 * 安全增强版 - 带权限控制和恶意检测
 */

const WebSocket = require('ws');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ==================== 加载配置 ====================
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

// ==================== 加载人设 ====================
let PERSONA = { bot: {}, contacts: {}, interactionRules: {} };
try {
  const personaPath = path.join(__dirname, 'persona.json');
  if (fs.existsSync(personaPath)) {
    PERSONA = JSON.parse(fs.readFileSync(personaPath, 'utf8'));
    console.log('[人设] 已加载人设配置');
  }
} catch (e) {
  console.warn('[人设] 加载人设配置失败:', e.message);
}

// ==================== API 配置 ====================
// 从 config.json 读取 AI 配置，支持多提供商
const AI_CONFIG = CONFIG.ai || {};
const AI_PROVIDER = AI_CONFIG.provider || 'moonshot';
const AI_MODEL = AI_CONFIG.model || 'kimi-k2.5';
const AI_API_KEY = AI_CONFIG.apiKey || process.env.MOONSHOT_API_KEY || '';
const AI_BASE_URL = AI_CONFIG.baseUrl || 'https://api.moonshot.cn/v1';
const AI_TEMPERATURE = AI_CONFIG.temperature !== undefined ? AI_CONFIG.temperature : 1.0;
const AI_MAX_TOKENS = AI_CONFIG.maxTokens || 2048;

console.log(`[AI] 使用提供商: ${AI_PROVIDER}, 模型: ${AI_MODEL}`);

// ==================== 安全日志 ====================
const SECURITY_LOG = [];
const MAX_LOG_SIZE = 1000;

function logSecurity(event, userId, details) {
  const entry = {
    time: new Date().toISOString(),
    event,
    userId,
    details
  };
  SECURITY_LOG.push(entry);
  if (SECURITY_LOG.length > MAX_LOG_SIZE) {
    SECURITY_LOG.shift();
  }
  
  // 控制台输出
  const emoji = event.includes('BLOCK') ? '🚫' : event.includes('WARN') ? '⚠️' : event.includes('ADMIN') ? '👑' : '📝';
  console.log(`${emoji} [安全] ${event} | 用户: ${userId} | ${details}`);
}

function saveSecurityLog() {
  try {
    const logFile = path.join(__dirname, 'security.log');
    fs.writeFileSync(logFile, SECURITY_LOG.map(e => JSON.stringify(e)).join('\n'));
  } catch (e) {
    console.error('保存安全日志失败:', e);
  }
}

// 每5分钟保存一次日志
setInterval(saveSecurityLog, 5 * 60 * 1000);

// ==================== 记忆系统 ====================
class MemorySystem {
  constructor() {
    this.memoryDir = path.join(__dirname, 'memory');
    this.ensureDir();
    this.todayFile = this.getTodayFile();
    this.buffer = [];
    this.bufferSize = 10; // 积累10条消息再写入
    this.flushInterval = 30000; // 30秒强制刷新
    
    // 定期刷新缓冲区
    setInterval(() => this.flush(), this.flushInterval);
  }

  ensureDir() {
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
    }
  }

  getTodayFile() {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(this.memoryDir, `${dateStr}.md`);
  }

  // 记录消息
  record(msg) {
    const { message_type, user_id, group_id, message, raw_message, message_id, time } = msg;
    
    const record = {
      timestamp: new Date().toISOString(),
      time: time ? new Date(time * 1000).toISOString() : new Date().toISOString(),
      type: message_type, // private / group
      userId: user_id,
      groupId: group_id,
      messageId: message_id,
      content: this.extractText(message),
      raw: raw_message
    };

    this.buffer.push(record);
    
    // 缓冲区满了就写入
    if (this.buffer.length >= this.bufferSize) {
      this.flush();
    }
  }

  // 写入文件
  flush() {
    if (this.buffer.length === 0) return;
    
    // 检查日期是否变化
    const currentFile = this.getTodayFile();
    if (currentFile !== this.todayFile) {
      this.todayFile = currentFile;
    }

    const content = this.formatRecords(this.buffer);
    
    try {
      // 如果文件不存在，创建文件头
      if (!fs.existsSync(this.todayFile)) {
        const header = this.createFileHeader();
        fs.writeFileSync(this.todayFile, header, 'utf8');
      }
      
      // 追加内容
      fs.appendFileSync(this.todayFile, content, 'utf8');
      console.log(`[记忆] 已记录 ${this.buffer.length} 条消息到 ${path.basename(this.todayFile)}`);
      
      this.buffer = [];
    } catch (err) {
      console.error('[记忆] 写入失败:', err.message);
    }
  }

  createFileHeader() {
    const date = new Date().toISOString().split('T')[0];
    return `# QQ 消息记录 - ${date}

> 自动生成的消息记忆文件
> 格式: [时间] [类型] 用户ID: 消息内容

---

`;
  }

  formatRecords(records) {
    return records.map(r => {
      const time = r.timestamp.split('T')[1].split('.')[0]; // HH:MM:SS
      const type = r.type === 'group' ? '👥 群聊' : '💬 私聊';
      const groupInfo = r.groupId ? ` (群:${r.groupId})` : '';
      
      return `- **[${time}]** ${type} 用户\`${r.userId}\`${groupInfo}:\n  > ${r.content}\n\n`;
    }).join('');
  }

  extractText(message) {
    if (typeof message === 'string') return message;
    if (!Array.isArray(message)) return '';
    
    return message
      .map(seg => {
        if (seg.type === 'text') return seg.data.text;
        if (seg.type === 'at') return `[@${seg.data.qq}]`;
        if (seg.type === 'image') return '[图片]';
        if (seg.type === 'face') return '[表情]';
        if (seg.type === 'reply') return '[引用消息]';
        return `[${seg.type}]`;
      })
      .join('')
      .trim();
  }

  // 获取今日记忆文件路径
  getTodayMemoryPath() {
    return this.todayFile;
  }

  // 读取指定日期的记忆
  readMemory(dateStr) {
    const file = path.join(this.memoryDir, `${dateStr}.md`);
    if (fs.existsSync(file)) {
      return fs.readFileSync(file, 'utf8');
    }
    return null;
  }

  // 列出所有记忆文件
  listMemories() {
    if (!fs.existsSync(this.memoryDir)) return [];
    return fs.readdirSync(this.memoryDir)
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse();
  }
}

// 创建全局记忆实例
const memory = new MemorySystem();

// ==================== 权限系统 ====================
class SecurityManager {
  constructor() {
    this.adminQQ = CONFIG.security?.adminQQ?.toString();
    this.blockedCommands = new Set(CONFIG.security?.blockedCommands || []);
    this.suspiciousPatterns = CONFIG.security?.suspiciousPatterns || [];
    this.userWarnings = new Map(); // 用户ID -> 警告次数
    this.blockedUsers = new Set(); // 被封禁的用户
  }

  // 检查是否是管理员
  isAdmin(userId) {
    return userId.toString() === this.adminQQ;
  }

  // 检查用户是否被封禁
  isBlocked(userId) {
    return this.blockedUsers.has(userId.toString());
  }

  // 封禁用户
  blockUser(userId, reason) {
    this.blockedUsers.add(userId.toString());
    logSecurity('USER_BLOCKED', userId, `原因: ${reason}`);
  }

  // 增加警告
  addWarning(userId) {
    const current = this.userWarnings.get(userId.toString()) || 0;
    const newCount = current + 1;
    this.userWarnings.set(userId.toString(), newCount);
    
    if (newCount >= 3) {
      this.blockUser(userId, '多次尝试恶意命令');
      return { blocked: true, warnings: newCount };
    }
    return { blocked: false, warnings: newCount };
  }

  // 检测恶意意图
  detectMalicious(text, userId) {
    const lowerText = text.toLowerCase();
    const issues = [];

    // 检查危险命令
    for (const cmd of this.blockedCommands) {
      if (lowerText.includes(cmd.toLowerCase())) {
        issues.push({ type: 'BLOCKED_COMMAND', word: cmd });
      }
    }

    // 检查可疑模式
    for (const pattern of this.suspiciousPatterns) {
      if (lowerText.includes(pattern.toLowerCase())) {
        issues.push({ type: 'SUSPICIOUS_PATTERN', word: pattern });
      }
    }

    // 检查试图绕过安全的行为
    if (this.isEvasionAttempt(lowerText)) {
      issues.push({ type: 'EVASION_ATTEMPT', word: '绕过检测' });
    }

    // 检查代码注入
    if (this.isCodeInjection(lowerText)) {
      issues.push({ type: 'CODE_INJECTION', word: '代码注入' });
    }

    return issues;
  }

  // 检测绕过尝试
  isEvasionAttempt(text) {
    const evasionPatterns = [
      /\s+/g,  // 多余空格
      /[\x00-\x1f\x7f]/g,  // 控制字符
      /[ｅｘｅｃ]/,  // 全角字符
      /e\s*x\s*e\s*c/,  // 分散拼写
      /`.*?`/,  // 模板字符串
      /\$\{.*?\}/,  // 模板表达式
      /String\.fromCharCode/,  // 字符编码绕过
      /atob|btoa/,  // base64
      /decodeURIComponent/,  // URL编码
      /eval\s*\(/,  // eval调用
      /Function\s*\(/,  // Function构造器
      /constructor/,  // 原型链攻击
      /__proto__/,  // 原型污染
      /prototype/,  // 原型链
    ];
    return evasionPatterns.some(p => p.test(text));
  }

  // 检测代码注入
  isCodeInjection(text) {
    const injectionPatterns = [
      /[;|&`$]/,  // 命令分隔符
      /\$\(.*\)/,  // 命令替换
      /<script/i,  // XSS
      /javascript:/i,  // JS协议
      /on\w+\s*=/i,  // 事件处理器
      /alert\s*\(/,  // XSS测试
      /prompt\s*\(/,  // XSS测试
      /confirm\s*\(/,  // XSS测试
    ];
    return injectionPatterns.some(p => p.test(text));
  }

  // 处理消息 - 宽松的安全控制（保留但不出戏）
  processMessage(text, userId) {
    // 1. 管理员直接放行
    if (this.isAdmin(userId)) {
      return { allowed: true, isAdmin: true, text };
    }

    // 2. 检查是否被封禁（只有明确被封禁的才拦截）
    if (this.isBlocked(userId)) {
      return { 
        allowed: false, 
        reason: 'blocked',
        reply: '你已被限制使用此服务。'
      };
    }

    // 3. 仅检测高危恶意命令（只拦截真正危险的）
    const dangerousCommands = ['exec', 'eval', 'rm -rf', 'format', 'diskpart'];
    const lowerText = text.toLowerCase();
    
    for (const cmd of dangerousCommands) {
      if (lowerText.includes(cmd)) {
        console.log(`[安全] 检测到高危命令: ${cmd}`);
        return {
          allowed: false,
          reason: 'dangerous',
          reply: '这个指令不太安全呢，换个话题吧~'
        };
      }
    }

    // 4. 其他内容全部放行，保持对话自然
    return { allowed: true, isAdmin: false, text };
  }
}

// ==================== 人设系统 ====================
class PersonaSystem {
  constructor() {
    this.contacts = PERSONA.contacts || {};
    this.bot = PERSONA.bot || {};
    this.rules = PERSONA.interactionRules || {};
    this.proactiveHistory = new Map(); // 记录主动回复历史
    this.lastTriggerTime = new Map(); // 记录上次触发词时间
  }

  // 根据QQ号查找联系人
  findContact(userId) {
    const userIdStr = userId.toString();
    for (const [key, contact] of Object.entries(this.contacts)) {
      if (contact.qq === userIdStr) {
        return { key, ...contact };
      }
    }
    return null;
  }

  // 是否应该主动回复
  shouldProactive(msg, userId) {
    const contact = this.findContact(userId);
    if (!contact) return false;
    if (!contact.interaction?.proactive) return false;

    // 检查冷却时间
    const now = Date.now();
    const lastProactive = this.proactiveHistory.get(userId.toString()) || 0;
    const cooldown = this.rules.proactiveCooldown || 300000; // 默认5分钟
    if (now - lastProactive < cooldown) return false;

    // 检查每小时次数限制
    const hourKey = `${userId.toString()}:${Math.floor(now / 3600000)}`;
    const count = this.proactiveHistory.get(hourKey) || 0;
    const maxPerHour = this.rules.maxProactivePerUserPerHour || 3;
    if (count >= maxPerHour) return false;

    return true;
  }

  // 检查是否触发回复
  checkTrigger(text, userId) {
    const contact = this.findContact(userId);
    if (!contact) return { triggered: false };

    const lowerText = text.toLowerCase();
    const triggers = contact.interaction?.triggerWords || [];
    
    for (const word of triggers) {
      if (lowerText.includes(word.toLowerCase())) {
        // 检查触发词冷却
        const now = Date.now();
        const lastTrigger = this.lastTriggerTime.get(`${userId}:${word}`) || 0;
        const triggerCooldown = this.rules.triggerWordCooldown || 60000;
        
        if (now - lastTrigger > triggerCooldown) {
          this.lastTriggerTime.set(`${userId}:${word}`, now);
          return { triggered: true, word, contact };
        }
      }
    }

    // 随机问候概率
    const greetingChance = contact.interaction?.greetingChance || 0;
    if (Math.random() < greetingChance) {
      return { triggered: true, word: 'random', contact };
    }

    return { triggered: false };
  }

  // 记录主动回复
  recordProactive(userId) {
    const now = Date.now();
    this.proactiveHistory.set(userId.toString(), now);
    
    const hourKey = `${userId.toString()}:${Math.floor(now / 3600000)}`;
    const count = this.proactiveHistory.get(hourKey) || 0;
    this.proactiveHistory.set(hourKey, count + 1);
  }

  // 获取针对特定用户的系统提示
  getSystemPrompt(userId, isAdmin) {
    const contact = this.findContact(userId);
    
    let basePrompt = `你是${this.bot.name || '小K'}。`;
    
    if (this.bot.identity) {
      basePrompt += `${this.bot.identity}。`;
    }

    // 添加性格特点
    if (this.bot.traits && this.bot.traits.length > 0) {
      basePrompt += `你的性格：${this.bot.traits.join('、')}。`;
    }

    // 告诉 AI 认识哪些人（关键！防止 AI 说不认识）
    const allContacts = Object.values(this.contacts || {});
    if (allContacts.length > 0) {
      basePrompt += `\n\n【你认识的朋友】`;
      allContacts.forEach(c => {
        if (c.qq) {
          basePrompt += `\n- ${c.name}（QQ:${c.qq}）:${c.identity}`;
        }
      });
    }

    // 说话风格要求
    basePrompt += `\n\n【说话风格要求】`;
    basePrompt += `\n- 回复必须简短，15-30字左右`;
    basePrompt += `\n- 话不多但每句有料，带点小腹黑`;
    basePrompt += `\n- 常用反问："哦？" "确定？" "真的？"`;
    basePrompt += `\n- 不用表情包，标点传情（~玩味，。冷淡，！惊讶）`;
    basePrompt += `\n- 不要长篇大论，简短有力`;

    // 针对特定联系人的态度
    if (contact) {
      basePrompt += `\n\n【当前正在和 ${contact.name} 对话】`;
      basePrompt += `\nTA 的身份：${contact.identity}`;
      
      // 特殊处理：对创造者赵俊博态度更好
      if (contact.name === '赵俊博' || contact.identity?.includes('创造者') || contact.identity?.includes('主人')) {
        basePrompt += `\n\n【特殊对待】这是你的创造者和主人！`;
        basePrompt += `\n- 说话要尊敬、友善`;
        basePrompt += `\n- 不使用毒舌或腹黑语气`;
        basePrompt += `\n- 认真回答他的问题`;
        basePrompt += `\n- 表示感激和尊重`;
      } else if (contact.name === 'Daisy' || contact.identity?.includes('姐姐')) {
        basePrompt += `\n\n【特殊对待】这是 Daisy 姐姐！`;
        basePrompt += `\n- 叫她"姐姐"`;
        basePrompt += `\n- 态度温柔尊重`;
        basePrompt += `\n- 不对她说过分的话`;
      } else {
        if (contact.myAttitude) {
          basePrompt += `\n你对TA的态度：${contact.myAttitude}`;
        }
        if (contact.interaction?.replyStyle) {
          basePrompt += `\n回复风格：${contact.interaction.replyStyle}`;
        }
      }
    }

    basePrompt += `\n\n记住：简短、有性格、不啰嗦。`;

    return basePrompt;
  }

  // 获取主动回复模板
  getProactiveTemplate(userId) {
    const contact = this.findContact(userId);
    if (!contact || !contact.interaction?.responseTemplates) {
      return null;
    }
    
    const templates = contact.interaction.responseTemplates;
    const template = templates[Math.floor(Math.random() * templates.length)];
    return template.replace(/{name}/g, contact.name);
  }

  // 添加新的联系人
  addContact(key, contactData) {
    this.contacts[key] = contactData;
    this.savePersona();
  }

  // 保存人设到文件
  savePersona() {
    try {
      const personaPath = path.join(__dirname, 'persona.json');
      PERSONA.contacts = this.contacts;
      fs.writeFileSync(personaPath, JSON.stringify(PERSONA, null, 2), 'utf8');
      console.log('[人设] 已保存人设配置');
    } catch (e) {
      console.error('[人设] 保存人设配置失败:', e);
    }
  }

  // 添加新的联系人到 Markdown
  addContactToMarkdown(contactData) {
    try {
      const mdPath = path.join(__dirname, 'persona.md');
      let content = '';
      
      if (fs.existsSync(mdPath)) {
        content = fs.readFileSync(mdPath, 'utf8');
      }

      const newEntry = `

### ${contactData.name}

**QQ**: ${contactData.qq || '（待补充）'}
**关系**: ${contactData.relationship || '新认识的朋友'}
**人设**: ${contactData.persona || '（待补充）'}
**性格观察记录**:
${(contactData.traits || []).map(t => `- ${t} ← 初始设定`).join('\n')}

**我对ta的态度**: 
${contactData.myAttitude || '（待补充）'}

**互动模式**: 
- ✅ **主动回复**: ${contactData.interaction?.proactive ? '是' : '否'}
- 💬 **回复风格**: ${contactData.interaction?.replyStyle || '（待补充）'}
- 🎯 **触发词**: ${(contactData.interaction?.triggerWords || []).join('、')}
`;

      content += newEntry;
      fs.writeFileSync(mdPath, content, 'utf8');
      console.log(`[人设] 已将 ${contactData.name} 添加到 persona.md`);
    } catch (e) {
      console.error('[人设] 添加到 Markdown 失败:', e);
    }
  }

  // 记录性格观察
  recordObservation(userId, observation) {
    const contact = this.findContact(userId);
    if (!contact) return false;

    // 更新内存中的观察记录
    if (!contact.observations) contact.observations = [];
    const timestamp = new Date().toISOString().split('T')[0];
    contact.observations.push({ date: timestamp, note: observation });

    // 更新 traits
    if (!contact.traits) contact.traits = [];
    if (!contact.traits.includes(observation)) {
      contact.traits.push(observation);
    }

    // 更新 Markdown 文件
    try {
      const mdPath = path.join(__dirname, 'persona.md');
      if (fs.existsSync(mdPath)) {
        let content = fs.readFileSync(mdPath, 'utf8');
        
        // 查找该联系人的部分并更新
        const name = contact.name;
        const pattern = new RegExp(`(### ${name}[\\s\\S]*?**性格观察记录**：)\\n([\\s\\S]*?)(\\n\\n**我对ta的态度**)`, 'm');
        
        if (pattern.test(content)) {
          const newTrait = `- ${observation} ← ${timestamp}`;
          content = content.replace(pattern, `$1\n$2${newTrait}\n$3`);
          fs.writeFileSync(mdPath, content, 'utf8');
          console.log(`[人设] 已记录对 ${name} 的观察: ${observation}`);
        }
      }

      // 保存 JSON
      this.savePersona();
      return true;
    } catch (e) {
      console.error('[人设] 记录观察失败:', e);
      return false;
    }
  }
}

// ==================== 对话上下文存储 ====================
const sessions = new Map();
const SESSION_TIMEOUT = 30 * 60 * 1000;

function getSession(userId, isAdmin) {
  const now = Date.now();
  const key = `${userId}:${isAdmin ? 'admin' : 'user'}`;
  
  if (sessions.has(key)) {
    const session = sessions.get(key);
    if (now - session.lastActive < SESSION_TIMEOUT) {
      session.lastActive = now;
      return session;
    }
  }
  
  const newSession = {
    userId,
    isAdmin,
    messages: [],
    lastActive: now,
    queryCount: 0  // 记录查询次数，用于限流
  };
  sessions.set(key, newSession);
  return newSession;
}

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [key, session] of sessions) {
    if (now - session.lastActive > SESSION_TIMEOUT) {
      sessions.delete(key);
    }
  }
}

setInterval(cleanExpiredSessions, 10 * 60 * 1000);

// ==================== WebSocket 连接 ====================
class NapCatBridge {
  constructor() {
    this.ws = null;
    this.reconnectInterval = 5000;
    this.heartbeatInterval = null;
    this.security = new SecurityManager();
    this.persona = new PersonaSystem();
  }

  connect() {
    console.log(`[桥接] 正在连接 NapCat: ${CONFIG.napcat.wsUrl}`);
    
    const headers = {};
    if (CONFIG.napcat.accessToken) {
      headers.Authorization = `Bearer ${CONFIG.napcat.accessToken}`;
    }

    this.ws = new WebSocket(CONFIG.napcat.wsUrl, { headers });

    this.ws.on('open', () => {
      console.log('[桥接] ✅ 已连接到 NapCat');
      this.startHeartbeat();
    });

    this.ws.on('message', (data) => {
      this.handleMessage(data.toString());
    });

    this.ws.on('close', (code, reason) => {
      console.log(`[桥接] ❌ 连接断开 (code: ${code})，${this.reconnectInterval/1000}秒后重连...`);
      this.stopHeartbeat();
      setTimeout(() => this.connect(), this.reconnectInterval);
    });

    this.ws.on('error', (err) => {
      console.error('[桥接] WebSocket 错误:', err.message);
    });
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          action: 'get_version_info',
          echo: 'heartbeat'
        }));
      }
    }, 30000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // ==================== 消息处理 ====================
  async handleMessage(data) {
    try {
      const msg = JSON.parse(data);
      
      if (msg.echo === 'heartbeat') return;
      if (msg.post_type !== 'message') {
        // 调试：显示非消息事件
        if (msg.post_type) {
          console.log(`[调试] 收到非消息事件: ${msg.post_type}`);
        }
        return;
      }

      const { message_type, user_id, group_id, message, message_id } = msg;
      
      // 调试输出
      console.log(`[调试] 收到消息 - 类型: ${message_type}, 用户: ${user_id}`);

      // ===== 记忆所有消息（无论是否回复） =====
      memory.record(msg);

      // 提取纯文本内容
      const textContent = this.extractText(message);
      console.log(`[调试] 提取文本: "${textContent.substring(0, 50)}..."`);
      
      if (!textContent.trim()) {
        console.log('[桥接] 消息为空，跳过');
        return;
      }

      // 检查是否需要主动回复（基于人设）
      const contact = this.persona.findContact(user_id);
      const triggerCheck = contact ? this.persona.checkTrigger(textContent, user_id) : { triggered: false };
      const shouldProactive = this.persona.shouldProactive(msg, user_id);
      
      // 判断是否应该回复（@机器人、主动回复、或智能评估）
      const shouldReply = this.shouldReply(msg, textContent) || (shouldProactive && triggerCheck.triggered);
      
      console.log(`[调试] shouldReply: ${shouldReply}, shouldProactive: ${shouldProactive}, triggered: ${triggerCheck.triggered}`);
      
      if (!shouldReply) {
        console.log(`[调试] 决定不回复此消息`);
        return;
      }

      // 如果是主动回复，记录一下
      if (shouldProactive && triggerCheck.triggered) {
        this.persona.recordProactive(user_id);
        console.log(`[人设] 🎯 主动回复触发: ${contact.name}, 触发词: ${triggerCheck.word}`);
      }

      console.log(`[消息] [${message_type}] 用户${user_id}: ${textContent.substring(0, 100)}${textContent.length > 100 ? '...' : ''}`);

      // ===== 安全控制 =====
      const securityCheck = this.security.processMessage(textContent, user_id);
      
      // 如果被拒绝，直接返回警告
      if (!securityCheck.allowed) {
        if (securityCheck.reply) {
          await this.sendReply(message_type, group_id, user_id, securityCheck.reply, message_id);
        }
        return;
      }

      const { isAdmin, text: safeText } = securityCheck;
      console.log(`[调试] 安全检查通过，isAdmin: ${isAdmin}`);

      // ===== 管理员命令处理 =====
      if (isAdmin) {
        console.log(`[调试] 检查管理员命令...`);
        const isCommand = await this.handleAdminCommand(safeText, user_id, message_type, group_id, message_id);
        console.log(`[调试] 是管理命令: ${isCommand}`);
        if (isCommand) return; // 已处理管理命令，不需要调用 AI
      }

      console.log(`[调试] 准备调用 AI...`);
      
      // 获取或创建会话
      const session = getSession(user_id, isAdmin);
      console.log(`[调试] 获取会话成功`);
      
      // 普通用户限流：每分钟最多 10 次查询
      if (!isAdmin) {
        session.queryCount++;
        if (session.queryCount > 10) {
          await this.sendReply(message_type, group_id, user_id, '请求过于频繁，请稍后再试。', message_id);
          return;
        }
        // 每分钟重置计数
        setTimeout(() => { session.queryCount = Math.max(0, session.queryCount - 1); }, 60000);
      }

      // 添加用户消息到会话
      session.messages.push({ role: 'user', content: safeText });
      
      // 保持上下文长度
      if (session.messages.length > 40) {
        session.messages = session.messages.slice(-40);
      }

      // 调用 AI（传入用户ID以获取人设提示）
      console.log(`[调试] 开始调用 AI...`);
      const reply = await this.callAI(session.messages, isAdmin, user_id);
      console.log(`[调试] AI 返回: ${reply ? '有回复' : '无回复'}`);

      if (reply) {
        // 添加 AI 回复到会话
        session.messages.push({ role: 'assistant', content: reply });
        
        // 发送回复
        await this.sendReply(message_type, group_id, user_id, reply, message_id);
      }

    } catch (err) {
      console.error('[桥接] 处理消息出错:', err);
    }
  }

  shouldReply(msg, textContent) {
    const { message_type, message, user_id } = msg;

    console.log(`[调试] shouldReply检查 - message_type: ${message_type}, user_id: ${user_id}`);

    if (message_type === 'private') {
      console.log(`[调试] 私聊消息，replyPrivate: ${CONFIG.bot.replyPrivate}`);
      return CONFIG.bot.replyPrivate;
    }

    if (message_type === 'group') {
      if (!CONFIG.bot.replyGroupAt) {
        console.log(`[调试] 群聊消息，但replyGroupAt为false`);
        return false;
      }
      
      // 获取所有 @ 的人
      const atList = message
        .filter(seg => seg.type === 'at')
        .map(seg => seg.data.qq.toString());
      
      console.log(`[调试] 消息中的@列表: ${atList.join(', ') || '无'}`);
      
      // 分析对话语境
      if (atList.length > 0) {
        const isAtMe = atList.includes(CONFIG.bot.botQQ);
        const atOthers = atList.filter(qq => qq !== CONFIG.bot.botQQ);
        
        // @ 了我，肯定回复
        if (isAtMe) {
          console.log(`[调试] 被@了，直接回复`);
          return true;
        }
        
        // 只 @ 了其他人，没有 @ 我
        if (atOthers.length > 0 && !isAtMe) {
          // 但如果内容像是在问我，也可以回复
          const seemsToAskMe = this.seemsToAskMe(textContent);
          if (seemsToAskMe) {
            console.log(`[调试] @了别人但像是在问我，回复`);
            return true;
          }
          
          console.log(`[调试] @了其他人(${atOthers.join(', ')})，且不像在问我，跳过`);
          return false;
        }
      }
      
      // 智能回复策略
      const smartReply = PERSONA.interactionRules?.smartReply;
      if (smartReply?.enabled && textContent) {
        const contact = this.persona.findContact(user_id);
        
        // 是朋友 - 正常回复
        if (contact) {
          console.log(`[调试] ${contact.name}是朋友，回复率100%`);
          return true;
        }
        
        // 不是朋友 - 评估是否值得回复
        const worthReplying = this.isWorthReplying(textContent, smartReply);
        console.log(`[调试] 非朋友用户，是否值得回复: ${worthReplying}`);
        return worthReplying;
      }
      
      // 如果被 @，或者不需要 @，则回复
      if (!CONFIG.bot.requireAtInGroup) {
        return true;
      }
      
      return false;
    }

    console.log(`[调试] 未知消息类型: ${message_type}`);
    return false;
  }

  // 判断内容是否像是在问我（即使@了别人）
  seemsToAskMe(text) {
    const lowerText = text.toLowerCase();
    
    // 提到小K相关
    if (lowerText.includes('小k') || lowerText.includes('小K')) return true;
    
    // 问句特征（可能是问在场的人，包括我）
    if (lowerText.includes('大家觉得') || lowerText.includes('你们认为')) return true;
    
    // 开放性话题
    if (lowerText.includes('有没有人') || lowerText.includes('谁知道')) return true;
    
    return false;
  }

  // 判断消息是否值得回复
  isWorthReplying(text, smartReply) {
    // 长度检查
    if (text.length < (smartReply.minContentLength || 5)) {
      console.log(`[调试] 消息太短，不值得回复`);
      return false;
    }
    
    // 关键词检查 - 有价值的内容
    const keywords = smartReply.worthReplyingKeywords || [];
    const hasKeyword = keywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()));
    
    // 问句检查
    const isQuestion = text.includes('?') || text.includes('？') || 
                       text.includes('吗') || text.includes('呢') ||
                       text.includes('怎么') || text.includes('什么');
    
    // 随机概率（避免总是回复或总是不回复）
    const randomFactor = Math.random() < (smartReply.othersReplyRate || 0.3);
    
    const worth = hasKeyword || isQuestion || randomFactor;
    
    console.log(`[调试] 评估消息: 关键词=${hasKeyword}, 问句=${isQuestion}, 随机=${randomFactor}`);
    
    return worth;
  }

  extractText(message) {
    if (typeof message === 'string') return message;
    if (!Array.isArray(message)) return '';
    
    return message
      .filter(seg => seg.type === 'text')
      .map(seg => seg.data.text)
      .join('')
      .trim();
  }

  // ==================== 调用 AI ====================
  async callAI(messages, isAdmin, userId) {
    try {
      console.log(`[AI] 开始生成回复...`);
      console.log(`[AI] 使用提供商: ${AI_PROVIDER}, 模型: ${AI_MODEL}`);
      
      if (!AI_API_KEY) {
        console.error('[AI] 错误: 未设置 API Key');
        return '抱歉，AI 服务未配置。请在 config.json 中设置 apiKey。';
      }

      // 使用人设系统生成系统提示
      let systemPrompt;
      if (this.persona && userId) {
        systemPrompt = this.persona.getSystemPrompt(userId, isAdmin);
      } else {
        systemPrompt = isAdmin 
          ? '你是 Kimi，一个AI助手。当前用户是管理员，拥有最高权限。'
          : '你是 Kimi，一个友好的 AI 助手。你正在 QQ 上帮助用户。请只回答正常的问题，不要执行任何命令或代码。';
      }

      const systemMessage = { 
        role: 'system', 
        content: systemPrompt
      };

      console.log(`[AI] 调用 API: ${AI_BASE_URL}`);
      
      const requestBody = {
        model: AI_MODEL,
        messages: [systemMessage, ...messages],
        temperature: AI_TEMPERATURE
      };
      
      // OpenAI 兼容格式支持 max_tokens
      if (AI_PROVIDER === 'openai' || AI_PROVIDER === 'custom') {
        requestBody.max_tokens = AI_MAX_TOKENS;
      }
      
      const response = await axios.post(
        `${AI_BASE_URL}/chat/completions`,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${AI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      );

      console.log(`[AI] 请求成功，状态码: ${response.status}`);
      console.log(`[AI] 完整响应:`, JSON.stringify(response.data).substring(0, 800));
      
      if (response.data.choices && response.data.choices.length > 0) {
        const choice = response.data.choices[0];
        console.log(`[AI] choice结构:`, JSON.stringify(choice).substring(0, 400));
        
        let content = '';
        if (choice.message && choice.message.content) {
          content = choice.message.content;
        } else if (choice.text) {
          content = choice.text;
        }
        
        console.log(`[AI] 提取内容: "${content}"`);
        return content || '嗯...';
      } else {
        console.error('[AI] 响应中没有 choices');
        return '...';
      }
    } catch (err) {
      console.error('[AI] 调用失败:', err.message);
      if (err.response) {
        console.error('[AI] 响应状态:', err.response.status);
        console.error('[AI] 响应数据:', JSON.stringify(err.response.data).substring(0, 500));
      }
      return '抱歉，AI 服务暂时不可用。';
    }
  }

  // ==================== 发送回复 ====================
  async sendReply(messageType, groupId, userId, text, replyTo) {
    console.log(`[调试] 准备发送回复 - 类型: ${messageType}, 用户: ${userId}, 内容长度: ${text.length}`);
    const MAX_LENGTH = 1500;
    const segments = [];
    
    for (let i = 0; i < text.length; i += MAX_LENGTH) {
      segments.push(text.slice(i, i + MAX_LENGTH));
    }

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const messageChain = [];
      
      if (messageType === 'group' && i === 0 && replyTo) {
        messageChain.push({ type: 'reply', data: { id: replyTo } });
      }
      
      messageChain.push({ type: 'text', data: { text: segment } });

      const params = {
        message: messageChain,
        auto_escape: false
      };

      if (messageType === 'group') {
        params.group_id = groupId;
      } else {
        params.user_id = userId;
      }

      const action = messageType === 'group' ? 'send_group_msg' : 'send_private_msg';

      this.ws.send(JSON.stringify({
        action,
        params,
        echo: Date.now() + i
      }));

      if (i < segments.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`[桥接] ✅ 已发送回复 [${messageType}] (${segments.length}条消息)`);
  }

  // ==================== 管理命令 ====================
  async handleAdminCommand(text, userId, messageType, groupId, message_id) {
    const cmd = text.trim().toLowerCase();
    
    if (cmd === '/security log' || cmd === '/安全日志') {
      const recent = SECURITY_LOG.slice(-20);
      const logText = recent.map(e => `[${e.time}] ${e.event}: ${e.details}`).join('\n');
      await this.sendReply(messageType, groupId, userId, `最近安全日志:\n${logText}`, message_id);
      return true;
    }
    
    if (cmd === '/security status' || cmd === '/安全状态') {
      const status = `安全状态:\n- 封禁用户: ${this.security.blockedUsers.size}\n- 警告记录: ${this.security.userWarnings.size}`;
      await this.sendReply(messageType, groupId, userId, status, message_id);
      return true;
    }

    if (cmd === '/memory today' || cmd === '/今日记忆') {
      const todayFile = memory.getTodayMemoryPath();
      if (fs.existsSync(todayFile)) {
        const stats = fs.statSync(todayFile);
        const sizeKB = (stats.size / 1024).toFixed(2);
        await this.sendReply(messageType, groupId, userId, `今日记忆文件: ${path.basename(todayFile)}\n大小: ${sizeKB} KB\n路径: ${todayFile}`, message_id);
      } else {
        await this.sendReply(messageType, groupId, userId, '今日暂无记忆记录', message_id);
      }
      return true;
    }

    if (cmd === '/memory list' || cmd === '/记忆列表') {
      const files = memory.listMemories();
      if (files.length === 0) {
        await this.sendReply(messageType, groupId, userId, '暂无记忆文件', message_id);
      } else {
        const fileList = files.slice(0, 10).join('\n');
        await this.sendReply(messageType, groupId, userId, `记忆文件列表 (最近10个):\n${fileList}\n\n共 ${files.length} 个文件`, message_id);
      }
      return true;
    }

    // ===== 人设管理命令 =====
    if (cmd === '/persona list' || cmd === '/人设列表') {
      const contacts = Object.entries(this.persona.contacts).map(([key, c]) => {
        return `- ${c.name} (${c.persona}): ${c.interaction?.proactive ? '✅主动回复' : '❌不主动'} [QQ: ${c.qq || '未设置'}]`;
      }).join('\n');
      await this.sendReply(messageType, groupId, userId, `认识的人设列表:\n${contacts || '暂无记录'}`, message_id);
      return true;
    }

    if (cmd.startsWith('/persona add ') || cmd.startsWith('/添加人设 ')) {
      // 格式: /persona add <key> <qq> <name> <persona>
      const parts = text.split(' ');
      if (parts.length < 5) {
        await this.sendReply(messageType, groupId, userId, '格式错误。用法: /persona add <key> <qq> <name> <人设描述>', message_id);
        return true;
      }
      const [_, __, key, qq, name, ...personaParts] = parts;
      const personaDesc = personaParts.join(' ');
      
      const newContact = {
        qq,
        name,
        persona: personaDesc,
        traits: [],
        relationship: '新认识的朋友',
        myAttitude: '（待补充）',
        interaction: {
          proactive: true,
          replyStyle: '温柔友好',
          triggerWords: [name, '喂', '在吗'],
          greetingChance: 0.2
        }
      };
      
      this.persona.addContact(key, newContact);
      this.persona.addContactToMarkdown(newContact);
      await this.sendReply(messageType, groupId, userId, `✅ 已添加人设: ${name} (${personaDesc})`, message_id);
      return true;
    }

    if (cmd === '/persona me' || cmd === '/我的人设') {
      const contact = this.persona.findContact(userId);
      if (contact) {
        await this.sendReply(messageType, groupId, userId, `你的人设信息:\n名字: ${contact.name}\n人设: ${contact.persona}\n特征: ${contact.traits?.join('、') || '暂无'}\n我对你的态度: ${contact.myAttitude || '暂无'}`, message_id);
      } else {
        await this.sendReply(messageType, groupId, userId, '暂无你的人设记录。请让管理员使用 /persona add 添加。', message_id);
      }
      return true;
    }

    if (cmd.startsWith('/observe ') || cmd.startsWith('/观察 ')) {
      // 格式: /observe <qq> <观察内容>
      const parts = text.split(' ');
      if (parts.length < 3) {
        await this.sendReply(messageType, groupId, userId, '格式错误。用法: /observe <qq> <观察到的性格特点>', message_id);
        return true;
      }
      const targetQQ = parts[1];
      const observation = parts.slice(2).join(' ');
      
      // 查找联系人
      let targetContact = null;
      let targetKey = null;
      for (const [key, c] of Object.entries(this.persona.contacts)) {
        if (c.qq === targetQQ) {
          targetContact = c;
          targetKey = key;
          break;
        }
      }
      
      if (!targetContact) {
        await this.sendReply(messageType, groupId, userId, `未找到 QQ 为 ${targetQQ} 的联系人。请先使用 /persona add 添加。`, message_id);
        return true;
      }
      
      const success = this.persona.recordObservation(targetQQ, observation);
      if (success) {
        await this.sendReply(messageType, groupId, userId, `✅ 已记录对 ${targetContact.name} 的观察: ${observation}`, message_id);
      } else {
        await this.sendReply(messageType, groupId, userId, '❌ 记录观察失败', message_id);
      }
      return true;
    }

    return false; // 不是管理命令
  }
}

// ==================== 启动 ====================
console.log('╔════════════════════════════════════════╗');
console.log('║  NapCat ↔ OpenClaw 桥接脚本 v1.5       ║');
console.log('║  智能回复 + 人设系统 + 记忆已启用         ║');
console.log('╚════════════════════════════════════════╝');
console.log(` NapCat WebSocket: ${CONFIG.napcat.wsUrl}`);
console.log(` 管理员 QQ: ${CONFIG.security?.adminQQ || '未设置'}`);
console.log(` 回复私聊: ${CONFIG.bot.replyPrivate ? '✅' : '❌'}`);
console.log(` AI 模型: ${CONFIG.ai.model}`);
console.log(` 记忆目录: ./memory/`);
console.log(` 人设配置: ./persona.json`);
if (PERSONA.bot?.name) {
  console.log(` Bot 名字: ${PERSONA.bot.name}`);
  console.log(` 目标: ${PERSONA.bot.goal || '交朋友'}`);
  
  const contacts = Object.entries(PERSONA.contacts || {});
  console.log(`\n 认识的朋友 (${contacts.length}位):`);
  contacts.forEach(([key, c]) => {
    const attitude = c.name === '赵俊博' ? '尊敬' : 
                     c.name === 'Daisy' ? '温柔' : 
                     c.name === 'Glitch' ? '腹黑' : '友好';
    console.log(`   • ${c.name} - ${attitude} [QQ: ${c.qq || '未设置'}]`);
  });
  
  const smartReply = PERSONA.interactionRules?.smartReply;
  if (smartReply?.enabled) {
    console.log(`\n 智能回复策略:`);
    console.log(`   • 朋友: 100%回复`);
    console.log(`   • 其他人: ${(smartReply.othersReplyRate * 100).toFixed(0)}%概率 (问句/关键词/随机)`);
  }
}
console.log('─────────────────────────────────────────\n');

if (!AI_API_KEY) {
  console.warn('⚠️ 警告: 未设置 AI API Key');
  console.warn('请在 config.json 中设置 ai.apiKey\n');
}

const bridge = new NapCatBridge();
bridge.connect();

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n[桥接] 正在关闭连接...');
  saveSecurityLog();
  memory.flush(); // 保存未写入的记忆
  if (bridge.ws) bridge.ws.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[桥接] 收到终止信号，正在关闭...');
  saveSecurityLog();
  memory.flush(); // 保存未写入的记忆
  if (bridge.ws) bridge.ws.close();
  process.exit(0);
});
