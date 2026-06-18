function generateMockArticles(keywords) {
  const keyword = keywords || '科技公司裁员';
  
  const baseArticle = {
    title: '某科技公司宣布大规模裁员 涉及数千名员工',
    source: '科技日报',
    publishTime: '2026-06-18 14:30:00',
    url: 'http://example.com/article1',
    paragraphs: [
      '今日，某知名科技公司宣布将进行大规模人员优化，预计涉及数千名员工。',
      '据内部消息人士透露，此次裁员主要集中在研发和市场部门，公司表示这是为了应对当前的市场环境和战略调整。',
      '该公司今年第一季度财报显示，营收同比下滑15%，净利润下降超过30%。',
      '业内分析师认为，这只是行业调整的开始，未来可能会有更多科技公司采取类似措施。',
      '截至发稿时，该公司尚未就裁员事宜作出官方回应。'
    ],
    images: ['img1.jpg', 'img2.jpg']
  };

  const variations = [
    {
      title: '突发！科技巨头大规模裁员 数千人受影响',
      source: '财经新闻网',
      publishTime: '2026-06-18 15:10:00',
      url: 'http://example.com/article2',
      type: 'direct',
      titleDiff: '标题替换："宣布"→"突发"，"涉及"→"受影响"',
      paraChanges: [2],
      removedParas: [],
      addedParas: [],
      images: ['img1.jpg', 'img3.jpg'],
      imageDiff: '图片2更换："办公大楼"→"公司logo"'
    },
    {
      title: '科技公司裁员潮继续 又一巨头宣布人员优化',
      source: '互联网周刊',
      publishTime: '2026-06-18 16:45:00',
      url: 'http://example.com/article3',
      type: 'rewrite',
      titleDiff: '标题改写：更换角度，从"裁员潮"切入',
      paraChanges: [0, 1, 3],
      removedParas: [4],
      addedParas: ['加上周已有两家同类公司宣布裁员计划，行业寒冬似乎正在到来。'],
      images: ['img4.jpg'],
      imageDiff: '图片全部更换'
    },
    {
      title: '传某科技公司将裁员数千人 官方暂未回应',
      source: '每日经济',
      publishTime: '2026-06-18 13:50:00',
      url: 'http://example.com/article0',
      type: 'source',
      titleDiff: '最早发布，信息较简略',
      paraChanges: [0, 1],
      removedParas: [3],
      addedParas: [],
      images: ['img1.jpg'],
      imageDiff: '只有一张配图'
    },
    {
      title: '科技公司大规模裁员引关注 行业或迎深度调整',
      source: '新闻晨报',
      publishTime: '2026-06-18 18:20:00',
      url: 'http://example.com/article4',
      type: 'secondary',
      titleDiff: '标题深化：加入"行业调整"视角',
      paraChanges: [0, 2, 3],
      removedParas: [4],
      addedParas: [
        '记者梳理发现，今年以来已有超过20家科技企业宣布裁员或人员优化计划。',
        '专家建议，从业者应提升自身技能，增强抗风险能力。'
      ],
      images: ['img5.jpg', 'img6.jpg'],
      imageDiff: '全部为新图片，含数据图表'
    },
    {
      title: '快讯：科技公司裁员最新消息 或涉及多个部门',
      source: '科技资讯',
      publishTime: '2026-06-18 15:55:00',
      url: 'http://example.com/article5',
      type: 'direct',
      titleDiff: '标题微调：加入"快讯"标签',
      paraChanges: [1],
      removedParas: [],
      addedParas: [],
      images: ['img1.jpg', 'img2.jpg'],
      imageDiff: '图片完全一致'
    }
  ];

  const articles = variations.map((v, i) => {
    const paragraphs = [...baseArticle.paragraphs];
    
    v.removedParas.sort((a, b) => b - a).forEach(idx => {
      if (idx < paragraphs.length) {
        paragraphs.splice(idx, 1);
      }
    });
    
    v.addedParas.forEach((p, idx) => {
      paragraphs.splice(Math.min(idx + 1, paragraphs.length), 0, p);
    });
    
    return {
      id: i,
      title: v.title,
      source: v.source,
      publishTime: v.publishTime,
      url: v.url,
      paragraphs: paragraphs,
      images: v.images,
      type: v.type,
      titleDiff: v.titleDiff,
      paraChanges: v.paraChanges,
      imageDiff: v.imageDiff,
      similarity: v.type === 'source' ? 100 : v.type === 'direct' ? 92 : v.type === 'rewrite' ? 75 : 60
    };
  });

  articles.sort((a, b) => new Date(a.publishTime) - new Date(b.publishTime));
  articles.forEach((a, i) => a.id = i);

  return articles;
}

