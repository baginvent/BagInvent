 import { Sidebar } from "./Sidebar";
 
 interface DashboardLayoutProps {
   children: React.ReactNode;
 }
 
 export function DashboardLayout({ children }: DashboardLayoutProps) {
   return (
     <div className="min-h-screen bg-background">
       <Sidebar />
      <main className="ml-56 min-h-screen p-6">
         {children}
       </main>
     </div>
   );
 }