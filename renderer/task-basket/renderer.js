const { ipcRenderer } = require('electron');
const { generateMockArticles, buildCandidateChains, calculateSimilarity } = require('../../shared/utils.js');

let articles = [];
let candidateChains = [];
let selectedArticleIds = new Set();
let currentView = 'edit';
let currentChainFilter = 'all';

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

const FIELD_LABELS = {
  title: ['标题', '题目', 'headline', 'title'],
  source: ['来源', '媒体', '发布媒体', '出处', 'source', 'media'],
  publishTime: ['发布时间', '时间', '发稿时间', '发布日期', 'date', 'time'],
  author: ['作者', '记者', '通讯员', '撰文', '署名', '文/', 'author', 'writer'],
  sourceNote: ['来源说明', '转载自', '引用自', '原文链接', '原文来源', 'note'],
  url: ['链接', '网址', 'url', 'link', '原文地址']
};

function matchFieldLabel(line) {
  const lower = line.trim().toLowerCase();
  for (const [field, labels] of Object.entries(FIELD_LABELS)) {
    for (const label of labels) {
      const labelLower = label.toLowerCase();
      if (lower.startsWith(labelLower + '：') || lower.startsWith(labelLower + ':') || lower.startsWith(labelLower + ' ')) {
        return field;
      }
    }
  }
  return null;
}

function extractFieldValue(line, field) {
  const labels = FIELD_LABELS[field] || [];
  for (const label of labels) {
    const patterns = [label + '：', label + ':', label + ' '];
    for (const p of patterns) {
      if (line.trim().startsWith(p)) {
        return line.trim().substring(p.length).trim();
      }
      const lowerLine = line.trim().toLowerCase();
      const lowerP = p.toLowerCase();
      if (lowerLine.startsWith(lowerP)) {
        return line.trim().substring(p.length).trim();
      }
    }
  }
  return null;
}

function isUrl(line) {
  return /^https?:\/\/\S+/i.test(line.trim());
}

function extractTimeFromLine(line) {
  const datetimePattern = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T]\s*(\d{1,2}):(\d{2})(:(\d{2}))?/;
  const datePattern = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/;
  const timePattern = /(\d{1,2}):(\d{2})(:(\d{2}))?/;

  let match = line.match(datetimePattern);
  if (match) {
    const year = match[1];
    const month = match[2].padStart(2, '0');
    const day = match[3].padStart(2, '0');
    const hour = match[4].padStart(2, '0');
    const minute = match[5].padStart(2, '0');
    const second = match[7] || '00';
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  }

  match = line.match(datePattern);
  if (match) {
    const year = match[1];
    const month = match[2].padStart(2, '0');
    const day = match[3].padStart(2, '0');
    return `${year}-${month}-${day} 00:00:00`;
  }

  match = line.match(timePattern);
  if (match) {
    const today = new Date();
    const hour = match[1].padStart(2, '0');
    const minute = match[2].padStart(2, '0');
    const second = match[4] || '00';
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')} ${hour}:${minute}:${second}`;
  }

  return null;
}

function looksLikeSourceName(str) {
  const s = str.trim();
  if (!s || s.length > 12) return false;
  if (s.length < 2) return false;
  if (/[。！？!?；;]/.test(s)) return false;
  if (/^[0-9]/.test(s)) return false;
  if (/[\u4e00-\u9fa5]/.test(s) && s.length <= 8) return true;
  if (s.endsWith('报') || s.endsWith('网') || s.endsWith('社') || s.endsWith('台') || s.endsWith('刊')) return true;
  return false;
}

function looksLikeTitle(str) {
  const s = str.trim();
  if (!s) return false;
  if (s.length < 6) return false;
  if (s.length > 80) return false;
  if (/[。；;]/.test(s)) return false;
  if (/[！？!?]/.test(s)) return true;
  if (/[：:].{2,}/.test(s)) return true;
  if (/[\u4e00-\u9fa5]/.test(s)) return s.length >= 8 && s.length <= 60;
  return false;
}

