import React, { useState } from 'react';
import { Plus, Check, X, Edit2, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { useUIStore } from '../stores/uiStore';
import { 
  useTasks, 
  useAddTask, 
  useUpdateTask, 
  useToggleTask, 
  useDeleteTask 
} from '../hooks/useTasks';

interface TaskListProps {
  projectId: string;
}

const TaskList: React.FC<TaskListProps> = ({ projectId }) => {
  const { showCompletedTasks, taskFilter } = useUIStore();
  const { data: tasks = [], isLoading, error } = useTasks(projectId, showCompletedTasks);
  const addTask = useAddTask(projectId);
  const updateTask = useUpdateTask(projectId);
  const toggleTask = useToggleTask(projectId);
  const deleteTask = useDeleteTask(projectId);
  
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'high' | 'medium' | 'low' | undefined>();
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const filteredTasks = tasks.filter(task => {
    if (taskFilter && !task.text.toLowerCase().includes(taskFilter.toLowerCase())) return false;
    return true;
  });

  const activeTasks = filteredTasks.filter(t => !t.completed);
  const completedTasks = filteredTasks.filter(t => t.completed);

  const handleAddTask = async () => {
    if (!newTaskText.trim()) return;
    
    try {
      await addTask.mutateAsync({
        text: newTaskText.trim(),
        priority: newTaskPriority
      });
      setNewTaskText('');
      setNewTaskPriority(undefined);
    } catch (error) {
      console.error('Failed to add task:', error);
    }
  };

  const handleToggleTask = async (taskId: string) => {
    try {
      await toggleTask.mutateAsync(taskId);
    } catch (error) {
      console.error('Failed to toggle task:', error);
    }
  };

  const startEditing = (task: any) => {
    setEditingTask(task.id);
    setEditText(task.text);
  };

  const saveEdit = async () => {
    if (!editText.trim() || !editingTask) return;
    
    try {
      await updateTask.mutateAsync({
        taskId: editingTask,
        updates: { text: editText.trim() }
      });
      setEditingTask(null);
      setEditText('');
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    
    try {
      await deleteTask.mutateAsync(taskId);
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const priorityColors = {
    high: 'text-red-600 dark:text-red-400',
    medium: 'text-yellow-600 dark:text-yellow-400',
    low: 'text-green-600 dark:text-green-400'
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <AlertCircle className="w-6 h-6 text-red-500 mx-auto mb-2" />
          <p className="text-sm text-red-600 dark:text-red-400">Failed to load tasks</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Add New Task */}
      <div className="mb-4">
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={newTaskText}
            onChange={(e) => setNewTaskText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAddTask()}
            placeholder="Add a new task..."
            disabled={addTask.isPending}
            className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            onClick={handleAddTask}
            disabled={!newTaskText.trim() || addTask.isPending}
            className="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {addTask.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setNewTaskPriority(newTaskPriority === 'high' ? undefined : 'high')}
            className={`px-2 py-1 text-xs rounded ${
              newTaskPriority === 'high'
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
            }`}
          >
            High
          </button>
          <button
            onClick={() => setNewTaskPriority(newTaskPriority === 'medium' ? undefined : 'medium')}
            className={`px-2 py-1 text-xs rounded ${
              newTaskPriority === 'medium'
                ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
            }`}
          >
            Medium
          </button>
          <button
            onClick={() => setNewTaskPriority(newTaskPriority === 'low' ? undefined : 'low')}
            className={`px-2 py-1 text-xs rounded ${
              newTaskPriority === 'low'
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
            }`}
          >
            Low
          </button>
        </div>
      </div>

      {/* Active Tasks */}
      {activeTasks.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
            Active ({activeTasks.length})
          </h4>
          <div className="space-y-2">
            {activeTasks.map(task => (
              <div
                key={task.id}
                className="group flex items-start gap-2 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <button
                  onClick={() => handleToggleTask(task.id)}
                  disabled={toggleTask.isPending}
                  className="mt-0.5 p-0.5 border-2 border-gray-300 dark:border-gray-600 rounded hover:border-blue-500 transition-colors disabled:opacity-50"
                >
                  <Check className="w-3 h-3 text-transparent" />
                </button>
                
                {editingTask === task.id ? (
                  <div className="flex-1 flex gap-2">
                    <input
                      type="text"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) saveEdit();
                        if (e.key === 'Escape') setEditingTask(null);
                      }}
                      className="flex-1 px-2 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                    <button
                      onClick={saveEdit}
                      disabled={updateTask.isPending}
                      className="p-1 text-green-600 hover:text-green-700 disabled:opacity-50"
                    >
                      {updateTask.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => setEditingTask(null)}
                      className="p-1 text-red-600 hover:text-red-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1">
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {task.text}
                      </p>
                      {task.priority && (
                        <span className={`text-xs ${priorityColors[task.priority]}`}>
                          {task.priority}
                        </span>
                      )}
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                      <button
                        onClick={() => startEditing(task)}
                        className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        disabled={deleteTask.isPending}
                        className="p-1 text-gray-500 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed Tasks */}
      {showCompletedTasks && completedTasks.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
            Completed ({completedTasks.length})
          </h4>
          <div className="space-y-2">
            {completedTasks.map(task => (
              <div
                key={task.id}
                className="group flex items-start gap-2 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors opacity-60"
              >
                <button
                  onClick={() => handleToggleTask(task.id)}
                  disabled={toggleTask.isPending}
                  className="mt-0.5 p-0.5 bg-blue-600 border-2 border-blue-600 rounded disabled:opacity-50"
                >
                  <Check className="w-3 h-3 text-white" />
                </button>
                <p className="flex-1 text-sm text-gray-500 dark:text-gray-400 line-through">
                  {task.text}
                </p>
                <button
                  onClick={() => handleDeleteTask(task.id)}
                  disabled={deleteTask.isPending}
                  className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {filteredTasks.length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {taskFilter
              ? 'No tasks match your filter'
              : showCompletedTasks
              ? 'No tasks yet. Add one above!'
              : 'No active tasks. Great job!'}
          </p>
        </div>
      )}
    </div>
  );
};

export default TaskList;