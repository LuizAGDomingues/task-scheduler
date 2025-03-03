// DOM Elements
const tasksList = document.getElementById('tasksList');
const addTaskBtn = document.getElementById('addTaskBtn');
const taskModal = document.getElementById('taskModal');
const modalTitle = document.getElementById('modalTitle');
const taskForm = document.getElementById('taskForm');
const closeBtn = document.querySelector('.close');
const cancelBtn = document.getElementById('cancelBtn');
const taskIdInput = document.getElementById('taskId');
const taskTitleInput = document.getElementById('taskTitle');
const scheduledDateInput = document.getElementById('scheduledDate');
const scheduledTimeInput = document.getElementById('scheduledTime');
const recurringSelect = document.getElementById('recurring');
const reminderTimeSelect = document.getElementById('reminderTime');
const filterButtons = document.querySelectorAll('.filter-btn');
const themeToggle = document.getElementById('themeToggle');
const themeLabel = document.getElementById('themeLabel');

// Current filter state
let currentFilter = 'all';

// Cronômetro (Timer) - armazena os cronômetros ativos por ID da tarefa
let activeTimers = {};
// Armazena o tempo total acumulado para cada tarefa (em segundos)
let taskTimers = {};

// Load tasks on startup
document.addEventListener('DOMContentLoaded', () => {
  loadTasks();
  initTheme();
});

// Theme toggle functionality
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.body.setAttribute('data-theme', savedTheme);
  themeToggle.checked = savedTheme === 'dark';
  themeLabel.textContent = savedTheme === 'dark' ? 'Dark Mode' : 'Light Mode';
}

themeToggle.addEventListener('change', () => {
  const newTheme = themeToggle.checked ? 'dark' : 'light';
  document.body.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  themeLabel.textContent = newTheme === 'dark' ? 'Dark Mode' : 'Light Mode';
});

// Filter functionality
filterButtons.forEach(button => {
  button.addEventListener('click', () => {
    filterButtons.forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
    currentFilter = button.getAttribute('data-filter');
    loadTasks();
  });
});

// Load and display tasks
async function loadTasks() {
  try {
    const tasks = await window.electronAPI.getTasks();
    
    // Filter tasks based on current selection
    let filteredTasks = tasks;
    if (currentFilter === 'pending') {
      filteredTasks = tasks.filter(task => !task.completed);
    } else if (currentFilter === 'completed') {
      filteredTasks = tasks.filter(task => task.completed);
    }
    
    // Sort tasks by date (upcoming first)
    filteredTasks.sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime));
    
    // Clear the tasks list
    tasksList.innerHTML = '';
    
    if (filteredTasks.length === 0) {
      tasksList.innerHTML = `
        <div class="empty-state">
          <p>No tasks found. Click "Add New Task" to create one.</p>
        </div>
      `;
      return;
    }
    
    // Add each task to the list
    filteredTasks.forEach(task => {
      addTaskToDOM(task);
    });
  } catch (error) {
    console.error('Error loading tasks:', error);
  }
}

// Add a task to the DOM
function addTaskToDOM(task) {
  const taskItem = document.createElement('li');
  taskItem.classList.add('task-item');
  taskItem.setAttribute('data-id', task.id);
  
  const scheduledDate = new Date(task.scheduledTime);
  const formattedDate = scheduledDate.toLocaleDateString();
  const formattedTime = scheduledDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  let recurringBadge = '';
  if (task.recurring) {
    recurringBadge = `<span class="task-recurring">${task.recurring}</span>`;
  }
  
  taskItem.innerHTML = `
    <div class="task-info">
      <div class="task-title ${task.completed ? 'completed' : ''}">
        <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''}>
        <span>${task.title}</span>${recurringBadge}
      </div>
      <div class="task-datetime">${formattedDate} at ${formattedTime}</div>
    </div>
    <div class="task-actions">
      <button class="task-edit">Edit</button>
      <button class="task-delete">Delete</button>
    </div>
  `;
  
  tasksList.appendChild(taskItem);
  
  // Add event listeners
  const checkbox = taskItem.querySelector('.task-checkbox');
  checkbox.addEventListener('change', () => {
    toggleTaskCompletion(task.id);
  });
  
  const editBtn = taskItem.querySelector('.task-edit');
  editBtn.addEventListener('click', () => {
    openEditTaskModal(task);
  });
  
  const deleteBtn = taskItem.querySelector('.task-delete');
  deleteBtn.addEventListener('click', () => {
    deleteTask(task.id);
  });

  addTaskHistoryButton(taskItem, task.id);
}

