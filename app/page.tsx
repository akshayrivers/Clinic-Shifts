import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function HomePage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-xl">
        <h1 className="text-4xl font-extrabold tracking-tight mb-4">
          Clinic Shift Scheduler
        </h1>
        <p className="text-slate-400 mb-8 text-lg">
          Production clinic shift management platform with role-based access control.
        </p>
        <Link
          href="/login"
          className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-base px-6 py-3 rounded-lg shadow-lg hover:shadow-indigo-500/20 transition-all"
        >
          Sign In to Access Portal
        </Link>
      </div>
    </div>
  );
}
