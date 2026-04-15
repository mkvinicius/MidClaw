/* MidClaw Web UI — app.js */

// ─── State ──────────────────────────────────────────────────────────────────

const state = {
  messages: [],       // chat history
  streaming: false,   // is LLM responding?
  vaultType: '',      // current vault type filter
  vaultSearch: '',    // current vault search query
  searchTimer: null,  // debounce timer
  health: null,       // last /api/health response
};

// ─── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  checkHealth();
  setInterval(checkHealth, 30_000);
});

async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    state.health = data;

    const pill = document.getElementById('status-pill');
    const text = document.getElementById('status-text');
    const model = document.getElementById('model-label');

    if (data.status === 'ok') {
      pill.className = 'ok';
      text.textContent = `${data.provider} · ${data.vault_notes} notas`;
      model.textContent = data.model || '—';
    } else {
      pill.className = 'err';
      text.textContent = 'erro';
    }
  } catch {
    const pill = document.getElementById('status-pill');
    document.getElementById('status-text').textContent = 'desconectado';
    pill.className = 'err';
  }
}

// ─── Navigation ──────────────────────────────────────────────────────────────

function switchTab(name) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`tab-${name}`).classList.add('active');
  document.querySelector(`[data-tab="${name}"]`).classList.add('active');

  if (name === 'vault') loadVault();
  if (name === 'status') loadStatus();
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('chat-form').dispatchEvent(new Event('submit'));
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

async function sendMessage(e) {
  e.preventDefault();
  if (state.streaming) return;

  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = 'auto';

  // Remove welcome message on first real message
  const welcome = document.getElementById('msg-welcome');
  if (welcome) welcome.remove();

  appendMessage('user', text);
  state.messages.push({ role: 'user', content: text });

  state.streaming = true;
  setSendState(true);

  const assistantEl = appendMessage('assistant', '');
  const bubble = assistantEl.querySelector('.msg-bubble');
  bubble.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';

  let fullText = '';

  try {
    const res = await fetch('/api/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: state.messages,
        system: 'Você é MidClaw, um agente de segurança AI especializado em análise de ameaças, MITRE ATT&CK, resposta a incidentes e segurança defensiva. Responda em português quando o usuário falar português.',
      }),
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6);
        if (raw === '[DONE]') break;
        try {
          const data = JSON.parse(raw);
          if (data.error) { fullText += `\n\n⚠️ ${data.error}`; break; }
          if (data.chunk) {
            fullText += data.chunk;
            bubble.innerHTML = renderMarkdown(fullText);
          }
        } catch {}
      }
    }

    if (!fullText) fullText = '_(sem resposta)_';
    bubble.innerHTML = renderMarkdown(fullText);
    state.messages.push({ role: 'assistant', content: fullText });

  } catch (err) {
    bubble.innerHTML = `<span style="color:var(--red)">Erro: ${err.message}</span>`;
  } finally {
    state.streaming = false;
    setSendState(false);
    scrollChatToBottom();
  }
}

function setSendState(loading) {
  const btn = document.getElementById('send-btn');
  const icon = document.getElementById('send-icon');
  const label = document.getElementById('send-label');
  btn.disabled = loading;
  icon.textContent = loading ? '' : '↑';
  icon.innerHTML = loading ? '<span class="spinner"></span>' : '↑';
  label.textContent = loading ? 'Aguardando...' : 'Enviar';
}

function appendMessage(role, text) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.innerHTML = `
    <div class="msg-avatar">${role === 'user' ? '👤' : '🤖'}</div>
    <div class="msg-bubble">${text ? renderMarkdown(text) : ''}</div>
  `;
  container.appendChild(div);
  scrollChatToBottom();
  return div;
}

function scrollChatToBottom() {
  const c = document.getElementById('chat-messages');
  c.scrollTop = c.scrollHeight;
}

