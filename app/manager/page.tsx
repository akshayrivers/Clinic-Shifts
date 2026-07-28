import { requireManager } from "@/lib/auth";
import { Navbar } from "@/components/navbar";
import { ManagerDashboard } from "@/components/manager/manager-dashboard";

export default async function ManagerPage() {
  await requireManager();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <ManagerDashboard />
      </main>
    </div>
  );
}
