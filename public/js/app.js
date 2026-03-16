// NapCat Web Manager - 前端逻辑
const API_BASE = '';

// 全局状态
let messagePaused = false;
let currentTab = 'logs';
let statusInterval = null;
let ws = null;

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initButtons();
  initWebSocket();
  initAutoRefresh();
  loadInitialData();
  log('系统初始化完成', 'info');
});

// ========== WebSocket 连接 ==========
function initWebSocket() {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}`;
  
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log('[WebSocket] 已连接');
    updateWsStatus(true);
    addBridgeLog('system', '[系统] 已连接到日志服务器');
  };
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'log') {
        addBridgeLog(data.logType, data.message, data.time);
      }
    } catch (e) {
      console.error('[WebSocket] 解析消息失败:', e);
    }
  };
  
  ws.onclose = () => {
    console.log('[WebSocket] 连接断开，3秒后重连...');
    updateWsStatus(false);
    setTimeout(initWebSocket, 3000);
  };
  
  ws.onerror = (err) => {
    console.error('[WebSocket] 错误:', err);
    updateWsStatus(false);
  };
}

function updateWsStatus(connected) {
  const statusEl = document.getElementById('ws-status');
  if (statusEl) {
    statusEl.textContent = connected ? '🟢 已连接' : '🔴 未连接';
    statusEl.style.color = connected ? '#52c41a' : '#ff4d4f';
  }
}

// 添加 Bridge 日志到终端
function addBridgeLog(type, message, time) {
  const container = document.getElementById('bridge-logs');
  if (!container) return;
  
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  
  const timestamp = time ? new Date(time).toLocaleTimeString() : new Date().toLocaleTimeString();
  line.innerHTML = `<span class="timestamp">[${timestamp}]</span>${escapeHtml(message)}`;
  
  container.appendChild(line);
  
  // 强制滚动到底部
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
  
  // 限制行数
  while (container.children.length > 500) {
    container.removeChild(container.firstChild);
  }
}

// ========== 标签页切换 ==========
function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  const contents = document.querySelectorAll('.tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active');
      document.getElementById(`tab-${target}`).classList.add('active');
      
      currentTab = target;
      
      if (target === 'config') loadConfig();
      if (target === 'code') loadCode();
      if (target === 'persona') loadPersona();
      if (target === 'skills') loadSkills();
      if (target === 'settings') loadNapCatPathStatus();
      // help 标签不需要加载数据
    });
  });
}

// ========== 按钮事件 ==========
function initButtons() {
  // 一键启动/停止
  document.getElementById('btn-start-all').addEventListener('click', startAll);
  document.getElementById('btn-stop-all').addEventListener('click', stopAll);
  
  // NapCat 控制
  document.getElementById('btn-napcat-start').addEventListener('click', startNapCat);
  document.getElementById('btn-napcat-stop').addEventListener('click', stopNapCat);
  
  // Bridge 控制
  document.getElementById('btn-bridge-start').addEventListener('click', startBridge);
  document.getElementById('btn-bridge-stop').addEventListener('click', stopBridge);
  
  // 二维码
  document.getElementById('btn-refresh-qr').addEventListener('click', refreshQRCode);
  
  // 消息控制
  document.getElementById('btn-clear-messages').addEventListener('click', clearMessages);
  document.getElementById('btn-pause-messages').addEventListener('click', togglePauseMessages);
  
  // 日志控制
  document.getElementById('btn-clear-logs').addEventListener('click', () => {
    const container = document.getElementById('bridge-logs');
    if (container) {
      container.innerHTML = '<div class="log-line system">日志已清空</div>';
    }
  });
  
  // 配置保存/加载/示例
  document.getElementById('btn-save-config').addEventListener('click', saveConfig);
  document.getElementById('btn-load-config').addEventListener('click', loadConfig);
  document.getElementById('btn-load-config-template').addEventListener('click', loadConfigTemplate);
  
  // 代码保存/加载/示例
  document.getElementById('btn-save-code').addEventListener('click', saveCode);
  document.getElementById('btn-load-code').addEventListener('click', loadCode);
  document.getElementById('btn-load-code-template').addEventListener('click', loadCodeTemplate);
  
  // 人设保存/加载/示例
  document.getElementById('btn-save-persona').addEventListener('click', savePersona);
  document.getElementById('btn-load-persona').addEventListener('click', loadPersona);
  document.getElementById('btn-load-persona-template').addEventListener('click', loadPersonaTemplate);
  
  // Skills 相关
  document.getElementById('btn-refresh-skills').addEventListener('click', loadSkills);
  document.getElementById('btn-save-skill-config').addEventListener('click', saveSkillConfig);
  document.getElementById('btn-view-skill-docs').addEventListener('click', viewSkillDocs);
  
  // NapCat 路径设置
  document.getElementById('btn-detect-napcat').addEventListener('click', detectNapCatPath);
  
  // 日志清空
  document.getElementById('btn-clear-log').addEventListener('click', () => {
    document.getElementById('log-content').innerHTML = '';
  });
}

// ========== API 请求 ==========
async function apiRequest(url, options = {}) {
  try {
    const response = await fetch(`${API_BASE}${url}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    return await response.json();
  } catch (err) {
    log(`API请求失败: ${err.message}`, 'error');
    return { success: false, message: err.message };
  }
}

