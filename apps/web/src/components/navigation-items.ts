import { MessageCircle, Settings } from "lucide-react";

export const navigationItems = [
  {
    to: "/",
    label: "Chat",
    icon: MessageCircle,
  },
  {
    to: "/settings",
    label: "Settings",
    icon: Settings,
  },
] as const;
