const { ipcRenderer } = require('electron');
const { generateConclusionReport } = require('../../shared/utils.js');

let articles = [];
let selectedSourceId = null;
let selectedKeyMediaIds = new Set();
let selectedUncertainIds = new Set();
let taskData = null;

const sourceList = document.getElementById('sourceList');
const keyMediaList = document.getElementById('keyMediaList');
const uncertainList = document.getElementById('uncertainList');
const timelineContainer = document.getElementById('timelineContainer');
const judgmentInput = document.getElementById('judgmentInput');
const reportBox = document.getElementById('reportBox');
const copyBtn = document.getElementById('copyBtn');
const resetBtn = document.getElementById('resetBtn');
const confirmBtn = document.getElementById('confirmBtn');

const TYPE_CYCLE = ['normal', 'source', 'keymedia', 'uncertain'];

function getNodeType(id) {
  if (id === selectedSourceId) return 'source';
  if (selectedKeyMediaIds.has(id)) return 'keymedia';
  if (selectedUncertainIds.has(id)) return 'uncertain';
  return 'normal';
}

function cycleNodeType(id) {
  const current = getNodeType(id);
  const currentIdx = TYPE_CYCLE.indexOf(current);
  const nextType = TYPE_CYCLE[(currentIdx + 1) % TYPE_CYCLE.length];

  if (current === 'source') selectedSourceId = null;
  if (current === 'keymedia') selectedKeyMediaIds.delete(id);
  if (current === 'uncertain') selectedUncertainIds.delete(id);

  if (nextType === 'source') {
    selectedSourceId = id;
  } else if (nextType === 'keymedia') {
    selectedKeyMediaIds.add(id);
  } else if (nextType === 'uncertain') {
    selectedUncertainIds.add(id);
  }
}

function formatFullTime(timeStr) {
  if (!timeStr) return '--:--';
  const d = new Date(timeStr);
  if (isNaN(d.getTime())) return timeStr;
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function renderTimeline() {
  if (!articles || articles.length === 0) {
    timelineContainer.innerHTML = '<span style="color: #5c5c7a; font-size: 12px; display: block; padding: 20px; text-align: center;">暂无稿件数据</span>';
    return;
  }

  const sorted = [...articles].sort((a, b) => {
    const t1 = a.publishTime ? new Date(a.publishTime).getTime() : Infinity;
    const t2 = b.publishTime ? new Date(b.publishTime).getTime() : Infinity;
    return t1 - t2;
  });

  const typeLabelMap = {
    source: '源头',
    keymedia: '关键扩散',
    uncertain: '不确定',
    normal: ''
  };
  const typeDotMap = {
    source: '★',
    keymedia: '◆',
    uncertain: '?',
    normal: ''
  };

  let html = '';
  sorted.forEach(article => {
    const nType = getNodeType(article.id);
    const typeClass = nType !== 'normal' ? `${nType}-type` : '';
    const typeLabel = typeLabelMap[nType];
    const dotMark = typeDotMap[nType];
    const timeStr = formatFullTime(article.publishTime);
    const titleShort = (article.title || '（无标题）').substring(0, 40);
    const missingFields = [];
    if (!article.title) missingFields.push('缺标题');
    if (!article.publishTime) missingFields.push('缺时间');
    const missingBadge = missingFields.length > 0
      ? `<span style="margin-left:6px;font-size:10px;padding:1px 6px;border-radius:8px;background:rgba(239,83,80,0.2);color:#ef5350;">${missingFields.join('/')}</span>`
      : '';

    html += `
      <div class="timeline-node ${typeClass}" data-id="${article.id}">
        <div class="timeline-dot">${dotMark}</div>
        <div class="tl-info">
          <div class="tl-main">
            <div class="tl-source">
              ${article.source || '未知来源'}${missingBadge}
            </div>
            <div class="tl-title" title="${article.title || ''}">${titleShort}</div>
          </div>
          <div class="tl-meta">
            <span class="tl-time">${timeStr}</span>
            ${typeLabel ? `<span class="tl-type">${typeLabel}</span>` : ''}
          </div>
        </div>
        <div class="timeline-cycle-menu">
          <button class="cycle-btn" data-action="cycle" title="循环切换类型">◉</button>
        </div>
      </div>
    `;
  });

  timelineContainer.innerHTML = html;

  timelineContainer.querySelectorAll('.timeline-node').forEach(node => {
    const id = parseFloat(node.dataset.id);
    const cycleBtn = node.querySelector('[data-action="cycle"]');
    cycleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      cycleNodeType(id);
      renderTimeline();
      renderArticleLists();
      updateReport();
    });
    node.addEventListener('click', () => {
      cycleNodeType(id);
      renderTimeline();
      renderArticleLists();
      updateReport();
    });
  });
}

