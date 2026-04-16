'use client';

import {RefObject, useEffect, useRef} from 'react';
import {Application, Mesh, MeshGeometry, Shader} from "pixi.js";

/* ────────────────────────────────────────────────────────────────────
 *  Full-screen galaxy shader — rendered as a single Mesh quad with a
 *  custom shader. No Filter overhead (no intermediate framebuffer).
 * ──────────────────────────────────────────────────────────────────── */

const VERTEX = `
  in vec2 aPosition;
  in vec2 aUV;
  out vec2 vUV;

  uniform mat3 uProjectionMatrix;
  uniform mat3 uWorldTransformMatrix;

  void main() {
    mat3 mvp = uProjectionMatrix * uWorldTransformMatrix;
    gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
    vUV = aUV;
  }
`;

const FRAGMENT = `
  precision highp float;

  in vec2 vUV;
  out vec4 finalColor;

  uniform float uTime;
  uniform vec2  uResolution;
  uniform vec2  uMouse;

  // ─── Gradient noise (no grid artifacts) ────────────────────────
  vec2 grad(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)),
             dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float gnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = dot(grad(i), f);
    float b = dot(grad(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
    float c = dot(grad(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
    float d = dot(grad(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
    return 0.5 + 0.5 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  // Combined rotation + scale matrix (rot * 2) — pre-computed constant shared by all fBm calls
  const mat2 ROT2 = mat2(1.6, 1.2, -1.2, 1.6);

  // Cheap fBm for warp offsets (3 octaves — fast)
  float fbmLow(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * gnoise(p);
      p = ROT2 * p;
      a *= 0.5;
    }
    return v;
  }

  // Detail fBm for final sample (5 octaves)
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * gnoise(p);
      p = ROT2 * p;
      a *= 0.5;
    }
    return v;
  }

  // ─── Simple hash for star placement ────────────────────────────
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float hash2(vec2 p) {
    return fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453123);
  }

  // ─── Star layer ────────────────────────────────────────────────
  // 'threshold' controls density: higher = fewer stars
  float starLayer(vec2 uv, float cellSize, float brightMin, float brightMax,
                  float radiusPx, float orbit, vec2 galCenter, float seed,
                  float threshold) {
    vec2 pxUV = uv * uResolution;
    vec2 gcPx = galCenter * uResolution;

    vec2 cell = floor(pxUV / cellSize);

    float bright = 0.0;

    for (int dx = -1; dx <= 1; dx++) {
      for (int dy = -1; dy <= 1; dy++) {
        vec2 nc = cell + vec2(float(dx), float(dy));
        float h  = hash(nc + seed);
        float h2 = hash2(nc + seed);
        if (h < threshold) continue;

        vec2 starOff = vec2(hash(nc * 1.3 + seed), hash(nc * 2.7 + seed + 41.0));
        vec2 starPx  = (nc + starOff) * cellSize;

        vec2 diff = starPx - gcPx;
        float dist = length(diff);
        float ang  = atan(diff.y, diff.x) + orbit / (1.0 + dist * 0.003);
        starPx = gcPx + vec2(cos(ang), sin(ang)) * dist;

        float d = length(pxUV - starPx);

        // Per-star twinkle: ~30% don't blink, rest have varied speed & amplitude
        float twinkleType = hash(nc * 5.7 + seed + 99.0);
        float twinkle = 1.0;
        if (twinkleType > 0.3) {
          float speed = 0.5 + twinkleType * 4.0;       // 0.5 – 4.5 range
          float amplitude = 0.1 + 0.4 * (twinkleType - 0.3) / 0.7;  // 0.1 – 0.5
          twinkle = 1.0 - amplitude + amplitude * sin(uTime * speed + h * 62.83);
        }
        // Per-star random opacity — some stars are faint, some vivid
        float opacity = 0.3 + 0.7 * hash(nc * 3.1 + seed + 77.0);
        float starBright = mix(brightMin, brightMax, h2) * twinkle * opacity;

        float glow = starBright * exp(-d * d / (radiusPx * radiusPx * 0.5));
        bright += glow;
      }
    }
    return bright;
  }

  // ─── Nebula layer helper ───────────────────────────────────────
  // Each cloud has its own center, stretch, and noise-eroded edges.
  vec3 nebulaLayer(vec2 uvP, vec2 center, float aspect, float t,
                   float freq, vec2 seedOff, vec3 tint,
                   float intensity, float breathSpeed, float breathPhase,
                   float falloffRadius, vec2 stretch) {
    vec2 nUV = (uvP - center) * vec2(aspect, 1.0) * stretch;
    float ra = t * 0.08;
    mat2 rot = mat2(cos(ra), -sin(ra), sin(ra), cos(ra));
    nUV = rot * nUV;

    vec2 p = nUV * freq + seedOff;

    // Single warp pass — organic flowing distortion
    float wt = t * 4.0;
    vec2 warp = vec2(
      fbmLow(p + vec2(wt * 0.6, -wt * 0.4) + 10.0),
      fbmLow(p + vec2(-wt * 0.5, wt * 0.7) + 20.0)
    );

    float n = fbm(p + warp * 2.2);

    float breath = 0.75 + 0.25 * sin(uTime * breathSpeed + breathPhase);

    // Noise-modulated edge: breaks the perfect circle into wispy, irregular shapes
    float edgeNoise = fbmLow(nUV * 3.0 + seedOff * 0.1 + vec2(t * 1.5, t * 1.2));
    float dist = length(nUV);
    float noisyRadius = falloffRadius * (0.6 + 0.8 * edgeNoise);
    float mask = smoothstep(noisyRadius, noisyRadius * 0.15, dist);

    // Additional density variation — some parts of the cloud are thinner
    float densityVar = 0.5 + 0.5 * fbmLow(nUV * 2.0 + seedOff * 0.3 + vec2(t * 1.0));
    
    return tint * n * intensity * breath * mask * densityVar;
  }

  // ─── Main ──────────────────────────────────────────────────────
  void main() {
    vec2 uv = vUV;
    float aspect = uResolution.x / uResolution.y;
    vec2 galCenter = vec2(0.5, 0.48);
    float t = uTime * 0.015;
    float dGC = length((uv - galCenter) * vec2(aspect, 1.0));

    // ── Parallax UVs — 7 depth levels ───────────────────────────
    // Back-to-front: deepNeb → bgStars → midNeb → midStars → nearNeb → nearStars → accentStars
    vec2 uvDeepNeb  = uv + uMouse * 0.005;
    vec2 uvBg       = uv + uMouse * 0.007;
    vec2 uvMidNeb   = uv + uMouse * 0.025;
    vec2 uvMid      = uv + uMouse * 0.03;
    vec2 uvNearNeb  = uv + uMouse * 0.055;
    vec2 uvNear     = uv + uMouse * 0.07;
    vec2 uvAccent   = uv + uMouse * 0.10;

    vec3 col = vec3(0.0);
    float orbit = uTime * 0.0018;

    // ════════════════════════════════════════════════════════════
    // DEPTH 1 — Deep nebula (furthest back)
    // ════════════════════════════════════════════════════════════
    col += nebulaLayer(uvDeepNeb, vec2(0.45, 0.42), aspect, t,
      4.0, vec2(0.0),  vec3(0.12, 0.04, 0.32), 0.80, 0.0075, 0.0, 0.95, vec2(1.0, 1.4));   // deep violet — tall, left of center
    col += nebulaLayer(uvDeepNeb, vec2(0.58, 0.55), aspect, t,
      5.0, vec2(50.0), vec3(0.06, 0.10, 0.35), 0.75, 0.009, 1.5, 1.0, vec2(1.5, 0.8));     // navy blue — wide, lower right
    col += nebulaLayer(uvDeepNeb, vec2(0.38, 0.52), aspect, t,
      3.8, vec2(70.0), vec3(0.22, 0.04, 0.28), 0.55, 0.008, 0.8, 0.80, vec2(1.2, 1.0));    // rich purple — left

    // Galactic core glow — warm purple-pink
    float coreGlow = exp(-dGC * dGC * 8.0) * 0.45;
    float corePulse = 0.85 + 0.15 * sin(uTime * 0.008);
    col += vec3(0.28, 0.10, 0.42) * coreGlow * corePulse;

    // ════════════════════════════════════════════════════════════
    // DEPTH 2 — Background stars (distant dust, sparse)
    // ════════════════════════════════════════════════════════════
    float bgStars = starLayer(uvBg, 12.0, 0.10, 0.55, 0.3, orbit, galCenter, 0.0, 0.80);
    bgStars *= mix(1.0, 0.12, smoothstep(0.0, 0.6, dGC));
    col += vec3(0.82, 0.85, 0.95) * bgStars;

    // ════════════════════════════════════════════════════════════
    // DEPTH 3 — Mid nebula (partially obscures bg stars)
    // ════════════════════════════════════════════════════════════
    col += nebulaLayer(uvMidNeb, vec2(0.55, 0.40), aspect, t,
      5.5, vec2(100.0), vec3(0.18, 0.05, 0.30), 0.50, 0.006, 3.0, 0.75, vec2(0.9, 1.3));   // plum — tall, right of center
    col += nebulaLayer(uvMidNeb, vec2(0.40, 0.58), aspect, t,
      4.2, vec2(150.0), vec3(0.08, 0.12, 0.30), 0.45, 0.007, 2.0, 0.85, vec2(1.6, 0.7));   // royal blue — wide band, lower left
    col += nebulaLayer(uvMidNeb, vec2(0.62, 0.48), aspect, t,
      4.8, vec2(170.0), vec3(0.30, 0.06, 0.24), 0.35, 0.0065, 2.5, 0.70, vec2(1.0, 1.1));  // magenta — right side

    // ════════════════════════════════════════════════════════════
    // DEPTH 4 — Mid-field stars (moderate, fewer)
    // ════════════════════════════════════════════════════════════
    float midStars = starLayer(uvMid, 30.0, 0.30, 0.75, 0.7, orbit * 0.7, galCenter, 200.0, 0.82);
    col += vec3(0.88, 0.90, 1.0) * midStars;

    // ════════════════════════════════════════════════════════════
    // DEPTH 5 — Near nebula wisps (foreground haze over mid stars)
    // ════════════════════════════════════════════════════════════
    col += nebulaLayer(uvNearNeb, vec2(0.48, 0.35), aspect, t,
      6.0, vec2(200.0), vec3(0.25, 0.08, 0.32), 0.35, 0.008, 4.5, 0.65, vec2(1.3, 0.8));   // bright purple — upper, wide
    col += nebulaLayer(uvNearNeb, vec2(0.35, 0.50), aspect, t,
      3.5, vec2(250.0), vec3(0.32, 0.10, 0.28), 0.28, 0.005, 5.5, 0.70, vec2(0.8, 1.5));   // hot pink — left, tall
    col += nebulaLayer(uvNearNeb, vec2(0.60, 0.60), aspect, t,
      5.2, vec2(280.0), vec3(0.10, 0.14, 0.34), 0.30, 0.007, 5.0, 0.68, vec2(1.4, 0.9));   // cerulean — lower right, wide

    // ════════════════════════════════════════════════════════════
    // DEPTH 6 — Near bright stars (sparse, warm/cool tinted)
    // ════════════════════════════════════════════════════════════
    float nearStars = starLayer(uvNear, 50.0, 0.50, 0.95, 1.4, orbit * 0.4, galCenter, 400.0, 0.85);
    vec2 nCell = floor(uvNear * uResolution / 35.0);
    float tintVal = hash(nCell + 400.0);
    vec3 starCol = tintVal < 0.15 ? vec3(1.0, 0.96, 0.88) : vec3(0.92, 0.94, 1.0);
    col += starCol * nearStars;

    // ════════════════════════════════════════════════════════════
    // DEPTH 7 — Foreground accent glow stars (very few, biggest shift)
    // ════════════════════════════════════════════════════════════
    float accentStars = starLayer(uvAccent, 100.0, 0.70, 1.0, 3.0, orbit * 0.3, galCenter, 600.0, 0.88);
    vec2 aCell = floor(uvAccent * uResolution / 70.0);
    float aTint = hash(aCell + 600.0);
    vec3 accentCol = aTint < 0.25 ? vec3(1.0, 0.96, 0.88) : vec3(0.87, 0.91, 1.0);
    col += accentCol * accentStars * 1.1;

    col = min(col, vec3(1.0));
    finalColor = vec4(col, 1.0);
  }
`;

