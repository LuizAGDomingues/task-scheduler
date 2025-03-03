const Store = require('electron-store');

class ActivityLogger {
  constructor() {
    this.store = new Store({
      name: 'task-scheduler-logs'
    });
    
    // Initialize logs array if it doesn't exist
    if (!this.store.has('logs')) {
      this.store.set('logs', []);
    }
  }
  
  // Add a log entry
  addLog(action, taskDetails) {
    const logs = this.getLogs();
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      action: action,
      taskId: taskDetails.id || null,
      taskTitle: taskDetails.title || null,
      details: taskDetails
    };
    
    logs.push(logEntry);
    
    // Keep only the most recent 1000 logs to prevent excessive storage usage
    if (logs.length > 1000) {
      logs.shift(); // Remove the oldest log
    }
    
    this.store.set('logs', logs);
    
    return logEntry;
  }
  
  // Get all logs
  getLogs() {
    return this.store.get('logs');
  }
  
  // Get logs for a specific task
  getTaskLogs(taskId) {
    const logs = this.getLogs();
    return logs.filter(log => log.taskId === taskId);
  }
  
  // Get logs for a specific action type
  getActionLogs(action) {
    const logs = this.getLogs();
    return logs.filter(log => log.action === action);
  }
  
  // Get logs within a date range
  getLogsInRange(startDate, endDate) {
    const logs = this.getLogs();
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    
    return logs.filter(log => {
      const logTime = new Date(log.timestamp).getTime();
      return logTime >= start && logTime <= end;
    });
  }
  
  // Clear all logs
  clearLogs() {
    this.store.set('logs', []);
    return true;
  }
}

module.exports = ActivityLogger;