const { ipcRenderer } = require('electron');
const { generateMockArticles, buildCandidateChains, calculateSimilarity } = require('../../shared/utils.js');

let articles = [];
let candidateChains = [];
let selectedArticleIds = new Set();
let currentView = 'chains';

const dropZone = document.getElementById('dropZone');
const chainList = document.getElementById('chainList');
const chainCount = document.getElementById('chainCount');
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
    ipcRenderer.invoke('focus-window', 'conclusion');
    ipcRenderer.invoke('generate-conclusion', {
      source: null,
      keyMedia: [],
      uncertainNodes: [],
      manualJudgment: ''
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
  const keywords = keywordsInput.value || '新闻事件';
  
  urls.forEach((url, i) => {
    const existing = articles.find(a => a.url === url);
    if (!existing) {
      const idx = articles.length;
      const article = {
        id: idx,
        title: `新闻稿件 ${idx + 1}`,
        source: `来源${idx + 1}`,
        publishTime: new Date(Date.now() - i * 3600000 - Math.random() * 3600000).toISOString().slice(0, 19).replace('T', ' '),
        url: url,
        paragraphs: [
          '这是一篇示例新闻稿件的第一段内容。',
          '第二段介绍了事件的背景和详细情况。',
          '第三段分析了事件可能带来的影响。',
          '最后一段是总结和展望。'
        ],
        images: [`img${idx}.jpg`],
        type: 'unknown',
        similarity: 0
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
        <p>添加链接后自动生成候选链路</p>
      </div>
    `;
    chainCount.textContent = '0 条';
    return;
  }

  if (currentView === 'chains') {
    renderChainView();
  } else {
    renderListView();
  }
  
  chainCount.textContent = `${candidateChains.length} 条链路`;
}

function renderChainView() {
  let html = '';
  
  candidateChains.forEach((chain, idx) => {
    const source = chain.source;
    const isSelected = selectedArticleIds.has(source.id);
    
    html += `
      <div class="chain-group" data-source-id="${source.id}">
        <div class="chain-source">
          <span class="label">源头</span>
          <span class="title">${source.title}</span>
          <span style="font-size: 11px; color: #7c7c9a;">${formatTime(source.publishTime)}</span>
        </div>
    `;
    
    chain.reprints.forEach(reprint => {
      const rArticle = reprint.article;
      const rSelected = selectedArticleIds.has(rArticle.id);
      
      html += `
        <div class="chain-reprint ${rSelected ? 'selected' : ''}" data-article-id="${rArticle.id}" style="cursor: pointer;">
          <span class="title">${rArticle.title}</span>
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
  const sorted = [...articles].sort((a, b) => new Date(a.publishTime) - new Date(b.publishTime));
  
  let html = '';
  sorted.forEach(article => {
    const isSelected = selectedArticleIds.has(article.id);
    const typeLabel = getTypeLabel(article.type);
    const sim = article.similarity ? `${article.similarity}%` : '-';
    
    html += `
      <div class="article-item ${isSelected ? 'selected' : ''}" data-article-id="${article.id}">
        <div class="title">${article.title}</div>
        <div class="meta">
          <span class="source">${article.source} · ${formatTime(article.publishTime)}</span>
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
  const date = new Date(timeStr);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
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
    }
  });
}

ipcRenderer.on('task-data-updated', (event, data) => {
  articles = data.articles || [];
  candidateChains = data.candidateChains || [];
  renderChains();
});

init();
