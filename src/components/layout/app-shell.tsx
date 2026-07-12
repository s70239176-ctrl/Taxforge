import { Masthead } from "./masthead";
import { NavRail } from "./nav-rail";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-void">
      <Masthead />
      <div className="mx-auto flex max-w-[1440px]">
        <NavRail />
        <main className="min-w-0 flex-1 px-4 py-5 md:px-6 md:py-6">{children}</main>
      </div>
    </div>
  );
}