function clearChat() {
  state.messages = [];
  const container = document.getElementById('chat-messages');
  container.innerHTML = `
    <div class="msg assistant" id="msg-welcome">
      <div class="msg-avatar">🤖</div>
      <div class="msg-bubble">Chat reiniciado. Como posso ajudar?</div>
    </div>`;
}

// ─── Vault ────────────────────────────────────────────────────────────────────

function debounceSearch(val) {
  state.vaultSearch = val;
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(() => {
    if (val.length >= 2) searchVault(val);
    else if (val.length === 0) loadVault();
  }, 300);
}

function filterType(btn, type) {
  state.vaultType = type;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('vault-search').value = '';
  state.vaultSearch = '';
  loadVault();
}

async function loadVault() {
  const grid = document.getElementById('notes-grid');
  grid.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

  try {
    const url = `/api/vault/notes?limit=100${state.vaultType ? `&type=${state.vaultType}` : ''}`;
    const res = await fetch(url);
    const data = await res.json();
    renderVaultStats(data.types || {}, data.total || 0);
    renderNotes(data.notes || []);
  } catch (err) {
    grid.innerHTML = `<div class="empty-state" style="color:var(--red)">Erro ao carregar vault: ${err.message}</div>`;
  }
}

async function searchVault(query) {
  const grid = document.getElementById('notes-grid');
  grid.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

  try {
    const res = await fetch(`/api/vault/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    renderNotes(data.results || []);
    if ((data.results || []).length === 0) {
      grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div>Nenhum resultado para "${query}"</div>`;
    }
  } catch (err) {
    grid.innerHTML = `<div class="empty-state" style="color:var(--red)">Erro: ${err.message}</div>`;
  }
}

function renderVaultStats(types, total) {
  const statsEl = document.getElementById('vault-stats');
  const TYPE_ICONS = {
    incident: '🚨', 'threat-actor': '👤', technique: '⚙️',
    simulation: '⚔️', conversation: '💬', index: '📑',
    'tool-log': '🔧',
  };
  let html = `<div class="stat-chip">Total <span class="count">${total}</span></div>`;
  for (const [type, count] of Object.entries(types)) {
    html += `<div class="stat-chip">${TYPE_ICONS[type] || '📄'} ${type} <span class="count">${count}</span></div>`;
  }
  statsEl.innerHTML = html;
}

function renderNotes(notes) {
  const grid = document.getElementById('notes-grid');
  if (!notes.length) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">🗄️</div>Vault vazio. Execute: <code>midclaw vault:seed</code></div>';
    return;
  }
  grid.innerHTML = notes.map(note => {
    const tags = (note.tags || []).slice(0, 4).map(t => `<span class="tag">#${t}</span>`).join('');
    const typeClass = `note-type-${note.type}`;
    return `
      <div class="note-card" onclick="openNote('${escHtml(note.path)}')">
        <div class="note-type ${typeClass}">${note.type}</div>
        <div class="note-title">${escHtml(note.title)}</div>
        <div class="note-path">${escHtml(note.path)}</div>
        <div class="note-tags">${tags}</div>
      </div>`;
  }).join('');
}