function init() {
  setupEventListeners();
  loadTaskData();
}

function setupEventListeners() {
  judgmentInput.addEventListener('input', () => {
    updateReport();
  });

  copyBtn.addEventListener('click', async () => {
    const report = reportBox.textContent;
    try {
      await navigator.clipboard.writeText(report);
      const originalText = copyBtn.textContent;
      copyBtn.textContent = '已复制!';
      copyBtn.style.background = 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)';
      setTimeout(() => {
        copyBtn.textContent = originalText;
        copyBtn.style.background = '';
      }, 1500);
    } catch (err) {
      console.log('复制失败', err);
    }
  });

  resetBtn.addEventListener('click', () => {
    selectedSourceId = null;
    selectedKeyMediaIds.clear();
    selectedUncertainIds.clear();
    judgmentInput.value = '';
    renderTimeline();
    renderArticleLists();
    updateReport();
  });

  confirmBtn.addEventListener('click', () => {
    const source = articles.find(a => a.id === selectedSourceId);
    const keyMedia = articles.filter(a => selectedKeyMediaIds.has(a.id));
    const uncertain = articles.filter(a => selectedUncertainIds.has(a.id));

    const conclusionData = {
      source: source || null,
      keyMedia: keyMedia,
      uncertainNodes: uncertain,
      manualJudgment: judgmentInput.value
    };

    ipcRenderer.invoke('update-task-data', { conclusions: conclusionData });

    const originalText = confirmBtn.textContent;
    confirmBtn.textContent = '已生成!';
    confirmBtn.style.background = 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)';
    setTimeout(() => {
      confirmBtn.textContent = originalText;
      confirmBtn.style.background = '';
    }, 1500);
  });
}

function loadTaskData() {
  ipcRenderer.invoke('get-task-data').then(data => {
    taskData = data;
    if (data && data.articles) {
      articles = data.articles;

      if (data.conclusions) {
        if (data.conclusions.source) {
          selectedSourceId = data.conclusions.source.id;
        }
        if (data.conclusions.keyMedia) {
          selectedKeyMediaIds = new Set(data.conclusions.keyMedia.map(a => a.id));
        }
        if (data.conclusions.uncertainNodes) {
          selectedUncertainIds = new Set(data.conclusions.uncertainNodes.map(a => a.id));
        }
        if (data.conclusions.manualJudgment) {
          judgmentInput.value = data.conclusions.manualJudgment;
        }
      }

      renderTimeline();
      renderArticleLists();
      updateReport();
    }
  });
}