function looksLikeAuthor(str) {
  const s = str.trim();
  if (!s || s.length > 15) return false;
  if (/^记者[：:]/.test(s) || /^通讯员[：:]/.test(s) || /^文[\/:]/.test(s)) return true;
  if (/[\u4e00-\u9fa5]{2,4}$/.test(s) && s.length <= 6) return true;
  return false;
}

function parseSingleBlock(block) {
  const rawLines = block.split('\n').filter(l => l.trim().length > 0);
  if (rawLines.length === 0) return null;

  const article = {
    id: 0,
    title: '',
    source: '',
    publishTime: '',
    url: '',
    paragraphs: [],
    images: [],
    author: '',
    sourceNote: '',
    type: 'unknown',
    similarity: 0,
    needsEdit: true
  };

  const remaining = [];
  let foundTime = false;
  let foundAuthor = false;
  let foundSource = false;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) continue;

    const field = matchFieldLabel(line);
    if (field) {
      const val = extractFieldValue(line, field);
      if (val) {
        if (field === 'publishTime') {
          article.publishTime = extractTimeFromLine(line) || val;
          foundTime = true;
        } else if (field === 'paragraphs' || field === 'content') {
          article.paragraphs.push(val);
        } else {
          article[field] = val;
        }
        if (field === 'source') foundSource = true;
        if (field === 'author') foundAuthor = true;
        continue;
      }
    }

    if (isUrl(line)) {
      article.url = line;
      continue;
    }

    if (!foundTime) {
      const t = extractTimeFromLine(line);
      if (t) {
        article.publishTime = t;
        foundTime = true;
        continue;
      }
    }

    remaining.push(line);
  }

  if (remaining.length > 0) {
    const firstLine = remaining[0];
    const lastLine = remaining[remaining.length - 1];

    if (!foundSource) {
      if (looksLikeSourceName(firstLine)) {
        article.source = firstLine;
        remaining.shift();
        foundSource = true;
      } else if (remaining.length >= 2 && looksLikeSourceName(lastLine)) {
        article.source = lastLine;
        remaining.pop();
        foundSource = true;
      }
    }

    if (!foundAuthor && remaining.length > 0) {
      const last = remaining[remaining.length - 1];
      if (looksLikeAuthor(last) && !looksLikeTitle(last)) {
        article.author = last;
        remaining.pop();
        foundAuthor = true;
      } else if (remaining.length >= 2 && looksLikeAuthor(remaining[remaining.length - 2])) {
        article.author = remaining[remaining.length - 2];
        remaining.splice(remaining.length - 2, 1);
        foundAuthor = true;
      }
    }

    if (!article.title && remaining.length > 0) {
      if (looksLikeTitle(remaining[0])) {
        article.title = remaining[0];
        remaining.shift();
      } else if (remaining.length > 0) {
        article.title = remaining[0];
        remaining.shift();
      }
    }

    if (remaining.length > 0) {
      article.paragraphs = article.paragraphs.concat(remaining.filter(l => l && l.length > 0));
    }
  }

  article.needsEdit = !article.title || !article.publishTime;
  return article;
}

