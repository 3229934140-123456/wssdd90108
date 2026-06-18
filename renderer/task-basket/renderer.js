const { ipcRenderer } = require('electron');
const { generateMockArticles, buildCandidateChains, calculateSimilarity } = require('../../shared/utils.js');

let articles = [];
let candidateChains = [];
let selectedArticleIds = new Set();
let currentView = 'edit';

const dropZone = document.getElementById('dropZone');
const chainList = document.getElementById('chainList');
const articleCount = document.getElementById('articleCount');
const compareBtn = document.getElementById('compareBtn');
const generateBtn = document.getElementById('generateBtn');
const clientNameInput = document.getElementById('clientName');
const keywordsInput = document.getElementById('keywords');
const pasteBtn = document.getElementById('pasteBtn');
const addSampleBtn = document.getElementById('addSampleBtn');
const clearBtn = document.getElementById('clearBtn');
const viewTabs = document.getElementById('viewTabs');

function init() {
  setupDragDrop();
  setupEventListeners();
  loadTaskData();
}

function setupDragDrop() {
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, highlight, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, unhighlight, false);
  });

  function highlight() {
    dropZone.classList.add('drag-over');
  }

  function unhighlight() {
    dropZone.classList.remove('drag-over');
  }

  dropZone.addEventListener('drop', handleDrop, false);

  function handleDrop(e) {
    const dt = e.dataTransfer;
    const text = dt.getData('text');
    
    if (text) {
      const urls = text.split(/\s+/).filter(u => u.startsWith('http'));
      if (urls.length > 0) {
        addUrls(urls);
      }
    }
  }
}

function setupEventListeners() {
  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      const urls = text.split(/\s+/).filter(u => u.startsWith('http'));
      if (urls.length > 0) {
        addUrls(urls);
      }
    } catch (err) {
      console.log('粘贴失败', err);
    }
  });

  addSampleBtn.addEventListener('click', () => {
    const keywords = keywordsInput.value || '科技公司裁员';
    clientNameInput.value = clientNameInput.value || '示例客户 - 某科技公司';
    keywordsInput.value = keywords;
    
    const mockArticles = generateMockArticles(keywords);
    articles = mockArticles;
    candidateChains = buildCandidateChains(articles);
    
    renderChains();
    updateTaskData();
  });

  clearBtn.addEventListener('click', () => {
    articles = [];
    candidateChains = [];
    selectedArticleIds.clear();
    renderChains();
    updateButtons();
    updateTaskData();
  });

  compareBtn.addEventListener('click', () => {
    const selected = articles.filter(a => selectedArticleIds.has(a.id));
    if (selected.length >= 2) {
      const sorted = [...selected].sort((a, b) => new Date(a.publishTime) - new Date(b.publishTime));
      ipcRenderer.invoke('open-compare-articles', sorted);
    }
  });

  generateBtn.addEventListener('click', () => {
    candidateChains = buildCandidateChains(articles);
    const taskData = {
      clientName: clientNameInput.value,
      keywords: keywordsInput.value,
      articles: articles,
      candidateChains: candidateChains,
      conclusions: {
        source: null,
        keyMedia: [],
        uncertainNodes: [],
        manualJudgment: ''
      }
    };
    ipcRenderer.invoke('update-task-data', taskData).then(() => {
      ipcRenderer.invoke('generate-conclusion', taskData.conclusions);
    });
  });

  clientNameInput.addEventListener('input', updateTaskData);
  keywordsInput.addEventListener('input', updateTaskData);

  viewTabs.addEventListener('click', (e) => {
    if (e.target.classList.contains('tab')) {
      const view = e.target.dataset.view;
      currentView = view;
      
      viewTabs.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      
      renderChains();
    }
  });
}

function addUrls(urls) {
  urls.forEach((url) => {
    const existing = articles.find(a => a.url === url);
    if (!existing) {
      const idx = articles.length;
      const article = {
        id: Date.now() + idx,
        title: '',
        source: '',
        publishTime: '',
        url: url,
        paragraphs: [],
        images: [],
        type: 'unknown',
        similarity: 0,
        needsEdit: true
      };
      articles.push(article);
    }
  });
  
  candidateChains = buildCandidateChains(articles);
  renderChains();
  updateTaskData();
}