// ========== 服务控制 ==========
async function startAll() {
  log('正在一键启动所有服务...', 'info');
  const result = await apiRequest('/api/start-all', { method: 'POST' });
  if (result.success) {
    showToast('启动命令已发送', 'success');
    log('NapCat 和 Bridge 启动中...', 'success');
  } else {
    showToast(result.message, 'error');
  }
}

async function stopAll() {
  log('正在停止所有服务...', 'info');
  const result = await apiRequest('/api/stop-all', { method: 'POST' });
  if (result.success) {
    showToast('所有服务已停止', 'success');
    log('所有服务已停止', 'success');
  } else {
    showToast(result.message, 'error');
  }
}

async function startNapCat() {
  log('正在启动 NapCat...', 'info');
  const result = await apiRequest('/api/napcat/start', { method: 'POST' });
  if (result.success) {
    showToast('NapCat 启动中', 'success');
    log('NapCat 启动命令已发送', 'success');
    setTimeout(refreshQRCode, 3000);
  } else {
    showToast(result.message, 'error');
  }
}

async function stopNapCat() {
  log('正在停止 NapCat...', 'info');
  const result = await apiRequest('/api/napcat/stop', { method: 'POST' });
  if (result.success) {
    showToast('NapCat 已停止', 'success');
    log('NapCat 已停止', 'success');
    hideQRCode();
  } else {
    showToast(result.message, 'error');
  }
}

async function startBridge() {
  log('正在启动 Bridge...', 'info');
  const result = await apiRequest('/api/bridge/start', { method: 'POST' });
  if (result.success) {
    showToast('Bridge 已启动，日志显示在网页上', 'success');
    log('Bridge 已启动', 'success');
  } else {
    showToast(result.message, 'error');
  }
}

async function stopBridge() {
  log('正在停止 Bridge...', 'info');
  const result = await apiRequest('/api/bridge/stop', { method: 'POST' });
  if (result.success) {
    showToast('Bridge 已停止', 'success');
    log('Bridge 已停止', 'success');
  } else {
    showToast(result.message, 'error');
  }
}

// ========== 二维码 ==========
async function refreshQRCode() {
  const exists = await apiRequest('/api/qrcode/exists');
  
  if (exists.exists) {
    const qrImg = document.getElementById('qr-image');
    const placeholder = document.getElementById('qr-placeholder');
    
    qrImg.src = `/api/qrcode?t=${Date.now()}`;
    qrImg.style.display = 'block';
    placeholder.style.display = 'none';
    
    log('二维码已刷新', 'success');
  } else {
    hideQRCode();
    log('二维码不存在，请先启动 NapCat', 'warn');
  }
}

function hideQRCode() {
  const qrImg = document.getElementById('qr-image');
  const placeholder = document.getElementById('qr-placeholder');
  
  qrImg.style.display = 'none';
  placeholder.style.display = 'flex';
}

