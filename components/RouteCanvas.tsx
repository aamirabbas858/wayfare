"use client";

import { useEffect, useRef } from "react";

/**
 * The hero's ambient background: a slowly drifting constellation of waypoints
 * with routes drawn between near neighbours.
 *
 * Canvas rather than SVG because there are ~40 moving nodes and a few hundred
 * candidate edges recomputed each frame — that is a lot of DOM churn for the
 * same result. Everything is drawn on one layer, so cost stays flat.
 *
 * It is decoration: nothing here conveys information, and it disables itself
 * entirely under prefers-reduced-motion.
 */
export default function RouteCanvas({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let raf = 0;
    let running = true;

    type Node = { x: number; y: number; vx: number; vy: number; r: number; hub: boolean };
    let nodes: Node[] = [];

    // Cap DPR at 2 — beyond that the extra pixels cost real frame time and
    // nobody can see the difference on a background texture.
    const dpr = () => Math.min(window.devicePixelRatio || 1, 2);

    function build() {
      const rect = canvas!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;

      const ratio = dpr();
      canvas!.width = Math.floor(width * ratio);
      canvas!.height = Math.floor(height * ratio);
      ctx!.setTransform(ratio, 0, 0, ratio, 0, 0);

      // Density scales with area but stays bounded, so a large monitor does
      // not quietly turn this into a thousand-node simulation.
      const count = Math.max(18, Math.min(44, Math.round((width * height) / 34000)));

      nodes = Array.from({ length: count }, (_, i) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.16,
        vy: (Math.random() - 0.5) * 0.16,
        r: Math.random() * 1.5 + 1,
        hub: i % 7 === 0, // a few larger "destination" markers
      }));
    }

    function isDark() {
      return document.documentElement.classList.contains("dark");
    }

    function frame() {
      if (!running) return;
      ctx!.clearRect(0, 0, width, height);

      const dark = isDark();
      const line = dark ? "241, 238, 232" : "11, 18, 17";
      const linkDistance = Math.min(190, Math.max(120, width / 8));

      // Edges first so nodes sit on top of them.
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.hypot(dx, dy);
          if (dist > linkDistance) continue;

          const alpha = (1 - dist / linkDistance) * (dark ? 0.16 : 0.13);
          ctx!.strokeStyle = `rgba(${line}, ${alpha})`;
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.moveTo(nodes[i].x, nodes[i].y);
          ctx!.lineTo(nodes[j].x, nodes[j].y);
          ctx!.stroke();
        }
      }

      for (const n of nodes) {
        if (n.hub) {
          // Signal-coloured waypoints with a soft halo, echoing the map markers.
          ctx!.fillStyle = "rgba(228, 87, 46, 0.16)";
          ctx!.beginPath();
          ctx!.arc(n.x, n.y, n.r * 4.5, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.fillStyle = "rgba(228, 87, 46, 0.9)";
        } else {
          ctx!.fillStyle = `rgba(${line}, ${dark ? 0.42 : 0.34})`;
        }
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx!.fill();

        if (!reduced) {
          n.x += n.vx;
          n.y += n.vy;
          // Wrap rather than bounce: bouncing reads as a boundary, wrapping
          // reads as a map that continues past the edge.
          if (n.x < -20) n.x = width + 20;
          if (n.x > width + 20) n.x = -20;
          if (n.y < -20) n.y = height + 20;
          if (n.y > height + 20) n.y = -20;
        }
      }

      raf = requestAnimationFrame(frame);
    }

    build();
    frame();

    const onResize = () => {
      cancelAnimationFrame(raf);
      build();
      frame();
    };

    // Stop work entirely when the tab is hidden — no point animating a
    // background nobody is looking at.
    const onVisibility = () => {
      running = !document.hidden;
      if (running) frame();
      else cancelAnimationFrame(raf);
    };

    window.addEventListener("resize", onResize, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