function renderChains() {
  if (articles.length === 0) {
    chainList.innerHTML = `
      <div class="empty-state">
        <div class="icon">📋</div>
        <p>添加链接后可补填稿件信息</p>
      </div>
    `;
    articleCount.textContent = '0 篇';
    return;
  }

  articleCount.textContent = `${articles.length} 篇`;

  if (currentView === 'edit') {
    renderEditView();
  } else if (currentView === 'chains') {
    renderChainView();
  } else {
    renderListView();
  }
}

function renderEditView() {
  let html = '';
  
  const sorted = [...articles].sort((a, b) => {
    if (a.publishTime && b.publishTime) return new Date(a.publishTime) - new Date(b.publishTime);
    return 0;
  });

  sorted.forEach(article => {
    const isEmpty = !article.title && !article.source;
    const borderClass = isEmpty ? 'border-color: #eb3349;' : 'border-color: #2d2d4a;';
    
    html += `
      <div class="article-item" data-article-id="${article.id}" style="${borderClass} cursor: default;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 11px; color: #7c7c9a; word-break: break-all;">${article.url}</span>
          <button class="btn btn-danger btn-small delete-btn" data-article-id="${article.id}" style="flex-shrink: 0; margin-left: 8px;">删除</button>
        </div>
        ${isEmpty ? '<div style="color: #eb3349; font-size: 11px; margin-bottom: 8px;">请补填以下信息后生成链路</div>' : ''}
        <div class="input-group" style="margin-bottom: 6px;">
          <label>标题</label>
          <input type="text" class="edit-field" data-field="title" data-id="${article.id}" value="${escapeHtml(article.title)}" placeholder="请输入新闻标题">
        </div>
        <div style="display: flex; gap: 8px; margin-bottom: 6px;">
          <div class="input-group" style="flex: 1; margin-bottom: 0;">
            <label>来源</label>
            <input type="text" class="edit-field" data-field="source" data-id="${article.id}" value="${escapeHtml(article.source)}" placeholder="媒体名称">
          </div>
          <div class="input-group" style="flex: 1; margin-bottom: 0;">
            <label>发布时间</label>
            <input type="datetime-local" class="edit-field" data-field="publishTime" data-id="${article.id}" value="${toDatetimeLocal(article.publishTime)}" step="1">
          </div>
        </div>
        <div class="input-group" style="margin-bottom: 0;">
          <label>正文（每段一行）</label>
          <textarea class="edit-field" data-field="paragraphs" data-id="${article.id}" rows="3" placeholder="将正文按段落粘贴，每段一行">${article.paragraphs.map(p => escapeHtml(p)).join('\n')}</textarea>
        </div>
      </div>
    `;
  });
  
  chainList.innerHTML = html;

  chainList.querySelectorAll('.edit-field').forEach(field => {
    const eventType = field.tagName === 'SELECT' ? 'change' : 'input';
    field.addEventListener(eventType, (e) => {
      const id = parseInt(field.dataset.id);
      const fieldName = field.dataset.field;
      const article = articles.find(a => a.id === id);
      if (!article) return;

      if (fieldName === 'paragraphs') {
        article.paragraphs = field.value.split('\n').filter(p => p.trim());
      } else if (fieldName === 'publishTime') {
        article.publishTime = field.value ? field.value.replace('T', ' ') : '';
      } else {
        article[fieldName] = field.value;
      }

      article.needsEdit = !article.title || !article.source;
      candidateChains = buildCandidateChains(articles);
      updateTaskData();
    });
  });

  chainList.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.articleId);
      articles = articles.filter(a => a.id !== id);
      selectedArticleIds.delete(id);
      candidateChains = buildCandidateChains(articles);
      renderChains();
      updateButtons();
      updateTaskData();
    });
  });
}