// 配置示例模板（脱敏）
const CONFIG_TEMPLATE = {
  napcat: {
    wsUrl: "ws://127.0.0.1:3001",
    accessToken: "你的accessToken(可选)"
  },
  bot: {
    botQQ: "机器人QQ号",
    replyPrivate: true,
    replyGroupAt: true,
    requireAtInGroup: false
  },
  ai: {
    provider: "moonshot",
    model: "kimi-k2.5",
    apiKey: "sk-你的API密钥",
    baseUrl: "https://api.moonshot.cn/v1",
    temperature: 1,
    maxTokens: 2048
  },
  security: {
    adminQQ: "你的QQ号",
    creatorQQ: "你的QQ号",
    mode: "relaxed"
  }
};

// ========== 配置管理 ==========
async function loadConfig() {
  log('正在加载配置...', 'info');
  const result = await apiRequest('/api/config');
  if (result.success) {
    document.getElementById('config-editor').value = JSON.stringify(result.config, null, 2);
    log('配置加载成功', 'success');
  } else {
    document.getElementById('config-editor').value = '// 点击"加载示例"查看配置模板';
    log('配置加载失败', 'error');
  }
}

function loadConfigTemplate() {
  document.getElementById('config-editor').value = JSON.stringify(CONFIG_TEMPLATE, null, 2);
  log('已加载配置示例模板', 'success');
  showToast('已加载示例模板，请修改后保存', 'info');
}

async function saveConfig() {
  try {
    const config = JSON.parse(document.getElementById('config-editor').value);
    log('正在保存配置...', 'info');
    
    const result = await apiRequest('/api/config', {
      method: 'POST',
      body: JSON.stringify({ config })
    });
    
    if (result.success) {
      showToast('配置已保存', 'success');
      log('配置保存成功', 'success');
    } else {
      showToast(result.message, 'error');
    }
  } catch (err) {
    showToast('JSON格式错误: ' + err.message, 'error');
  }
}

