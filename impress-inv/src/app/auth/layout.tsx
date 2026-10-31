import { Images } from "@/utlis/images";
import { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex flex-1 items-center justify-center bg-zinc-100 bg-cover bg-center px-4 py-10"
      style={{ backgroundImage: `url('${Images.Background}')` }}
    >
      {children}
    </div>
  );
}