function parseBatchImport(text) {
  const newArticles = [];
  const trimmedText = text.trim();

  if (trimmedText.includes('|') && /^[^|]*\|/.test(trimmedText.split('\n')[0])) {
    const lines = trimmedText.split('\n');
    lines.forEach(line => {
      line = line.trim();
      if (!line) return;
      if (!line.includes('|')) {
        const parsed = parseSingleBlock(line);
        if (parsed) {
          parsed.id = Date.now() + newArticles.length + Math.random();
          newArticles.push(parsed);
        }
        return;
      }
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
    let blocks = [];
    if (trimmedText.includes('\n\n') || trimmedText.includes('\n \n')) {
      blocks = trimmedText.split(/\n\s*\n/).filter(b => b.trim());
    } else {
      blocks = [trimmedText];
    }

    blocks.forEach(block => {
      const parsed = parseSingleBlock(block);
      if (parsed) {
        parsed.id = Date.now() + newArticles.length + Math.random();
        newArticles.push(parsed);
      }
    });
  }

  const validArticles = newArticles.filter(a => a && (a.title || a.source || a.paragraphs.length > 0));
  let addedCount = 0;
  validArticles.forEach(a => {
    const exists = articles.find(ex => ex.url && a.url && ex.url === a.url);
    if (!exists) {
      articles.push(a);
      addedCount++;
    }
  });

  candidateChains = buildCandidateChains(articles);
  renderChains();
  updateMissingWarning();
  updateTaskData();
  return addedCount;
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
          <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
            <span style="font-size: 12px; font-weight: 600; color: #4ecca3; padding: 2px 8px; background: rgba(78, 204, 163, 0.15); border-radius: 4px; flex-shrink: 0;">
              ${article.source || '未知来源'}
            </span>
            <span style="font-size: 11px; color: #7c7c9a; word-break: break-all; flex: 1; min-width: 0;">${article.url || '(无链接)'}</span>
          </div>
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

function getFilteredChains() {
  const chains = candidateChains;
  if (currentChainFilter === 'all') return chains;

  if (currentChainFilter === 'earliest') {
    const sorted = [...chains].sort((a, b) => {
      const ta = new Date(a.source.publishTime).getTime();
      const tb = new Date(b.source.publishTime).getTime();
      return ta - tb;
    });
    return sorted.slice(0, 3);
  }

  if (currentChainFilter === 'highest') {
    const sorted = [...chains].sort((a, b) => b.totalSimilarity - a.totalSimilarity);
    return sorted.slice(0, 3);
  }

  if (currentChainFilter === 'samesource') {
    const sourceMap = {};
    chains.forEach(c => {
      const s = c.source.source || '未知';
      if (!sourceMap[s]) sourceMap[s] = [];
      sourceMap[s].push(c);
    });
    const multiSourceChains = [];
    Object.values(sourceMap).forEach(arr => {
      if (arr.length >= 2) {
        multiSourceChains.push(...arr);
      }
    });
    if (multiSourceChains.length > 0) return multiSourceChains;
    return chains.filter(c => c.reprints.length >= 2).slice(0, 3);
  }

  if (currentChainFilter === 'missing') {
    return chains.filter(c => {
      const srcMissing = !c.source.title || !c.source.publishTime;
      const reprintMissing = c.reprints.some(r => !r.article.title || !r.article.publishTime);
      return srcMissing || reprintMissing;
    });
  }

  return chains;
}

function openChainCompare(sourceArticle, reprintArticle) {
  const sorted = [sourceArticle, reprintArticle].sort((a, b) =>
    new Date(a.publishTime) - new Date(b.publishTime)
  );
  ipcRenderer.invoke('open-compare-articles', sorted);
}

function renderChainView() {
  const filters = [
    { key: 'all', label: '全部链路' },
    { key: 'earliest', label: '最早发布' },
    { key: 'highest', label: '最高相似度' },
    { key: 'samesource', label: '同源媒体' },
    { key: 'missing', label: '缺字段' }
  ];

  let filterHtml = `<div class="chain-filter-bar" style="display: flex; gap: 4px; margin-bottom: 10px; flex-wrap: wrap;">`;
  filters.forEach(f => {
    const active = currentChainFilter === f.key
      ? 'background: #667eea; color: #fff; border-color: #667eea;'
      : 'background: #16162a; color: #9fa8da; border-color: #2d2d4a;';
    filterHtml += `
      <span class="chain-filter-btn" data-filter="${f.key}"
            style="padding: 5px 10px; font-size: 11px; border: 1px solid; border-radius: 6px; cursor: pointer; transition: all 0.2s; ${active}">
        ${f.label}
      </span>
    `;
  });
  filterHtml += `</div>`;

  const filteredChains = getFilteredChains();
  let html = filterHtml;

  if (filteredChains.length === 0) {
    html += `<div style="text-align: center; padding: 30px 0; color: #5c5c7a; font-size: 12px;">
      该筛选条件下没有匹配的链路
    </div>`;
    chainList.innerHTML = html;
    bindChainFilterEvents();
    return;
  }

  filteredChains.forEach((chain, idx) => {
    const source = chain.source;
    const srcMissing = !source.title || !source.publishTime;

    html += `
      <div class="chain-group" data-source-id="${source.id}" style="margin-bottom: 12px;">
        <div class="chain-source" style="position: relative; padding-right: 80px;">
          <span class="label">源头</span>
          <span class="title">${source.title || '(未填写标题)'}</span>
          <span style="font-size: 11px; color: #7c7c9a;">${source.source || '?'} · ${formatTime(source.publishTime)}</span>
          ${srcMissing ? '<span style="font-size:10px;color:#ef5350;margin-left:6px;">缺字段</span>' : ''}
          <button class="chain-source-compare-btn" data-source-id="${source.id}"
                  style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
                         padding: 3px 8px; font-size: 10px; background: #2d2d4a; color: #e0e0e0;
                         border: 1px solid #3d3d5c; border-radius: 4px; cursor: pointer;">
            对照
          </button>
        </div>
    `;

    if (chain.reprints.length === 0) {
      html += `
        <div style="padding: 8px 14px 8px 36px; font-size: 11px; color: #5c5c7a;">
          暂无相似转载稿件
        </div>
      `;
    }

    chain.reprints.forEach(reprint => {
      const rArticle = reprint.article;
      const rSelected = selectedArticleIds.has(rArticle.id);
      const rMissing = !rArticle.title || !rArticle.publishTime;

      html += `
        <div class="chain-reprint ${rSelected ? 'selected' : ''}" data-article-id="${rArticle.id}"
             style="cursor: pointer; position: relative; padding-right: 60px;">
          <span class="title">${rArticle.title || '(未填写标题)'}</span>
          <span class="sim">${reprint.similarity}%</span>
          <span class="time">+${Math.round(reprint.timeDiff)}分钟</span>
          ${rMissing ? '<span class="time" style="color:#ef5350;">缺字段</span>' : ''}
          <button class="chain-reprint-compare-btn" data-source-id="${source.id}" data-reprint-id="${rArticle.id}"
                  style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
                         padding: 2px 7px; font-size: 10px; background: rgba(102, 126, 234, 0.15); color: #667eea;
                         border: 1px solid rgba(102, 126, 234, 0.3); border-radius: 4px; cursor: pointer;">
            对照
          </button>
        </div>
      `;
    });

    html += `</div>`;
  });

  chainList.innerHTML = html;

  bindChainFilterEvents();
  bindChainReprintEvents();
  bindChainCompareEvents();
}

function bindChainFilterEvents() {
  chainList.querySelectorAll('.chain-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentChainFilter = btn.dataset.filter;
      renderChains();
    });
  });
}

function bindChainReprintEvents() {
  chainList.querySelectorAll('.chain-reprint').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.chain-reprint-compare-btn')) return;
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

function bindChainCompareEvents() {
  chainList.querySelectorAll('.chain-reprint-compare-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const srcId = parseFloat(btn.dataset.sourceId);
      const rpId = parseFloat(btn.dataset.reprintId);
      const srcArticle = articles.find(a => a.id === srcId);
      const rpArticle = articles.find(a => a.id === rpId);
      if (srcArticle && rpArticle) {
        openChainCompare(srcArticle, rpArticle);
      }
    });
  });

  chainList.querySelectorAll('.chain-source-compare-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const srcId = parseFloat(btn.dataset.sourceId);
      const srcArticle = articles.find(a => a.id === srcId);
      const chain = candidateChains.find(c => c.source.id === srcId);
      if (srcArticle && chain && chain.reprints.length > 0) {
        openChainCompare(srcArticle, chain.reprints[0].article);
      }
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
