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
const judgmentInput = document.getElementById('judgmentInput');
const reportBox = document.getElementById('reportBox');
const copyBtn = document.getElementById('copyBtn');
const resetBtn = document.getElementById('resetBtn');
const confirmBtn = document.getElementById('confirmBtn');

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
      
      renderArticleLists();
      updateReport();
    }
  });
}

function renderArticleLists() {
  const sorted = [...articles].sort((a, b) => new Date(a.publishTime) - new Date(b.publishTime));

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
      const id = parseInt(tag.dataset.id);
      if (selectedSourceId === id) {
        selectedSourceId = null;
      } else {
        selectedSourceId = id;
      }
      renderArticleLists();
      updateReport();
    });
  });

  keyMediaList.querySelectorAll('.selectable-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const id = parseInt(tag.dataset.id);
      if (selectedKeyMediaIds.has(id)) {
        selectedKeyMediaIds.delete(id);
      } else {
        selectedKeyMediaIds.add(id);
      }
      renderArticleLists();
      updateReport();
    });
  });

  uncertainList.querySelectorAll('.selectable-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const id = parseInt(tag.dataset.id);
      if (selectedUncertainIds.has(id)) {
        selectedUncertainIds.delete(id);
      } else {
        selectedUncertainIds.add(id);
      }
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
  const date = new Date(timeStr);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

ipcRenderer.on('task-data-updated', (event, data) => {
  taskData = data;
  if (data && data.articles) {
    articles = data.articles;
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
  renderArticleLists();
  updateReport();
});

init();
