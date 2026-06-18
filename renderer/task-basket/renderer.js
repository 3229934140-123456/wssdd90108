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
const toggleBatchBtn = document.getElementById('toggleBatchBtn');
const batchArea = document.getElementById('batchArea');
const batchInput = document.getElementById('batchInput');
const parseBatchBtn = document.getElementById('parseBatchBtn');
const pasteBatchBtn = document.getElementById('pasteBatchBtn');
const clearBatchBtn = document.getElementById('clearBatchBtn');
const missingWarning = document.getElementById('missingWarning');
const missingText = document.getElementById('missingText');

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
    updateMissingWarning();
    updateTaskData();
  });

  clearBtn.addEventListener('click', () => {
    articles = [];
    candidateChains = [];
    selectedArticleIds.clear();
    renderChains();
    updateButtons();
    updateMissingWarning();
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
    const completeArticles = articles.filter(a => a.title && a.publishTime);
    const missingArticles = articles.filter(a => !a.title || !a.publishTime);

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

  toggleBatchBtn.addEventListener('click', () => {
    const isHidden = batchArea.style.display === 'none';
    batchArea.style.display = isHidden ? 'block' : 'none';
    toggleBatchBtn.textContent = isHidden ? '收起' : '展开';
  });

  pasteBatchBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      batchInput.value = text;
    } catch (err) {
      console.log('粘贴失败', err);
    }
  });

  clearBatchBtn.addEventListener('click', () => {
    batchInput.value = '';
  });

  parseBatchBtn.addEventListener('click', () => {
    const text = batchInput.value.trim();
    if (!text) return;
    parseBatchImport(text);
    batchInput.value = '';
  });
}

function parseBatchImport(text) {
  const lines = text.split('\n');
  const newArticles = [];
  
  if (text.includes('|')) {
    lines.forEach(line => {
      line = line.trim();
      if (!line) return;
      const parts = line.split('|');
      const [url, title, source, publishTime, ...contentParts] = parts;
      const contentStr = contentParts.join('|');
      const paragraphs = contentStr ? contentStr.split('||').filter(p => p.trim()) : [];
      
      newArticles.push({
        id: Date.now() + newArticles.length + Math.random(),
        title: (title || '').trim(),
        source: (source || '').trim(),
        publishTime: (publishTime || '').trim(),
        url: (url || '').trim(),
        paragraphs: paragraphs,
        images: [],
        author: '',
        sourceNote: '',
        type: 'unknown',
        similarity: 0,
        needsEdit: !(title && publishTime)
      });
    });
  } else {
    const blocks = text.split(/\n\s*\n/).filter(b => b.trim());
    blocks.forEach(block => {
      const blockLines = block.split('\n').filter(l => l.trim());
      if (blockLines.length === 0) return;
      
      let url = '';
      let title = '';
      let source = '';
      let publishTime = '';
      let paragraphs = [];
      
      const urlLine = blockLines.find(l => l.startsWith('http'));
      if (urlLine) {
        url = urlLine.trim();
        blockLines.splice(blockLines.indexOf(urlLine), 1);
      }
      
      const timeLine = blockLines.find(l => /\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(l) || /\d{1,2}:\d{2}(:\d{2})?/.test(l));
      if (timeLine) {
        const timeMatch = timeLine.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2}[ T]\d{1,2}:\d{2}(:\d{2})?)|(\d{1,2}:\d{2}(:\d{2})?)/);
        if (timeMatch) {
          publishTime = timeMatch[0].replace(/\//g, '-').replace('T', ' ').trim();
          if (!publishTime.includes('-')) {
            const today = new Date();
            publishTime = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')} ${publishTime}`;
          }
        }
        blockLines.splice(blockLines.indexOf(timeLine), 1);
      }
      
      if (blockLines.length > 0) {
        title = blockLines[0].trim();
        paragraphs = blockLines.slice(1).map(l => l.trim()).filter(l => l);
      }
      
      newArticles.push({
        id: Date.now() + newArticles.length + Math.random(),
        title: title,
        source: source,
        publishTime: publishTime,
        url: url,
        paragraphs: paragraphs,
        images: [],
        author: '',
        sourceNote: '',
        type: 'unknown',
        similarity: 0,
        needsEdit: !(title && publishTime)
      });
    });
  }
  
  newArticles.forEach(a => {
    if (a.url && articles.find(ex => ex.url === a.url)) return;
    articles.push(a);
  });
  
  candidateChains = buildCandidateChains(articles);
  renderChains();
  updateMissingWarning();
  updateTaskData();
}