function buildCandidateChains(articles) {
  const sorted = [...articles].sort((a, b) => new Date(a.publishTime) - new Date(b.publishTime));
  
  const chains = [];
  
  for (let i = 0; i < sorted.length; i++) {
    const chain = {
      source: sorted[i],
      reprints: [],
      totalSimilarity: 0
    };
    
    for (let j = 0; j < sorted.length; j++) {
      if (i !== j) {
        const timeDiff = (new Date(sorted[j].publishTime) - new Date(sorted[i].publishTime)) / (1000 * 60);
        if (timeDiff > 0) {
          const sim = calculateSimilarity(sorted[i], sorted[j]);
          if (sim > 50) {
            chain.reprints.push({
              article: sorted[j],
              similarity: sim,
              timeDiff: timeDiff
            });
          }
        }
      }
    }
    
    chain.reprints.sort((a, b) => b.similarity - a.similarity);
    chain.totalSimilarity = chain.reprints.reduce((sum, r) => sum + r.similarity, 0) / (chain.reprints.length || 1);
    chains.push(chain);
  }
  
  chains.sort((a, b) => b.reprints.length - a.reprints.length || b.totalSimilarity - a.totalSimilarity);
  
  return chains;
}

function calculateSimilarity(article1, article2) {
  const titleSim = stringSimilarity(article1.title, article2.title);
  
  const paras1 = article1.paragraphs.join(' ');
  const paras2 = article2.paragraphs.join(' ');
  const contentSim = stringSimilarity(paras1, paras2);
  
  return Math.round(titleSim * 0.3 + contentSim * 0.7);
}

function stringSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 100;
  
  const costs = [];
  for (let i = 0; i <= shorter.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= longer.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (shorter.charAt(i - 1) !== longer.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[longer.length] = lastValue;
  }
  
  const distance = costs[longer.length];
  return Math.round((1 - distance / longer.length) * 100);
}

function analyzeDifferences(article1, article2) {
  const differences = {
    title: {
      original: article1.title,
      compared: article2.title,
      changeType: article2.titleDiff || detectTitleChange(article1.title, article2.title)
    },
    source: {
      original: article1.source,
      compared: article2.source,
      changeType: detectSourceChange(article1, article2)
    },
    paragraphs: {
      same: [],
      modified: [],
      added: [],
      removed: []
    },
    images: {
      change: article2.imageDiff || detectImageChange(article1.images, article2.images),
      originalCount: article1.images ? article1.images.length : 0,
      comparedCount: article2.images ? article2.images.length : 0
    }
  };

  const maxLen = Math.max(
    article1.paragraphs ? article1.paragraphs.length : 0,
    article2.paragraphs ? article2.paragraphs.length : 0
  );
  for (let i = 0; i < maxLen; i++) {
    const p1 = (article1.paragraphs && article1.paragraphs[i]) || '';
    const p2 = (article2.paragraphs && article2.paragraphs[i]) || '';
    
    if (!p1 && p2) {
      differences.paragraphs.added.push({ index: i, content: p2 });
    } else if (p1 && !p2) {
      differences.paragraphs.removed.push({ index: i, content: p1 });
    } else {
      const sim = stringSimilarity(p1, p2);
      if (sim > 90) {
        differences.paragraphs.same.push({ index: i, content1: p1, content2: p2, similarity: sim });
      } else {
        differences.paragraphs.modified.push({ index: i, content1: p1, content2: p2, similarity: sim });
      }
    }
  }

  return differences;
}

function detectTitleChange(title1, title2) {
  if (!title1 || !title2) return '标题信息缺失';
  if (title1 === title2) return '标题无变化';
  const sim = stringSimilarity(title1, title2);
  if (sim > 80) return '标题微调';
  if (sim > 50) return '标题改写';
  return '标题大幅修改';
}

