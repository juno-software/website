'use client';

import { useEffect, useRef } from 'react';

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const setCanvasSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    setCanvasSize();
    window.addEventListener('resize', setCanvasSize);

    // Star particles
    const stars: Array<{
      x: number;
      y: number;
      radius: number;
      opacity: number;
      twinkleSpeed: number;
      twinklePhase: number;
    }> = [];

    // Create stars
    for (let i = 0; i < 200; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 2,
        opacity: Math.random(),
        twinkleSpeed: Math.random() * 0.05,
        twinklePhase: Math.random() * Math.PI * 2
      });
    }

    // Animation
    let animationFrame: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw stars with twinkling effect
      stars.forEach((star) => {
        star.twinklePhase += star.twinkleSpeed;
        const twinkle = Math.sin(star.twinklePhase) * 0.5 + 0.5;

        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity * twinkle})`;
        ctx.fill();
      });

      animationFrame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener('resize', setCanvasSize);
      cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-b from-[#000000] via-[#0a0612] to-[#000000]">
      {/* Canvas for stars */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 opacity-80"
      />

      {/* Nebula effect */}
      <div className="nebula-glow"></div>

      {/* Content */}
      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4">
        <div className="text-center space-y-12">
          {/* Company Name with glow effect */}
          <div className="relative">
            <h1 className="company-name text-7xl md:text-9xl font-bold tracking-wider">
              JUNO
            </h1>
            <p className="software-text text-2xl md:text-4xl font-light tracking-[0.3em] mt-2">
              SOFTWARE
            </p>
          </div>

          {/* Decorative line */}
          <div className="flex items-center justify-center gap-4 py-8">
            <div className="h-px w-12 bg-gradient-to-r from-transparent via-blue-400 to-transparent"></div>
            <div className="w-1 h-1 rounded-full bg-blue-400 animate-pulse"></div>
            <div className="h-px w-12 bg-gradient-to-r from-transparent via-purple-400 to-transparent"></div>
          </div>

          {/* Coming Soon */}
          <p className="text-gray-500 text-lg md:text-xl font-light tracking-widest uppercase">
            Coming Soon
          </p>
        </div>
      </main>
    </div>
  );
}
