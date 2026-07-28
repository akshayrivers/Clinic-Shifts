import { requireManager } from "@/lib/auth";
import { Navbar } from "@/components/navbar";

export default async function ManagerPage() {
  const manager = await requireManager();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 shadow-sm">
          <div className="mb-6 border-b border-slate-200 dark:border-slate-800 pb-4">
            <span className="px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300">
              Manager Access Only
            </span>
            <h1 className="text-3xl font-bold tracking-tight mt-3">Manager Portal</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Welcome, {manager.fullName}. You have full manager authorization.
            </p>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            This area is restricted to users with the <code className="font-mono text-indigo-600 dark:text-indigo-400">manager</code> role.
          </p>
        </div>
      </main>
    </div>
  );
}