function detectSourceChange(article1, article2) {
  const s1 = article1.source || '';
  const s2 = article2.source || '';
  const a1 = article1.author || '';
  const a2 = article2.author || '';
  const note1 = article1.sourceNote || '';
  const note2 = article2.sourceNote || '';
  const paras1 = (article1.paragraphs || []).join('\n');
  const paras2 = (article2.paragraphs || []).join('\n');
  
  const changes = [];

  if (s1 && s2 && s1 !== s2) {
    const sim = stringSimilarity(s1, s2);
    if (sim > 70) {
      changes.push(`媒体名微调："${s1}"→"${s2}"`);
    } else {
      changes.push(`媒体名替换："${s1}"→"${s2}"`);
    }
  } else if (s1 && !s2) {
    changes.push(`来源信息被删除（原文：${s1}）`);
  } else if (!s1 && s2) {
    changes.push(`新增来源标注：${s2}`);
  } else if (s1 && s2 && s1 === s2) {
    changes.push(`来源保留：${s1}`);
  }

  if (a1 && !a2) {
    changes.push(`原文署名被删除（${a1}）`);
  } else if (a1 && a2 && a1 !== a2) {
    changes.push(`署名变更："${a1}"→"${a2}"`);
  } else if (!a1 && a2) {
    changes.push(`新增署名：${a2}`);
  }

  if (note1 && !note2) {
    changes.push(`来源说明被删除（${note1}）`);
  } else if (note1 && note2 && note1 !== note2) {
    changes.push(`来源说明变更："${note1}"→"${note2}"`);
  } else if (!note1 && note2) {
    changes.push(`新增来源说明：${note2}`);
  } else if (note1 && note2 && note1 === note2) {
    changes.push(`来源说明保留：${note1}`);
  }

  const reprintPatterns = [
    /转载自[：: ]*([^\s，,。；;]+)/g,
    /引用自[：: ]*([^\s，,。；;]+)/g,
    /来源[：: ]*([^\s，,。；;]+)/g,
    /[据据从][ ]*([^\s，,。；;]+)[ ]*(报道|消息|获悉)/g,
    /([^\s，,。；;]+)[ ]*(报道|讯|消息)/g
  ];
  
  const noteMatches1 = new Set();
  const noteMatches2 = new Set();
  
  reprintPatterns.forEach(pat => {
    [...paras1.matchAll(pat)].forEach(m => { if (m[1]) noteMatches1.add(m[1].replace(/[《》""'']/g, '')); });
    [...paras2.matchAll(pat)].forEach(m => { if (m[1]) noteMatches2.add(m[1].replace(/[《》""'']/g, '')); });
    if (note1) [...note1.matchAll(pat)].forEach(m => { if (m[1]) noteMatches1.add(m[1].replace(/[《》""'']/g, '')); });
    if (note2) [...note2.matchAll(pat)].forEach(m => { if (m[1]) noteMatches2.add(m[1].replace(/[《》""'']/g, '')); });
  });
  
  const in1not2 = [...noteMatches1].filter(x => ![...noteMatches2].includes(x));
  const in2not1 = [...noteMatches2].filter(x => ![...noteMatches1].includes(x));
  const inBoth = [...noteMatches1].filter(x => [...noteMatches2].includes(x));
  
  if (inBoth.length > 0) changes.push(`正文中引用保留：${inBoth.join('、')}`);
  if (in1not2.length > 0) changes.push(`正文引用被删除：${in1not2.join('、')}`);
  if (in2not1.length > 0) changes.push(`新增正文引用：${in2not1.join('、')}`);

  return changes.length > 0 ? changes.join('；') : '来源无变化';
}

function detectImageChange(images1, images2) {
  const i1 = images1 || [];
  const i2 = images2 || [];
  if (i1.length === 0 && i2.length === 0) return '无配图';
  if (i1.length === i2.length) {
    const allSame = i1.every((img, idx) => img === i2[idx]);
    return allSame ? '图片完全一致' : `${i1.length}张配图中有变化`;
  }
  if (i1.length === 0) return `新增${i2.length}张配图`;
  if (i2.length === 0) return `原文${i1.length}张配图全部删除`;
  return `配图数量变化：${i1.length}张→${i2.length}张`;
}

