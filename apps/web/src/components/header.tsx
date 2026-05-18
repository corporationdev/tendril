import { SidebarTrigger } from "@tendril/ui/components/sidebar";

import { CommandMenu } from "@/components/command-menu";

export default function Header() {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-3">
      <div className="flex items-center gap-2">
        <SidebarTrigger />
        <div className="h-4 w-px bg-border" />
      </div>
      <CommandMenu />
    </header>
  );
}
