const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use the ipcRenderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Task CRUD operations
  getTasks: () => ipcRenderer.invoke('get-tasks'),
  addTask: (task) => ipcRenderer.invoke('add-task', task),
  updateTask: (task) => ipcRenderer.invoke('update-task', task),
  deleteTask: (taskId) => ipcRenderer.invoke('delete-task', taskId),
  toggleTaskCompletion: (taskId) => ipcRenderer.invoke('toggle-task-completion', taskId),
  getLogs: () => ipcRenderer.invoke('get-logs'),
  getTaskLogs: (taskId) => ipcRenderer.invoke('get-task-logs', taskId)
});