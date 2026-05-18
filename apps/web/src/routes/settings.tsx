import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@tendril/ui/components/button";
import { Separator } from "@tendril/ui/components/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@tendril/ui/components/sidebar";
import { Skeleton } from "@tendril/ui/components/skeleton";
import { Monitor, Moon, Sun, User2 } from "lucide-react";
import type { CSSProperties } from "react";

import { useTheme } from "@/components/theme-provider";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/settings")({
  component: SettingsRoute,
});

const themeOptions = [
  {
    label: "Light",
    theme: "light",
    icon: Sun,
  },
  {
    label: "Dark",
    theme: "dark",
    icon: Moon,
  },
  {
    label: "System",
    theme: "system",
    icon: Monitor,
  },
] as const;

function SettingsRoute() {
  const { data: session, isPending } = authClient.useSession();
  const { setTheme, theme } = useTheme();

  return (
    <SidebarProvider
      className="min-h-svh bg-background"
      style={{ "--sidebar-width": "14rem" } as CSSProperties}
    >
      <Sidebar className="min-h-svh border-r" collapsible="none">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Settings</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive>
                    <User2 />
                    <span>General</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset className="min-w-0 bg-background">
        <main className="mx-auto w-full max-w-3xl px-6 py-8">
          <div className="space-y-1">
            <h1 className="font-semibold text-2xl">General</h1>
            <p className="text-muted-foreground text-sm">
              Manage your account and appearance preferences.
            </p>
          </div>

          <Separator className="my-6" />

          <section className="grid gap-3 py-2 sm:grid-cols-[12rem_1fr]">
            <div>
              <h2 className="font-medium text-sm">Account</h2>
              <p className="text-muted-foreground text-sm">
                Current signed-in user.
              </p>
            </div>
            <div className="rounded-md border bg-card p-4">
              <AccountSummary isPending={isPending} session={session} />
            </div>
          </section>

          <Separator className="my-6" />

          <section className="grid gap-3 py-2 sm:grid-cols-[12rem_1fr]">
            <div>
              <h2 className="font-medium text-sm">Appearance</h2>
              <p className="text-muted-foreground text-sm">
                Choose how Tendril looks.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {themeOptions.map(({ icon: Icon, label, theme: themeValue }) => {
                const isSelected = theme === themeValue;

                return (
                  <Button
                    aria-pressed={isSelected}
                    key={themeValue}
                    onClick={() => setTheme(themeValue)}
                    type="button"
                    variant={isSelected ? "default" : "outline"}
                  >
                    <Icon />
                    {label}
                  </Button>
                );
              })}
            </div>
          </section>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function AccountSummary({
  isPending,
  session,
}: {
  isPending: boolean;
  session: ReturnType<typeof authClient.useSession>["data"];
}) {
  if (isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
    );
  }

  if (!session) {
    return (
      <p className="text-muted-foreground text-sm">
        No user is currently signed in.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex size-10 items-center justify-center rounded-md bg-muted">
        <User2 className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">{session.user.name}</p>
        <p className="truncate text-muted-foreground text-sm">
          {session.user.email}
        </p>
      </div>
    </div>
  );
}