function generatePropagationPath(taskData) {
  const { articles, conclusions } = taskData;
  const { source, keyMedia, uncertainNodes, timelineOrder, manuallyAdjustedIds } = conclusions || {};
  const keyMediaIds = new Set((keyMedia || []).map(a => a.id));
  const uncertainIds = new Set((uncertainNodes || []).map(a => a.id));
  const adjustedIds = new Set(manuallyAdjustedIds || []);

  let sorted = [];
  if (timelineOrder && timelineOrder.length === (articles || []).length) {
    const idMap = new Map((articles || []).map(a => [a.id, a]));
    timelineOrder.forEach(id => {
      if (idMap.has(id)) sorted.push(idMap.get(id));
    });
  }
  if (sorted.length !== (articles || []).length) {
    sorted = [...(articles || [])].sort((a, b) => {
      const t1 = a.publishTime ? new Date(a.publishTime).getTime() : Infinity;
      const t2 = b.publishTime ? new Date(b.publishTime).getTime() : Infinity;
      return t1 - t2;
    });
  }

  if (sorted.length === 0) return '（暂无可分析稿件）';

  const pathParts = [];

  if (source) {
    pathParts.push(`《${source.source}》于${formatDateShort(source.publishTime)}首发`);
  } else {
    pathParts.push(`最早一篇为《${sorted[0].source}》${formatDateShort(sorted[0].publishTime)}发布（未标记为源头）`);
  }

  const keyList = sorted.filter(a => keyMediaIds.has(a.id));
  if (keyList.length > 0) {
    const keyStr = keyList.map(a => `《${a.source}》（${formatDateShort(a.publishTime)}）`).join('、');
    pathParts.push(`经${keyStr}进行关键扩散`);
  }

  const uncertainList = sorted.filter(a => uncertainIds.has(a.id));
  if (uncertainList.length > 0) {
    const uncStr = uncertainList.map(a => `《${a.source}》`).join('、');
    pathParts.push(`其中${uncStr}传播链路存疑`);
  }

  const rest = sorted.filter(a => {
    if (source && a.id === source.id) return false;
    if (keyMediaIds.has(a.id)) return false;
    if (uncertainIds.has(a.id)) return false;
    return true;
  });

  if (rest.length > 0) {
    const last = rest[rest.length - 1];
    pathParts.push(`后续共有${rest.length}家媒体跟进转载，最晚为《${last.source}》${formatDateShort(last.publishTime)}`);
  }

  const overallDur = calcDuration(sorted[0], sorted[sorted.length - 1]);
  if (overallDur) {
    pathParts.push(`整体传播时长约${overallDur}`);
  }

  const adjustedInPath = sorted.filter(a => adjustedIds.has(a.id));
  if (adjustedInPath.length > 0) {
    const names = adjustedInPath.map(a => `《${a.source}》`).join('、');
    pathParts.push(`【注：${names} 位置为人工调整】`);
  }

  return pathParts.join('，') + '。';
}

function formatDateShort(timeStr) {
  if (!timeStr) return '时间未知';
  const d = new Date(timeStr);
  if (isNaN(d.getTime())) return timeStr;
  return `${d.getMonth() + 1}月${d.getDate()}日${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function calcDuration(a, b) {
  if (!a?.publishTime || !b?.publishTime) return null;
  const t1 = new Date(a.publishTime).getTime();
  const t2 = new Date(b.publishTime).getTime();
  const diff = Math.abs(t2 - t1);
  if (diff === 0) return null;
  const hours = diff / (1000 * 60 * 60);
  if (hours >= 1) return `${hours.toFixed(1)}小时`;
  const minutes = diff / (1000 * 60);
  return `${Math.round(minutes)}分钟`;
}

function generateConclusionReport(taskData) {
  const { clientName, keywords, conclusions, candidateChains } = taskData;
  const { source, keyMedia, uncertainNodes, manualJudgment } = conclusions || {};
  
  let report = '';
  report += `【转载核查报告】\n`;
  report += `客户：${clientName || '未填写'}\n`;
  report += `事件关键词：${keywords || '未填写'}\n`;
  report += `生成时间：${new Date().toLocaleString('zh-CN')}\n\n`;
  
  report += `一、传播路径概览（自动生成）\n`;
  report += `  ${generatePropagationPath(taskData)}\n\n`;
  
  report += `二、传播源头判断\n`;
  if (source) {
    report += `  源头媒体：${source.source}\n`;
    report += `  首发时间：${source.publishTime}\n`;
    report += `  原文标题：${source.title}\n`;
  } else {
    report += `  尚未确定\n`;
  }
  report += `\n`;
  
  report += `三、关键扩散媒体\n`;
  if (keyMedia && keyMedia.length > 0) {
    keyMedia.forEach((m, i) => {
      report += `  ${i + 1}. ${m.source}（${m.publishTime}）\n`;
    });
  } else {
    report += `  暂未标记\n`;
  }
  report += `\n`;
  
  report += `四、不确定节点\n`;
  if (uncertainNodes && uncertainNodes.length > 0) {
    uncertainNodes.forEach((m, i) => {
      report += `  ${i + 1}. ${m.source} - 需进一步核实\n`;
    });
  } else {
    report += `  无\n`;
  }
  report += `\n`;
  
  report += `五、人工判断补充\n`;
  report += `  ${manualJudgment || '暂无补充说明'}\n`;
  
  return report;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateMockArticles,
    buildCandidateChains,
    calculateSimilarity,
    stringSimilarity,
    analyzeDifferences,
    detectTitleChange,
    detectSourceChange,
    detectImageChange,
    generateConclusionReport
  };
}
