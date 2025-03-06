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

// Elementos de filtro de data
const dateFilterStart = document.getElementById('dateFilterStart');
const timeFilterStart = document.getElementById('timeFilterStart');
const dateFilterEnd = document.getElementById('dateFilterEnd');
const timeFilterEnd = document.getElementById('timeFilterEnd');
const applyDateFilterBtn = document.getElementById('applyDateFilterBtn');
const clearDateFilterBtn = document.getElementById('clearDateFilterBtn');

// Current filter state
let currentFilter = 'all';
// Filtros de data (null significa sem filtro)
let dateFilterActive = false;
let startDateTime = null;
let endDateTime = null;

// Cronômetro (Timer) - armazena os cronômetros ativos por ID da tarefa
let activeTimers = {};
// Armazena o tempo total acumulado para cada tarefa (em segundos)
let taskTimers = {};

// Adicione variáveis para manipular o modal de histórico no topo do arquivo, junto com as outras variáveis DOM
const historyModal = document.getElementById('historyModal');
const historyModalTitle = document.getElementById('historyModalTitle');
const historyList = document.getElementById('historyList');
const taskHistoryInfo = document.getElementById('taskHistoryInfo');
const closeHistoryBtn = document.getElementById('closeHistoryBtn');
const historyCloseX = document.querySelector('.history-close');

// Load tasks on startup
document.addEventListener('DOMContentLoaded', () => {
  loadTasks();
  initTheme();
  initDateFilters();
});

// Salva os tempos acumulados quando o usuário fechar a página
window.addEventListener('beforeunload', async () => {
  // Para cada cronômetro ativo, salva o tempo acumulado
  for (const taskId in activeTimers) {
    if (activeTimers[taskId]) {
      await pauseTaskTimer(taskId);
    }
  }
});

// Theme toggle functionality
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.body.setAttribute('data-theme', savedTheme);
  themeToggle.checked = savedTheme === 'dark';
  themeLabel.textContent = savedTheme === 'dark' ? 'Modo Escuro' : 'Modo Claro';
}

