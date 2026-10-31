import { ReactNode } from "react";
import { Navbar } from "@/components/layout/Navbar";
import Image from "next/image";
import { Images } from "@/utlis/images";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen bg-zinc-100 bg-cover bg-center bg-fixed"
      style={{ backgroundImage: `url('${Images.Background}')` }}
    >
      <Navbar />

      <main className="relative min-h-[calc(100vh-57px)] px-4 py-8">
        <div className="absolute w-20 left-0 top-0 m-4">
          <Image
            src={Images.Logo}
            alt="Logo"
            width={100}
            height={100}
          />
        </div>

        <div className="mx-auto flex w-full max-w-7xl justify-center">
          {children}
        </div>
      </main>
    </div>
  );
}