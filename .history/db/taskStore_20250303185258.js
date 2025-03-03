const Store = require('electron-store');
const { v4: uuidv4 } = require('uuid');

class TaskStore {
  constructor() {
    this.store = new Store({
      name: 'task-scheduler-data'
    });
    
    // Initialize tasks array if it doesn't exist
    if (!this.store.has('tasks')) {
      this.store.set('tasks', []);
    }
  }
  
  // Get all tasks
  getTasks() {
    return this.store.get('tasks');
  }
  
  // Add a new task
  addTask(taskData) {
    const tasks = this.getTasks();
    
    const newTask = {
      id: uuidv4(),
      title: taskData.title,
      scheduledTime: taskData.scheduledTime,
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      recurring: taskData.recurring || null,
      reminderTime: taskData.reminderTime || null,
      elapsedTime: taskData.elapsedTime || 0
    };
    
    tasks.push(newTask);
    this.store.set('tasks', tasks);
    
    return newTask;
  }
  
  // Update an existing task
  updateTask(updatedTask) {
    const tasks = this.getTasks();
    const index = tasks.findIndex(task => task.id === updatedTask.id);
    
    if (index !== -1) {
      tasks[index] = {
        ...tasks[index],
        ...updatedTask,
        updatedAt: new Date().toISOString()
      };
      
      this.store.set('tasks', tasks);
      return tasks[index];
    }
    
    return null;
  }
  
  // Delete a task
  deleteTask(taskId) {
    const tasks = this.getTasks();
    const filteredTasks = tasks.filter(task => task.id !== taskId);
    
    this.store.set('tasks', filteredTasks);
    return true;
  }
  
  // Toggle task completion status
  toggleTaskCompletion(taskId) {
    const tasks = this.getTasks();
    const index = tasks.findIndex(task => task.id === taskId);
    
    if (index !== -1) {
      tasks[index].completed = !tasks[index].completed;
      tasks[index].updatedAt = new Date().toISOString();
      
      this.store.set('tasks', tasks);
      return tasks[index];
    }
    
    return null;
  }
  
  // Get tasks filtered by status
  getTasksByStatus(completed) {
    const tasks = this.getTasks();
    return tasks.filter(task => task.completed === completed);
  }
  
  // Get tasks sorted by scheduled time
  getTasksSortedByTime() {
    const tasks = this.getTasks();
    return tasks.sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime));
  }
}

module.exports = TaskStore;