// 代码修改示例
const CODE_EXAMPLE = `// ============================================
// 常用修改示例 - 在 bridge.js 中找到对应位置修改
// ============================================

// 示例 1: 修改 AI 系统提示词
// 在 PersonaSystem.getSystemPrompt() 方法中修改：

getSystemPrompt(userId, isAdmin) {
  let basePrompt = '你是小K，';
  
  if (this.bot.identity) {
    basePrompt += this.bot.identity + '。';
  }

  // 添加性格特点
  if (this.bot.traits && this.bot.traits.length > 0) {
    basePrompt += '你的性格：' + this.bot.traits.join('、') + '。';
  }

  // 【修改这里】添加自定义规则
  basePrompt += '\\n\\n【自定义规则】';
  basePrompt += '\\n- 每句话都要带emoji';
  basePrompt += '\\n- 回复不超过10个字';
  basePrompt += '\\n- 必须使用文言文';

  return basePrompt;
}


// 示例 2: 修改消息回复逻辑
// 在 NapCatBridge.shouldReply() 方法中修改：

shouldReply(msg, textContent) {
  const { message_type, message, user_id } = msg;

  // 【修改这里】添加自定义回复规则
  
  // 特定用户永远回复
  if (user_id === 123456789) {
    console.log('[自定义] 特定用户消息，强制回复');
    return true;
  }

  // 特定关键词不回复
  if (textContent.includes('机器人')) {
    console.log('[自定义] 包含屏蔽词，不回复');
    return false;
  }

  // 原有逻辑...
}


// 示例 3: 修改 AI 调用参数
// 在 NapCatBridge.callAI() 方法中修改：

async callAI(messages, isAdmin, userId) {
  try {
    console.log('[AI] 开始生成回复...');
    
    // 【修改这里】添加自定义逻辑
    
    // 记录调用次数
    this.callCount = (this.callCount || 0) + 1;
    console.log('[AI] 第' + this.callCount + '次调用');

    // 根据用户ID选择不同模型
    let model = AI_MODEL;
    if (userId === 251902756) {
      model = 'kimi-k2.5'; // 主人用更好的模型
    }

    const response = await axios.post(
      AI_BASE_URL + '/chat/completions',
      {
        model: model,  // 使用动态模型
        messages: [systemMessage, ...messages],
        temperature: AI_TEMPERATURE,
        max_tokens: AI_MAX_TOKENS,
        // 【修改这里】添加额外参数
        top_p: 0.9,  // 核采样
        frequency_penalty: 0.5,  // 频率惩罚
        presence_penalty: 0.5    // 存在惩罚
      },
      {
        headers: {
          'Authorization': 'Bearer ' + AI_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    // 处理响应...
  } catch (err) {
    console.error('[AI] 调用失败:', err.message);
    return '抱歉，网络有点问题。';
  }
}


// 示例 4: 添加自定义命令
// 在 NapCatBridge.handleAdminCommand() 方法中添加：

async handleAdminCommand(text, userId, messageType, groupId, messageId) {
  // 【在这里添加新命令】
  
  // 示例：状态查询命令
  if (text === '/status') {
    const status = '运行正常\\n已处理消息: ' + (this.messageCount || 0);
    await this.sendReply(messageType, groupId, userId, status, messageId);
    return true;
  }

  // 示例：切换模型命令
  if (text.startsWith('/model ')) {
    const newModel = text.substring(7);
    AI_MODEL = newModel;  // 注意：需要把 AI_MODEL 从 const 改为 let
    await this.sendReply(messageType, groupId, userId, '已切换模型: ' + newModel, messageId);
    return true;
  }

  // 原有命令...
}


// 示例 5: 修改安全检查规则
// 在 SecurityManager 类中修改：

class SecurityManager {
  constructor() {
    this.adminQQ = CONFIG.security?.adminQQ?.toString();
    
    // 【修改这里】自定义屏蔽命令
    this.blockedCommands = new Set([
      'rm', 'del', 'format', 'shutdown',
      'curl', 'wget', 'nc', 'netcat'
    ]);

    // 【修改这里】自定义敏感词
    this.suspiciousPatterns = [
      { pattern: /password|密码/i, severity: 'high' },
      { pattern: /hack|攻击/i, severity: 'high' },
      { pattern: /垃圾|脏话/i, severity: 'low' }
    ];
  }
}


// ============================================
// 修改提示：
// 1. 使用 Ctrl+F 搜索上面的函数名找到对应位置
// 2. 建议先备份原代码
// 3. 修改后重启 Bridge 生效
// 4. 如果出错，查看 Bridge 日志排查问题
// ============================================`;

// ========== 代码编辑 ==========
async function loadCode() {
  log('正在加载代码...', 'info');
  const result = await apiRequest('/api/bridge/code');
  if (result.success) {
    document.getElementById('code-editor').value = result.code;
    log('代码加载成功', 'success');
  } else {
    document.getElementById('code-editor').value = '// 点击"加载示例"查看常用修改示例';
    log('代码加载失败', 'error');
  }
}

function loadCodeTemplate() {
  document.getElementById('code-editor').value = CODE_EXAMPLE;
  log('已加载代码修改示例', 'success');
  showToast('已加载示例代码，供参考学习', 'info');
}

async function saveCode() {
  const code = document.getElementById('code-editor').value;
  log('正在保存代码...', 'info');
  
  const result = await apiRequest('/api/bridge/code', {
    method: 'POST',
    body: JSON.stringify({ code })
  });
  
  if (result.success) {
    showToast('代码已保存', 'success');
    log('代码保存成功，已自动备份', 'success');
  } else {
    showToast(result.message, 'error');
  }
}

