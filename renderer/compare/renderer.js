const { ipcRenderer } = require('electron');
const { analyzeDifferences, calculateSimilarity, stringSimilarity } = require('../../shared/utils.js');

let articles = [];
let leftArticle = null;
let rightArticle = null;
let currentPairIndex = 0;
let articlePairs = [];
let selectedSource = null;

const leftSelect = document.getElementById('leftSelect');
const rightSelect = document.getElementById('rightSelect');
const leftTitle = document.getElementById('leftTitle');
const rightTitle = document.getElementById('rightTitle');
const leftTime = document.getElementById('leftTime');
const rightTime = document.getElementById('rightTime');
const leftContent = document.getElementById('leftContent');
const rightContent = document.getElementById('rightContent');
const simNum = document.getElementById('simNum');
const sameNum = document.getElementById('sameNum');
const diffNum = document.getElementById('diffNum');
const addNum = document.getElementById('addNum');
const titleDiff = document.getElementById('titleDiff');
const sourceDiff = document.getElementById('sourceDiff');
const imageDiff = document.getElementById('imageDiff');
const timeDiff = document.getElementById('timeDiff');
const reprintType = document.getElementById('reprintType');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const markSourceBtn = document.getElementById('markSourceBtn');
const toConclusionBtn = document.getElementById('toConclusionBtn');

function init() {
  setupEventListeners();
  loadInitialData();
}

function setupEventListeners() {
  leftSelect.addEventListener('change', () => {
    const id = parseInt(leftSelect.value);
    leftArticle = articles.find(a => a.id === id);
    updateComparison();
  });

  rightSelect.addEventListener('change', () => {
    const id = parseInt(rightSelect.value);
    rightArticle = articles.find(a => a.id === id);
    updateComparison();
  });

  prevBtn.addEventListener('click', () => {
    if (articlePairs.length > 0) {
      currentPairIndex = (currentPairIndex - 1 + articlePairs.length) % articlePairs.length;
      loadPair(currentPairIndex);
    }
  });

  nextBtn.addEventListener('click', () => {
    if (articlePairs.length > 0) {
      currentPairIndex = (currentPairIndex + 1) % articlePairs.length;
      loadPair(currentPairIndex);
    }
  });

  markSourceBtn.addEventListener('click', () => {
    if (leftArticle) {
      selectedSource = leftArticle;
      ipcRenderer.invoke('generate-conclusion', { source: leftArticle });
      alert(`已将「${leftArticle.source}」标记为传播源头`);
    }
  });

  toConclusionBtn.addEventListener('click', () => {
    ipcRenderer.invoke('focus-window', 'conclusion');
  });
}

function loadInitialData() {
  ipcRenderer.invoke('get-task-data').then(data => {
    if (data && data.articles) {
      articles = data.articles;
      populateSelects();
      generatePairs(data.candidateChains);
      
      if (data.selectedArticles && data.selectedArticles.length >= 2) {
        leftArticle = data.selectedArticles[0];
        rightArticle = data.selectedArticles[1];
        updateSelects();
        updateComparison();
      } else if (articles.length >= 2) {
        const sorted = [...articles].sort((a, b) => new Date(a.publishTime) - new Date(b.publishTime));
        leftArticle = sorted[0];
        rightArticle = sorted[1];
        updateSelects();
        updateComparison();
      }
    }
  });
}

function populateSelects() {
  const sorted = [...articles].sort((a, b) => new Date(a.publishTime) - new Date(b.publishTime));
  
  const options = sorted.map(a => 
    `<option value="${a.id}">${a.source} - ${a.title.substring(0, 20)}...</option>`
  ).join('');
  
  leftSelect.innerHTML = options;
  rightSelect.innerHTML = options;
}

function updateSelects() {
  if (leftArticle) leftSelect.value = leftArticle.id;
  if (rightArticle) rightSelect.value = rightArticle.id;
}

function generatePairs(chains) {
  articlePairs = [];
  
  if (chains && chains.length > 0) {
    chains.forEach(chain => {
      if (chain.reprints && chain.reprints.length > 0) {
        chain.reprints.forEach(reprint => {
          articlePairs.push({
            left: chain.source,
            right: reprint.article,
            similarity: reprint.similarity
          });
        });
      }
    });
  }
  
  articlePairs.sort((a, b) => b.similarity - a.similarity);
  
  if (articlePairs.length > 0) {
    currentPairIndex = 0;
    loadPair(0);
  }
}

function loadPair(index) {
  if (index >= 0 && index < articlePairs.length) {
    const pair = articlePairs[index];
    leftArticle = pair.left;
    rightArticle = pair.right;
    updateSelects();
    updateComparison();
  }
}

