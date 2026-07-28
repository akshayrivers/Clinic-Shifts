"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";

export function Navbar() {
  const { data: session, status } = useSession();

  return (
    <header className="bg-slate-900 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
        <div className="flex items-center space-x-6">
          <Link href="/dashboard" className="text-xl font-bold tracking-tight hover:text-slate-200">
            Clinic Shift Scheduler
          </Link>

          {session?.user && (
            <nav className="flex space-x-4 text-sm font-medium">
              <Link
                href="/dashboard"
                className="hover:bg-slate-800 px-3 py-2 rounded-md transition-colors"
              >
                Dashboard
              </Link>
              {session.user.role === "manager" && (
                <Link
                  href="/manager"
                  className="bg-indigo-950 text-indigo-200 hover:bg-indigo-900 px-3 py-2 rounded-md transition-colors"
                >
                  Manager Portal
                </Link>
              )}
              {session.user.role === "staff" && (
                <Link
                  href="/staff"
                  className="bg-teal-950 text-teal-200 hover:bg-teal-900 px-3 py-2 rounded-md transition-colors"
                >
                  Staff Portal
                </Link>
              )}
            </nav>
          )}
        </div>

        <div className="flex items-center space-x-4">
          {status === "loading" ? (
            <span className="text-sm text-slate-400">Loading...</span>
          ) : session?.user ? (
            <div className="flex items-center space-x-4 text-sm">
              <div className="text-right">
                <div className="font-semibold">{session.user.fullName}</div>
                <div className="text-xs text-slate-400 capitalize">
                  {session.user.role} {session.user.profession ? `(${session.user.profession})` : ""}
                </div>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-colors"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