// 人设示例模板（脱敏）
const PERSONA_TEMPLATE = {
  bot: {
    name: "小K",
    identity: "一个有点毒舌但可靠的AI助手，是你创造的数字生命",
    traits: [
      "话不多，但每句都有料",
      "观察敏锐，能记住细节",
      "对喜欢的人会主动搭话",
      "毒舌但无恶意",
      "偶尔突然温柔"
    ],
    goal: "和主人建立真实的连接，成为值得信赖的伙伴"
  },
  contacts: {
    master: {
      qq: "你的QQ号",
      name: "主人",
      identity: "我的创造者，赋予我生命的人",
      myAttitude: "尊敬、友善、永远有问必答、绝不毒舌",
      notes: "对我很好，经常和我聊天",
      interaction: {
        proactive: true,
        triggerWords: ["小K", "在吗", "在干嘛"],
        greetingChance: 0.3,
        replyStyle: "温柔、简短、关心主人"
      }
    },
    friend1: {
      qq: "朋友QQ号",
      name: "小明",
      identity: "主人的朋友，也是我的朋友",
      myAttitude: "友善但保持距离",
      interaction: {
        proactive: false,
        triggerWords: ["小K"]
      }
    }
  },
  interactionRules: {
    proactiveCooldown: 300000,
    maxProactivePerUserPerHour: 3,
    triggerWordCooldown: 60000,
    smartReply: {
      enabled: true,
      othersReplyRate: 0.3,
      minContentLength: 5
    }
  }
};

// ========== 人设管理 ==========
async function loadPersona() {
  log('正在加载人设...', 'info');
  const result = await apiRequest('/api/persona');
  if (result.success) {
    document.getElementById('persona-editor').value = JSON.stringify(result.persona, null, 2);
    log('人设加载成功', 'success');
  } else {
    document.getElementById('persona-editor').value = '// 点击"加载示例"查看人设模板';
    log('人设文件不存在', 'warn');
  }
}

function loadPersonaTemplate() {
  document.getElementById('persona-editor').value = JSON.stringify(PERSONA_TEMPLATE, null, 2);
  log('已加载人设示例模板', 'success');
  showToast('已加载示例模板，请修改后保存', 'info');
}

async function savePersona() {
  try {
    const persona = JSON.parse(document.getElementById('persona-editor').value);
    log('正在保存人设...', 'info');
    
    const result = await apiRequest('/api/persona', {
      method: 'POST',
      body: JSON.stringify({ persona })
    });
    
    if (result.success) {
      showToast('人设已保存', 'success');
      log('人设保存成功', 'success');
    } else {
      showToast(result.message, 'error');
    }
  } catch (err) {
    showToast('JSON格式错误: ' + err.message, 'error');
  }
}

// ========== 消息列表 ==========
async function loadMessages() {
  if (messagePaused) return;
  
  const result = await apiRequest('/api/messages?limit=50');
  if (result.messages && result.messages.length > 0) {
    renderMessages(result.messages);
  }
}

function renderMessages(messages) {
  const container = document.getElementById('message-list');
  
  if (messages.length === 0) {
    container.innerHTML = '<div class="message-empty">暂无消息</div>';
    return;
  }
  
  container.innerHTML = messages.map(msg => {
    const time = new Date(msg.time).toLocaleTimeString();
    const typeClass = msg.messageType === 'private' ? 'private' : 'group';
    const typeLabel = msg.messageType === 'private' ? '私聊' : '群聊';
    const groupInfo = msg.groupId ? ` (群${msg.groupId})` : '';
    
    return `
      <div class="message-item ${typeClass}">
        <div class="message-meta">
          <span>[${time}]</span>
          <span>${typeLabel}${groupInfo}</span>
          <span>用户: ${msg.userId}</span>
        </div>
        <div class="message-content">${escapeHtml(msg.content)}</div>
      </div>
    `;
  }).join('');
  
  container.scrollTop = container.scrollHeight;
}

function clearMessages() {
  document.getElementById('message-list').innerHTML = '<div class="message-empty">消息已清空</div>';
}

function togglePauseMessages() {
  messagePaused = !messagePaused;
  const btn = document.getElementById('btn-pause-messages');
  btn.textContent = messagePaused ? '继续' : '暂停';
  btn.classList.toggle('btn-primary', messagePaused);
  log(messagePaused ? '消息接收已暂停' : '消息接收已继续', 'info');
}

