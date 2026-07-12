"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutGrid,
  ListTree,
  FlaskConical,
  FileStack,
  BookOpenText,
} from "lucide-react";

const ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/transactions", label: "Transactions", icon: ListTree },
  { href: "/simulate", label: "Simulate", icon: FlaskConical },
  { href: "/reports", label: "Reports", icon: FileStack },
  { href: "/docs", label: "API Docs", icon: BookOpenText },
];

export function NavRail() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-[45px] hidden h-[calc(100vh-45px)] w-[188px] shrink-0 border-r border-line md:block">
      <ul className="flex flex-col gap-0.5 p-3">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm transition-colors",
                  active
                    ? "bg-panel-raised text-ink border-l-2 border-gain pl-2"
                    : "text-ink-muted hover:bg-panel-raised hover:text-ink"
                )}
              >
                <Icon size={15} strokeWidth={1.75} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="absolute bottom-0 left-0 right-0 border-t border-line p-3">
        <div className="label-eyebrow mb-1">ASP status</div>
        <div className="flex items-center gap-1.5 text-2xs font-mono text-gain">
          <span className="live-dot" />
          Registered on Onchain OS
        </div>
      </div>
    </nav>
  );
}
