"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

// If something breaks while a page is shown (a code error or unexpected data), the user sees this message
// inside the normal layout (the menu stays) and can try again. The session is never touched here.
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[Page error]", error);
  }, [error]);

  return (
    <div className="w-full max-w-md self-center rounded-lg bg-white p-8 text-center shadow-xl">
      <h1 className="text-xl font-semibold text-zinc-900">Something went wrong</h1>
      <p className="mt-2 text-sm text-zinc-600">
        This page could not be shown. Your data is safe and you are still logged in. Please try again, and if it
        keeps happening tell the support team what you were doing.
      </p>
      {error.digest && <p className="mt-2 text-xs text-zinc-400">Error code: {error.digest}</p>}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button type="button" shape="rounded" onClick={reset} className="px-6">
          Try again
        </Button>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-md border border-zinc-400 bg-white px-6 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
