const { ipcRenderer } = require('electron');
const { analyzeDifferences, calculateSimilarity, stringSimilarity } = require('../../shared/utils.js');

let articles = [];
let leftArticle = null;
let rightArticle = null;
let currentPairIndex = 0;
let articlePairs = [];
let selectedSource = null;
let evidenceSelection = {};

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
const sameEvidence = document.getElementById('sameEvidence');
const modifiedEvidence = document.getElementById('modifiedEvidence');
const quoteEvidence = document.getElementById('quoteEvidence');
const sameCount = document.getElementById('sameCount');
const modifiedCount = document.getElementById('modifiedCount');

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
      evidenceSelection = data.evidenceSelection || {};
      if (typeof evidenceSelection !== 'object' || Array.isArray(evidenceSelection)) evidenceSelection = {};
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
  renderEvidence(diff);
}

function extractSourceContext(article) {
  const tags = [];
  const paraTags = {};

  const reprintPatterns = [
    { regex: /转载自[：: ]*([^\s，,。；;]+)/g, type: 'reprint', label: '转载自' },
    { regex: /引用自[：: ]*([^\s，,。；;]+)/g, type: 'quote', label: '引用自' },
    { regex: /来源[：: ]*([^\s，,。；;]+)/g, type: 'quote', label: '来源' },
    { regex: /[据从][ ]*([^\s，,。；;]+)[ ]*(报道|消息|获悉)/g, type: 'quote', label: '据' },
    { regex: /([^\s，,。；;]+)[ ]*(讯)/g, type: 'quote', label: '' }
  ];

  if (article.sourceNote) {
    tags.push({ type: 'source-note', label: '来源说明', name: article.sourceNote });
  }
  if (article.author) {
    tags.push({ type: 'source-note', label: '署名', name: article.author });
  }

  const seenNames = new Set();
  (article.paragraphs || []).forEach((para, idx) => {
    paraTags[idx] = [];
    reprintPatterns.forEach(p => {
      const matches = [...para.matchAll(p.regex)];
      matches.forEach(m => {
        if (m[1]) {
          const cleanName = m[1].replace(/[《》""'']/g, '');
          paraTags[idx].push({ type: p.type, name: cleanName, label: p.label });
          const key = `${p.type}|${cleanName}`;
          if (!seenNames.has(key)) {
            seenNames.add(key);
            tags.push({ type: p.type, label: p.label || '引用', name: cleanName });
          }
        }
      });
    });
  });

  return { tags, paraTags };
}

function renderSourceTags(ctx) {
  if (!ctx.tags || ctx.tags.length === 0) return '';
  const html = ctx.tags.map(t => `
    <span class="source-tag ${t.type}">
      <span class="type">${t.label}</span>
      <span class="name">${t.name}</span>
    </span>
  `).join('');
  return `<div class="source-tags">${html}</div>`;
}

function decoratePara(content, paraTagList) {
  if (!paraTagList || paraTagList.length === 0) return content;
  const tagHtml = paraTagList.map(t => `<span class="para-source-tag ${t.type}">${t.label}${t.name}</span>`).join('');
  return content + tagHtml;
}

