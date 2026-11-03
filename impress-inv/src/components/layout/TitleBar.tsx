"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Icon } from "@iconify/react";
import { Images } from "@/utlis/images";

export function TitleBar() {
  const [isElectron, setIsElectron] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).appConfig) {
      setIsElectron(true);
      const appConfig = (window as any).appConfig;

      if (typeof appConfig.isMaximized === "function") {
        appConfig.isMaximized().then((max: boolean) => {
          setIsMaximized(max);
        });
      }

      if (typeof appConfig.onWindowStateChange === "function") {
        appConfig.onWindowStateChange((max: boolean) => {
          setIsMaximized(max);
        });
      }
    }
  }, []);

  const handleAction = (action: "back" | "forward" | "reload" | "minimize" | "maximize" | "close") => {
    if (typeof window !== "undefined") {
      const appConfig = (window as any).appConfig;
      if (appConfig?.windowAction) {
        appConfig.windowAction(action);
      } else {
        if (action === "back") window.history.back();
        else if (action === "forward") window.history.forward();
        else if (action === "reload") window.location.reload();
      }
    }
  };

  return (
    <div
      className="flex h-9 w-full select-none items-center justify-between border-b border-zinc-300 bg-zinc-900 px-2 text-zinc-100"
      style={{ WebkitAppRegion: "drag" } as any}
    >
      {/* Left side: Navigation & App branding */}
      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: "no-drag" } as any}
      >
        <button
          type="button"
          onClick={() => handleAction("back")}
          title="Back"
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
        >
          <Icon icon="mdi:arrow-left" className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => handleAction("forward")}
          title="Forward"
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
        >
          <Icon icon="mdi:arrow-right" className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => handleAction("reload")}
          title="Refresh / Reload Page"
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
        >
          <Icon icon="mdi:refresh" className="h-4 w-4" />
        </button>

        <div className="mx-1 h-3.5 w-px bg-zinc-700" />

        <div className="flex items-center gap-1.5 px-1">
          <Image
            src={Images.Logo}
            alt="Logo"
            width={16}
            height={16}
            className="h-4 w-4 object-contain brightness-200"
          />
          <span className="text-xs font-semibold tracking-wide text-zinc-200">
            Impress-Bike Inventory
          </span>
        </div>
      </div>

      {/* Center: Draggable area placeholder */}
      <div className="flex-1 text-center text-[11px] text-zinc-400 font-medium truncate px-4 pointer-events-none">
        Inventory Management Software
      </div>

      {/* Right side: Window controls (Minimize, Maximize, Close) */}
      <div
        className="flex items-center"
        style={{ WebkitAppRegion: "no-drag" } as any}
      >
        <button
          type="button"
          onClick={() => handleAction("minimize")}
          title="Minimize"
          className="flex h-9 w-10 items-center justify-center text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
        >
          <Icon icon="mdi:minus" className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => handleAction("maximize")}
          title={isMaximized ? "Restore Down" : "Maximize"}
          className="flex h-9 w-10 items-center justify-center text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
        >
          <Icon
            icon={isMaximized ? "mdi:window-restore" : "mdi:window-maximize"}
            className="h-3.5 w-3.5"
          />
        </button>

        <button
          type="button"
          onClick={() => handleAction("close")}
          title="Close"
          className="flex h-9 w-10 items-center justify-center text-zinc-400 hover:bg-red-600 hover:text-white transition-colors"
        >
          <Icon icon="mdi:close" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

