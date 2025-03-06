const { app, BrowserWindow, ipcMain, Menu, Tray } = require('electron');
const path = require('path');
const notifier = require('node-notifier');
const TaskStore = require('./db/taskStore');
const ActivityLogger = require('./db/activityLog');

let mainWindow;
let tray = null;
let taskStore;
let activityLogger;
let notificationTimers = {};

// Initialize the task store
function initializeTaskStore() {
  taskStore = new TaskStore();
  activityLogger = new ActivityLogger();
  scheduleNotificationsForTasks();
}

// Schedule notifications for existing tasks
function scheduleNotificationsForTasks() {
  // Clear existing timers
  Object.values(notificationTimers).forEach(timer => clearTimeout(timer));
  notificationTimers = {};
  
  const tasks = taskStore.getTasks();
  tasks.forEach(task => {
    if (!task.completed) {
      scheduleNotification(task);
    }
  });
}

// Schedule a notification for a single task
function scheduleNotification(task) {
  const now = new Date().getTime();
  const scheduledTime = new Date(task.scheduledTime).getTime();
  
  // Only schedule if the time is in the future
  if (scheduledTime > now) {
    const timeUntilNotification = scheduledTime - now;
    
    // Schedule the main notification
    notificationTimers[task.id] = setTimeout(() => {
      showNotification(task, false);
    }, timeUntilNotification);
    
    // Schedule reminder if set
    if (task.reminderTime) {
      const reminderMinutes = parseInt(task.reminderTime);
      const reminderTime = scheduledTime - (reminderMinutes * 60 * 1000);
      
      // Only schedule reminder if it's still in the future
      if (reminderTime > now) {
        const timeUntilReminder = reminderTime - now;
        
        notificationTimers[`${task.id}_reminder`] = setTimeout(() => {
          showNotification(task, true);
        }, timeUntilReminder);
        
        console.log(`Scheduled reminder for task "${task.title}" in ${timeUntilReminder}ms (${reminderMinutes} minutes before)`);
      }
    }
    
    console.log(`Scheduled notification for task "${task.title}" in ${timeUntilNotification}ms`);
  }
}

// Modify the showNotification function to handle reminders
function showNotification(task, isReminder) {
  notifier.notify({
    title: isReminder ? 'Lembrete de Tarefa' : 'Tarefa Agendada para Agora',
    message: isReminder ? 
      `Lembrete: "${task.title}" está agendada para daqui a ${task.reminderTime} minutos` : 
      task.title,
    icon: path.join(__dirname, 'icon.png'),
    sound: true,
    wait: true
  });
}

// Show a Windows notification
function showNotification(task) {
  notifier.notify({
    title: 'Lembrete de Tarefa',
    message: task.title,
    icon: path.join(__dirname, 'icon.png'),
    sound: true,
    wait: true
  });
}

