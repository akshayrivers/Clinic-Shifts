import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/navbar";
import Link from "next/link";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 shadow-sm mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Welcome, {user.fullName}
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                Signed in as <span className="font-semibold">{user.email}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                Role: {user.role}
              </span>
              {user.profession && (
                <span className="px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-full bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                  Profession: {user.profession}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-3">Manager Portal</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              Access managerial controls, staff assignments, and shift management. Protected by Manager RBAC.
            </p>
            {user.role === "manager" ? (
              <Link
                href="/manager"
                className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm px-4 py-2.5 rounded-lg transition-colors"
              >
                Go to Manager Portal &rarr;
              </Link>
            ) : (
              <span className="text-xs text-rose-600 dark:text-rose-400 font-medium bg-rose-50 dark:bg-rose-950/50 px-3 py-1.5 rounded-md border border-rose-200 dark:border-rose-900">
                Requires Manager role (Access Restricted)
              </span>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-semibold mb-3">Staff Portal</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              View available shifts and manage personal shift claims. Protected by Staff RBAC.
            </p>
            {user.role === "staff" ? (
              <Link
                href="/staff"
                className="inline-block bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm px-4 py-2.5 rounded-lg transition-colors"
              >
                Go to Staff Portal &rarr;
              </Link>
            ) : (
              <span className="text-xs text-rose-600 dark:text-rose-400 font-medium bg-rose-50 dark:bg-rose-950/50 px-3 py-1.5 rounded-md border border-rose-200 dark:border-rose-900">
                Requires Staff role (Access Restricted)
              </span>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
