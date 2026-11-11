import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";

// Shown for any address that does not exist (or a page that is not built yet).
// The user stays logged in: this is only a message page, it never touches the session.
export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-100">
      <Navbar />
      <main className="flex min-h-[calc(100vh-57px)] items-center justify-center px-4 py-8">
        <div className="w-full max-w-md rounded-lg bg-white p-8 text-center shadow-xl">
          <p className="text-5xl font-bold text-primary-500">404</p>
          <h1 className="mt-3 text-xl font-semibold text-zinc-900">Page not found</h1>
          <p className="mt-2 text-sm text-zinc-600">
            This page does not exist or is not available yet. You are still logged in, use the menu above or go back
            to the dashboard.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-md bg-primary-500 px-6 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600"
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
