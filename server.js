const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const PORT = 3456;

// ============================================
// 路径配置 - 使用相对路径，方便移植
// ============================================

// Bridge 路径（项目内置）
const BRIDGE_DIR = path.join(__dirname, 'bridge');
const BRIDGE_PATH = path.join(BRIDGE_DIR, 'bridge.js');
const BRIDGE_CONFIG_PATH = path.join(BRIDGE_DIR, 'config.json');
const BRIDGE_PERSONA_PATH = path.join(BRIDGE_DIR, 'persona.json');

// NapCat 路径配置
// 支持用户自定义路径，保存在配置文件中
const NAPCAT_CONFIG_FILE = path.join(__dirname, '.napcat-path.json');

// 加载 NapCat 路径配置
function loadNapCatPath() {
  try {
    if (fs.existsSync(NAPCAT_CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(NAPCAT_CONFIG_FILE, 'utf8'));
      return config.path;
    }
  } catch (e) {
    console.error('[路径] 加载 NapCat 路径配置失败:', e.message);
  }
  // 默认路径
  return process.env.NAPCAT_PATH || path.join(__dirname, 'napcat');
}

// 保存 NapCat 路径配置
function saveNapCatPath(napcatPath) {
  try {
    fs.writeFileSync(NAPCAT_CONFIG_FILE, JSON.stringify({ path: napcatPath, updatedAt: new Date().toISOString() }, null, 2));
    return true;
  } catch (e) {
    console.error('[路径] 保存 NapCat 路径配置失败:', e.message);
    return false;
  }
}

// 获取 NapCat 相关路径
let NAPCAT_PATH = loadNapCatPath();
let NAPCAT_BAT = path.join(NAPCAT_PATH, 'napcat.bat');
let QRCODE_PATH = path.join(NAPCAT_PATH, 'versions', '9.9.26-44498', 'resources', 'app', 'napcat', 'cache', 'qrcode.png');

// 更新 NapCat 路径
function updateNapCatPaths(newPath) {
  NAPCAT_PATH = newPath;
  NAPCAT_BAT = path.join(NAPCAT_PATH, 'napcat.bat');
  QRCODE_PATH = path.join(NAPCAT_PATH, 'versions', '9.9.26-44498', 'resources', 'app', 'napcat', 'cache', 'qrcode.png');
  saveNapCatPath(newPath);
}

// Skills 路径
const SKILLS_DIR = process.env.OPENCLAW_SKILLS || path.join(__dirname, '..', 'node_modules', 'openclaw', 'skills');
const WORKSPACE_SKILLS_DIR = path.join(__dirname, 'skills');

// 检查路径是否存在
function checkPaths() {
  const checks = {
    bridge: fs.existsSync(BRIDGE_DIR),
    bridgeJs: fs.existsSync(BRIDGE_PATH),
    bridgeConfig: fs.existsSync(BRIDGE_CONFIG_PATH),
    napcat: fs.existsSync(NAPCAT_BAT)
  };
  
  console.log('[路径检查]', checks);
  return checks;
}

// 全局状态
let napcatProcess = null;
let bridgeProcess = null;
let wsClient = null;
let messageHistory = [];
let botStatus = {
  napcat: 'stopped',
  bridge: 'stopped',
  qq: 'offline',
  wsConnected: false
};

// WebSocket 客户端列表（用于推送日志）
const wsClients = new Set();

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== WebSocket 日志推送 ====================

// 广播日志给所有连接的客户端
function broadcastLog(type, message) {
  const logData = JSON.stringify({
    type: 'log',
    logType: type, // 'bridge', 'napcat', 'system'
    message: message,
    time: new Date().toISOString()
  });
  
  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(logData);
    }
  });
}

// ==================== API路由 ====================

// 获取状态
app.get('/api/status', (req, res) => {
  res.json(botStatus);
});

