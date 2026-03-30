'use client';

import { useEffect, useRef } from 'react';

export default function GalaxyCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let app: import('pixi.js').Application | null = null;
    let destroyed = false;

    let cleanup: (() => void) | undefined;

    const init = async () => {
      const PIXI = await import('pixi.js');

      if (destroyed) return;

      app = new PIXI.Application();

      await app.init({
        resizeTo: window,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      if (destroyed) {
        app.destroy(true);
        return;
      }

      const canvas = app.canvas as HTMLCanvasElement;
      canvas.style.position = 'absolute';
      canvas.style.inset = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      containerRef.current!.appendChild(canvas);

      const W = () => app!.screen.width;
      const H = () => app!.screen.height;

      // ── Nebula layer ──────────────────────────────────────────────
      const nebulaContainer = new PIXI.Container();
      app.stage.addChild(nebulaContainer);

      interface NebulaCloud {
        graphic: import('pixi.js').Graphics;
        baseX: number;
        baseY: number;
        phase: number;
        speed: number;
        baseAlpha: number;
      }

      // Real nebulae are near-invisible wisps — very high blur, very low alpha
      const cloudConfigs = [
        { color: 0x2d0a4e, alpha: 0.9,  rx: 0.35, ry: 0.45, rw: 700, rh: 380, blur: 130 }, // diffuse purple arm
        { color: 0x0d1b4b, alpha: 0.85, rx: 0.65, ry: 0.55, rw: 750, rh: 420, blur: 140 }, // deep blue arm
        { color: 0x1a0a3d, alpha: 0.7,  rx: 0.50, ry: 0.30, rw: 580, rh: 280, blur: 120 }, // violet wisp
        { color: 0x0a1628, alpha: 0.75, rx: 0.20, ry: 0.65, rw: 600, rh: 350, blur: 135 }, // dark blue wisp
        { color: 0x200838, alpha: 0.6,  rx: 0.78, ry: 0.35, rw: 520, rh: 300, blur: 115 }, // faint purple
        { color: 0x0e0b2e, alpha: 0.65, rx: 0.50, ry: 0.70, rw: 640, rh: 360, blur: 125 }, // indigo band
      ];

      const nebulaClouds: NebulaCloud[] = [];

      for (const cfg of cloudConfigs) {
        const g = new PIXI.Graphics();
        g.ellipse(0, 0, cfg.rw, cfg.rh);
        g.fill({ color: cfg.color, alpha: cfg.alpha });
        g.x = W() * cfg.rx;
        g.y = H() * cfg.ry;
        g.blendMode = 'add';

        const blur = new PIXI.BlurFilter({ strength: cfg.blur, quality: 3 });
        g.filters = [blur];

        nebulaContainer.addChild(g);
        nebulaClouds.push({
          graphic: g,
          baseX: cfg.rx,
          baseY: cfg.ry,
          phase: Math.random() * Math.PI * 2,
          speed: 0.015 + Math.random() * 0.02, // imperceptibly slow
          baseAlpha: cfg.alpha,
        });
      }

      // Galactic core — a barely-visible warm glow at center
      const core = new PIXI.Graphics();
      core.circle(0, 0, 220);
      core.fill({ color: 0x3b1f6b, alpha: 0.5 });
      core.x = W() * 0.5;
      core.y = H() * 0.48;
      core.blendMode = 'add';
      core.filters = [new PIXI.BlurFilter({ strength: 90, quality: 3 })];
      nebulaContainer.addChild(core);
      nebulaClouds.push({ graphic: core, baseX: 0.5, baseY: 0.48, phase: 0, speed: 0.008, baseAlpha: 0.5 });

      // Three star containers at different depths for parallax layering
      const bgStarsContainer   = new PIXI.Container(); // furthest — sub-pixel cluster
      const midStarsContainer  = new PIXI.Container(); // mid — small field stars
      const nearStarsContainer = new PIXI.Container(); // closest — bright/glow stars
      app.stage.addChild(bgStarsContainer);
      app.stage.addChild(midStarsContainer);
      app.stage.addChild(nearStarsContainer);

      // Each star tracks its own orbital path around the galactic center
      interface Star {
        graphic: import('pixi.js').Graphics;
        baseAlpha: number;
        twinkleSpeed: number;
        twinklePhase: number;
        cx: number;        // orbital center x
        cy: number;        // orbital center y
        angle: number;     // current orbital angle (radians)
        dist: number;      // orbital radius (pixels)
        orbitSpeed: number; // rad per tick — inner stars faster (differential rotation)
      }

      const stars: Star[] = [];
      const dimColors  = [0xffffff, 0xdde8ff, 0xccd6f6, 0xe8f4ff, 0xf0f4ff];
      const warmColors = [0xfff4e0, 0xffe8cc, 0xffd9a0];

      // Galactic center (fixed at init — stars orbit around this point)
      const GCX = W() * 0.5;
      const GCY = H() * 0.48;

      // Differential rotation: inner stars spin faster, like a real galaxy
      const orbitSpeed = (dist: number) => 0.0018 / (1 + dist / 120);

      const makeStar = (
        container: import('pixi.js').Container,
        x: number, y: number,
        r: number, color: number,
        baseAlpha: number,
        twinkleSpeed: number,
        blendMode?: string,
        blurStrength?: number,
      ): Star => {
        const g = new PIXI.Graphics();
        g.circle(0, 0, r);
        g.fill({ color, alpha: 1 });
        g.x = x;
        g.y = y;
        if (blendMode) g.blendMode = blendMode as import('pixi.js').BLEND_MODES;
        if (blurStrength) g.filters = [new PIXI.BlurFilter({ strength: blurStrength, quality: 2 })];
        container.addChild(g);
        const dx = x - GCX;
        const dy = y - GCY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return {
          graphic: g,
          baseAlpha,
          twinkleSpeed,
          twinklePhase: Math.random() * Math.PI * 2,
          cx: GCX,
          cy: GCY,
          angle: Math.atan2(dy, dx),
          dist,
          orbitSpeed: orbitSpeed(dist),
        };
      };

      // Galaxy-weighted position: denser toward core
      const galaxyPos = () => {
        const angle = Math.random() * Math.PI * 2;
        const raw = Math.random();
        const t = raw < 0.55
          ? Math.sqrt(raw / 0.55) * 0.28
          : 0.28 + ((raw - 0.55) / 0.45) * 0.72;
        return {
          x: GCX + Math.cos(angle) * t * W() * 0.7,
          y: GCY + Math.sin(angle) * t * H() * 0.6,
        };
      };

      // 500 sub-pixel background stars — tight core cluster
      for (let i = 0; i < 500; i++) {
        const pos = galaxyPos();
        const isWarm = Math.random() < 0.08;
        const color = isWarm
          ? warmColors[Math.floor(Math.random() * warmColors.length)]
          : dimColors[Math.floor(Math.random() * dimColors.length)];
        stars.push(makeStar(bgStarsContainer, pos.x, pos.y, 0.2 + Math.random() * 0.55, color,
          0.15 + Math.random() * 0.55, 0.003 + Math.random() * 0.012));
      }

      // 120 small visible stars scattered across the field
      for (let i = 0; i < 120; i++) {
        const x = Math.random() * W();
        const y = Math.random() * H();
        const color = dimColors[Math.floor(Math.random() * dimColors.length)];
        stars.push(makeStar(midStarsContainer, x, y, 0.5 + Math.random() * 1.0, color,
          0.35 + Math.random() * 0.5, 0.006 + Math.random() * 0.018));
      }

      // 40 brighter stars with a faint halo
      for (let i = 0; i < 40; i++) {
        const x = Math.random() * W();
        const y = Math.random() * H();
        const isWarm = Math.random() < 0.15;
        const color = isWarm
          ? warmColors[Math.floor(Math.random() * warmColors.length)]
          : dimColors[Math.floor(Math.random() * dimColors.length)];
        stars.push(makeStar(nearStarsContainer, x, y, 1.0 + Math.random() * 1.4, color,
          0.55 + Math.random() * 0.45, 0.01 + Math.random() * 0.025,
          'add', 2.5));
      }

      // 12 prominent stars with visible glow
      const accentColors = [0xffffff, 0xdde8ff, 0xc7d2fe, 0xfff4e0];
      for (let i = 0; i < 12; i++) {
        const x = Math.random() * W();
        const y = Math.random() * H();
        const color = accentColors[Math.floor(Math.random() * accentColors.length)];
        stars.push(makeStar(nearStarsContainer, x, y, 1.8 + Math.random() * 2.0, color,
          0.75 + Math.random() * 0.25, 0.008 + Math.random() * 0.015,
          'add', 6));
      }

      // ── Parallax mouse tracking ───────────────────────────────────
      // Normalized mouse offset from screen center (-1 → +1)
      const mouse   = { x: 0, y: 0 }; // raw target
      const smooth  = { x: 0, y: 0 }; // lerped value

      const onMouseMove = (e: MouseEvent) => {
        mouse.x = (e.clientX / window.innerWidth  - 0.5) * 2;
        mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
      };
      window.addEventListener('mousemove', onMouseMove);

      // Parallax depth factors (multiplied by half screen dimension)
      // Higher = closer to camera = more movement
      const P_NEBULA = 0.006;
      const P_BG     = 0.012;
      const P_MID    = 0.024;
      const P_NEAR   = 0.042;

      // ── Animation loop ────────────────────────────────────────────
      let time = 0;

      app.ticker.add(() => {
        time += 0.003;

        // Smooth mouse with lerp
        smooth.x += (mouse.x - smooth.x) * 0.055;
        smooth.y += (mouse.y - smooth.y) * 0.055;

        const hw = W() * 0.5;
        const hh = H() * 0.5;

        // Parallax offsets per layer
        const px = { nebula: smooth.x * hw * P_NEBULA, bg: smooth.x * hw * P_BG,
                     mid: smooth.x * hw * P_MID,        near: smooth.x * hw * P_NEAR };
        const py = { nebula: smooth.y * hh * P_NEBULA, bg: smooth.y * hh * P_BG,
                     mid: smooth.y * hh * P_MID,        near: smooth.y * hh * P_NEAR };

        // Nebula clouds: drift + alpha breathe + parallax
        for (const cloud of nebulaClouds) {
          const t = time * cloud.speed + cloud.phase;
          cloud.graphic.x = W() * cloud.baseX + Math.sin(t) * 55;
          cloud.graphic.y = H() * cloud.baseY + Math.cos(t * 0.65) * 40;
          cloud.graphic.scale.set(0.93 + Math.sin(t * 0.35) * 0.07);
          cloud.graphic.alpha = cloud.baseAlpha * (0.75 + Math.sin(t * 0.5) * 0.25);
        }
        nebulaContainer.rotation += 0.000025;
        nebulaContainer.x = px.nebula;
        nebulaContainer.y = py.nebula;

        // Star container parallax offsets
        bgStarsContainer.x   = px.bg;   bgStarsContainer.y   = py.bg;
        midStarsContainer.x  = px.mid;  midStarsContainer.y  = py.mid;
        nearStarsContainer.x = px.near; nearStarsContainer.y = py.near;

        // Stars: orbital rotation + twinkle
        for (const star of stars) {
          star.angle += star.orbitSpeed;
          star.graphic.x = star.cx + Math.cos(star.angle) * star.dist;
          star.graphic.y = star.cy + Math.sin(star.angle) * star.dist;
          star.twinklePhase += star.twinkleSpeed;
          star.graphic.alpha = star.baseAlpha * (0.65 + Math.sin(star.twinklePhase) * 0.35);
        }
      });

      cleanup = () => window.removeEventListener('mousemove', onMouseMove);
    };

    init().then(r => { cleanup = r ?? cleanup; });

    return () => {
      destroyed = true;
      cleanup?.();
      if (app) {
        app.destroy(true, { children: true });
        app = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ pointerEvents: 'none', zIndex: 0 }}
    />
  );
}