function addUrls(urls) {
  urls.forEach((url) => {
    const existing = articles.find(a => a.url === url);
    if (!existing) {
      const article = {
        id: Date.now() + Math.random(),
        title: '',
        source: '',
        publishTime: '',
        url: url,
        paragraphs: [],
        images: [],
        author: '',
        sourceNote: '',
        type: 'unknown',
        similarity: 0,
        needsEdit: true
      };
      articles.push(article);
    }
  });
  
  candidateChains = buildCandidateChains(articles);
  renderChains();
  updateMissingWarning();
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
    const missingFields = [];
    if (!article.title) missingFields.push('标题');
    if (!article.publishTime) missingFields.push('发布时间');
    const hasMissing = missingFields.length > 0;
    const borderClass = hasMissing ? 'border-color: #eb3349;' : 'border-color: #2d2d4a;';
    
    html += `
      <div class="article-item" data-article-id="${article.id}" style="${borderClass} cursor: default;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 11px; color: #7c7c9a; word-break: break-all; flex: 1;">${article.url || '(无链接)'}</span>
          <button class="btn btn-danger btn-small delete-btn" data-article-id="${article.id}" style="flex-shrink: 0; margin-left: 8px;">删除</button>
        </div>
        ${hasMissing ? `<div style="color: #eb3349; font-size: 11px; margin-bottom: 8px;">⚠ 缺少：${missingFields.join('、')}</div>` : ''}
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
        <div style="display: flex; gap: 8px; margin-bottom: 6px;">
          <div class="input-group" style="flex: 1; margin-bottom: 0;">
            <label>作者署名</label>
            <input type="text" class="edit-field" data-field="author" data-id="${article.id}" value="${escapeHtml(article.author || '')}" placeholder="可选">
          </div>
          <div class="input-group" style="flex: 1; margin-bottom: 0;">
            <label>来源说明</label>
            <input type="text" class="edit-field" data-field="sourceNote" data-id="${article.id}" value="${escapeHtml(article.sourceNote || '')}" placeholder="转载自/引用">
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
    field.addEventListener('blur', () => {
      const id = parseFloat(field.dataset.id);
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

      article.needsEdit = !article.title || !article.publishTime;
      candidateChains = buildCandidateChains(articles);
      updateMissingWarning();
      updateTaskData();
    });
  });

  chainList.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseFloat(btn.dataset.articleId);
      articles = articles.filter(a => a.id !== id);
      selectedArticleIds.delete(id);
      candidateChains = buildCandidateChains(articles);
      renderChains();
      updateButtons();
      updateMissingWarning();
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
      const id = parseFloat(el.dataset.articleId);
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
    const missingFields = [];
    if (!article.title) missingFields.push('标题');
    if (!article.publishTime) missingFields.push('时间');
    
    html += `
      <div class="article-item ${isSelected ? 'selected' : ''}" data-article-id="${article.id}" style="${missingFields.length ? 'border-color: #eb3349;' : ''}">
        <div class="title">${article.title || '(未填写标题)'}</div>
        <div class="meta">
          <span class="source">${article.source || '未知来源'} · ${article.publishTime ? formatTime(article.publishTime) : '未知时间'}</span>
          <span class="similarity">相似度 ${sim}</span>
        </div>
        <div style="margin-top: 6px; display: flex; gap: 6px; flex-wrap: wrap;">
          <span class="badge ${typeLabel.class}">${typeLabel.text}</span>
          ${missingFields.length > 0 ? `<span class="badge badge-rewrite">缺${missingFields.join('/')}</span>` : ''}
        </div>
      </div>
    `;
  });
  
  chainList.innerHTML = html;
  
  chainList.querySelectorAll('.article-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = parseFloat(el.dataset.articleId);
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

function updateMissingWarning() {
  const missing = articles.filter(a => !a.title || !a.publishTime);
  const complete = articles.length - missing.length;
  
  if (missing.length > 0) {
    const details = [];
    missing.forEach(a => {
      const missingFields = [];
      if (!a.title) missingFields.push('标题');
      if (!a.publishTime) missingFields.push('发布时间');
      details.push(`${a.source || a.url?.slice(0, 20) || '稿件'}(缺${missingFields.join('/')})`);
    });
    missingWarning.style.display = 'block';
    missingText.innerHTML = `共 ${articles.length} 篇稿件，${complete} 篇已补全，${missing.length} 篇待完善：<span style="color: #fff;">${details.slice(0, 3).join('；')}${details.length > 3 ? '...' : ''}</span>。已补全的稿件可直接进入结论。`;
  } else {
    missingWarning.style.display = 'none';
  }
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
  const tzOffset = d.getTimezoneOffset() * 60000;
  const local = new Date(d.getTime() - tzOffset);
  return local.toISOString().slice(0, 16);
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
      updateMissingWarning();
    }
  });
}

ipcRenderer.on('task-data-updated', (event, data) => {
  articles = data.articles || [];
  candidateChains = data.candidateChains || [];
  renderChains();
  updateButtons();
  updateMissingWarning();
});

init();
