import { requireStaff } from "@/lib/auth";
import { Navbar } from "@/components/navbar";
import { StaffDashboard } from "@/components/staff/staff-dashboard";

export default async function StaffPage() {
  await requireStaff();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <StaffDashboard />
      </main>
    </div>
  );
}
