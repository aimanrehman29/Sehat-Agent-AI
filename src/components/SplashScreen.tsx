/**
 * SplashScreen.tsx — Logo splash shown on every app open.
 *
 * Displays the logo centered full-screen for ~1.4 seconds,
 * then fades out via CSS animation to reveal the Hub underneath.
 */

"use client";

export default function SplashScreen() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white gap-3 animate-[fadeOut_1.4s_ease-in-out_forwards]">
      <img src="/logo.png" alt="Sehat-Agent AI" width={96} height={96} />
      <p className="text-sm font-medium text-[#015D67]">Sehat-Agent AI</p>
    </div>
  );
}
