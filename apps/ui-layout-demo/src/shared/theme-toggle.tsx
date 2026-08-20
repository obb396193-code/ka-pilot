import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={dark ? "切换浅色主题" : "切换深色主题"}
      onClick={() => setDark((value) => !value)}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}