function renderArticleLists() {
  const sorted = [...articles].sort((a, b) => {
    const t1 = a.publishTime ? new Date(a.publishTime).getTime() : Infinity;
    const t2 = b.publishTime ? new Date(b.publishTime).getTime() : Infinity;
    return t1 - t2;
  });

  if (sorted.length === 0) {
    const emptyHtml = '<span style="color: #5c5c7a; font-size: 12px;">暂无数据</span>';
    sourceList.innerHTML = emptyHtml;
    keyMediaList.innerHTML = emptyHtml;
    uncertainList.innerHTML = emptyHtml;
    return;
  }

  let sourceHtml = '';
  let keyMediaHtml = '';
  let uncertainHtml = '';

  sorted.forEach(article => {
    const timeStr = formatTime(article.publishTime);
    const label = `${article.source} · ${timeStr}`;

    sourceHtml += `
      <span class="selectable-tag ${selectedSourceId === article.id ? 'source' : ''}"
            data-id="${article.id}" data-type="source" title="${article.title}">
        ${label}
      </span>
    `;

    keyMediaHtml += `
      <span class="selectable-tag ${selectedKeyMediaIds.has(article.id) ? 'selected' : ''}"
            data-id="${article.id}" data-type="keymedia" title="${article.title}">
        ${label}
      </span>
    `;

    uncertainHtml += `
      <span class="selectable-tag ${selectedUncertainIds.has(article.id) ? 'selected' : ''}"
            data-id="${article.id}" data-type="uncertain" title="${article.title}">
        ${label}
      </span>
    `;
  });

  sourceList.innerHTML = sourceHtml;
  keyMediaList.innerHTML = keyMediaHtml;
  uncertainList.innerHTML = uncertainHtml;

  sourceList.querySelectorAll('.selectable-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const id = parseFloat(tag.dataset.id);
      if (selectedSourceId === id) {
        selectedSourceId = null;
      } else {
        selectedSourceId = id;
      }
      renderTimeline();
      renderArticleLists();
      updateReport();
    });
  });

  keyMediaList.querySelectorAll('.selectable-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const id = parseFloat(tag.dataset.id);
      if (selectedKeyMediaIds.has(id)) {
        selectedKeyMediaIds.delete(id);
      } else {
        selectedKeyMediaIds.add(id);
      }
      renderTimeline();
      renderArticleLists();
      updateReport();
    });
  });

  uncertainList.querySelectorAll('.selectable-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const id = parseFloat(tag.dataset.id);
      if (selectedUncertainIds.has(id)) {
        selectedUncertainIds.delete(id);
      } else {
        selectedUncertainIds.add(id);
      }
      renderTimeline();
      renderArticleLists();
      updateReport();
    });
  });
}

function updateReport() {
  const source = articles.find(a => a.id === selectedSourceId);
  const keyMedia = articles.filter(a => selectedKeyMediaIds.has(a.id));
  const uncertain = articles.filter(a => selectedUncertainIds.has(a.id));

  const reportData = {
    clientName: taskData?.clientName || '',
    keywords: taskData?.keywords || '',
    articles: articles,
    candidateChains: taskData?.candidateChains || [],
    conclusions: {
      source: source,
      keyMedia: keyMedia,
      uncertainNodes: uncertain,
      manualJudgment: judgmentInput.value
    }
  };

  const report = generateConclusionReport(reportData);
  reportBox.textContent = report;
}

function formatTime(timeStr) {
  if (!timeStr) return '--:--';
  const date = new Date(timeStr);
  if (isNaN(date.getTime())) return timeStr;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

ipcRenderer.on('task-data-updated', (event, data) => {
  taskData = data;
  if (data && data.articles) {
    articles = data.articles;
    renderTimeline();
    renderArticleLists();
    updateReport();
  }
});

ipcRenderer.on('load-conclusion', (event, data) => {
  taskData = data;
  if (data && data.articles) {
    articles = data.articles;
  }
  if (data?.conclusions?.source) {
    selectedSourceId = data.conclusions.source.id;
  }
  if (data?.conclusions?.keyMedia) {
    selectedKeyMediaIds = new Set(data.conclusions.keyMedia.map(a => a.id));
  }
  if (data?.conclusions?.uncertainNodes) {
    selectedUncertainIds = new Set(data.conclusions.uncertainNodes.map(a => a.id));
  }
  if (data?.conclusions?.manualJudgment) {
    judgmentInput.value = data.conclusions.manualJudgment;
  }
  renderTimeline();
  renderArticleLists();
  updateReport();
});

init();
