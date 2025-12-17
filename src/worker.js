/**
 * Domain Monitor Worker (Full Pro Version)
 * Ported from Flask to Cloudflare Workers
 * Features: Drag&Drop, Themes, Local/Cloud Backup, Batch Ops
 */

// --- 1. HTML 渲染 (包含完整的 UI/CSS/JS) ---
function renderHTML(domains, config, stats) {
  // 处理数据，生成表格 HTML
  const rows = domains.map(d => `
      <tr data-id="${d.id}">
          <td><input type="checkbox" class="chk" value="${d.id}"></td>
          <td class="drag-handle" style="cursor:grab; color:#666;"><i class="fas fa-grip-lines"></i></td>
          <td>
              <div style="font-weight:bold; font-size:1.1em;">
                  ${d.domain_name} 
                  <a href="http://${d.domain_name}" target="_blank" style="font-size:0.7em; color:#666; text-decoration:none;"><i class="fas fa-external-link-alt"></i></a>
              </div>
              <div style="font-size:0.8em; color:var(--accent);">${d.remark}</div>
          </td>
          <td id="status-${d.id}">
              ${d.is_online 
                  ? `<span class="status-badge badge-ok">200 OK</span> <small>${d.response_time}ms</small>` 
                  : (d.status_code !== 'N/A' ? `<span class="status-badge badge-err">${d.status_code}</span>` : '<span style="color:#666">-</span>')
              }
          </td>
          <td class="hide-mobile">
              <span style="color:${d.days_to_expire < 30 ? '#d63031' : '#00b894'}">${d.days_to_expire} 天</span>
              <div style="font-size:0.75em; color:#888;">${d.expiration_date}</div>
          </td>
          <td style="text-align:right;">
              <button class="btn btn-grey" style="padding:4px 8px;" onclick="safeCopy('${d.domain_name}')" title="复制域名"><i class="fas fa-copy"></i></button>
              <button class="btn btn-primary" style="padding:4px 8px;" onclick="openEdit('${d.id}', '${d.domain_name}', '${d.remark}', '${d.registration_date}', '${d.expiration_date}')" title="编辑"><i class="fas fa-edit"></i></button>
              <button class="btn btn-danger" style="padding:4px 8px;" onclick="delOne(${d.id})" title="删除"><i class="fas fa-trash"></i></button>
          </td>
      </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <title>Domain Monitor Pro</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.0/Sortable.min.js"></script>
    <style>
        :root { --bg:#121212; --card:#1e1e1e; --text:#e0e0e0; --accent:#6c5ce7; --danger:#d63031; --success:#00b894; }
        [data-theme="light"] { --bg:#f5f6fa; --card:#ffffff; --text:#2d3436; --accent:#0984e3; --danger:#ff7675; --success:#00b894; }
        [data-theme="cyber"] { --bg:#000; --card:#0a0a0a; --text:#0ff; --accent:#f0f; --success:#0f0; --danger:#f00; }

        body { background:var(--bg); color:var(--text); font-family:'Segoe UI', sans-serif; margin:0; padding:20px; min-height:100vh; transition:0.3s; }
        .container { max-width:1200px; margin:0 auto; }
        .navbar { display:flex; justify-content:space-between; align-items:center; background:var(--card); padding:15px; border-radius:15px; margin-bottom:30px; box-shadow:0 4px 10px rgba(0,0,0,0.1); border:1px solid rgba(255,255,255,0.05); }
        .btn { padding:8px 15px; border:none; border-radius:6px; cursor:pointer; color:white; display:inline-flex; align-items:center; gap:5px; text-decoration:none; font-size:14px; transition:0.2s; }
        .btn:hover { opacity:0.9; transform:translateY(-1px); }
        .btn:active { transform:translateY(0); }
        .btn-primary { background:var(--accent); }
        .btn-danger { background:var(--danger); }
        .btn-success { background:var(--success); }
        .btn-grey { background:#636e72; }
        
        /* 设置面板 */
        .settings-grid { display:none; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:20px; margin-bottom:20px; }
        .config-card { background:rgba(255,255,255,0.02); padding:20px; border-radius:15px; border:1px solid rgba(255,255,255,0.1); }
        [data-theme="light"] .config-card { background:#fff; border:1px solid #eee; }
        
        .config-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; font-weight:bold; font-size:1.1em; }
        .group { margin-bottom:15px; }
        .group-label { font-size:0.85em; color:#888; margin-bottom:8px; }
        .btn-group { display:flex; gap:8px; flex-wrap:wrap; }

        /* 表格 */
        .d-table { width:100%; border-collapse:collapse; background:var(--card); border-radius:12px; overflow:hidden; box-shadow:0 5px 15px rgba(0,0,0,0.2); }
        th, td { padding:12px 15px; text-align:left; border-bottom:1px solid rgba(128,128,128,0.1); }
        .status-badge { padding:3px 8px; border-radius:4px; font-size:0.8em; font-weight:bold; }
        .badge-ok { background:rgba(0,184,148,0.15); color:var(--success); border:1px solid var(--success); }
        .badge-err { background:rgba(214,48,49,0.15); color:var(--danger); border:1px solid var(--danger); }
        
        /* 模态框 */
        .modal { display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:999; backdrop-filter:blur(5px); }
        .modal-content { background:var(--card); width:90%; max-width:450px; margin:8% auto; padding:25px; border-radius:15px; border:1px solid rgba(128,128,128,0.2); box-shadow:0 20px 50px rgba(0,0,0,0.5); }
        .modal input, .modal textarea { width:100%; padding:10px; margin:5px 0 15px 0; background:rgba(128,128,128,0.1); border:1px solid rgba(128,128,128,0.2); color:var(--text); box-sizing:border-box; border-radius:6px; font-family:inherit; }
        .modal label { font-size:0.9em; color:var(--accent); font-weight:bold; }

        @media(max-width:768px) { .hide-mobile { display:none; } }
    </style>
</head>
<body>

<div class="container">
    <div class="navbar">
        <div style="font-weight:bold; font-size:1.2em; display:flex; align-items:center; gap:10px;">
            <i class="fas fa-server" style="color:var(--accent)"></i> DomainMonitor
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
            <select onchange="setTheme(this.value)" id="themeSelect" style="padding:6px; border-radius:6px; background:rgba(128,128,128,0.2); color:var(--text); border:none;">
                <option value="default">🌑 深色</option>
                <option value="light">☀️ 浅色</option>
                <option value="cyber">🤖 赛博</option>
            </select>
            <button class="btn btn-grey" onclick="toggleSettings()">🔧 管理</button>
            <a href="/logout" class="btn btn-danger"><i class="fas fa-power-off"></i></a>
        </div>
    </div>

    <!-- 数据管理区域 (默认隐藏) -->
    <div id="settingsPanel" class="settings-grid">
        <!-- 本地导入导出 -->
        <div class="config-card">
            <div class="config-header">📁 本地数据</div>
            <div class="group">
                <div class="group-label">导出备份:</div>
                <div class="btn-group">
                    <a href="/export/json" class="btn btn-primary btn-sm"><i class="fas fa-download"></i> JSON</a>
                    <a href="/export/txt" class="btn btn-grey btn-sm"><i class="fas fa-download"></i> TXT</a>
                </div>
            </div>
            <div class="group">
                <div class="group-label">导入恢复 (JSON/TXT):</div>
                <div class="btn-group">
                    <button onclick="document.getElementById('fileIn').click()" class="btn btn-success"><i class="fas fa-upload"></i> 选择文件</button>
                    <input type="file" id="fileIn" hidden onchange="uploadFile(this)">
                </div>
            </div>
        </div>

        <!-- GitHub Gist -->
        <div class="config-card">
            <div class="config-header">
                <span><i class="fab fa-github"></i> Gist 备份</span>
                <button onclick="openConfigModal('gist')" class="btn btn-grey" style="font-size:0.7em">⚙️ 设置</button>
            </div>
            <div class="group-label">同步到 GitHub:</div>
            <div class="btn-group">
                <button onclick="cloudAction('gist','export')" class="btn btn-primary">⬆️ 备份</button>
                <button onclick="cloudAction('gist','import')" class="btn btn-success">⬇️ 恢复</button>
            </div>
            <div style="font-size:0.75em; margin-top:10px; color:#888;">ID: ${config.gist_id || '未绑定'}</div>
        </div>

        <!-- WebDAV -->
        <div class="config-card">
            <div class="config-header">
                <span><i class="fas fa-cloud"></i> WebDAV</span>
                <button onclick="openConfigModal('webdav')" class="btn btn-grey" style="font-size:0.7em">⚙️ 设置</button>
            </div>
            <div class="group-label">同步到网盘:</div>
            <div class="btn-group">
                <button onclick="cloudAction('webdav','export')" class="btn btn-primary">⬆️ 上传</button>
                <button onclick="cloudAction('webdav','import')" class="btn btn-success">⬇️ 下载</button>
            </div>
        </div>
    </div>

    <!-- 统计栏 -->
    <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:15px; margin-bottom:20px; text-align:center;">
        <div class="config-card">
            <div style="color:#888; font-size:0.8em">总域名</div><div style="font-size:1.5em; font-weight:bold;">${stats.total}</div>
        </div>
        <div class="config-card">
            <div style="color:#888; font-size:0.8em">正常</div><div style="font-size:1.5em; color:var(--success); font-weight:bold;">${stats.online}</div>
        </div>
        <div class="config-card">
            <div style="color:#888; font-size:0.8em">异常</div><div style="font-size:1.5em; color:var(--danger); font-weight:bold;">${stats.issue}</div>
        </div>
        <div class="config-card">
            <div style="color:#888; font-size:0.8em">即将过期</div><div style="font-size:1.5em; color:#fdcb6e; font-weight:bold;">${stats.soon}</div>
        </div>
    </div>

    <!-- 操作栏 -->
    <div style="margin-bottom:15px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px;">
        <div style="display:flex; gap:10px;">
            <button onclick="document.getElementById('addModal').style.display='block'" class="btn btn-primary"><i class="fas fa-plus"></i> 添加</button>
            <button onclick="batchRefresh()" class="btn btn-success"><i class="fas fa-sync"></i> 刷新</button>
        </div>
        <button onclick="batchDelete()" class="btn btn-danger"><i class="fas fa-trash"></i> 批量删除</button>
    </div>

    <!-- 列表 -->
    <div style="overflow-x:auto;">
        <table class="d-table">
            <thead>
                <tr>
                    <th width="30"><input type="checkbox" id="selectAll" onclick="toggleAll()"></th>
                    <th width="30"></th>
                    <th>域名 / 备注</th>
                    <th>状态</th>
                    <th class="hide-mobile">到期</th>
                    <th style="text-align:right">操作</th>
                </tr>
            </thead>
            <tbody id="domainList">${rows}</tbody>
        </table>
    </div>
</div>

<!-- 弹窗: 添加 -->
<div id="addModal" class="modal">
    <div class="modal-content">
        <h3>批量添加</h3>
        <p style="font-size:0.8em; color:#888;">输入域名 (一行一个):</p>
        <textarea id="bulkInput" rows="8" placeholder="google.com\nbaidu.com"></textarea>
        <div style="text-align:right;">
            <button onclick="document.getElementById('addModal').style.display='none'" class="btn btn-grey">取消</button>
            <button onclick="submitAdd()" class="btn btn-primary">确定</button>
        </div>
    </div>
</div>

<!-- 弹窗: 编辑 -->
<div id="editModal" class="modal">
    <div class="modal-content">
        <h3>编辑域名</h3>
        <input type="hidden" id="editId">
        <label>域名</label><input type="text" id="editDomain">
        <label>备注</label><input type="text" id="editRemark">
        <label>注册日期</label><input type="text" id="editReg" placeholder="YYYY-MM-DD">
        <label>到期日期</label><input type="text" id="editExp" placeholder="YYYY-MM-DD">
        <div style="text-align:right;">
            <button onclick="document.getElementById('editModal').style.display='none'" class="btn btn-grey">取消</button>
            <button onclick="submitEdit()" class="btn btn-primary">保存</button>
        </div>
    </div>
</div>

<!-- 弹窗: 配置 (Gist/WebDAV) -->
<div id="configModal" class="modal">
    <div class="modal-content">
        <h3>配置参数</h3>
        <div id="gistFields" style="display:none;">
            <label>GitHub Personal Access Token</label>
            <input type="password" id="cfg_gist_token" value="${config.gist_token || ''}" placeholder="ghp_xxxxxx">
        </div>
        <div id="webdavFields" style="display:none;">
            <label>WebDAV 地址</label>
            <input type="text" id="cfg_webdav_url" value="${config.webdav_url || ''}" placeholder="https://dav.example.com/">
            <label>账号</label>
            <input type="text" id="cfg_webdav_user" value="${config.webdav_user || ''}">
            <label>密码</label>
            <input type="password" id="cfg_webdav_pass" value="${config.webdav_pass || ''}">
        </div>
        <div style="text-align:right; margin-top:15px;">
            <button onclick="document.getElementById('configModal').style.display='none'" class="btn btn-grey">取消</button>
            <button onclick="saveConfig()" class="btn btn-success">保存配置</button>
        </div>
    </div>
</div>

<script>
    // --- 核心功能函数 ---
    
    // 复制功能
    function safeCopy(text) {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => alert('已复制: ' + text));
        } else {
            let ta = document.createElement("textarea");
            ta.value = text; ta.style.position = "fixed"; ta.style.left = "-9999px";
            document.body.appendChild(ta); ta.focus(); ta.select();
            try { document.execCommand('copy'); alert('已复制: ' + text); } 
            catch (e) { alert('复制失败'); }
            document.body.removeChild(ta);
        }
    }

    // 主题切换
    function setTheme(t) {
        document.body.setAttribute('data-theme', t);
        localStorage.setItem('theme', t);
        document.getElementById('themeSelect').value = t;
    }
    const savedTheme = localStorage.getItem('theme') || 'default';
    setTheme(savedTheme);

    // 面板切换
    function toggleSettings() {
        const p = document.getElementById('settingsPanel');
        p.style.display = (p.style.display === 'grid' ? 'none' : 'grid');
    }

    // 拖拽排序 (SortableJS)
    new Sortable(document.getElementById('domainList'), {
        handle: '.drag-handle', animation: 150,
        onEnd: function() {
            const ids = Array.from(document.querySelectorAll('tr[data-id]')).map(tr=>tr.getAttribute('data-id'));
            fetch('/api/reorder', {
                method:'POST', 
                headers:{'Content-Type':'application/json'}, 
                body:JSON.stringify({order:ids})
            });
        }
    });

    // --- API 调用逻辑 ---
    
    async function submitAdd() {
        const fd = new FormData(); fd.append('domains', document.getElementById('bulkInput').value);
        await fetch('/api/add_bulk', {method:'POST', body:fd}); location.reload();
    }
    
    function delOne(id) { 
        if(confirm('确认删除?')) fetch('/api/delete/'+id, {method:'POST'}).then(()=>location.reload()); 
    }
    
    function batchDelete() {
        const checks = document.querySelectorAll('.chk:checked');
        if(!checks.length) return alert('未选择任何域名');
        if(confirm('确定删除选中的 ' + checks.length + ' 个域名?')) {
            // 前端循环删除，简单直接
            const promises = Array.from(checks).map(c => fetch('/api/delete/'+c.value, {method:'POST'}));
            Promise.all(promises).then(() => location.reload());
        }
    }

    function batchRefresh() {
        if(!confirm('确定刷新状态?')) return;
        const checks = document.querySelectorAll('.chk:checked');
        const list = checks.length ? checks : document.querySelectorAll('.chk');
        
        list.forEach((c, idx) => {
            const id = c.value;
            setTimeout(() => {
                const el = document.getElementById('status-'+id);
                if(el) {
                    el.innerHTML = '<span style="color:#888">...</span>';
                    fetch('/api/refresh/'+id, {method:'POST'}).then(r=>r.json()).then(d=>{
                        const cls = d.online ? 'badge-ok' : 'badge-err';
                        const txt = d.online ? '200 OK' : d.code;
                        el.innerHTML = \`<span class="status-badge \${cls}">\${txt}</span> <small>\${d.ms}ms</small>\`;
                    });
                }
            }, idx * 150); // 错峰请求
        });
    }

    // 编辑
    function openEdit(id, dom, rem, reg, exp) {
        document.getElementById('editModal').style.display='block';
        document.getElementById('editId').value = id;
        document.getElementById('editDomain').value = dom;
        document.getElementById('editRemark').value = rem;
        document.getElementById('editReg').value = reg;
        document.getElementById('editExp').value = exp;
    }
    function submitEdit() {
        const fd = new FormData();
        fd.append('id', document.getElementById('editId').value);
        fd.append('domain_name', document.getElementById('editDomain').value);
        fd.append('remark', document.getElementById('editRemark').value);
        fd.append('reg_date', document.getElementById('editReg').value);
        fd.append('exp_date', document.getElementById('editExp').value);
        fetch('/api/edit', {method:'POST', body:fd}).then(()=>location.reload());
    }

    // 配置与备份
    function openConfigModal(type) {
        document.getElementById('configModal').style.display = 'block';
        document.getElementById('gistFields').style.display = (type==='gist'?'block':'none');
        document.getElementById('webdavFields').style.display = (type==='webdav'?'block':'none');
    }
    function saveConfig() {
        const fd = new FormData();
        fd.append('gist_token', document.getElementById('cfg_gist_token').value);
        fd.append('webdav_url', document.getElementById('cfg_webdav_url').value);
        fd.append('webdav_user', document.getElementById('cfg_webdav_user').value);
        fd.append('webdav_pass', document.getElementById('cfg_webdav_pass').value);
        fetch('/api/save_config', {method:'POST', body:fd}).then(r=>r.json()).then(d=>{ alert(d.msg); });
    }
    function cloudAction(service, action) {
        if(!confirm('执行 '+service+' '+action+'?')) return;
        fetch('/api/'+service+'/'+action, {method:'POST'}).then(r=>r.json()).then(d=>{
            alert(d.msg);
            if(d.status === 'success' && action === 'import') location.reload();
        });
    }

    // 本地文件导入
    function uploadFile(input) {
        if(!input.files.length) return;
        const fd = new FormData(); fd.append('file', input.files[0]);
        fetch('/import_file', {method:'POST', body:fd}).then(r=>r.json()).then(res=>{
            alert(res.msg); location.reload();
        });
    }

    // 全选/反选
    function toggleAll() {
        const val = document.getElementById('selectAll').checked;
        document.querySelectorAll('.chk').forEach(c=>c.checked=val);
    }
    
    // 点击遮罩关闭
    window.onclick = function(e) { if(e.target.classList.contains('modal')) e.target.style.display='none'; }
</script>
</body>
</html>
  `;
}

// 登录界面
const LOGIN_HTML = `
<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width"><title>Login</title></head>
<body style="background:#121212;color:white;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;">
<form method="POST" style="background:#1e1e1e;padding:40px;border-radius:10px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.5);">
  <h3 style="margin-top:0;">🔐 域名监控</h3>
  <input type="password" name="password" placeholder="Password" style="padding:10px;border-radius:5px;border:none;width:200px;margin-bottom:15px;" autofocus>
  <br>
  <button type="submit" style="padding:10px 20px;border-radius:5px;border:none;background:#6c5ce7;color:white;cursor:pointer;font-weight:bold;">Login</button>
</form></body></html>
`;

// --- 后端逻辑 Helpers ---

function calcDays(expDateStr) {
  if (!expDateStr) return 0;
  try {
      const exp = new Date(expDateStr);
      const now = new Date();
      return Math.ceil((exp - now) / (1000 * 60 * 60 * 24)); 
  } catch (e) { return 0; }
}

async function checkWebsite(url) {
  let target = url.startsWith('http') ? url : `http://${url}`;
  const start = Date.now();
  try {
      const resp = await fetch(target, {
          method: 'GET',
          headers: { 'User-Agent': 'Mozilla/5.0 (DomainMonitor-Worker)' },
          redirect: 'follow'
      });
      return { online: true, code: resp.status.toString(), ms: Date.now() - start };
  } catch (e) {
      return { online: false, code: "Error", ms: 0 };
  }
}

export default {
  // 1. 处理 HTTP 请求
  async fetch(request, env) {
      const url = new URL(request.url);
      const method = request.method;
      
      const SYS_PASSWORD = env.PASSWORD || "123456"; 
      
      // 鉴权
      const cookie = request.headers.get('Cookie') || "";
      const isLoggedIn = cookie.includes(`auth=${SYS_PASSWORD}`);

      // Login / Logout
      if (url.pathname === '/login') {
          if (method === 'POST') {
              const fd = await request.formData();
              if (fd.get('password') === SYS_PASSWORD) {
                  return new Response('Redirecting...', {
                      status: 302,
                      headers: { 'Location': '/', 'Set-Cookie': `auth=${SYS_PASSWORD}; Path=/; HttpOnly; Max-Age=31536000; SameSite=Lax` }
                  });
              }
          }
          return new Response(LOGIN_HTML, { headers: { 'Content-Type': 'text/html' } });
      }

      if (url.pathname === '/logout') {
          return new Response('Logged out', {
              status: 302,
              headers: { 'Location': '/login', 'Set-Cookie': 'auth=; Path=/; Max-Age=0' }
          });
      }

      if (!isLoggedIn) return new Response(null, { status: 302, headers: { 'Location': '/login' } });

      // 主页 Dashboard
      if (url.pathname === '/') {
          // 按 position 排序
          const { results: domains } = await env.DB.prepare("SELECT * FROM Domain ORDER BY position ASC").all();
          const config = await env.DB.prepare("SELECT * FROM Config LIMIT 1").first() || {};
          
          const stats = {
              total: domains.length,
              online: domains.filter(d => d.is_online).length,
              issue: domains.filter(d => !d.is_online && d.status_code !== 'N/A').length,
              soon: domains.filter(d => d.days_to_expire < 30).length
          };
          return new Response(renderHTML(domains, config, stats), { headers: { 'Content-Type': 'text/html' } });
      }

      // --- APIs ---

      // 批量添加
      if (url.pathname === '/api/add_bulk' && method === 'POST') {
          const fd = await request.formData();
          const lines = (fd.get('domains') || "").split('\n');
          // 获取当前最大 position，保证新加的在最后
          const maxPosRes = await env.DB.prepare("SELECT MAX(position) as m FROM Domain").first();
          let currentPos = (maxPosRes.m || 0) + 1;
          
          const stmt = env.DB.prepare("INSERT OR IGNORE INTO Domain (domain_name, position) VALUES (?, ?)");
          const batch = [];
          
          for (let line of lines) {
              let clean = line.trim().replace(/^https?:\/\//, '').split('/')[0];
              if (clean && clean.includes('.')) {
                  batch.push(stmt.bind(clean, currentPos));
                  currentPos++;
              }
          }
          if (batch.length) await env.DB.batch(batch);
          return Response.json({ status: 'success' });
      }

      // 删除
      if (url.pathname.startsWith('/api/delete/')) {
          const id = url.pathname.split('/').pop();
          await env.DB.prepare("DELETE FROM Domain WHERE id=?").bind(id).run();
          return Response.json({ status: 'success' });
      }

      // 编辑
      if (url.pathname === '/api/edit') {
          const fd = await request.formData();
          const days = calcDays(fd.get('exp_date'));
          await env.DB.prepare("UPDATE Domain SET domain_name=?, remark=?, registration_date=?, expiration_date=?, days_to_expire=? WHERE id=?")
              .bind(fd.get('domain_name'), fd.get('remark'), fd.get('reg_date'), fd.get('exp_date'), days, fd.get('id')).run();
          return Response.json({ status: 'success' });
      }

      // 排序 API (Reorder)
      if (url.pathname === '/api/reorder' && method === 'POST') {
          const json = await request.json();
          const ids = json.order || [];
          const stmt = env.DB.prepare("UPDATE Domain SET position=? WHERE id=?");
          const batch = ids.map((id, index) => stmt.bind(index, id));
          if (batch.length) await env.DB.batch(batch);
          return Response.json({ status: 'success' });
      }

      // 单个刷新
      if (url.pathname.startsWith('/api/refresh/')) {
          const id = url.pathname.split('/').pop();
          const d = await env.DB.prepare("SELECT * FROM Domain WHERE id=?").bind(id).first();
          if(d) {
              const res = await checkWebsite(d.domain_name);
              const days = calcDays(d.expiration_date);
              await env.DB.prepare("UPDATE Domain SET is_online=?, status_code=?, response_time=?, last_checked=?, days_to_expire=? WHERE id=?")
                  .bind(res.online?1:0, res.code, res.ms, new Date().toISOString(), days, id).run();
              return Response.json({ status: 'success', ...res });
          }
          return Response.json({ status: 'error' });
      }

      // 保存配置
      if (url.pathname === '/api/save_config') {
          const fd = await request.formData();
          await env.DB.prepare("UPDATE Config SET gist_token=?, webdav_url=?, webdav_user=?, webdav_pass=? WHERE id=1")
              .bind(fd.get('gist_token'), fd.get('webdav_url'), fd.get('webdav_user'), fd.get('webdav_pass')).run();
          return Response.json({ status: 'success', msg: '配置已保存' });
      }

      // --- 本地导入导出 ---

      // 导出 JSON
      if (url.pathname === '/export/json') {
          const { results } = await env.DB.prepare("SELECT domain_name as domain, registration_date as reg, expiration_date as exp, remark FROM Domain").all();
          return new Response(JSON.stringify(results, null, 2), {
              headers: {
                  'Content-Type': 'application/json',
                  'Content-Disposition': `attachment; filename="domain_backup_${new Date().toISOString().split('T')[0]}.json"`
              }
          });
      }

      // 导出 TXT
      if (url.pathname === '/export/txt') {
          const { results } = await env.DB.prepare("SELECT domain_name FROM Domain").all();
          const txt = results.map(r => r.domain_name).join('\n');
          return new Response(txt, {
              headers: {
                  'Content-Type': 'text/plain',
                  'Content-Disposition': `attachment; filename="domains.txt"`
              }
          });
      }

      // 导入文件 (JSON/TXT)
      if (url.pathname === '/import_file' && method === 'POST') {
          const fd = await request.formData();
          const file = fd.get('file');
          if (!file) return Response.json({ status: 'error', msg: 'No file' });
          
          const content = await file.text();
          const stmt = env.DB.prepare("INSERT OR IGNORE INTO Domain (domain_name, remark, registration_date, expiration_date, position) VALUES (?, ?, ?, ?, 9999)");
          const batch = [];

          try {
              if (file.name.endsWith('.json')) {
                  const data = JSON.parse(content);
                  for (let item of data) {
                      if(item.domain) batch.push(stmt.bind(item.domain, item.remark||'', item.reg||'', item.exp||''));
                  }
              } else {
                  // TXT
                  const lines = content.split('\n');
                  for (let line of lines) {
                      const d = line.trim();
                      if (d) batch.push(stmt.bind(d, '', '', ''));
                  }
              }

              if (batch.length) await env.DB.batch(batch);
              return Response.json({ status: 'success', msg: `成功导入 ${batch.length} 条数据` });
          } catch (e) {
              return Response.json({ status: 'error', msg: '解析失败: ' + e.message });
          }
      }

      // --- 云端备份逻辑 (Gist / WebDAV) ---

      async function getBackupJson() {
          const { results } = await env.DB.prepare("SELECT domain_name as domain, registration_date as reg, expiration_date as exp, remark FROM Domain").all();
          return JSON.stringify(results, null, 2);
      }
      
      async function restoreData(data) {
          if (typeof data === 'string') data = JSON.parse(data);
          const stmt = env.DB.prepare("INSERT OR IGNORE INTO Domain (domain_name, remark, registration_date, expiration_date, position) VALUES (?, ?, ?, ?, 9999)");
          const batch = [];
          for (let item of data) {
              if (item.domain) batch.push(stmt.bind(item.domain, item.remark||'', item.reg||'', item.exp||''));
          }
          if (batch.length) await env.DB.batch(batch);
      }

      // Gist Action
      if (url.pathname.startsWith('/api/gist/')) {
          const action = url.pathname.split('/').pop();
          const conf = await env.DB.prepare("SELECT * FROM Config LIMIT 1").first();
          if (!conf.gist_token) return Response.json({status:'error', msg:'无 Gist Token'});
          
          const headers = { 
              'Authorization': `token ${conf.gist_token}`, 
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'DomainMonitor-Worker'
          };

          if (action === 'export') {
              const content = await getBackupJson();
              const payload = { description: "Domain Monitor Backup", public: false, files: { "domains_backup.json": { content } } };
              let gId = conf.gist_id;
              
              if (gId) {
                  const r = await fetch(`https://api.github.com/gists/${gId}`, { method: 'PATCH', headers, body: JSON.stringify(payload) });
                  if (r.status !== 200) gId = null; 
              }
              
              if (!gId) {
                  const r = await fetch("https://api.github.com/gists", { method: 'POST', headers, body: JSON.stringify(payload) });
                  if (r.status === 201) {
                      const json = await r.json();
                      await env.DB.prepare("UPDATE Config SET gist_id=? WHERE id=1").bind(json.id).run();
                      return Response.json({status:'success', msg:'新 Gist 创建成功'});
                  }
                  return Response.json({status:'error', msg:'创建 Gist 失败'});
              }
              return Response.json({status:'success', msg:'Gist 更新成功'});
          }

          if (action === 'import') {
              if (!conf.gist_id) return Response.json({status:'error', msg:'未绑定 Gist ID'});
              const r = await fetch(`https://api.github.com/gists/${conf.gist_id}`, { headers });
              if (r.ok) {
                  const json = await r.json();
                  if (json.files['domains_backup.json']) {
                      await restoreData(json.files['domains_backup.json'].content);
                      return Response.json({status:'success', msg:'恢复成功'});
                  }
              }
              return Response.json({status:'error', msg:'读取 Gist 失败'});
          }
      }

      // WebDAV Action
      if (url.pathname.startsWith('/api/webdav/')) {
          const action = url.pathname.split('/').pop();
          const conf = await env.DB.prepare("SELECT * FROM Config LIMIT 1").first();
          if (!conf.webdav_url) return Response.json({status:'error', msg:'无 WebDAV 配置'});

          const targetUrl = conf.webdav_url.replace(/\/+$/, '') + '/domains_backup.json';
          const auth = btoa(`${conf.webdav_user}:${conf.webdav_pass}`);
          const headers = { 'Authorization': `Basic ${auth}` };

          if (action === 'export') {
              const content = await getBackupJson();
              const r = await fetch(targetUrl, { method: 'PUT', headers, body: content });
              if ([200, 201, 204].includes(r.status)) return Response.json({status:'success', msg:'WebDAV 上传成功'});
              return Response.json({status:'error', msg: `上传失败: ${r.status}`});
          }

          if (action === 'import') {
              const r = await fetch(targetUrl, { headers });
              if (r.ok) {
                  const json = await r.json();
                  await restoreData(json);
                  return Response.json({status:'success', msg:'恢复成功'});
              }
              return Response.json({status:'error', msg: `下载失败: ${r.status}`});
          }
      }

      return new Response('Not Found', { status: 404 });
  },

  // 2. Cron 定时任务 (保持自动检测)
  async scheduled(controller, env, ctx) {
      console.log("Cron triggered...");
      const { results } = await env.DB.prepare("SELECT * FROM Domain").all();
      if (!results || !results.length) return;

      const updates = results.map(async (d) => {
          try {
              const res = await checkWebsite(d.domain_name);
              const days = calcDays(d.expiration_date);
              await env.DB.prepare(
                  "UPDATE Domain SET is_online=?, status_code=?, response_time=?, last_checked=?, days_to_expire=? WHERE id=?"
              ).bind(res.online ? 1 : 0, res.code, res.ms, new Date().toISOString(), days, d.id).run();
          } catch (e) { console.error(e); }
      });

      ctx.waitUntil(Promise.all(updates));
  }
};
