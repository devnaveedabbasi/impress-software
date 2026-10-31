"use client";

import React from "react";

export default function LoadingScreen({ text = "Loading Data" }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] w-full gap-6">
      <div className="relative flex items-center justify-center">
        {/* Outer Fast Spinner */}
        <div className="absolute w-20 h-20 rounded-full border-[3px] border-transparent border-t-blue-600 border-r-blue-400 animate-spin"></div>
        
        {/* Inner Reverse Spinner */}
        <div className="absolute w-14 h-14 rounded-full border-[3px] border-transparent border-b-sky-500 border-l-sky-300 animate-[spin_1.5s_linear_reverse]"></div>
        
        {/* Center Pulsing Core */}
        <div className="w-6 h-6 bg-gradient-to-tr from-blue-600 to-sky-400 rounded-full animate-pulse shadow-lg shadow-blue-500/50"></div>
      </div>
      
      {/* Animated Text */}
      <div className="flex items-center gap-1.5">
        <span className="text-gray-600 font-medium tracking-widest text-sm uppercase">{text}</span>
        <span className="flex gap-1">
          <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
          <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
          <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
        </span>
      </div>
    </div>
  );
}