function doRender(containerRef: RefObject<HTMLDivElement | null>) {
    let app: Application | null = null;
    let destroyed = false;
    let cleanup: (() => void) | undefined;

    const init = async () => {
        if (destroyed) return;

        app = new Application();
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5); // cap resolution for performance

        await app.init({
            resizeTo: window,
            backgroundAlpha: 0,
            antialias: false,
            resolution: dpr,
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

        // ── Full-screen quad as a Mesh ──────────────────────────────
        // Two triangles covering the screen, with UVs from (0,0) to (1,1).
        const w = app.screen.width;
        const h = app.screen.height;

        const geometry = new MeshGeometry({
            positions: new Float32Array([
                0, 0,
                w, 0,
                w, h,
                0, h,
            ]),
            uvs: new Float32Array([
                0, 0,
                1, 0,
                1, 1,
                0, 1,
            ]),
            indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
        });

        const shader = Shader.from({
            gl: {
                vertex: VERTEX,
                fragment: FRAGMENT,
            },
            resources: {
                galaxyUniforms: {
                    uTime: {value: 0, type: 'f32'},
                    uResolution: {value: new Float32Array([w * dpr, h * dpr]), type: 'vec2<f32>'},
                    uMouse: {value: new Float32Array([0, 0]), type: 'vec2<f32>'},
                },
            },
        });

        const mesh = new Mesh({geometry, shader});
        app.stage.addChild(mesh);

        // Pre-cache hot-path references — avoids repeated property chain walks each frame/resize
        const uniforms = shader.resources.galaxyUniforms.uniforms;
        const posAttribute = geometry.getAttribute('aPosition');

        // ── Mouse tracking via PixiJS event system ─────────────────
        const mouse = {x: 0, y: 0};
        const smooth = {x: 0, y: 0};

        app.stage.eventMode = 'static';
        app.stage.hitArea = app.screen;
        app.stage.on('globalpointermove', (e: import('pixi.js').FederatedPointerEvent) => {
            mouse.x = (e.global.x / app!.screen.width - 0.5) * 2;
            mouse.y = (e.global.y / app!.screen.height - 0.5) * 2;
        });

        // ── Resize ─────────────────────────────────────────────────
        const onResize = () => {
            if (!app) return;
            const curDpr = Math.min(window.devicePixelRatio || 1, 1.5);
            const nw = app.screen.width;
            const nh = app.screen.height;

            // Mutate existing buffer in-place — avoids Float32Array allocation on every resize
            const d = posAttribute.buffer.data as Float32Array;
            d[2] = nw;
            d[4] = nw; d[5] = nh;
            d[7] = nh;
            posAttribute.buffer.update();

            uniforms.uResolution[0] = nw * curDpr;
            uniforms.uResolution[1] = nh * curDpr;
        };
        window.addEventListener('resize', onResize);

        // ── Animation loop ─────────────────────────────────────────
        let time = 0;

        // Pause rendering when the tab is hidden — saves GPU/CPU on inactive tabs
        const onVisibilityChange = () => {
            if (document.hidden) app!.ticker.stop();
            else app!.ticker.start();
        };
        document.addEventListener('visibilitychange', onVisibilityChange);

        app.ticker.add(() => {
            // Use deltaTime so animation speed is frame-rate independent
            // (deltaTime ≈ 1.0 at 60 fps, 0.5 at 120 fps, 2.0 at 30 fps)
            const dt = app!.ticker.deltaTime;
            time += dt;

            // Frame-rate independent exponential smoothing: equivalent to 0.055 factor at 60 fps
            const factor = 1 - Math.pow(0.945, dt);
            smooth.x += (mouse.x - smooth.x) * factor;
            smooth.y += (mouse.y - smooth.y) * factor;

            uniforms.uTime = time;
            uniforms.uMouse[0] = smooth.x;
            uniforms.uMouse[1] = smooth.y;
        });

        cleanup = () => {
            window.removeEventListener('resize', onResize);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    };

    init().catch(console.error);

    return () => {
        destroyed = true;
        cleanup?.();
        if (app) {
            app.destroy(true, {children: true});
            app = null;
        }
    };
}

export default function GalaxyCanvas() {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        return doRender(containerRef);
    }, []);

    return (
        <div
            ref={containerRef}
            className="absolute inset-0"
            style={{pointerEvents: 'auto', zIndex: 0}}
        />
    );
}