function renderEvidence(diff) {
  sameCount.textContent = diff.paragraphs.same.length;
  modifiedCount.textContent = diff.paragraphs.modified.length;

  const maxShow = 3;
  const lId = leftArticle ? leftArticle.id : 'L';
  const rId = rightArticle ? rightArticle.id : 'R';
  const pairKey = `${lId}_${rId}`;

  if (diff.paragraphs.same.length === 0) {
    sameEvidence.innerHTML = '<span style="color: #5c5c7a;">暂无相同段落</span>';
  } else {
    const items = diff.paragraphs.same.slice(0, maxShow);
    sameEvidence.innerHTML = items.map((item, i) => {
      const evKey = `${pairKey}_same_${item.index}`;
      const checked = evidenceSelection[evKey] ? 'checked' : '';
      return `
      <div class="evidence-item" data-evidence-key="${evKey}" style="padding: 6px 8px; margin-bottom: 4px; background: rgba(78, 204, 163, 0.08); border-radius: 4px; border-left: 2px solid #4ecca3; display: flex; gap: 6px; align-items: flex-start;">
        <input type="checkbox" class="evidence-checkbox" data-evidence-key="${evKey}" data-evidence-type="same" data-evidence-data='${escapeHtml(JSON.stringify({ type: 'same', index: item.index, content: item.content1, leftId: lId, rightId: rId, leftSource: leftArticle ? leftArticle.source : '', rightSource: rightArticle ? rightArticle.source : '' }))}' style="margin-top: 3px; flex-shrink: 0;" ${checked}>
        <div style="flex: 1; min-width: 0;">
          <span style="color: #4ecca3; font-size: 10px; font-weight: 600;">第${item.index + 1}段</span>
          <div style="color: #b0b0c0; margin-top: 2px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
            ${item.content1.substring(0, 120)}${item.content1.length > 120 ? '...' : ''}
          </div>
        </div>
      </div>
    `}).join('') + (diff.paragraphs.same.length > maxShow
      ? `<div style="font-size: 10px; color: #5c5c7a; margin-top: 4px;">还有 ${diff.paragraphs.same.length - maxShow} 段...</div>`
      : '');
  }

  if (diff.paragraphs.modified.length === 0) {
    modifiedEvidence.innerHTML = '<span style="color: #5c5c7a;">暂无改写段落</span>';
  } else {
    const items = diff.paragraphs.modified.slice(0, maxShow);
    modifiedEvidence.innerHTML = items.map((item, i) => {
      const evKey = `${pairKey}_modified_${item.index}`;
      const checked = evidenceSelection[evKey] ? 'checked' : '';
      return `
      <div class="evidence-item" data-evidence-key="${evKey}" style="padding: 6px 8px; margin-bottom: 6px; background: rgba(255, 193, 7, 0.08); border-radius: 4px; border-left: 2px solid #ffc107; display: flex; gap: 6px; align-items: flex-start;">
        <input type="checkbox" class="evidence-checkbox" data-evidence-key="${evKey}" data-evidence-type="modified" data-evidence-data='${escapeHtml(JSON.stringify({ type: 'modified', index: item.index, similarity: item.similarity, leftContent: item.content1, rightContent: item.content2, leftId: lId, rightId: rId, leftSource: leftArticle ? leftArticle.source : '', rightSource: rightArticle ? rightArticle.source : '' }))}' style="margin-top: 10px; flex-shrink: 0;" ${checked}>
        <div style="flex: 1; min-width: 0;">
          <span style="color: #ffc107; font-size: 10px; font-weight: 600;">第${item.index + 1}段（相似度 ${item.similarity}%）</span>
          <div style="color: #b0b0c0; margin-top: 2px; font-size: 11px;">
            <div style="color: #7c7c9a; font-size: 10px;">左：${item.content1.substring(0, 60)}${item.content1.length > 60 ? '...' : ''}</div>
            <div style="color: #e0e0e0; font-size: 10px; margin-top: 2px;">右：${item.content2.substring(0, 60)}${item.content2.length > 60 ? '...' : ''}</div>
          </div>
        </div>
      </div>
    `}).join('') + (diff.paragraphs.modified.length > maxShow
      ? `<div style="font-size: 10px; color: #5c5c7a; margin-top: 4px;">还有 ${diff.paragraphs.modified.length - maxShow} 段...</div>`
      : '');
  }

  const leftQuotes = extractQuoteSentences(leftArticle);
  const rightQuotes = extractQuoteSentences(rightArticle);

  if (leftQuotes.length === 0 && rightQuotes.length === 0) {
    quoteEvidence.innerHTML = '<span style="color: #5c5c7a;">未检测到明确来源引用</span>';
  } else {
    const maxQuoteShow = 3;
    const allQuotes = [];

    leftQuotes.slice(0, maxQuoteShow).forEach((q, qi) => {
      allQuotes.push({ side: 'left', text: q, qi });
    });
    rightQuotes.slice(0, maxQuoteShow).forEach((q, qi) => {
      allQuotes.push({ side: 'right', text: q, qi: qi + 100 });
    });

    quoteEvidence.innerHTML = allQuotes.map(q => {
      const evKey = `${pairKey}_quote_${q.side}_${q.qi}`;
      const checked = evidenceSelection[evKey] ? 'checked' : '';
      return `
      <div class="evidence-item" data-evidence-key="${evKey}" style="padding: 5px 8px; margin-bottom: 4px; background: rgba(102, 126, 234, 0.08); border-radius: 4px; border-left: 2px solid #667eea; display: flex; gap: 6px; align-items: flex-start;">
        <input type="checkbox" class="evidence-checkbox" data-evidence-key="${evKey}" data-evidence-type="quote" data-evidence-data='${escapeHtml(JSON.stringify({ type: 'quote', side: q.side, text: q.text, leftId: lId, rightId: rId, leftSource: leftArticle ? leftArticle.source : '', rightSource: rightArticle ? rightArticle.source : '' }))}' style="margin-top: 3px; flex-shrink: 0;" ${checked}>
        <div style="flex: 1; min-width: 0;">
          <span style="color: #667eea; font-size: 10px; font-weight: 600;">${q.side === 'left' ? '左稿' : '右稿'}</span>
          <span style="color: #b0b0c0; font-size: 11px; margin-left: 6px;">${q.text}</span>
        </div>
      </div>
    `}).join('');
  }

  bindEvidenceCheckboxes();
}

