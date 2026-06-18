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
      changeType: article2.titleDiff || '存在差异'
    },
    paragraphs: {
      same: [],
      modified: [],
      added: [],
      removed: []
    },
    images: {
      change: article2.imageDiff || '无变化',
      originalCount: article1.images.length,
      comparedCount: article2.images.length
    }
  };

  const maxLen = Math.max(article1.paragraphs.length, article2.paragraphs.length);
  for (let i = 0; i < maxLen; i++) {
    const p1 = article1.paragraphs[i] || '';
    const p2 = article2.paragraphs[i] || '';
    
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

function generateConclusionReport(taskData) {
  const { clientName, keywords, conclusions, candidateChains } = taskData;
  const { source, keyMedia, uncertainNodes, manualJudgment } = conclusions;
  
  let report = '';
  report += `【转载核查报告】\n`;
  report += `客户：${clientName || '未填写'}\n`;
  report += `事件关键词：${keywords || '未填写'}\n`;
  report += `生成时间：${new Date().toLocaleString('zh-CN')}\n\n`;
  
  report += `一、传播源头判断\n`;
  if (source) {
    report += `  源头媒体：${source.source}\n`;
    report += `  首发时间：${source.publishTime}\n`;
    report += `  原文标题：${source.title}\n`;
  } else {
    report += `  尚未确定\n`;
  }
  report += `\n`;
  
  report += `二、关键扩散媒体\n`;
  if (keyMedia && keyMedia.length > 0) {
    keyMedia.forEach((m, i) => {
      report += `  ${i + 1}. ${m.source}（${m.publishTime}）\n`;
    });
  } else {
    report += `  暂未标记\n`;
  }
  report += `\n`;
  
  report += `三、不确定节点\n`;
  if (uncertainNodes && uncertainNodes.length > 0) {
    uncertainNodes.forEach((m, i) => {
      report += `  ${i + 1}. ${m.source} - 需进一步核实\n`;
    });
  } else {
    report += `  无\n`;
  }
  report += `\n`;
  
  report += `四、人工判断\n`;
  report += `  ${manualJudgment || '暂无'}\n`;
  
  return report;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateMockArticles,
    buildCandidateChains,
    calculateSimilarity,
    stringSimilarity,
    analyzeDifferences,
    generateConclusionReport
  };
}