// 启动 NapCat - 使用CMD的start命令
app.post('/api/napcat/start', (req, res) => {
  exec('tasklist /FI "IMAGENAME eq NapCatWinBootMain.exe" 2>NUL | find /I "NapCat" >NUL', (error) => {
    if (!error) {
      return res.json({ success: false, message: 'NapCat已在运行中' });
    }

    try {
      const cmd = `cmd /c start "NapCat QQ Bot" /d "${NAPCAT_PATH}" napcat.bat`;
      
      exec(cmd, { windowsHide: false }, (err) => {
        if (err) {
          console.error('[NapCat] 启动失败:', err);
          broadcastLog('system', `[错误] NapCat启动失败: ${err.message}`);
          return res.json({ success: false, message: err.message });
        }
        
        botStatus.napcat = 'running';
        console.log('[NapCat] 已在新窗口启动');
        broadcastLog('system', '[系统] NapCat已启动');
        
        setTimeout(() => {
          exec('tasklist /FI "IMAGENAME eq NapCatWinBootMain.exe" 2>NUL | find /I "NapCat" >NUL', (err) => {
            if (!err) {
              console.log('[NapCat] 进程检测成功');
              botStatus.qq = 'waiting_qr';
              broadcastLog('system', '[系统] NapCat进程检测成功，等待登录');
            }
          });
        }, 3000);
      });

      res.json({ success: true, message: 'NapCat正在新窗口启动...' });
    } catch (err) {
      console.error('[NapCat] 启动失败:', err);
      broadcastLog('system', `[错误] NapCat启动异常: ${err.message}`);
      res.json({ success: false, message: err.message });
    }
  });
});

// 停止 NapCat
app.post('/api/napcat/stop', (req, res) => {
  try {
    exec('taskkill /F /IM NapCatWinBootMain.exe 2>NUL', () => {
      exec('taskkill /F /IM QQ.exe 2>NUL', () => {
        botStatus.napcat = 'stopped';
        botStatus.qq = 'offline';
        napcatProcess = null;
        broadcastLog('system', '[系统] NapCat已停止');
        res.json({ success: true, message: 'NapCat已停止' });
      });
    });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 启动 Bridge - 后台运行并捕获输出
app.post('/api/bridge/start', (req, res) => {
  if (bridgeProcess) {
    return res.json({ success: false, message: 'Bridge已在运行中' });
  }

  // 检查 bridge.js 是否存在
  if (!fs.existsSync(BRIDGE_PATH)) {
    return res.json({ success: false, message: 'bridge.js 不存在，请确保项目完整' });
  }

  try {
    // 使用 spawn 启动，捕获输出（不弹窗，日志显示在网页上）
    // 使用相对路径启动
    bridgeProcess = spawn('node', ['bridge.js'], {
      cwd: BRIDGE_DIR,
      detached: false,
      windowsHide: true
    });

    botStatus.bridge = 'running';
    broadcastLog('system', '[系统] Bridge已启动，正在捕获输出...');

    // 捕获标准输出
    bridgeProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        console.log(`[Bridge] ${output}`);
        broadcastLog('bridge', output);
      }
    });

    // 捕获错误输出
    bridgeProcess.stderr.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        console.error(`[Bridge Error] ${output}`);
        broadcastLog('bridge', `[错误] ${output}`);
      }
    });

    // 进程退出
    bridgeProcess.on('close', (code) => {
      console.log(`[Bridge] 进程退出，代码: ${code}`);
      broadcastLog('system', `[系统] Bridge已停止 (退出码: ${code})`);
      bridgeProcess = null;
      botStatus.bridge = 'stopped';
    });

    bridgeProcess.on('error', (err) => {
      console.error('[Bridge] 启动错误:', err);
      broadcastLog('system', `[错误] Bridge启动错误: ${err.message}`);
    });

    res.json({ success: true, message: 'Bridge已启动（日志显示在网页上）' });
  } catch (err) {
    console.error('[Bridge] 启动失败:', err);
    broadcastLog('system', `[错误] Bridge启动失败: ${err.message}`);
    res.json({ success: false, message: err.message });
  }
});

