'use client';

import GalaxyCanvas from './GalaxyCanvas';

export default function Home() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-b from-[#000000] via-[#0a0612] to-[#000000] cursor-default select-none">
      {/* PixiJS galaxy: nebula clouds + glowing stars */}
      <GalaxyCanvas />

      {/* Content */}
      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4">
        <div className="text-center space-y-12">
          {/* Company Name with glow effect */}
          <div className="relative">
            <h1 className="company-name text-7xl md:text-9xl font-bold tracking-wider ">
              JUNO
            </h1>
            <p className="software-text text-2xl md:text-4xl font-light tracking-[0.3em] mt-2">
              SOFTWARE
            </p>
          </div>

        </div>
      </main>
    </div>
  );
}
