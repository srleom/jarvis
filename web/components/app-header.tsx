import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { JarvisMark } from "@/components/jarvis-mark";

export type Crumb = { label: ReactNode; href?: string };

export function AppHeader({ crumbs = [] }: { crumbs?: Crumb[] }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 rounded-md pr-1 font-medium tracking-tight">
          <JarvisMark />
          <span className="text-[15px]">Jarvis</span>
        </Link>
        {crumbs.map((c, i) => (
          <Fragment key={i}>
            <ChevronRight className="size-3.5 text-muted-foreground/60" />
            {c.href ? (
              <Link
                href={c.href}
                className="max-w-[40vw] truncate text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {c.label}
              </Link>
            ) : (
              <span className="max-w-[40vw] truncate text-sm">{c.label}</span>
            )}
          </Fragment>
        ))}
      </div>
    </header>
  );
}