// 停止 Bridge
app.post('/api/bridge/stop', (req, res) => {
  if (!bridgeProcess) {
    return res.json({ success: false, message: 'Bridge未运行' });
  }

  try {
    bridgeProcess.kill();
    bridgeProcess = null;
    botStatus.bridge = 'stopped';
    broadcastLog('system', '[系统] Bridge已停止');
    res.json({ success: true, message: 'Bridge已停止' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 获取二维码
app.get('/api/qrcode', (req, res) => {
  if (fs.existsSync(QRCODE_PATH)) {
    res.sendFile(QRCODE_PATH);
  } else {
    res.status(404).json({ success: false, message: '二维码不存在，请先启动NapCat' });
  }
});

// 检查二维码是否存在
app.get('/api/qrcode/exists', (req, res) => {
  const exists = fs.existsSync(QRCODE_PATH);
  res.json({ exists, path: QRCODE_PATH });
});

// 读取 bridge.js
app.get('/api/bridge/code', (req, res) => {
  try {
    const code = fs.readFileSync(BRIDGE_PATH, 'utf8');
    res.json({ success: true, code });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 保存 bridge.js
app.post('/api/bridge/code', (req, res) => {
  try {
    const { code } = req.body;
    const backupPath = BRIDGE_PATH + '.backup.' + Date.now();
    fs.copyFileSync(BRIDGE_PATH, backupPath);
    fs.writeFileSync(BRIDGE_PATH, code, 'utf8');
    res.json({ success: true, message: '代码已保存并备份' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 读取 config.json
app.get('/api/config', (req, res) => {
  try {
    const config = fs.readFileSync(BRIDGE_CONFIG_PATH, 'utf8');
    res.json({ success: true, config: JSON.parse(config) });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 保存 config.json
app.post('/api/config', (req, res) => {
  try {
    const { config } = req.body;
    const backupPath = BRIDGE_CONFIG_PATH + '.backup.' + Date.now();
    fs.copyFileSync(BRIDGE_CONFIG_PATH, backupPath);
    fs.writeFileSync(BRIDGE_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    res.json({ success: true, message: '配置已保存并备份' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 读取 persona.json
app.get('/api/persona', (req, res) => {
  try {
    if (fs.existsSync(BRIDGE_PERSONA_PATH)) {
      const persona = fs.readFileSync(BRIDGE_PERSONA_PATH, 'utf8');
      res.json({ success: true, persona: JSON.parse(persona) });
    } else {
      res.json({ success: false, message: '人设文件不存在' });
    }
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 保存 persona.json
app.post('/api/persona', (req, res) => {
  try {
    const { persona } = req.body;
    const backupPath = BRIDGE_PERSONA_PATH + '.backup.' + Date.now();
    if (fs.existsSync(BRIDGE_PERSONA_PATH)) {
      fs.copyFileSync(BRIDGE_PERSONA_PATH, backupPath);
    }
    fs.writeFileSync(BRIDGE_PERSONA_PATH, JSON.stringify(persona, null, 2), 'utf8');
    res.json({ success: true, message: '人设已保存并备份' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 获取消息历史
app.get('/api/messages', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json({ messages: messageHistory.slice(-limit) });
});

// ==================== NapCat 路径管理 ====================

// 获取当前 NapCat 路径
app.get('/api/napcat/path', (req, res) => {
  const exists = fs.existsSync(NAPCAT_BAT);
  res.json({
    success: true,
    path: NAPCAT_PATH,
    exists: exists,
    batPath: NAPCAT_BAT,
    qrPath: QRCODE_PATH
  });
});

// 设置 NapCat 路径
app.post('/api/napcat/path', (req, res) => {
  try {
    const { path: newPath } = req.body;
    
    if (!newPath) {
      return res.json({ success: false, message: '路径不能为空' });
    }
    
    // 验证路径是否存在 napcat.bat
    const batPath = path.join(newPath, 'napcat.bat');
    if (!fs.existsSync(batPath)) {
      return res.json({ 
        success: false, 
        message: '该目录下未找到 napcat.bat，请确认路径正确',
        checkedPath: batPath
      });
    }
    
    // 更新路径
    updateNapCatPaths(newPath);
    
    res.json({ 
      success: true, 
      message: 'NapCat 路径已更新',
      path: NAPCAT_PATH,
      exists: true
    });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 检测 NapCat 路径（自动查找常见位置）
app.post('/api/napcat/detect', (req, res) => {
  try {
    // 常见安装位置
    const commonPaths = [
      path.join(__dirname, 'napcat'),
      'F:\\下载\\NapCat.44498.Shell',
      'C:\\Program Files\\NapCat',
      'C:\\NapCat',
      path.join(require('os').homedir(), 'Downloads', 'NapCat'),
      path.join(require('os').homedir(), 'NapCat')
    ];
    
    // 添加环境变量路径
    if (process.env.NAPCAT_PATH) {
      commonPaths.unshift(process.env.NAPCAT_PATH);
    }
    
    // 查找存在的路径
    const found = commonPaths.find(p => fs.existsSync(path.join(p, 'napcat.bat')));
    
    if (found) {
      updateNapCatPaths(found);
      res.json({
        success: true,
        message: '自动检测到 NapCat',
        path: found
      });
    } else {
      res.json({
        success: false,
        message: '未检测到 NapCat，请手动选择路径',
        searched: commonPaths
      });
    }
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// ==================== Skills API ====================

// 获取所有已安装的 skills
app.get('/api/skills', (req, res) => {
  try {
    const skills = [];
    
    // 读取系统 skills
    if (fs.existsSync(SKILLS_DIR)) {
      const systemSkills = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => {
          const skillPath = path.join(SKILLS_DIR, dirent.name);
          const skillMdPath = path.join(skillPath, 'SKILL.md');
          const configPath = path.join(skillPath, 'config.json');
          
          let description = '';
          let hasConfig = false;
          
          if (fs.existsSync(skillMdPath)) {
            const mdContent = fs.readFileSync(skillMdPath, 'utf8');
            const descMatch = mdContent.match(/<description>([\s\S]*?)<\/description>/);
            description = descMatch ? descMatch[1].trim() : '';
          }
          
          hasConfig = fs.existsSync(configPath);
          
          return {
            name: dirent.name,
            type: 'system',
            path: skillPath,
            description: description,
            hasConfig: hasConfig
          };
        });
      
      skills.push(...systemSkills);
    }
    
    // 读取用户自定义 skills
    if (fs.existsSync(WORKSPACE_SKILLS_DIR)) {
      const userSkills = fs.readdirSync(WORKSPACE_SKILLS_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => {
          const skillPath = path.join(WORKSPACE_SKILLS_DIR, dirent.name);
          const skillMdPath = path.join(skillPath, 'SKILL.md');
          const configPath = path.join(skillPath, 'config.json');
          
          let description = '';
          let hasConfig = false;
          
          if (fs.existsSync(skillMdPath)) {
            const mdContent = fs.readFileSync(skillMdPath, 'utf8');
            const descMatch = mdContent.match(/<description>([\s\S]*?)<\/description>/);
            description = descMatch ? descMatch[1].trim() : '';
          }
          
          hasConfig = fs.existsSync(configPath);
          
          return {
            name: dirent.name,
            type: 'user',
            path: skillPath,
            description: description,
            hasConfig: hasConfig
          };
        });
      
      skills.push(...userSkills);
    }
    
    res.json({ success: true, skills: skills });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 获取 skill 配置
app.get('/api/skills/:name/config', (req, res) => {
  try {
    const skillName = req.params.name;
    let configPath = path.join(SKILLS_DIR, skillName, 'config.json');
    
    // 如果在系统目录找不到，尝试用户目录
    if (!fs.existsSync(configPath) && fs.existsSync(WORKSPACE_SKILLS_DIR)) {
      configPath = path.join(WORKSPACE_SKILLS_DIR, skillName, 'config.json');
    }
    
    if (fs.existsSync(configPath)) {
      const config = fs.readFileSync(configPath, 'utf8');
      res.json({ success: true, config: JSON.parse(config) });
    } else {
      res.json({ success: false, message: '配置文件不存在' });
    }
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 保存 skill 配置
app.post('/api/skills/:name/config', (req, res) => {
  try {
    const skillName = req.params.name;
    const { config } = req.body;
    
    // 优先保存到用户目录
    let configDir = path.join(WORKSPACE_SKILLS_DIR, skillName);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    const configPath = path.join(configDir, 'config.json');
    
    // 备份原文件
    if (fs.existsSync(configPath)) {
      const backupPath = configPath + '.backup.' + Date.now();
      fs.copyFileSync(configPath, backupPath);
    }
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    res.json({ success: true, message: '配置已保存并备份' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 获取 skill 文档
app.get('/api/skills/:name/docs', (req, res) => {
  try {
    const skillName = req.params.name;
    let skillMdPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');
    
    // 如果在系统目录找不到，尝试用户目录
    if (!fs.existsSync(skillMdPath) && fs.existsSync(WORKSPACE_SKILLS_DIR)) {
      skillMdPath = path.join(WORKSPACE_SKILLS_DIR, skillName, 'SKILL.md');
    }
    
    if (fs.existsSync(skillMdPath)) {
      const docs = fs.readFileSync(skillMdPath, 'utf8');
      res.json({ success: true, docs: docs });
    } else {
      res.json({ success: false, message: '文档不存在' });
    }
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 一键启动所有
app.post('/api/start-all', async (req, res) => {
  try {
    // 检查 NapCat 是否存在
    if (!fs.existsSync(NAPCAT_BAT)) {
      return res.json({ 
        success: false, 
        message: 'NapCat 未找到。请下载 NapCat 并放在项目目录的 napcat/ 文件夹中，或设置 NAPCAT_PATH 环境变量' 
      });
    }

    // 启动 NapCat（弹窗）
    const napcatCmd = `cmd /c start "NapCat QQ Bot" /d "${NAPCAT_PATH}" napcat.bat`;
    exec(napcatCmd);
    botStatus.napcat = 'running';
    broadcastLog('system', '[系统] NapCat已启动');

    // 等待5秒后启动 Bridge（后台，日志在网页显示）
    setTimeout(() => {
      if (!bridgeProcess) {
        bridgeProcess = spawn('node', ['bridge.js'], {
          cwd: BRIDGE_DIR,
          detached: false,
          windowsHide: true
        });

        botStatus.bridge = 'running';
        broadcastLog('system', '[系统] Bridge已启动，日志显示在网页上');

        bridgeProcess.stdout.on('data', (data) => {
          const output = data.toString().trim();
          if (output) {
            console.log(`[Bridge] ${output}`);
            broadcastLog('bridge', output);
          }
        });

        bridgeProcess.stderr.on('data', (data) => {
          const output = data.toString().trim();
          if (output) {
            console.error(`[Bridge Error] ${output}`);
            broadcastLog('bridge', `[错误] ${output}`);
          }
        });

        bridgeProcess.on('close', (code) => {
          console.log(`[Bridge] 进程退出，代码: ${code}`);
          broadcastLog('system', `[系统] Bridge已停止 (退出码: ${code})`);
          bridgeProcess = null;
          botStatus.bridge = 'stopped';
        });
      }
    }, 5000);

    res.json({ success: true, message: '正在启动 NapCat 和 Bridge...' });
  } catch (err) {
    console.error('[一键启动] 失败:', err);
    broadcastLog('system', `[错误] 启动失败: ${err.message}`);
    res.json({ success: false, message: err.message });
  }
});

// 一键停止所有
app.post('/api/stop-all', (req, res) => {
  try {
    // 结束 Bridge
    if (bridgeProcess) {
      bridgeProcess.kill();
      bridgeProcess = null;
      botStatus.bridge = 'stopped';
    }
    
    // 结束 NapCat
    exec('taskkill /F /IM NapCatWinBootMain.exe 2>NUL', () => {
      exec('taskkill /F /IM QQ.exe 2>NUL', () => {
        botStatus.napcat = 'stopped';
        botStatus.qq = 'offline';
        napcatProcess = null;
      });
    });
    
    broadcastLog('system', '[系统] 所有服务已停止');
    res.json({ success: true, message: '所有服务已停止' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// ==================== HTTP + WebSocket 服务器 ====================

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// WebSocket 连接处理
wss.on('connection', (ws) => {
  console.log('[WebSocket] 客户端已连接');
  wsClients.add(ws);
  
  // 发送欢迎消息
  ws.send(JSON.stringify({
    type: 'log',
    logType: 'system',
    message: '[系统] 已连接到日志服务器',
    time: new Date().toISOString()
  }));

  ws.on('close', () => {
    console.log('[WebSocket] 客户端已断开');
    wsClients.delete(ws);
  });

  ws.on('error', (err) => {
    console.error('[WebSocket] 客户端错误:', err);
    wsClients.delete(ws);
  });
});

// NapCat WebSocket 连接（接收消息）
function connectNapCatWebSocket() {
  try {
    const ws = new WebSocket('ws://127.0.0.1:3001');
    
    ws.on('open', () => {
      console.log('[WebSocket] 已连接到 NapCat');
      botStatus.wsConnected = true;
      broadcastLog('system', '[系统] 已连接到 NapCat');
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.post_type === 'message') {
          messageHistory.push({
            id: msg.message_id,
            type: 'receive',
            messageType: msg.message_type,
            userId: msg.user_id,
            groupId: msg.group_id,
            content: extractText(msg.message),
            raw: msg,
            time: new Date().toISOString()
          });
          
          if (messageHistory.length > 200) {
            messageHistory = messageHistory.slice(-100);
          }
        }
      } catch (e) {
        console.error('[WebSocket] 解析消息失败:', e);
      }
    });

    ws.on('close', () => {
      console.log('[WebSocket] NapCat连接断开，5秒后重连...');
      botStatus.wsConnected = false;
      setTimeout(connectNapCatWebSocket, 5000);
    });

    ws.on('error', (err) => {
      console.error('[WebSocket] NapCat错误:', err.message);
      botStatus.wsConnected = false;
    });

    wsClient = ws;
  } catch (err) {
    console.error('[WebSocket] NapCat连接失败:', err.message);
    setTimeout(connectNapCatWebSocket, 5000);
  }
}

function extractText(message) {
  if (typeof message === 'string') return message;
  if (!Array.isArray(message)) return '';
  return message
    .filter(seg => seg.type === 'text')
    .map(seg => seg.data.text)
    .join('')
    .trim();
}

// ==================== 启动服务器 ====================

server.listen(PORT, () => {
  // 检查路径
  const paths = checkPaths();
  
  console.log(`
╔══════════════════════════════════════════════════════════╗
║        NapCat Web Manager 已启动                         ║
║                                                          ║
║   访问地址: http://localhost:${PORT}                      ║
║                                                          ║
║   功能:                                                  ║
║   • 可视化启动/停止 NapCat                              ║
║   • 显示登录二维码                                      ║
║   • 实时消息监控                                        ║
║   • Bridge 日志实时显示在网页上                         ║
║   • 编辑 Bridge 代码和配置                              ║
║   • 管理 AI 人设                                        ║
╚══════════════════════════════════════════════════════════╝
  `);
  
  console.log('[路径配置]');
  console.log('  Bridge 目录:', BRIDGE_DIR, paths.bridge ? '✅' : '❌');
  console.log('  Bridge JS:', BRIDGE_PATH, paths.bridgeJs ? '✅' : '❌');
  console.log('  NapCat:', NAPCAT_PATH, paths.napcat ? '✅' : '❌');
  
  if (!paths.napcat) {
    console.log('\n⚠️  NapCat 未找到！请下载 NapCat 并放在以下位置之一：');
    console.log('   1. 项目目录的 napcat/ 文件夹中');
    console.log('   2. 设置 NAPCAT_PATH 环境变量指向 NapCat 目录');
    console.log('   下载地址: https://github.com/NapNeko/NapCatQQ/releases\n');
  }
  
  connectNapCatWebSocket();
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n[服务器] 正在关闭...');
  if (wsClient) wsClient.close();
  if (bridgeProcess) bridgeProcess.kill();
  if (napcatProcess) napcatProcess.kill();
  wsClients.forEach(client => client.close());
  server.close(() => {
    process.exit(0);
  });
});
