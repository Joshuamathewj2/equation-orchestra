"use client";

import React, { useEffect, useRef } from "react";
import { useAudioEngine } from "@/context/AudioEngineContext";

const MATH_SYMBOLS = [
  "∫", "∑", "π", "∞", "θ", "√x", "sin(x)", "cos(y)", "λ", "φ", "f(x)", 
  "dy/dx", "Δ", "Ω", "μ", "x²", "y = mx+c", "e^x", "log(n)", "∇", "≈"
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  symbol: string;
  size: number;
  opacity: number;
  wobbleSpeed: number;
  wobbleAmount: number;
  phase: number;
}

export const FloatingParticles: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { isPlaying, getMasterAnalyser } = useAudioEngine();
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // Initialize particles
    const particleCount = 45;
    const particles: Particle[] = [];
    
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.2,
        vy: -0.2 - Math.random() * 0.4, // float up
        symbol: MATH_SYMBOLS[Math.floor(Math.random() * MATH_SYMBOLS.length)],
        size: 10 + Math.random() * 14,
        opacity: 0.1 + Math.random() * 0.25,
        wobbleSpeed: 0.01 + Math.random() * 0.02,
        wobbleAmount: 2 + Math.random() * 5,
        phase: Math.random() * Math.PI * 2,
      });
    }

    let animationId: number;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Get audio data for reactive movement
      let audioScale = 1.0;
      let glowFactor = 0.0;
      
      const analyser = getMasterAnalyser();
      if (analyser && isPlaying) {
        if (!analyserRef.current || analyserRef.current !== analyser) {
          analyserRef.current = analyser;
          dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
        }
        
        const dataArray = dataArrayRef.current;
        if (dataArray) {
          analyser.getByteFrequencyData(dataArray as any);
          // Calculate average volume
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length; // 0 to 255
          audioScale = 1.0 + (avg / 255) * 1.5; // up to 2.5x speed/size
          glowFactor = avg / 255; // 0.0 to 1.0
        }
      }

      // Draw faint grid lines in the background
      ctx.strokeStyle = `rgba(99, 102, 241, ${0.03 + glowFactor * 0.03})`;
      ctx.lineWidth = 1;
      const stepX = 80;
      const stepY = 80;
      for (let x = 0; x < canvas.width; x += stepX) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += stepY) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Draw particles
      particles.forEach((p) => {
        p.phase += p.wobbleSpeed * (isPlaying ? audioScale * 0.8 : 1.0);
        const wobble = Math.sin(p.phase) * p.wobbleAmount;

        // Draw symbol
        const currentOpacity = Math.min(0.6, p.opacity * (1.0 + glowFactor * 1.5));
        ctx.fillStyle = `rgba(168, 85, 247, ${currentOpacity})`; // Purple tone
        
        // React to sound with neon shadow glows
        if (glowFactor > 0.1) {
          ctx.shadowColor = "#06b6d4"; // Cyan glow
          ctx.shadowBlur = glowFactor * 15;
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.font = `italic ${p.size * (1.0 + glowFactor * 0.4)}px serif`;
        ctx.fillText(p.symbol, p.x + wobble, p.y);
        ctx.shadowBlur = 0; // Reset shadow

        // Update position
        p.y += p.vy * audioScale;
        p.x += p.vx * audioScale;

        // Wrap around screen edges
        if (p.y < -30) {
          p.y = canvas.height + 30;
          p.x = Math.random() * canvas.width;
        }
        if (p.x < -30) p.x = canvas.width + 30;
        if (p.x > canvas.width + 30) p.x = -30;
      });

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationId);
    };
  }, [isPlaying, getMasterAnalyser]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none -z-10"
      style={{ background: "radial-gradient(circle at center, #0f071e 0%, #030107 100%)" }}
    />
  );
};