// Create the main application window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'icon.png')
  });

  mainWindow.loadFile('index.html');
  
  // Create system tray icon
  tray = new Tray(path.join(__dirname, 'icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Open', 
      click: () => { mainWindow.show(); } 
    },
    { 
      label: 'Quit', 
      click: () => { app.quit(); } 
    }
  ]);
  
  tray.setToolTip('Task Scheduler');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
  
  mainWindow.on('close', (event) => {
    if (app.quitting) {
      mainWindow = null;
    } else {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}


// Handle recurring tasks
function handleRecurringTasks() {
  const tasks = taskStore.getTasks();
  const now = new Date();
  const updatedTasks = [];
  
  tasks.forEach(task => {
    if (task.completed && task.recurring) {
      const scheduledDate = new Date(task.scheduledTime);
      
      // If the scheduled time is in the past and the task is complete with a recurring setting
      if (scheduledDate < now) {
        let newDate = new Date(scheduledDate);
        
        // Calculate next occurrence based on recurring type
        switch (task.recurring) {
          case 'daily':
            newDate.setDate(newDate.getDate() + 1);
            // Keep moving forward until we get a future date
            while (newDate < now) {
              newDate.setDate(newDate.getDate() + 1);
            }
            break;
          case 'weekly':
            newDate.setDate(newDate.getDate() + 7);
            // Keep moving forward until we get a future date
            while (newDate < now) {
              newDate.setDate(newDate.getDate() + 7);
            }
            break;
          case 'monthly':
            newDate.setMonth(newDate.getMonth() + 1);
            // Keep moving forward until we get a future date
            while (newDate < now) {
              newDate.setMonth(newDate.getMonth() + 1);
            }
            break;
        }
        
        // Create a new task for the next occurrence
        const newTask = {
          title: task.title,
          scheduledTime: newDate.toISOString(),
          recurring: task.recurring,
          reminderTime: task.reminderTime
        };
        
        // Add the new task
        const addedTask = taskStore.addTask(newTask);
        updatedTasks.push(addedTask);
        
        // Schedule notification for the new task
        scheduleNotification(addedTask);
      }
    }
  });
  
  return updatedTasks;
}

// App ready event
app.whenReady().then(() => {
  initializeTaskStore();
  createWindow();
  handleRecurringTasks();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// App quit events
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.quitting = true;
});

// IPC Communication with Renderer
ipcMain.handle('get-tasks', async () => {
  return taskStore.getTasks();
});

ipcMain.handle('add-task', async (event, task) => {
  const newTask = taskStore.addTask(task);
  scheduleNotification(newTask);
  
  // Log the action
  activityLogger.addLog('create', newTask);
  
  return newTask;
});

ipcMain.handle('update-task', async (event, task, updateType = 'update') => {
  const updatedTask = taskStore.updateTask(task);
  
  // Clear existing notification timer
  if (notificationTimers[task.id]) {
    clearTimeout(notificationTimers[task.id]);
    delete notificationTimers[task.id];
  }
  
  // Clear reminder timer if it exists
  if (notificationTimers[`${task.id}_reminder`]) {
    clearTimeout(notificationTimers[`${task.id}_reminder`]);
    delete notificationTimers[`${task.id}_reminder`];
  }
  
  // Schedule a new notification if the task is not completed
  if (!updatedTask.completed) {
    scheduleNotification(updatedTask);
  }
  
  // Log the action usando o tipo específico de atualização
  // Somente registra logs para atualizações não silenciosas
  if (updateType !== 'silent_update') {
    activityLogger.addLog(updateType, updatedTask);
  }
  
  return updatedTask;
});

ipcMain.handle('delete-task', async (event, taskId) => {
  // Get the task before deletion for logging
  const task = taskStore.getTasks().find(t => t.id === taskId);
  
  // Clear the notification timer
  if (notificationTimers[taskId]) {
    clearTimeout(notificationTimers[taskId]);
    delete notificationTimers[taskId];
  }
  
  // Clear reminder timer if it exists
  if (notificationTimers[`${taskId}_reminder`]) {
    clearTimeout(notificationTimers[`${taskId}_reminder`]);
    delete notificationTimers[`${taskId}_reminder`];
  }
  
  const result = taskStore.deleteTask(taskId);
  
  // Log the action
  if (task) {
    activityLogger.addLog('delete', task);
  }
  
  return result;
});

ipcMain.handle('toggle-task-completion', async (event, taskId) => {
  const updatedTask = taskStore.toggleTaskCompletion(taskId);
  
  // Clear the notification timer if task is completed
  if (updatedTask.completed) {
    if (notificationTimers[taskId]) {
      clearTimeout(notificationTimers[taskId]);
      delete notificationTimers[taskId];
    }
    
    // Clear reminder timer if it exists
    if (notificationTimers[`${taskId}_reminder`]) {
      clearTimeout(notificationTimers[`${taskId}_reminder`]);
      delete notificationTimers[`${taskId}_reminder`];
    }
    
    // Log completion
    activityLogger.addLog('complete', updatedTask);
    
    // Handle recurring tasks
    if (updatedTask.recurring) {
      const recurredTask = createRecurringTask(updatedTask);
      if (recurredTask) {
        activityLogger.addLog('create_recurring', recurredTask);
      }
    }
  } else {
    // Schedule notification if task is uncompleted
    scheduleNotification(updatedTask);
    
    // Log uncompletion
    activityLogger.addLog('uncomplete', updatedTask);
  }
  
  return updatedTask;
});

ipcMain.handle('get-logs', async () => {
  return activityLogger.getLogs();
});

ipcMain.handle('get-task-logs', async (event, taskId) => {
  return activityLogger.getTaskLogs(taskId);
});

// Helper function to create recurring tasks
function createRecurringTask(completedTask) {
  const now = new Date();
  const scheduledDate = new Date(completedTask.scheduledTime);
  let newDate = new Date(scheduledDate);
  
  // Calculate next occurrence based on recurring type
  switch (completedTask.recurring) {
    case 'daily':
      newDate.setDate(newDate.getDate() + 1);
      // Keep moving forward until we get a future date
      while (newDate < now) {
        newDate.setDate(newDate.getDate() + 1);
      }
      break;
    case 'weekly':
      newDate.setDate(newDate.getDate() + 7);
      // Keep moving forward until we get a future date
      while (newDate < now) {
        newDate.setDate(newDate.getDate() + 7);
      }
      break;
    case 'monthly':
      newDate.setMonth(newDate.getMonth() + 1);
      // Keep moving forward until we get a future date
      while (newDate < now) {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      break;
  }
  
  // Create a new task for the next occurrence
  const newTask = {
    title: completedTask.title,
    scheduledTime: newDate.toISOString(),
    recurring: completedTask.recurring,
    reminderTime: completedTask.reminderTime
  };
  
  // Add the new task
  const addedTask = taskStore.addTask(newTask);
  
  // Schedule notification for the new task
  scheduleNotification(addedTask);
  
  return addedTask;
}

// Rota para adicionar um log customizado
ipcMain.handle('add-log', async (event, logEntry) => {
  // Cria um objeto de log compatível com o que o activityLogger.addLog espera
  const log = activityLogger.addLog(logEntry.action, {
    id: logEntry.taskId,
    title: logEntry.taskTitle,
    details: logEntry.details,
    elapsedTime: logEntry.elapsedTime
  });
  
  return log;
});