async function openNote(path) {
  const modal = document.getElementById('note-modal');
  const content = document.getElementById('note-modal-content');
  modal.classList.add('open');
  content.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

  try {
    const res = await fetch(`/api/vault/note?path=${encodeURIComponent(path)}`);
    const note = await res.json();

    const backlinksHtml = (note.backlinks || []).length
      ? `<div class="backlinks-section">
           <h4>⬅ Backlinks (${note.backlinks.length})</h4>
           ${note.backlinks.map(b => `<span class="backlink-chip" onclick="openNote('${escHtml(b.path)}')">${escHtml(b.title || b.path)}</span>`).join('')}
         </div>`
      : '';

    content.innerHTML = `
      <div style="margin-bottom:16px">
        <div class="note-type note-type-${note.type}" style="margin-bottom:6px">${note.type}</div>
        <div style="font-family:var(--font-mono);font-size:12px;color:var(--text);margin-bottom:12px">${escHtml(note.path)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
          ${(note.tags||[]).map(t=>`<span class="tag">#${t}</span>`).join('')}
        </div>
      </div>
      <div class="note-content-md">${renderMarkdown(note.content || '')}</div>
      ${backlinksHtml}`;
  } catch (err) {
    content.innerHTML = `<div style="color:var(--red)">Erro: ${err.message}</div>`;
  }
}

function closeNoteModal() {
  document.getElementById('note-modal').classList.remove('open');
}
document.getElementById('note-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('note-modal')) closeNoteModal();
});

// ─── Simulation ───────────────────────────────────────────────────────────────

async function runSim() {
  const btn = document.getElementById('sim-btn');
  const errEl = document.getElementById('sim-error');
  const result = document.getElementById('sim-result');
  const placeholder = document.getElementById('sim-placeholder');
  errEl.style.display = 'none';

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Simulando...';

  placeholder.style.display = 'none';
  result.style.display = 'block';
  result.innerHTML = `
    <div style="text-align:center;padding:40px;color:var(--text)">
      <div class="spinner" style="width:24px;height:24px;margin:0 auto 12px"></div>
      O agente está simulando o ataque... isso pode levar alguns segundos.
    </div>`;

  try {
    const res = await fetch('/api/sim/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor:    document.getElementById('sim-actor').value,
        scenario: document.getElementById('sim-scenario').value,
        target:   document.getElementById('sim-target').value,
        defender: document.getElementById('sim-defender').value,
        steps:    parseInt(document.getElementById('sim-steps').value),
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = data.detail || 'Erro desconhecido';
      errEl.style.display = 'block';
      result.style.display = 'none';
      placeholder.style.display = 'flex';
      return;
    }

    const riskClass = data.risk_score >= 80 ? 'risk-crit'
                    : data.risk_score >= 60 ? 'risk-high'
                    : data.risk_score >= 30 ? 'risk-med'
                    : 'risk-low';

    const outcomeClass = `outcome-${data.outcome}`;
    const outcomeLabels = { success: 'Ataque bem-sucedido', partial: 'Parcial', detected: 'Detectado', blocked: 'Bloqueado' };

    result.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
        <div class="risk-badge ${riskClass}">🔥 Risco: ${data.risk_score}/100</div>
        <div class="outcome-badge ${outcomeClass}">${outcomeLabels[data.outcome] || data.outcome}</div>
      </div>
      <div class="note-content-md" style="margin-bottom:20px">${renderMarkdown(data.markdown || '')}</div>`;

  } catch (err) {
    errEl.textContent = `Erro: ${err.message}`;
    errEl.style.display = 'block';
    result.style.display = 'none';
    placeholder.style.display = 'flex';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '⚔️ Executar Simulação';
  }
}

// ─── Status ───────────────────────────────────────────────────────────────────