// Add Task Button Click Event
addTaskBtn.addEventListener('click', openAddTaskModal);

// Close Modal Events
closeBtn.addEventListener('click', closeModal);
cancelBtn.addEventListener('click', closeModal);
window.addEventListener('click', (event) => {
  if (event.target === taskModal) {
    closeModal();
  }
});

// Open Add Task Modal
function openAddTaskModal() {
  modalTitle.textContent = 'Add New Task';
  taskForm.reset();
  taskIdInput.value = '';
  
  // Set default date to today
  const today = new Date();
  const formattedDate = today.toISOString().split('T')[0];
  scheduledDateInput.value = formattedDate;
  
  // Set default time to next hour
  today.setHours(today.getHours() + 1);
  today.setMinutes(0);
  scheduledTimeInput.value = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;
  
  taskModal.style.display = 'block';
  taskTitleInput.focus();
}

// Open Edit Task Modal (continued)
function openEditTaskModal(task) {
  modalTitle.textContent = 'Edit Task';
  taskIdInput.value = task.id;
  taskTitleInput.value = task.title;
  
  const scheduledDate = new Date(task.scheduledTime);
  scheduledDateInput.value = scheduledDate.toISOString().split('T')[0];
  
  const hours = String(scheduledDate.getHours()).padStart(2, '0');
  const minutes = String(scheduledDate.getMinutes()).padStart(2, '0');
  scheduledTimeInput.value = `${hours}:${minutes}`;
  
  recurringSelect.value = task.recurring || '';
  reminderTimeSelect.value = task.reminderTime || '';
  
  taskModal.style.display = 'block';
  taskTitleInput.focus();
}

// Close Modal
function closeModal() {
  taskModal.style.display = 'none';
}

// Save Task Form Submit
taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  
  // Get form values
  const taskId = taskIdInput.value;
  const title = taskTitleInput.value;
  const date = scheduledDateInput.value;
  const time = scheduledTimeInput.value;
  const recurring = recurringSelect.value;
  const reminderTime = reminderTimeSelect.value;
  
  // Create scheduledTime by combining date and time
  const scheduledTime = new Date(`${date}T${time}`).toISOString();
  
  // Create task object
  const task = {
    title,
    scheduledTime,
    recurring: recurring || null,
    reminderTime: reminderTime || null
  };
  
  try {
    // If taskId exists, update task, otherwise add new task
    if (taskId) {
      task.id = taskId;
      await window.electronAPI.updateTask(task);
    } else {
      await window.electronAPI.addTask(task);
    }
    
    // Reload tasks and close modal
    loadTasks();
    closeModal();
  } catch (error) {
    console.error('Error saving task:', error);
  }
});

// Toggle Task Completion
async function toggleTaskCompletion(taskId) {
  try {
    await window.electronAPI.toggleTaskCompletion(taskId);
    loadTasks();
  } catch (error) {
    console.error('Error toggling task completion:', error);
  }
}

