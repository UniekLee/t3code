import { Link } from "@tanstack/react-router";
import { BellIcon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";

import { useAttentionItems } from "./hooks";

/** Sidebar entry for the Activity inbox with a count of everything waiting on the viewer. */
export function ActivityRow({ className }: { className: string }) {
  const count = useAttentionItems().length;
  return (
    <Link
      to="/channels/activity"
      activeOptions={{ exact: true }}
      className={cn(className, count > 0 && "font-semibold text-sidebar-foreground")}
      activeProps={{ className: "bg-sidebar-row-selected text-sidebar-foreground" }}
    >
      <BellIcon aria-hidden className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">Activity</span>
      {count > 0 ? (
        <Badge variant="warning" size="sm" className="ms-auto">
          {count}
        </Badge>
      ) : null}
    </Link>
  );
}
