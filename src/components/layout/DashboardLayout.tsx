import { Sidebar } from "./Sidebar";
import { NotificationMenu } from "./NotificationMenu";

interface DashboardLayoutProps {
  children: React.ReactNode;
  pageLabel?: string;
}

export function DashboardLayout({ children, pageLabel }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-[#262120]">
      <div className="grid min-h-screen md:grid-cols-[220px_minmax(0,1fr)]">
        <Sidebar />
        <div className="min-h-screen overflow-hidden bg-[#f7f4ef] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
          <header className="flex h-14 items-center justify-end border-b border-stone-200/80 bg-white/80 px-5 sm:px-7 lg:px-9">
            <NotificationMenu />
          </header>
          <main
            aria-label={pageLabel}
            className="min-h-[calc(100vh-56px)] p-5 sm:p-7 lg:p-9"
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