function bindEvidenceCheckboxes() {
  document.querySelectorAll('.evidence-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const key = cb.dataset.evidenceKey;
      let evData = null;
      try { evData = JSON.parse(cb.dataset.evidenceData); } catch (e) { evData = null; }
      if (cb.checked) {
        evidenceSelection[key] = evData || { key };
      } else {
        delete evidenceSelection[key];
      }
      saveEvidenceSelection();
    });
  });
}

function saveEvidenceSelection() {
  ipcRenderer.invoke('update-evidence-selection', evidenceSelection);
}

function escapeHtml(str) {
  if (typeof str !== 'string') str = String(str);
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function extractQuoteSentences(article) {
  const quotes = [];
  const quotePatterns = [
    /[^。；;\n]*转载自[：: ]*[^\s，,。；;]+[^。；;\n]*[。；;\n]?/g,
    /[^。；;\n]*引用自[：: ]*[^\s，,。；;]+[^。；;\n]*[。；;\n]?/g,
    /[^。；;\n]*来源[：: ]*[^\s，,。；;]+[^。；;\n]*[。；;\n]?/g,
    /[^。；;\n]*[据从][ ]*[^\s，,。；;]+[ ]*(报道|消息|获悉)[^。；;\n]*[。；;\n]?/g,
    /[^。；;\n]*[^\s，,。；;]+[ ]*(讯|报道称)[^。；;\n]*[。；;\n]?/g
  ];

  const fullText = (article.paragraphs || []).join('\n') + (article.sourceNote ? '\n' + article.sourceNote : '');

  quotePatterns.forEach(pat => {
    const matches = fullText.match(pat);
    if (matches) {
      matches.forEach(m => {
        const clean = m.trim();
        if (clean.length > 6 && clean.length < 120) {
          if (!quotes.find(q => q === clean)) {
            quotes.push(clean);
          }
        }
      });
    }
  });

  return quotes;
}

function renderDiffContent(diff) {
  const leftCtx = extractSourceContext(leftArticle);
  const rightCtx = extractSourceContext(rightArticle);
  const leftHtml = [];
  const rightHtml = [];

  diff.paragraphs.same.forEach(item => {
    leftHtml.push(`<p class="same">${decoratePara(highlightDiff(item.content1, item.content2, 'left'), leftCtx.paraTags[item.index])}</p>`);
    rightHtml.push(`<p class="same">${decoratePara(highlightDiff(item.content1, item.content2, 'right'), rightCtx.paraTags[item.index])}</p>`);
  });

  diff.paragraphs.modified.forEach(item => {
    leftHtml.push(`<p class="modified">${decoratePara(item.content1, leftCtx.paraTags[item.index])}</p>`);
    rightHtml.push(`<p class="modified">${decoratePara(item.content2, rightCtx.paraTags[item.index])}</p>`);
  });

  diff.paragraphs.removed.forEach(item => {
    leftHtml.push(`<p class="removed">${decoratePara(item.content, leftCtx.paraTags[item.index])}</p>`);
    rightHtml.push(`<p class="removed" style="visibility: hidden;">&nbsp;</p>`);
  });

  diff.paragraphs.added.forEach(item => {
    leftHtml.push(`<p class="added" style="visibility: hidden;">&nbsp;</p>`);
    rightHtml.push(`<p class="added">${decoratePara(item.content, rightCtx.paraTags[item.index])}</p>`);
  });

  const leftTitleHtml = `<h3 style="font-size: 15px; margin-bottom: 12px; color: #fff; line-height: 1.5;">${leftArticle.title}</h3>` + renderSourceTags(leftCtx);
  const rightTitleHtml = `<h3 style="font-size: 15px; margin-bottom: 12px; color: #fff; line-height: 1.5;">${rightArticle.title}</h3>` + renderSourceTags(rightCtx);

  leftContent.innerHTML = leftTitleHtml + leftHtml.join('');
  rightContent.innerHTML = rightTitleHtml + rightHtml.join('');
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