function updateComparison() {
  if (!leftArticle || !rightArticle) return;

  leftTitle.textContent = leftArticle.source || '未知来源';
  rightTitle.textContent = rightArticle.source || '未知来源';
  leftTime.textContent = formatTime(leftArticle.publishTime);
  rightTime.textContent = formatTime(rightArticle.publishTime);

  const diff = analyzeDifferences(leftArticle, rightArticle);
  const similarity = calculateSimilarity(leftArticle, rightArticle);

  simNum.textContent = similarity + '%';
  sameNum.textContent = diff.paragraphs.same.length;
  diffNum.textContent = diff.paragraphs.modified.length;
  addNum.textContent = diff.paragraphs.added.length + '/' + diff.paragraphs.removed.length;

  titleDiff.textContent = diff.title.changeType;
  sourceDiff.textContent = diff.source.changeType;
  sourceDiff.style = getSourceDiffStyle(diff.source.changeType);
  imageDiff.textContent = diff.images.change;
  
  const t1 = new Date(leftArticle.publishTime);
  const t2 = new Date(rightArticle.publishTime);
  const diffMinutes = Math.abs((t2 - t1) / (1000 * 60));
  timeDiff.textContent = diffMinutes > 60 
    ? `${(diffMinutes / 60).toFixed(1)} 小时` 
    : `${Math.round(diffMinutes)} 分钟`;

  let type = '待判断';
  let typeClass = '';
  if (similarity >= 90) {
    type = '直接转载';
    typeClass = 'color: #4ecca3;';
  } else if (similarity >= 70) {
    type = '改写转载';
    typeClass = 'color: #ffc107;';
  } else if (similarity >= 50) {
    type = '二次报道';
    typeClass = 'color: #ce93d8;';
  } else {
    type = '关联较弱';
    typeClass = 'color: #7c7c9a;';
  }
  reprintType.textContent = type;
  reprintType.style = typeClass;

  renderDiffContent(diff);
}

function renderDiffContent(diff) {
  const leftHtml = [];
  const rightHtml = [];

  const maxLen = Math.max(
    leftArticle.paragraphs.length,
    rightArticle.paragraphs.length
  );

  let leftIdx = 0;
  let rightIdx = 0;

  diff.paragraphs.same.forEach(item => {
    leftHtml.push(`<p class="same">${highlightDiff(item.content1, item.content2, 'left')}</p>`);
    rightHtml.push(`<p class="same">${highlightDiff(item.content1, item.content2, 'right')}</p>`);
  });

  diff.paragraphs.modified.forEach(item => {
    leftHtml.push(`<p class="modified">${item.content1}</p>`);
    rightHtml.push(`<p class="modified">${item.content2}</p>`);
  });

  diff.paragraphs.removed.forEach(item => {
    leftHtml.push(`<p class="removed">${item.content}</p>`);
    rightHtml.push(`<p class="removed" style="visibility: hidden;">&nbsp;</p>`);
  });

  diff.paragraphs.added.forEach(item => {
    leftHtml.push(`<p class="added" style="visibility: hidden;">&nbsp;</p>`);
    rightHtml.push(`<p class="added">${item.content}</p>`);
  });

  leftContent.innerHTML = `<h3 style="font-size: 15px; margin-bottom: 12px; color: #fff; line-height: 1.5;">${leftArticle.title}</h3>` + leftHtml.join('');
  rightContent.innerHTML = `<h3 style="font-size: 15px; margin-bottom: 12px; color: #fff; line-height: 1.5;">${rightArticle.title}</h3>` + rightHtml.join('');
}

function highlightDiff(text1, text2, side) {
  if (text1 === text2) return text1;

  const words1 = text1.split('');
  const words2 = text2.split('');
  
  if (side === 'left') {
    return text1;
  } else {
    return text2;
  }
}

function formatTime(timeStr) {
  if (!timeStr) return '未知';
  const date = new Date(timeStr);
  if (isNaN(date.getTime())) return timeStr;
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function getSourceDiffStyle(changeType) {
  if (changeType.includes('被删除')) return 'color: #ef5350;';
  if (changeType.includes('替换') || changeType.includes('微调') || changeType.includes('变更')) return 'color: #ffc107;';
  if (changeType.includes('保留')) return 'color: #4ecca3;';
  if (changeType.includes('新增')) return 'color: #667eea;';
  return '';
}

ipcRenderer.on('compare-articles', (event, selectedArticles) => {
  if (selectedArticles && selectedArticles.length >= 2) {
    leftArticle = selectedArticles[0];
    rightArticle = selectedArticles[1];
    updateSelects();
    updateComparison();
  }
});

ipcRenderer.on('task-data-updated', (event, data) => {
  if (data && data.articles) {
    articles = data.articles;
    populateSelects();
    
    if (!leftArticle && !rightArticle && articles.length >= 2) {
      const sorted = [...articles].sort((a, b) => new Date(a.publishTime) - new Date(b.publishTime));
      leftArticle = sorted[0];
      rightArticle = sorted[1];
      updateSelects();
      updateComparison();
    }
  }
});

init();