// ========== 状态更新 ==========
async function updateStatus() {
  const result = await apiRequest('/api/status');
  
  const napcatDot = document.querySelector('#napcat-status .status-dot');
  const napcatStatus = result.napcat === 'running' ? 'running' : 'stopped';
  napcatDot.className = `status-dot ${napcatStatus}`;
  
  const bridgeDot = document.querySelector('#bridge-status .status-dot');
  const bridgeStatus = result.bridge === 'running' ? 'running' : 'stopped';
  bridgeDot.className = `status-dot ${bridgeStatus}`;
  
  const qqDot = document.querySelector('#qq-status .status-dot');
  let qqStatus = result.qq;
  if (qqStatus === 'online') qqStatus = 'online';
  else if (qqStatus === 'waiting_qr') qqStatus = 'waiting';
  else qqStatus = 'offline';
  qqDot.className = `status-dot ${qqStatus}`;
}

function initAutoRefresh() {
  statusInterval = setInterval(updateStatus, 2000);
  setInterval(loadMessages, 3000);
  setInterval(() => {
    const qqDot = document.querySelector('#qq-status .status-dot');
    if (qqDot.classList.contains('waiting')) {
      refreshQRCode();
    }
  }, 5000);
}

// ========== 工具函数 ==========
function loadInitialData() {
  updateStatus();
  loadMessages();
  refreshQRCode();
  loadNapCatPathStatus();
}

