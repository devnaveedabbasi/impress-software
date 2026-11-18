"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

interface ExitButtonProps {
  // plain: a bare <button> that takes the class of the page's own buttons (for a page that does not use Button)
  className?: string;
  plain?: boolean;
  // ghost: no box, only the word (the quiet last button under a form)
  ghost?: boolean;
}

// Leaves the entry screen and goes to the home page of the system.
export function ExitButton({ className, plain = false, ghost = false }: ExitButtonProps) {
  const router = useRouter();
  const goHome = () => router.push("/");

  if (plain) {
    return (
      <button type="button" onClick={goHome} className={className}>
        Exit
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant={ghost ? "ghost" : "secondary"}
      shape="rounded"
      onClick={goHome}
      className={className ?? "border border-zinc-400 bg-white px-6 hover:bg-zinc-50"}
    >
      Exit
    </Button>
  );
}