// Delete Task
async function deleteTask(taskId) {
  if (confirm('Are you sure you want to delete this task?')) {
    try {
      await window.electronAPI.deleteTask(taskId);
      loadTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  }
}

// Function to handle recurring tasks (will be implemented in future)
function handleRecurringTask(task) {
  // This is a placeholder for future implementation of recurring tasks
  // The idea is to automatically create the next occurrence after completion
  if (task.completed && task.recurring) {
    const scheduledDate = new Date(task.scheduledTime);
    let newDate = new Date(scheduledDate);
    
    // Calculate next occurrence based on recurring type
    switch (task.recurring) {
      case 'daily':
        newDate.setDate(newDate.getDate() + 1);
        break;
      case 'weekly':
        newDate.setDate(newDate.getDate() + 7);
        break;
      case 'monthly':
        newDate.setMonth(newDate.getMonth() + 1);
        break;
    }
    
    // This would create the next occurrence
    // To be implemented in the future
  }
}

// Add this to renderer.js

// Logs functionality
const toggleLogsBtn = document.getElementById('toggleLogsBtn');
const logsContent = document.getElementById('logsContent');
const logsList = document.getElementById('logsList');

toggleLogsBtn.addEventListener('click', () => {
  if (logsContent.style.display === 'block') {
    logsContent.style.display = 'none';
    toggleLogsBtn.textContent = 'Show Logs';
  } else {
    loadLogs();
    logsContent.style.display = 'block';
    toggleLogsBtn.textContent = 'Hide Logs';
  }
});

async function loadLogs() {
  try {
    const logs = await window.electronAPI.getLogs();
    
    // Sort logs by timestamp (newest first)
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Take only the most recent 50 logs
    const recentLogs = logs.slice(0, 50);
    
    // Clear the logs list
    logsList.innerHTML = '';
    
    if (recentLogs.length === 0) {
      logsList.innerHTML = '<li class="log-item">No activity logs yet.</li>';
      return;
    }
    
    // Add each log to the list
    recentLogs.forEach(log => {
      addLogToDOM(log);
    });
  } catch (error) {
    console.error('Error loading logs:', error);
  }
}

function addLogToDOM(log) {
  const logItem = document.createElement('li');
  logItem.classList.add('log-item');
  
  const timestamp = new Date(log.timestamp);
  const formattedDate = timestamp.toLocaleDateString();
  const formattedTime = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  let actionText = log.action;
  switch (log.action) {
    case 'create':
      actionText = 'Created';
      break;
    case 'create_recurring':
      actionText = 'Created (Recurring)';
      break;
    case 'update':
      actionText = 'Updated';
      break;
    case 'delete':
      actionText = 'Deleted';
      break;
    case 'complete':
      actionText = 'Completed';
      break;
    case 'uncomplete':
      actionText = 'Reopened';
      break;
  }
  
  logItem.innerHTML = `
    <span class="log-timestamp">${formattedDate} ${formattedTime}</span>
    <span class="log-action ${log.action}">${actionText}</span>
    <span class="log-details">${log.taskTitle || 'Unknown task'}</span>
  `;
  
  logsList.appendChild(logItem);
}

// Get task logs for a specific task
async function getTaskLogs(taskId) {
  try {
    const logs = await window.electronAPI.getTaskLogs(taskId);
    return logs;
  } catch (error) {
    console.error('Error getting task logs:', error);
    return [];
  }
}

// Add task history button to task items
function addTaskHistoryButton(taskItem, taskId) {
  const actionsDiv = taskItem.querySelector('.task-actions');
  
  const historyBtn = document.createElement('button');
  historyBtn.classList.add('task-history');
  historyBtn.textContent = 'History';
  
  historyBtn.addEventListener('click', async () => {
    const logs = await getTaskLogs(taskId);
    showTaskHistoryModal(logs);
  });
  
  actionsDiv.insertBefore(historyBtn, actionsDiv.firstChild);
}

// Show task history modal
function showTaskHistoryModal(logs) {
  // Implementation for a modal to show task history
  alert(`Task has ${logs.length} history entries. This feature is coming soon!`);
}

// Modify the addTaskToDOM function to add the history button
// Add this line at the end of the function
// 