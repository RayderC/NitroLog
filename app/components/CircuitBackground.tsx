"use client";

import { useEffect, useRef } from "react";

const GRID = 80;

interface Line { x1: number; y1: number; x2: number; y2: number }
interface Node { x: number; y: number }
interface Pulse { lineIndex: number; t: number; speed: number; rgb: string }

export default function CircuitBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    if (!ctx) return;

    let raf: number;
    let lines: Line[] = [];
    let nodes: Node[] = [];
    const pulses: Pulse[] = [];

    function build(cv: typeof canvas) {
      lines = []; nodes = [];
      const cols = Math.ceil(cv.width / GRID) + 2;
      const rows = Math.ceil(cv.height / GRID) + 2;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols - 1; c++)
          if (Math.abs(Math.sin(r * 127.1 + c * 311.7)) < 0.28)
            lines.push({ x1: c * GRID, y1: r * GRID, x2: (c + 1) * GRID, y2: r * GRID });
      for (let r = 0; r < rows - 1; r++)
        for (let c = 0; c < cols; c++)
          if (Math.abs(Math.sin(c * 191.3 + r * 73.5)) < 0.20)
            lines.push({ x1: c * GRID, y1: r * GRID, x2: c * GRID, y2: (r + 1) * GRID });
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          if (Math.abs(Math.sin(r * 53.1 + c * 97.3)) < 0.14)
            nodes.push({ x: c * GRID, y: r * GRID });
      pulses.length = 0;
      for (let i = 0; i < Math.min(22, lines.length); i++) spawnPulse(Math.random());
    }

    function spawnPulse(t = 0) {
      if (!lines.length) return;
      pulses.push({
        lineIndex: Math.floor(Math.random() * lines.length),
        t, speed: 0.003 + Math.random() * 0.007,
        rgb: Math.random() < 0.55 ? "34,211,238" : "168,85,247",
      });
    }

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      build(canvas);
    }

    resize();
    window.addEventListener("resize", resize);

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 1;
      for (const l of lines) {
        ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2);
        ctx.strokeStyle = "rgba(34,211,238,0.055)"; ctx.stroke();
      }
      for (const n of nodes) {
        ctx.beginPath(); ctx.arc(n.x, n.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(168,85,247,0.28)"; ctx.fill();
        ctx.beginPath(); ctx.arc(n.x, n.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(168,85,247,0.05)"; ctx.fill();
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i]; p.t += p.speed;
        if (p.t > 1.15) { pulses.splice(i, 1); spawnPulse(); continue; }
        const t = Math.min(p.t, 1);
        const l = lines[p.lineIndex];
        if (!l) { pulses.splice(i, 1); continue; }
        const x = l.x1 + (l.x2 - l.x1) * t;
        const y = l.y1 + (l.y2 - l.y1) * t;
        const ts = Math.max(0, t - 0.22);
        const tx0 = l.x1 + (l.x2 - l.x1) * ts;
        const ty0 = l.y1 + (l.y2 - l.y1) * ts;
        const grad = ctx.createLinearGradient(tx0, ty0, x, y);
        grad.addColorStop(0, `rgba(${p.rgb},0)`);
        grad.addColorStop(1, `rgba(${p.rgb},0.55)`);
        ctx.beginPath(); ctx.moveTo(tx0, ty0); ctx.lineTo(x, y);
        ctx.strokeStyle = grad; ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1;
        const grd = ctx.createRadialGradient(x, y, 0, x, y, 12);
        grd.addColorStop(0, `rgba(${p.rgb},0.85)`);
        grd.addColorStop(0.45, `rgba(${p.rgb},0.28)`);
        grd.addColorStop(1, `rgba(${p.rgb},0)`);
        ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.fillStyle = grd; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.rgb},1)`; ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return (
    <canvas ref={canvasRef} style={{
      position: "fixed", top: 0, left: 0,
      width: "100%", height: "100%",
      pointerEvents: "none", zIndex: 0,
    }} />
  );
}
