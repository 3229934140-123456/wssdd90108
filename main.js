const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

let taskBasketWin = null;
let compareWin = null;
let conclusionWin = null;

let currentTaskData = {
  clientName: '',
  keywords: '',
  articles: [],
  candidateChains: [],
  selectedArticles: [],
  conclusions: {
    source: null,
    keyMedia: [],
    uncertainNodes: [],
    manualJudgment: ''
  }
};

function createTaskBasketWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  taskBasketWin = new BrowserWindow({
    width: Math.floor(width * 0.45),
    height: Math.floor(height * 0.85),
    x: Math.floor(width * 0.02),
    y: Math.floor(height * 0.05),
    title: '任务篮',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  taskBasketWin.loadFile(path.join(__dirname, 'renderer', 'task-basket', 'index.html'));

  taskBasketWin.on('closed', () => {
    taskBasketWin = null;
  });
}

function createCompareWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  compareWin = new BrowserWindow({
    width: Math.floor(width * 0.5),
    height: Math.floor(height * 0.85),
    x: Math.floor(width * 0.48),
    y: Math.floor(height * 0.05),
    title: '相似稿对照',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  compareWin.loadFile(path.join(__dirname, 'renderer', 'compare', 'index.html'));

  compareWin.on('closed', () => {
    compareWin = null;
  });
}

function createConclusionWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  conclusionWin = new BrowserWindow({
    width: Math.floor(width * 0.4),
    height: Math.floor(height * 0.7),
    x: Math.floor(width * 0.55),
    y: Math.floor(height * 0.1),
    title: '核查结论',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  conclusionWin.loadFile(path.join(__dirname, 'renderer', 'conclusion', 'index.html'));

  conclusionWin.on('closed', () => {
    conclusionWin = null;
  });
}

app.whenReady().then(() => {
  createTaskBasketWindow();
  createCompareWindow();
  createConclusionWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createTaskBasketWindow();
      createCompareWindow();
      createConclusionWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('get-task-data', () => {
  return currentTaskData;
});

ipcMain.handle('update-task-data', (event, data) => {
  currentTaskData = { ...currentTaskData, ...data };
  
  if (compareWin) {
    compareWin.webContents.send('task-data-updated', currentTaskData);
  }
  if (conclusionWin) {
    conclusionWin.webContents.send('task-data-updated', currentTaskData);
  }
  if (taskBasketWin) {
    taskBasketWin.webContents.send('task-data-updated', currentTaskData);
  }
  
  return currentTaskData;
});

ipcMain.handle('open-compare-articles', (event, articles) => {
  currentTaskData.selectedArticles = articles;
  
  if (compareWin) {
    compareWin.focus();
    compareWin.webContents.send('compare-articles', articles);
  }
  
  return true;
});

ipcMain.handle('generate-conclusion', (event, conclusionData) => {
  currentTaskData.conclusions = { ...currentTaskData.conclusions, ...conclusionData };
  
  if (conclusionWin) {
    conclusionWin.focus();
    conclusionWin.webContents.send('load-conclusion', currentTaskData);
  }
  
  return true;
});

ipcMain.handle('focus-window', (event, windowName) => {
  const winMap = {
    'task-basket': taskBasketWin,
    'compare': compareWin,
    'conclusion': conclusionWin
  };
  
  const win = winMap[windowName];
  if (win) {
    win.focus();
  }
  return true;
});
