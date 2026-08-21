import { Avatar, AvatarFallback } from "./ui/avatar";
import { recentTasks } from "./demo-data";

export function RecentActivity() {
  return (
    <div className="space-y-8">
      {recentTasks.map((task) => (
        <div className="flex items-center" key={task.name}>
          <Avatar className="h-9 w-9 border">
            <AvatarFallback>{task.initials}</AvatarFallback>
          </Avatar>
          <div className="ml-4 min-w-0 space-y-1">
            <p className="truncate text-sm leading-none font-medium">
              {task.name}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {task.account}
            </p>
          </div>
          <div className="ml-auto pl-4 text-sm font-medium tabular-nums">
            {task.status}
          </div>
        </div>
      ))}
    </div>
  );
}
