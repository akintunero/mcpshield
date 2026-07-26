const API_BASE = '';
const API_KEY_STORAGE = 'mcpshield_api_key';

function getApiKey() {
  try {
    return localStorage.getItem(API_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

function setApiKey(key) {
  try {
    if (key) localStorage.setItem(API_KEY_STORAGE, key);
    else localStorage.removeItem(API_KEY_STORAGE);
  } catch {}
}

function authHeaders(extra = {}) {
  const headers = { ...extra };
  const key = getApiKey();
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

async function apiFetch(path, options = {}) {
  const headers = authHeaders(options.headers || {});
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    const entered = window.prompt('API key required. Enter API_KEY:');
    if (entered) {
      setApiKey(entered.trim());
      return apiFetch(path, options);
    }
  }
  return res;
}

let FINDINGS_CATALOG = {};

async function loadCatalog() {
  try {
    const res = await apiFetch('/api/catalog');
    if (res.ok) {
      const data = await res.json();
      for (const entry of data.catalog) {
        FINDINGS_CATALOG[entry.id] = {
          businessImpact: entry.businessImpact,
          technicalImpact: entry.technicalImpact,
          attackScenario: entry.attackScenario,
          bestPractice: entry.bestPractice,
          terraform: entry.remediation?.terraform || '',
          awsCli: entry.remediation?.awsCli || '',
        };
      }
    }
  } catch (e) {
    console.warn('Failed to load catalog from API, falling back to empty:', e);
  }
}

let appState = {
  score: { score: 0, grade: '-', breakdown: { critical: 0, high: 0, medium: 0, low: 0 } },
  findings: [],
  activeFinding: null,
  activeFilter: 'all',
  endpoint: 'http://localhost:4566',
};

function setScoreCircle(score) {
  const circle = document.querySelector('.ring-fg');
  if (!circle) return;

  const radius = circle.r.baseVal.value;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  circle.style.strokeDasharray = `${circumference} ${circumference}`;
  circle.style.strokeDashoffset = offset;

  if (score >= 90) {
    circle.style.stroke = '#10b981';
  } else if (score >= 70) {
    circle.style.stroke = '#fbbf24';
  } else if (score >= 50) {
    circle.style.stroke = '#f97316';
  } else {
    circle.style.stroke = '#ef4444';
  }
}

function renderCodeTemplate(template, finding) {
  if (!template) return '';
  const resourceId = finding.resource.id;
  const safeId = resourceId.replace(/[^a-zA-Z0-9_]/g, '_');

  let out = template;
  out = out.replace(/{{endpoint}}/g, appState.endpoint);
  out = out.replace(/{{region}}/g, finding.resource.region || 'us-east-1');
  out = out.replace(/{{resourceId}}/g, safeId);
  out = out.replace(/{{resourceType}}/g, finding.resource.type);

  out = out.replace(/{{bucket}}/g, resourceId);

  if (finding.resource.service === 'iam') {
    out = out.replace(/{{userName}}/g, resourceId);
    out = out.replace(/{{roleName}}/g, resourceId);
    let accessKeyId = '';
    if (finding.evidence.accessKeyId) {
      accessKeyId = finding.evidence.accessKeyId;
    } else if (finding.evidence.staleActiveKeys && finding.evidence.staleActiveKeys[0]) {
      accessKeyId = finding.evidence.staleActiveKeys[0].accessKeyId || '';
    } else if (finding.evidence.unusedActiveKeys && finding.evidence.unusedActiveKeys[0]) {
      accessKeyId = finding.evidence.unusedActiveKeys[0].accessKeyId || '';
    }
    out = out.replace(/{{accessKeyId}}/g, accessKeyId);
  }
  if (finding.resource.service === 'ec2') {
    out = out.replace(/{{sgId}}/g, resourceId);
  }
  if (finding.resource.service === 'kms') {
    out = out.replace(/{{keyId}}/g, resourceId);
  }
  if (finding.resource.service === 'secretsmanager') {
    out = out.replace(/{{secretId}}/g, resourceId);
  }
  return out;
}

function selectFinding(finding) {
  appState.activeFinding = finding;

  document.querySelectorAll('.finding-item').forEach((el) => {
    if (el.dataset.id === finding.findingId) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  const placeholder = document.getElementById('remediation-placeholder');
  const content = document.getElementById('remediation-content');
  placeholder.classList.add('hidden');
  content.classList.remove('hidden');

  const sevEl = document.getElementById('detail-severity');
  sevEl.className = `badge ${finding.severity}`;
  sevEl.textContent = finding.severity;

  document.getElementById('detail-title').textContent = finding.title;
  document.getElementById('detail-resource').textContent =
    `${finding.resource.service}::${finding.resource.type}/${finding.resource.id}`;

  const catalog = FINDINGS_CATALOG[finding.catalogId] || {
    businessImpact: 'N/A',
    technicalImpact: 'N/A',
    attackScenario: 'N/A',
    bestPractice: 'N/A',
    terraform: '',
    awsCli: '',
  };

  document.getElementById('detail-desc').textContent = finding.description;
  document.getElementById('detail-tech-impact').textContent = catalog.technicalImpact;
  document.getElementById('detail-biz-impact').textContent = catalog.businessImpact;

  const scenarioBox = document.getElementById('detail-scenario');
  if (catalog.attackScenario) {
    scenarioBox.classList.remove('hidden');
    scenarioBox.textContent = `Attack Scenario: ${catalog.attackScenario}`;
  } else {
    scenarioBox.classList.add('hidden');
  }

  document.getElementById('detail-best-practice').textContent = catalog.bestPractice;

  document.getElementById('code-tf').textContent = renderCodeTemplate(catalog.terraform, finding);
  document.getElementById('code-cli').textContent = renderCodeTemplate(catalog.awsCli, finding);
}

function renderFindingsList() {
  const container = document.getElementById('findings-container');
  if (!container) return;

  const filtered = appState.findings.filter((f) => {
    if (appState.activeFilter === 'all') return true;
    if (appState.activeFilter === 'open') return f.status === 'open';
    if (appState.activeFilter === 'resolved') return f.status === 'resolved';
    return f.severity === appState.activeFilter;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
        <p>No findings match your filter guidelines.</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered
    .map((f) => {
      const isActive = appState.activeFinding && appState.activeFinding.findingId === f.findingId;
      return `
      <div class="finding-item ${isActive ? 'active' : ''} ${f.status}" data-id="${f.findingId}">
        <div class="finding-row-1">
          <span class="badge ${f.status === 'resolved' ? 'resolved' : f.severity}">${f.status === 'resolved' ? 'Fixed' : f.severity}</span>
          <span class="finding-service">${f.service.toUpperCase()}</span>
        </div>
        <div class="finding-title">${f.title}</div>
        <div class="finding-resource">${f.resource.type}:${f.resource.id}</div>
      </div>
    `;
    })
    .join('');

  container.querySelectorAll('.finding-item').forEach((el) => {
    el.addEventListener('click', () => {
      const f = appState.findings.find((item) => item.findingId === el.dataset.id);
      if (f) selectFinding(f);
    });
  });
}

async function syncState(forceScan = false) {
  const refreshBtn = document.getElementById('refresh-btn');
  refreshBtn.classList.add('loading');

  try {
    if (forceScan) {
      console.log('Triggering environment scan from Sync State...');
      await apiFetch('/api/scan', { method: 'POST' });
    }

    const res = await apiFetch('/api/state');
    if (!res.ok) throw new Error('API query failed');

    const data = await res.json();

    appState.score = data.score;
    appState.findings = data.findings;
    if (data.lastScan) {
      appState.endpoint = data.lastScan.endpoint;
    }

    document.getElementById('posture-score').textContent = appState.score.score;
    const gradeBadge = document.getElementById('posture-grade');
    gradeBadge.textContent = appState.score.grade;
    gradeBadge.className = `grade-badge grade-${appState.score.grade}`;

    document.getElementById('resources-count').textContent = data.lastScan
      ? data.lastScan.resourcesScanned
      : 0;

    if (data.lastScan && data.lastScan.completedAt) {
      const date = new Date(data.lastScan.completedAt);
      document.getElementById('last-scan-time').textContent =
        date.toLocaleTimeString() + ' ' + date.toLocaleDateString();
    } else {
      document.getElementById('last-scan-time').textContent = 'Never';
    }

    const catBreakdown = appState.score.categoryBreakdown || {};
    const delta = appState.score.delta;

    const deltaEl = document.getElementById('score-delta');
    if (delta !== undefined && delta !== null) {
      deltaEl.textContent = delta >= 0 ? `+${delta} pts` : `${delta} pts`;
      deltaEl.style.color = delta >= 0 ? '#10b981' : '#ef4444';
    } else {
      deltaEl.textContent = '-';
      deltaEl.style.color = 'var(--text-muted)';
    }

    // Category breakdown
    const fillCat = (id, val) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = val !== undefined ? `${val}/100` : '-/100';
        el.className = 'cat-score';
        if (val !== undefined) {
          if (val < 50) el.classList.add('low-score');
          else if (val < 80) el.classList.add('mid-score');
          else el.classList.add('high-score');
        }
      }
    };
    fillCat('cat-exposure', catBreakdown.publicExposure);
    fillCat('cat-identity', catBreakdown.identity);
    fillCat('cat-encryption', catBreakdown.encryption);
    fillCat('cat-secrets', catBreakdown.secrets);
    fillCat('cat-recovery', catBreakdown.recovery);
    fillCat('cat-logging', catBreakdown.logging);

    const breakdown = appState.score.breakdown;
    document.getElementById('count-critical').textContent = breakdown.critical;
    document.getElementById('count-high').textContent = breakdown.high;
    document.getElementById('count-medium').textContent = breakdown.medium;
    document.getElementById('count-low').textContent = breakdown.low;

    const resolvedCount = appState.findings.filter((f) => f.status === 'resolved').length;
    document.getElementById('count-resolved').textContent = resolvedCount;

    // Update horizontal bar graph widths
    const max = Math.max(
      breakdown.critical,
      breakdown.high,
      breakdown.medium,
      breakdown.low,
      resolvedCount,
      1,
    );
    document.getElementById('bar-critical').style.width = `${(breakdown.critical / max) * 100}%`;
    document.getElementById('bar-high').style.width = `${(breakdown.high / max) * 100}%`;
    document.getElementById('bar-medium').style.width = `${(breakdown.medium / max) * 100}%`;
    document.getElementById('bar-low').style.width = `${(breakdown.low / max) * 100}%`;
    document.getElementById('bar-resolved').style.width = `${(resolvedCount / max) * 100}%`;

    setScoreCircle(appState.score.score);
    renderFindingsList();

    if (appState.findings.length > 0 && !appState.activeFinding) {
      const firstOpen = appState.findings.find((f) => f.status === 'open') || appState.findings[0];
      if (firstOpen) selectFinding(firstOpen);
    }
  } catch (err) {
    console.error('Error syncing status: ', err);
  } finally {
    refreshBtn.classList.remove('loading');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('refresh-btn').addEventListener('click', () => syncState(true));

  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach((el) => el.classList.remove('active'));
      btn.classList.add('active');
      appState.activeFilter = btn.dataset.filter;
      renderFindingsList();
    });
  });

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach((el) => el.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((el) => el.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`panel-${tabName}`).classList.add('active');
    });
  });

  const bindCopy = (btnId, codeId) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', () => {
      const codeText = document.getElementById(codeId).textContent;
      navigator.clipboard.writeText(codeText).then(() => {
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => (btn.textContent = orig), 1500);
      });
    });
  };
  bindCopy('copy-tf-btn', 'code-tf');
  bindCopy('copy-cli-btn', 'code-cli');

  // Floating Chat Toggle
  const chatToggleBtn = document.getElementById('chat-toggle-btn');
  const chatWidget = document.getElementById('chat-widget');
  const chatCloseBtn = document.getElementById('chat-close-btn');
  chatToggleBtn.addEventListener('click', () => {
    chatWidget.classList.toggle('hidden');
    if (!chatWidget.classList.contains('hidden')) chatInput.focus();
  });
  chatCloseBtn.addEventListener('click', () => chatWidget.classList.add('hidden'));

  // AI Security Analyst Chatbot Implementation
  let chatHistory = [];
  const chatSendBtn = document.getElementById('chat-send-btn');
  const chatInput = document.getElementById('chat-input');
  const chatMessages = document.getElementById('chat-messages');

  function formatMarkdown(text) {
    let formatted = text;
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/`(.*?)`/g, '<code>$1</code>');
    formatted = formatted.replace(/\n/g, '<br>');
    return formatted;
  }

  function appendMessage(sender, content) {
    const msg = document.createElement('div');
    msg.className = `chat-message ${sender}`;
    msg.innerHTML = `<p>${formatMarkdown(content)}</p>`;
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return msg;
  }

  async function sendChatMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    appendMessage('user', text);
    chatInput.value = '';
    chatInput.disabled = true;
    chatSendBtn.disabled = true;

    const typingEl = appendMessage('assistant typing', '...');

    try {
      const res = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: chatHistory }),
      });

      typingEl.remove();

      if (!res.ok) throw new Error('Chat API call failed');
      const data = await res.json();

      appendMessage('assistant', data.content);
      chatHistory.push({ role: 'user', content: text });
      chatHistory.push({ role: 'assistant', content: data.content });

      // If the message triggers changes, reload the state
      const query = text.toLowerCase();
      if (
        query.includes('scan') ||
        query.includes('fix') ||
        query.includes('approve') ||
        query.includes('remediat')
      ) {
        syncState(false);
      }
    } catch (err) {
      typingEl.remove();
      appendMessage(
        'assistant error',
        'Encountered an error communicating with the analyst agent.',
      );
      console.error(err);
    } finally {
      chatInput.disabled = false;
      chatSendBtn.disabled = false;
      chatInput.focus();
    }
  }

  chatSendBtn.addEventListener('click', sendChatMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });

  // Load catalog from API, then sync state
  loadCatalog().then(() => {
    syncState(true);
  });
  setInterval(() => syncState(false), 5000);
});
