import { Task } from "@/lib/types";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

interface TaskListProps {
  tasks: Task[];
  loanId: number;
}

const taskSchema = z.object({
  description: z.string().min(1, "Task description is required"),
  priority: z.string().min(1, "Priority is required"),
  dueDate: z.string().optional(),
  completed: z.boolean().default(false)
});

export default function TaskList({ tasks, loanId }: TaskListProps) {
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const { toast } = useToast();
  
  const form = useForm<z.infer<typeof taskSchema>>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      description: "",
      priority: "medium",
      dueDate: format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'), // Default to 1 week from now
      completed: false
    }
  });
  
  const onSubmit = async (data: z.infer<typeof taskSchema>) => {
    try {
      await apiRequest("POST", `/api/loans/${loanId}/tasks`, data);
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
      setIsAddTaskOpen(false);
      form.reset();
      toast({
        title: "Task added",
        description: "The task has been added successfully."
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add task. Please try again.",
        variant: "destructive"
      });
    }
  };
  
  const toggleTaskCompletion = async (taskId: number, completed: boolean) => {
    try {
      await apiRequest("PATCH", `/api/tasks/${taskId}`, { completed });
      queryClient.invalidateQueries({ queryKey: [`/api/loans/${loanId}`] });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update task. Please try again.",
        variant: "destructive"
      });
    }
  };
  
  // Sort tasks - incomplete tasks first, then by due date
  const sortedTasks = [...tasks].sort((a, b) => {
    // First by completion status
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }
    
    // Then by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] || 1;
    const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] || 1;
    
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }
    
    // Then by due date
    if (a.dueDate && b.dueDate) {
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    }
    
    return 0;
  });
  
  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border border-gray-100" data-component="task-list">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-100 flex justify-between items-center">
          <div>
            <h3 className="text-lg leading-6 font-heading font-medium text-gray-900 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Action Items
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Tasks to complete for this loan file
            </p>
          </div>
          <Button 
            onClick={() => setIsAddTaskOpen(true)}
            variant="outline"
            className="border-amber-300 text-amber-600 hover:bg-amber-50"
            size="sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 mr-1">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Add task
          </Button>
        </div>
        <div className="px-4 py-1">
          <div className="divide-y divide-gray-100">
            {sortedTasks.map((task) => (
              <div key={task.id} className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Checkbox 
                      id={`task-${task.id}`}
                      checked={task.completed}
                      onCheckedChange={(checked) => toggleTaskCompletion(task.id, checked as boolean)}
                      className={`h-4 w-4 rounded ${task.priority === 'high' ? 'text-red-500' : 'text-blue-500'}`}
                    />
                    <label 
                      htmlFor={`task-${task.id}`} 
                      className={`ml-3 block text-sm font-medium ${task.completed ? 'text-gray-400 line-through' : 'text-gray-700'}`}
                    >
                      {task.description}
                      {task.priority === 'high' && 
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                          High Priority
                        </span>
                      }
                      {task.priority === 'medium' && 
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                          Medium
                        </span>
                      }
                    </label>
                  </div>
                  <div className="ml-4 flex-shrink-0 flex">
                    <span className={`text-xs rounded-full px-2 py-1 ${
                      task.completed 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {task.completed 
                        ? `Completed ${task.dueDate ? format(new Date(task.dueDate), 'MMM d') : ''}` 
                        : `Due ${task.dueDate ? format(new Date(task.dueDate), 'MMM d') : 'soon'}`}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            
            {tasks.length === 0 && (
              <div className="py-6 text-center text-gray-500 text-sm">
                No tasks added yet
              </div>
            )}
          </div>
        </div>
        <div className="px-4 py-3 bg-gray-50 sm:px-6 border-t border-gray-100 flex justify-between items-center">
          <span className="text-sm text-gray-500 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {tasks.filter(task => task.completed).length} of {tasks.length} tasks completed
          </span>
        </div>
      </div>
      
      {/* Add Task Dialog */}
      <Dialog open={isAddTaskOpen} onOpenChange={setIsAddTaskOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Task</DialogTitle>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Task Description</FormLabel>
                    <FormControl>
                      <Input placeholder="Contact insurance agent for binder" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setIsAddTaskOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Add Task</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