function renderChainView() {
  let html = '';
  
  candidateChains.forEach((chain, idx) => {
    const source = chain.source;
    
    html += `
      <div class="chain-group" data-source-id="${source.id}">
        <div class="chain-source">
          <span class="label">源头</span>
          <span class="title">${source.title || '(未填写标题)'}</span>
          <span style="font-size: 11px; color: #7c7c9a;">${source.source || '?'} · ${formatTime(source.publishTime)}</span>
        </div>
    `;
    
    chain.reprints.forEach(reprint => {
      const rArticle = reprint.article;
      const rSelected = selectedArticleIds.has(rArticle.id);
      
      html += `
        <div class="chain-reprint ${rSelected ? 'selected' : ''}" data-article-id="${rArticle.id}" style="cursor: pointer;">
          <span class="title">${rArticle.title || '(未填写标题)'}</span>
          <span class="sim">${reprint.similarity}%</span>
          <span class="time">+${Math.round(reprint.timeDiff)}分钟</span>
        </div>
      `;
    });
    
    html += `</div>`;
  });
  
  chainList.innerHTML = html;
  
  chainList.querySelectorAll('.chain-reprint').forEach(el => {
    el.addEventListener('click', (e) => {
      const id = parseInt(el.dataset.articleId);
      if (selectedArticleIds.has(id)) {
        selectedArticleIds.delete(id);
        el.style.background = '';
      } else {
        selectedArticleIds.add(id);
        el.style.background = 'rgba(78, 204, 163, 0.08)';
      }
      updateButtons();
    });
  });
}

function renderListView() {
  const sorted = [...articles].sort((a, b) => {
    if (a.publishTime && b.publishTime) return new Date(a.publishTime) - new Date(b.publishTime);
    return 0;
  });
  
  let html = '';
  sorted.forEach(article => {
    const isSelected = selectedArticleIds.has(article.id);
    const typeLabel = getTypeLabel(article.type);
    const sim = article.similarity ? `${article.similarity}%` : '-';
    
    html += `
      <div class="article-item ${isSelected ? 'selected' : ''}" data-article-id="${article.id}">
        <div class="title">${article.title || '(未填写标题)'}</div>
        <div class="meta">
          <span class="source">${article.source || '未知来源'} · ${article.publishTime ? formatTime(article.publishTime) : '未知时间'}</span>
          <span class="similarity">相似度 ${sim}</span>
        </div>
        <div style="margin-top: 6px;">
          <span class="badge ${typeLabel.class}">${typeLabel.text}</span>
        </div>
      </div>
    `;
  });
  
  chainList.innerHTML = html;
  
  chainList.querySelectorAll('.article-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = parseInt(el.dataset.articleId);
      if (selectedArticleIds.has(id)) {
        selectedArticleIds.delete(id);
        el.classList.remove('selected');
      } else {
        selectedArticleIds.add(id);
        el.classList.add('selected');
      }
      updateButtons();
    });
  });
}

function getTypeLabel(type) {
  const labels = {
    source: { text: '疑似源头', class: 'badge-source' },
    direct: { text: '直接转载', class: 'badge-direct' },
    rewrite: { text: '改写转载', class: 'badge-rewrite' },
    secondary: { text: '二次报道', class: 'badge-secondary' },
    unknown: { text: '待分析', class: 'badge-secondary' }
  };
  return labels[type] || labels.unknown;
}

function formatTime(timeStr) {
  if (!timeStr) return '未知';
  const date = new Date(timeStr);
  if (isNaN(date.getTime())) return timeStr;
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function toDatetimeLocal(timeStr) {
  if (!timeStr) return '';
  const d = new Date(timeStr);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 16);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function updateButtons() {
  const hasSelected = selectedArticleIds.size >= 2;
  compareBtn.disabled = !hasSelected;
  generateBtn.disabled = articles.length === 0;
}

function updateTaskData() {
  const taskData = {
    clientName: clientNameInput.value,
    keywords: keywordsInput.value,
    articles: articles,
    candidateChains: candidateChains
  };
  
  ipcRenderer.invoke('update-task-data', taskData);
}

function loadTaskData() {
  ipcRenderer.invoke('get-task-data').then(data => {
    if (data && data.articles && data.articles.length > 0) {
      articles = data.articles;
      candidateChains = data.candidateChains || [];
      clientNameInput.value = data.clientName || '';
      keywordsInput.value = data.keywords || '';
      renderChains();
      updateButtons();
    }
  });
}

ipcRenderer.on('task-data-updated', (event, data) => {
  articles = data.articles || [];
  candidateChains = data.candidateChains || [];
  renderChains();
  updateButtons();
});

init();
