import { useNavigate } from "@tanstack/react-router";
import { Button } from "@tendril/ui/components/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@tendril/ui/components/command";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import { navigationItems } from "@/components/navigation-items";

interface CommandMenuProps {
  showTrigger?: boolean;
}

export function CommandMenu({ showTrigger = true }: CommandMenuProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((currentOpen) => !currentOpen);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  return (
    <>
      {showTrigger && (
        <>
          <Button
            aria-label="Open command menu"
            className="hidden h-8 min-w-48 justify-between px-2 text-muted-foreground sm:inline-flex"
            onClick={() => setOpen(true)}
            type="button"
            variant="outline"
          >
            <span className="flex items-center gap-2">
              <Search className="size-3.5" />
              Search commands
            </span>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-medium text-[0.625rem] text-muted-foreground">
              Cmd K
            </kbd>
          </Button>
          <Button
            aria-label="Open command menu"
            className="sm:hidden"
            onClick={() => setOpen(true)}
            size="icon"
            type="button"
            variant="outline"
          >
            <Search className="size-4" />
          </Button>
        </>
      )}
      <CommandDialog onOpenChange={setOpen} open={open} title="Command Menu">
        <Command>
          <CommandInput placeholder="Type a command or search..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Navigation">
              {navigationItems.map(({ icon: Icon, label, to }) => (
                <CommandItem
                  key={to}
                  onSelect={() =>
                    runCommand(() => {
                      navigate({ to });
                    })
                  }
                  value={`navigate-${label}`}
                >
                  <Icon />
                  <span>{label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
