import { requireStaff } from "@/lib/auth";
import { Navbar } from "@/components/navbar";

export default async function StaffPage() {
  const staff = await requireStaff();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 shadow-sm">
          <div className="mb-6 border-b border-slate-200 dark:border-slate-800 pb-4">
            <span className="px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300">
              Staff Access Only
            </span>
            <h1 className="text-3xl font-bold tracking-tight mt-3">Staff Portal</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Welcome, {staff.fullName}. Profession: <span className="font-semibold capitalize">{staff.profession}</span>
            </p>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            This area is restricted to users with the <code className="font-mono text-teal-600 dark:text-teal-400">staff</code> role.
          </p>
        </div>
      </main>
    </div>
  );
}