async function loadStatus() {
  const grid = document.getElementById('status-grid');
  grid.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

  try {
    const res = await fetch('/api/health');
    const data = await res.json();

    const providerOk = data.provider !== 'none';
    const vaultOk = data.vault_notes > 0;

    grid.innerHTML = `
      <div class="status-card">
        <h3>🤖 LLM</h3>
        <div class="status-row"><span class="label">Provider</span><span class="value ${providerOk?'ok':'err'}">${data.provider}</span></div>
        <div class="status-row"><span class="label">Modelo</span><span class="value">${data.model || '—'}</span></div>
        <div class="status-row"><span class="label">Status</span><span class="value ${providerOk?'ok':'err'}">${providerOk?'configurado':'sem API key'}</span></div>
      </div>
      <div class="status-card">
        <h3>🗄️ Vault</h3>
        <div class="status-row"><span class="label">Notas</span><span class="value">${data.vault_notes}</span></div>
        <div class="status-row"><span class="label">Status</span><span class="value ${vaultOk?'ok':'warn'}">${vaultOk?'ok':'vazio — execute vault:seed'}</span></div>
        <div class="status-row"><span class="label">Path</span><span class="value" style="font-size:10px">${data.vault_path || '—'}</span></div>
      </div>
      <div class="status-card">
        <h3>🔧 Ferramentas</h3>
        <div class="tools-list">
          ${(data.tools||[]).map(t=>`<span class="tool-chip">${t}</span>`).join('')}
        </div>
        ${(!data.tools||!data.tools.length)?'<div style="color:var(--text);font-size:12px;margin-top:8px">Nenhuma ferramenta carregada</div>':''}
      </div>
      <div class="status-card">
        <h3>⚡ Sistema</h3>
        <div class="status-row"><span class="label">Bridge</span><span class="value ok">rodando</span></div>
        <div class="status-row"><span class="label">API</span><span class="value ok">/api/*</span></div>
        <div class="status-row"><span class="label">Docs</span><span class="value"><a href="/api/docs" target="_blank" style="color:var(--accent)">/api/docs ↗</a></span></div>
      </div>`;
  } catch (err) {
    grid.innerHTML = `<div class="empty-state" style="color:var(--red)">Erro ao conectar com o bridge: ${err.message}</div>`;
  }
}

// ─── Markdown renderer (sem dependências) ────────────────────────────────────

function renderMarkdown(text) {
  if (!text) return '';

  // Remove frontmatter
  text = text.replace(/^---[\s\S]*?---\n?/, '');

  // Escape HTML (before anything else)
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // Code blocks (triple backtick)
  const codeBlocks = [];
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code class="lang-${lang}">${esc(code.trim())}</code></pre>`);
    return `\x00CODE${idx}\x00`;
  });

  // Inline code
  text = text.replace(/`([^`]+)`/g, (_, c) => `<code>${esc(c)}</code>`);

  // Headers
  text = text.replace(/^#{4}\s+(.+)$/gm, '<h4>$1</h4>');
  text = text.replace(/^#{3}\s+(.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^#{2}\s+(.+)$/gm, '<h2>$1</h2>');
  text = text.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // Bold / italic
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Wikilinks → styled span
  text = text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, path, alias) => {
    const label = alias || path.split('/').pop();
    return `<span style="color:var(--accent);cursor:pointer" onclick="openNote('${path}')" title="${path}">[[${label}]]</span>`;
  });

  // Regular links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Horizontal rule
  text = text.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:12px 0">');

  // Lists (unordered)
  text = text.replace(/^[\*\-]\s+(.+)$/gm, '<li>$1</li>');
  text = text.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  text = text.replace(/<\/ul>\s*<ul>/g, '');

  // Ordered lists
  text = text.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');

  // Blockquote
  text = text.replace(/^>\s+(.+)$/gm, '<blockquote style="border-left:3px solid var(--border2);padding-left:10px;color:var(--text);margin:4px 0">$1</blockquote>');

  // Paragraphs
  const lines = text.split('\n');
  const output = [];
  let inParagraph = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inParagraph) { output.push('</p>'); inParagraph = false; }
    } else if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<li') ||
               trimmed.startsWith('<pre') || trimmed.startsWith('<blockquote') || trimmed.startsWith('<hr') ||
               trimmed.startsWith('\x00CODE')) {
      if (inParagraph) { output.push('</p>'); inParagraph = false; }
      output.push(trimmed);
    } else {
      if (!inParagraph) { output.push('<p>'); inParagraph = true; }
      else output.push('<br>');
      output.push(trimmed);
    }
  }
  if (inParagraph) output.push('</p>');

  let result = output.join('');

  // Restore code blocks
  codeBlocks.forEach((block, i) => {
    result = result.replace(`\x00CODE${i}\x00`, block);
  });

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