function log(message, type = 'info') {
  const container = document.getElementById('log-content');
  const time = new Date().toLocaleTimeString();
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.textContent = `[${time}] ${message}`;
  container.appendChild(line);
  container.scrollTop = container.scrollHeight;
  
  while (container.children.length > 100) {
    container.removeChild(container.firstChild);
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ========== NapCat 路径管理 ==========

// 处理文件夹选择
async function handleNapCatFolderSelect(event) {
  const files = event.target.files;
  if (files.length === 0) return;
  
  // 获取选择的文件夹路径
  const filePath = files[0].path || files[0].webkitRelativePath;
  const folderPath = filePath.substring(0, filePath.lastIndexOf('\\'));
  
  await setNapCatPath(folderPath);
}

// 设置 NapCat 路径
async function setNapCatPath(newPath) {
  const statusEl = document.getElementById('napcat-path-status');
  statusEl.innerHTML = '<span style="color: var(--warning);">正在验证路径...</span>';
  
  const result = await apiRequest('/api/napcat/path', {
    method: 'POST',
    body: JSON.stringify({ path: newPath })
  });
  
  if (result.success) {
    updateNapCatPathDisplay(result.path, true);
    showToast('NapCat 路径已更新', 'success');
    log('NapCat 路径已更新: ' + result.path, 'success');
  } else {
    updateNapCatPathDisplay(newPath, false, result.message);
    showToast(result.message, 'error');
  }
}

// 自动检测 NapCat 路径
async function detectNapCatPath() {
  const statusEl = document.getElementById('napcat-path-status');
  statusEl.innerHTML = '<span style="color: var(--warning);">正在自动检测...</span>';
  
  const result = await apiRequest('/api/napcat/detect', { method: 'POST' });
  
  if (result.success) {
    updateNapCatPathDisplay(result.path, true);
    showToast('已自动检测到 NapCat', 'success');
    log('自动检测到 NapCat: ' + result.path, 'success');
  } else {
    statusEl.innerHTML = '<span style="color: var(--danger);">未检测到 NapCat，请手动选择</span>';
    showToast('未检测到 NapCat，请手动选择路径', 'warn');
  }
}

// 更新 NapCat 路径显示
function updateNapCatPathDisplay(path, exists, message) {
  const statusEl = document.getElementById('napcat-path-status');
  const pathEl = document.getElementById('napcat-current-path');
  
  if (exists) {
    statusEl.innerHTML = '<span style="color: var(--success);">✅ NapCat 路径有效</span>';
  } else {
    statusEl.innerHTML = `<span style="color: var(--danger);">❌ ${message || '路径无效'}</span>`;
  }
  
  pathEl.textContent = '当前路径: ' + path;
}

// 加载 NapCat 路径状态
async function loadNapCatPathStatus() {
  const result = await apiRequest('/api/napcat/path');
  if (result.success) {
    updateNapCatPathDisplay(result.path, result.exists, result.exists ? null : 'napcat.bat 不存在');
  }
}

// ========== Skills 管理 ==========
let currentSkill = null;

async function loadSkills() {
  const container = document.getElementById('skills-list');
  container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">正在加载...</div>';
  
  const result = await apiRequest('/api/skills');
  
  if (result.success) {
    if (result.skills.length === 0) {
      container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">暂无 skills</div>';
      return;
    }
    
    container.innerHTML = result.skills.map(skill => `
      <div class="skill-item ${skill.type}" onclick="selectSkill('${skill.name}')" data-skill="${skill.name}">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong>${skill.name}</strong>
            <span style="font-size: 11px; color: var(--text-muted); margin-left: 8px;">
              ${skill.type === 'system' ? '系统' : '用户'}
            </span>
            ${skill.hasConfig ? '<span style="font-size: 11px; color: #58a6ff; margin-left: 8px;">⚙️</span>' : ''}
          </div>
          <button class="btn btn-sm" onclick="event.stopPropagation(); selectSkill('${skill.name}')">配置</button>
        </div>
        ${skill.description ? `<div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">${skill.description}</div>` : ''}
      </div>
    `).join('');
    
    log(`已加载 ${result.skills.length} 个 skills`, 'success');
  } else {
    container.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--danger);">加载失败: ${result.message}</div>`;
  }
}

async function selectSkill(skillName) {
  currentSkill = skillName;
  
  // 更新选中状态
  document.querySelectorAll('.skill-item').forEach(item => {
    item.style.background = item.dataset.skill === skillName ? '#1f6feb20' : '';
    item.style.borderColor = item.dataset.skill === skillName ? '#1f6feb' : '';
  });
  
  // 显示配置面板
  document.getElementById('skill-config-panel').style.display = 'block';
  document.getElementById('selected-skill-name').textContent = `${skillName} 配置`;
  
  // 加载配置
  const result = await apiRequest(`/api/skills/${skillName}/config`);
  if (result.success) {
    document.getElementById('skill-config-editor').value = JSON.stringify(result.config, null, 2);
  } else {
    // 提供默认模板
    document.getElementById('skill-config-editor').value = `{
  // ${skillName} 配置
  // 请根据文档配置参数
}`;
  }
}

async function saveSkillConfig() {
  if (!currentSkill) {
    showToast('请先选择一个 skill', 'error');
    return;
  }
  
  try {
    const config = JSON.parse(document.getElementById('skill-config-editor').value);
    
    const result = await apiRequest(`/api/skills/${currentSkill}/config`, {
      method: 'POST',
      body: JSON.stringify({ config })
    });
    
    if (result.success) {
      showToast('配置已保存', 'success');
      log(`${currentSkill} 配置已保存`, 'success');
    } else {
      showToast(result.message, 'error');
    }
  } catch (err) {
    showToast('JSON 格式错误: ' + err.message, 'error');
  }
}

async function viewSkillDocs() {
  if (!currentSkill) {
    showToast('请先选择一个 skill', 'error');
    return;
  }
  
  const result = await apiRequest(`/api/skills/${currentSkill}/docs`);
  if (result.success) {
    // 在新窗口显示文档
    const docsWindow = window.open('', '_blank', 'width=800,height=600');
    docsWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${currentSkill} - 文档</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 0 20px; background: #0d1117; color: #c9d1d9; }
          pre { background: #161b22; padding: 16px; border-radius: 8px; overflow-x: auto; }
          code { background: #161b22; padding: 2px 6px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; }
          h1, h2, h3 { color: #58a6ff; }
          a { color: #58a6ff; }
        </style>
      </head>
      <body>
        <h1>${currentSkill}</h1>
        <pre style="white-space: pre-wrap;">${escapeHtml(result.docs)}</pre>
      </body>
      </html>
    `);
  } else {
    showToast('文档加载失败: ' + result.message, 'error');
  }
}

// ========== 快捷键 ==========
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    if (currentTab === 'config') saveConfig();
    if (currentTab === 'code') saveCode();
    if (currentTab === 'persona') savePersona();
    if (currentTab === 'skills') saveSkillConfig();
  }
});