themeToggle.addEventListener('change', () => {
  const newTheme = themeToggle.checked ? 'dark' : 'light';
  document.body.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  themeLabel.textContent = newTheme === 'dark' ? 'Modo Escuro' : 'Modo Claro';
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
    
    // Primeiro vamos pausar qualquer cronômetro ativo
    Object.keys(activeTimers).forEach(taskId => {
      clearInterval(activeTimers[taskId]);
      delete activeTimers[taskId];
    });
    
    // Limpa o objeto de tempos acumulados
    taskTimers = {};
    
    // Filter tasks based on current selection
    let filteredTasks = tasks;
    if (currentFilter === 'pending') {
      filteredTasks = tasks.filter(task => !task.completed);
    } else if (currentFilter === 'completed') {
      filteredTasks = tasks.filter(task => task.completed);
    }
    
    // Aplica o filtro de data, se estiver ativo
    if (dateFilterActive && startDateTime && endDateTime) {
      filteredTasks = filteredTasks.filter(task => {
        const taskDate = new Date(task.scheduledTime);
        // Verifica se a data/hora da tarefa está dentro do intervalo selecionado
        return taskDate >= startDateTime && taskDate <= endDateTime;
      });
    }
    
    // Sort tasks by date (upcoming first)
    filteredTasks.sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime));
    
    // Clear the tasks list
    tasksList.innerHTML = '';
    
    if (filteredTasks.length === 0) {
      tasksList.innerHTML = `
        <div class="empty-state">
          <p>Nenhuma tarefa encontrada. Clique em "Nova Tarefa" para criar uma.</p>
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
  
  // Formata o tempo decorrido se existir
  const elapsedTime = task.elapsedTime || 0;
  const formattedElapsedTime = formatTime(elapsedTime);
  
  taskItem.innerHTML = `
    <div class="task-info">
      <div class="task-title ${task.completed ? 'completed' : ''}">
        <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''}>
        <span>${task.title}</span>${recurringBadge}
      </div>
      <div class="task-datetime">${formattedDate} às ${formattedTime}</div>
      <div class="task-timer-container">
        <span class="task-timer-display">${formattedElapsedTime}</span>
      </div>
    </div>
    <div class="task-actions">
      <button class="task-timer" ${task.completed ? 'disabled' : ''}>Cronometrar</button>
      <button class="task-edit" ${task.completed ? 'disabled' : ''}>Editar</button>
      <button class="task-delete">Excluir</button>
    </div>
  `;
  
  tasksList.appendChild(taskItem);
  
  // Add event listeners
  const checkbox = taskItem.querySelector('.task-checkbox');
  checkbox.addEventListener('change', () => {
    // Pausa o cronômetro se a tarefa for marcada como concluída
    if (checkbox.checked && activeTimers[task.id]) {
      pauseTaskTimer(task.id);
    }
    toggleTaskCompletion(task.id);
  });
  
  const editBtn = taskItem.querySelector('.task-edit');
  if (!task.completed) {
    editBtn.addEventListener('click', () => {
      openEditTaskModal(task);
    });
  }
  
  const deleteBtn = taskItem.querySelector('.task-delete');
  deleteBtn.addEventListener('click', () => {
    // Pausa o cronômetro antes de excluir a tarefa
    if (activeTimers[task.id]) {
      pauseTaskTimer(task.id);
    }
    deleteTask(task.id);
  });
  
  // Adiciona listener para o botão do cronômetro
  const timerBtn = taskItem.querySelector('.task-timer');
  if (!task.completed) {
    timerBtn.addEventListener('click', () => {
      toggleTaskTimer(task.id);
    });
  }
  
  // Inicializa o timer no objeto global
  taskTimers[task.id] = task.elapsedTime || 0;

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
  taskForm.reset();
  
  // Set default date to today
  const today = new Date().toISOString().split('T')[0];
  scheduledDateInput.value = today;
  
  modalTitle.textContent = 'Nova Tarefa';
  taskModal.style.display = 'block';
}

// Open Edit Task Modal
function openEditTaskModal(task) {
  taskForm.reset();
  
  // Fill the form with task details
  taskIdInput.value = task.id;
  taskTitleInput.value = task.title;
  
  const scheduledDate = new Date(task.scheduledTime);
  scheduledDateInput.value = scheduledDate.toISOString().split('T')[0];
  
  const hours = scheduledDate.getHours().toString().padStart(2, '0');
  const minutes = scheduledDate.getMinutes().toString().padStart(2, '0');
  scheduledTimeInput.value = `${hours}:${minutes}`;
  
  recurringSelect.value = task.recurring || '';
  reminderTimeSelect.value = task.reminderTime || '';
  
  modalTitle.textContent = 'Editar Tarefa';
  taskModal.style.display = 'block';
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
      
      // Preserva o tempo acumulado na tarefa
      const tasks = await window.electronAPI.getTasks();
      const existingTask = tasks.find(t => t.id === taskId);
      if (existingTask && existingTask.elapsedTime) {
        task.elapsedTime = existingTask.elapsedTime;
      }
      
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
    
    // Após alterar o status da tarefa, precisamos atualizar a interface
    const tasks = await window.electronAPI.getTasks();
    const task = tasks.find(t => t.id === taskId);
    
    if (task) {
      const taskItem = document.querySelector(`.task-item[data-id="${taskId}"]`);
      
      if (taskItem) {
        // Se a tarefa foi concluída, desativa os botões de edição e cronômetro
        if (task.completed) {
          // Se o cronômetro estiver ativo, pause-o
          if (activeTimers[taskId]) {
            pauseTaskTimer(taskId);
          }
          
          // Desabilita botões
          const editBtn = taskItem.querySelector('.task-edit');
          editBtn.setAttribute('disabled', true);
          editBtn.replaceWith(editBtn.cloneNode(true)); // Remove event listeners
          
          const timerBtn = taskItem.querySelector('.task-timer');
          timerBtn.setAttribute('disabled', true);
          timerBtn.replaceWith(timerBtn.cloneNode(true)); // Remove event listeners
          
          // Atualiza visualmente o título
          const titleEl = taskItem.querySelector('.task-title');
          titleEl.classList.add('completed');
        } else {
          // Se a tarefa foi reaberta, habilita os botões
          const editBtn = taskItem.querySelector('.task-edit');
          editBtn.removeAttribute('disabled');
          
          // Adiciona event listener no botão de editar
          editBtn.addEventListener('click', async () => {
            const currentTask = (await window.electronAPI.getTasks()).find(t => t.id === taskId);
            if (currentTask) {
              openEditTaskModal(currentTask);
            }
          });
          
          const timerBtn = taskItem.querySelector('.task-timer');
          timerBtn.removeAttribute('disabled');
          
          // Adiciona event listener no botão do cronômetro
          timerBtn.addEventListener('click', () => {
            toggleTaskTimer(taskId);
          });
          
          // Atualiza visualmente o título
          const titleEl = taskItem.querySelector('.task-title');
          titleEl.classList.remove('completed');
        }
        
        // Atualiza o estado do checkbox
        const checkbox = taskItem.querySelector('.task-checkbox');
        checkbox.checked = task.completed;
      }
    }
    
    // Por fim, recarrega as tarefas para garantir consistência
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

// Logs functionality
const toggleLogsBtn = document.getElementById('toggleLogsBtn');
const logsContent = document.getElementById('logsContent');
const logsList = document.getElementById('logsList');

toggleLogsBtn.addEventListener('click', () => {
  const logsContent = document.getElementById('logsContent');
  
  if (logsContent.style.display === 'none' || !logsContent.style.display) {
    logsContent.style.display = 'block';
    toggleLogsBtn.textContent = 'Ocultar Registros';
    loadLogs();
  } else {
    logsContent.style.display = 'none';
    toggleLogsBtn.textContent = 'Mostrar Registros';
  }
});

async function loadLogs() {
  try {
    const logs = await window.electronAPI.getLogs();
    
    // Take only the most recent 50 logs
    const recentLogs = logs.slice(0, 50);
    
    // Clear the logs list
    logsList.innerHTML = '';
    
    if (recentLogs.length === 0) {
      logsList.innerHTML = '<li class="log-item">Nenhum registro de atividade ainda.</li>';
      return;
    }
    
    // Add each log to the list
    recentLogs.forEach(log => {
      addLogToDOM(log);
    });
  } catch (error) {
    console.error('Erro ao carregar logs:', error);
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
      actionText = 'Criada';
      break;
    case 'create_recurring':
      actionText = 'Criada (Recorrente)';
      break;
    case 'update':
      actionText = 'Atualizada';
      break;
    case 'delete':
      actionText = 'Excluída';
      break;
    case 'complete':
      actionText = 'Concluída';
      break;
    case 'uncomplete':
      actionText = 'Reaberta';
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
  historyBtn.textContent = 'Histórico';
  
  historyBtn.addEventListener('click', async () => {
    const logs = await getTaskLogs(taskId);
    showTaskHistoryModal(logs, taskId);
  });
  
  actionsDiv.insertBefore(historyBtn, actionsDiv.firstChild);
}

// Show task history modal
function showTaskHistoryModal(logs, taskId) {
  // Limpa o conteúdo anterior
  historyList.innerHTML = '';
  
  // Obtém os detalhes da tarefa, se disponíveis
  let taskTitle = '';
  
  if (logs.length > 0 && logs[0].taskTitle) {
    taskTitle = logs[0].taskTitle;
  }
  
  // Atualiza o título do modal
  historyModalTitle.textContent = `Histórico da Tarefa${taskTitle ? ': ' + taskTitle : ''}`;
  
  // Adiciona informações gerais sobre a tarefa
  taskHistoryInfo.innerHTML = `
    <p>Esta tarefa possui <strong>${logs.length}</strong> ${logs.length === 1 ? 'registro' : 'registros'} no histórico.</p>
  `;
  
  if (logs.length === 0) {
    historyList.innerHTML = '<li class="history-item"><span>Nenhum registro de histórico encontrado.</span></li>';
  } else {
    // Ordena os logs por data (mais recentes primeiro)
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Adiciona cada entrada de log à lista
    logs.forEach(log => {
      const historyItem = document.createElement('li');
      historyItem.classList.add('history-item');
      
      const timestamp = new Date(log.timestamp);
      const formattedDate = timestamp.toLocaleDateString();
      const formattedTime = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      let actionText = log.action;
      switch (log.action) {
        case 'create':
          actionText = 'Criada';
          break;
        case 'create_recurring':
          actionText = 'Recorrente';
          break;
        case 'update':
          actionText = 'Atualizada';
          break;
        case 'delete':
          actionText = 'Excluída';
          break;
        case 'complete':
          actionText = 'Concluída';
          break;
        case 'uncomplete':
          actionText = 'Reaberta';
          break;
        case 'timer_started':
          actionText = 'Cronômetro Iniciado';
          break;
        case 'timer_paused':
          actionText = 'Cronômetro Pausado';
          break;
      }
      
      // Formata detalhes adicionais se disponíveis
      let details = '';
      if (log.details) {
        // Se log.details for um objeto, converte para string amigável
        if (typeof log.details === 'object' && log.details !== null) {
          try {
            details = JSON.stringify(log.details);
          } catch (e) {
            details = 'Detalhes disponíveis';
          }
        } else {
          details = log.details;
        }
      } else if (log.action === 'timer_started') {
        details = 'Cronômetro iniciado';
      } else if (log.action === 'timer_paused') {
        details = `Cronômetro pausado. Tempo total: ${formatTime(log.elapsedTime || 0)}`;
      } else if (log.action === 'create' || log.action === 'create_recurring') {
        details = `Tarefa criada${log.action === 'create_recurring' ? ' (recorrente)' : ''}`;
      } else if (log.action === 'update') {
        details = 'Detalhes da tarefa atualizados';
      } else if (log.action === 'complete') {
        details = 'Tarefa marcada como concluída';
      } else if (log.action === 'uncomplete') {
        details = 'Tarefa reaberta';
      } else if (log.action === 'delete') {
        details = 'Tarefa removida';
      }
      
      historyItem.innerHTML = `
        <div class="history-timestamp">${formattedDate} ${formattedTime}</div>
        <div class="history-action ${log.action}">${actionText}</div>
        <div class="history-details">${details}</div>
      `;
      
      historyList.appendChild(historyItem);
    });
  }
  
  // Exibe o modal
  historyModal.style.display = 'block';
}

// Eventos para fechar o modal de histórico
closeHistoryBtn.addEventListener('click', () => {
  historyModal.style.display = 'none';
});

historyCloseX.addEventListener('click', () => {
  historyModal.style.display = 'none';
});

window.addEventListener('click', (event) => {
  if (event.target === historyModal) {
    historyModal.style.display = 'none';
  }
});

// Funções do cronômetro (timer)

// Iniciar o cronômetro para uma tarefa específica
async function startTaskTimer(taskId) {
  if (activeTimers[taskId]) {
    // O cronômetro já está ativo
    return;
  }
  
  // Inicializa o tempo se não existir
  if (!taskTimers[taskId]) {
    taskTimers[taskId] = 0;
  }
  
  const timerDisplay = document.querySelector(`.task-item[data-id="${taskId}"] .task-timer-display`);
  
  // Inicia um intervalo que atualiza o cronômetro a cada segundo
  const startTime = Date.now() - (taskTimers[taskId] * 1000); // Ajusta para o tempo acumulado
  
  activeTimers[taskId] = setInterval(() => {
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    taskTimers[taskId] = elapsedSeconds;
    
    // Atualiza o display do cronômetro
    if (timerDisplay) {
      timerDisplay.textContent = formatTime(elapsedSeconds);
    }
  }, 1000);
  
  // Atualiza o visual do botão de controle do timer
  const timerBtn = document.querySelector(`.task-item[data-id="${taskId}"] .task-timer`);
  if (timerBtn) {
    timerBtn.textContent = 'Pausar';
    timerBtn.classList.add('active');
  }
  
  // Registra o evento no histórico
  try {
    // Busca a tarefa para obter o título
    const tasks = await window.electronAPI.getTasks();
    const task = tasks.find(t => t.id === taskId);
    
    if (task) {
      // Registra o evento no log de atividades
      await window.electronAPI.addLog({
        taskId: taskId,
        taskTitle: task.title,
        action: 'timer_started',
        details: 'Cronômetro iniciado',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Erro ao registrar evento de início do cronômetro:', error);
  }
}

// Pausar o cronômetro para uma tarefa específica
async function pauseTaskTimer(taskId) {
  if (!activeTimers[taskId]) {
    // O cronômetro não está ativo
    return;
  }
  
  // Para o intervalo
  clearInterval(activeTimers[taskId]);
  delete activeTimers[taskId];
  
  // Atualiza o visual do botão de controle do timer
  const timerBtn = document.querySelector(`.task-item[data-id="${taskId}"] .task-timer`);
  if (timerBtn) {
    timerBtn.textContent = 'Cronometrar';
    timerBtn.classList.remove('active');
  }
  
  // Salva o tempo decorrido no banco de dados
  await updateTaskElapsedTime(taskId, taskTimers[taskId]);
  
  // Registra o evento no histórico
  try {
    // Busca a tarefa para obter o título
    const tasks = await window.electronAPI.getTasks();
    const task = tasks.find(t => t.id === taskId);
    
    if (task) {
      // Registra o evento no log de atividades
      await window.electronAPI.addLog({
        taskId: taskId,
        taskTitle: task.title,
        action: 'timer_paused',
        details: `Cronômetro pausado. Tempo total: ${formatTime(taskTimers[taskId])}`,
        elapsedTime: taskTimers[taskId],
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Erro ao registrar evento de pausa do cronômetro:', error);
  }
}

// Atualiza o tempo decorrido de uma tarefa no banco de dados
async function updateTaskElapsedTime(taskId, elapsedTime) {
  try {
    // Busca a tarefa atual para manter outros atributos
    const tasks = await window.electronAPI.getTasks();
    const task = tasks.find(t => t.id === taskId);
    
    if (task) {
      task.elapsedTime = elapsedTime;
      await window.electronAPI.updateTask(task);
    }
  } catch (error) {
    console.error('Erro ao atualizar o tempo da tarefa:', error);
  }
}

// Formata o tempo em segundos para uma string legível (HH:MM:SS)
function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Alterna o estado do cronômetro (iniciar/pausar)
async function toggleTaskTimer(taskId) {
  if (activeTimers[taskId]) {
    await pauseTaskTimer(taskId);
  } else {
    startTaskTimer(taskId);
  }
}

// Inicializa os campos de filtro de data/hora com valores padrão
function initDateFilters() {
  // Define a data atual como valor padrão
  const today = new Date();
  const formattedDate = today.toISOString().split('T')[0];
  
  // Configura o filtro de início para o início do dia atual
  dateFilterStart.value = formattedDate;
  timeFilterStart.value = '00:00';
  
  // Configura o filtro de fim para o final do dia atual
  dateFilterEnd.value = formattedDate;
  timeFilterEnd.value = '23:59';
}

// Event listeners para os filtros de data
applyDateFilterBtn.addEventListener('click', () => {
  // Verifica se todos os campos de data e hora estão preenchidos
  if (dateFilterStart.value && timeFilterStart.value && 
      dateFilterEnd.value && timeFilterEnd.value) {
    
    // Cria objetos Date para as datas/horas de início e fim
    startDateTime = new Date(`${dateFilterStart.value}T${timeFilterStart.value}`);
    endDateTime = new Date(`${dateFilterEnd.value}T${timeFilterEnd.value}`);
    
    // Ativa o filtro de data
    dateFilterActive = true;
    
    // Recarrega as tarefas com o novo filtro
    loadTasks();
  } else {
    alert('Por favor, preencha todos os campos de data e hora.');
  }
});

clearDateFilterBtn.addEventListener('click', () => {
  // Desativa o filtro de data
  dateFilterActive = false;
  startDateTime = null;
  endDateTime = null;
  
  // Reinicia os valores para o padrão
  initDateFilters();
  
  // Recarrega as tarefas sem o filtro de data
  loadTasks();
}); 