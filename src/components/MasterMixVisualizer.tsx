"use client";

import React, { useEffect, useRef } from "react";
import { useAudioEngine } from "@/context/AudioEngineContext";
import { Activity, Radio, Cpu } from "lucide-react";

export const MasterMixVisualizer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { isPlaying, getMasterAnalyser, currentChordName, tempo, basePitch, instrumentsState } = useAudioEngine();
  const animationRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const peaksRef = useRef<number[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.resetTransform();
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);

      ctx.clearRect(0, 0, w, h);

      // Draw futuristic visualizer grid background
      ctx.strokeStyle = "rgba(63, 63, 70, 0.15)";
      ctx.lineWidth = 1;
      const gridCols = 16;
      const gridRows = 8;
      for (let c = 1; c < gridCols; c++) {
        const x = (c / gridCols) * w;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let r = 1; r < gridRows; r++) {
        const y = (r / gridRows) * h;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const analyser = getMasterAnalyser();
      
      if (!analyser || !isPlaying) {
        // Render a subtle, glowing idle waveform
        ctx.strokeStyle = "rgba(168, 85, 247, 0.4)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
          const evalX = (x / w) * Math.PI * 4;
          const y = h / 2 + Math.sin(evalX) * 8 * Math.cos(evalX * 0.5);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Draw idle peak hold line
        ctx.strokeStyle = "rgba(6, 182, 212, 0.25)";
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(0, h * 0.4);
        ctx.lineTo(w, h * 0.4);
        ctx.moveTo(0, h * 0.6);
        ctx.lineTo(w, h * 0.6);
        ctx.stroke();
        ctx.setLineDash([]);

        animationRef.current = requestAnimationFrame(draw);
        return;
      }

      if (!analyserRef.current || analyserRef.current !== analyser) {
        analyserRef.current = analyser;
        dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
        peaksRef.current = new Array(analyser.frequencyBinCount).fill(0);
      }

      const dataArray = dataArrayRef.current;
      const peaks = peaksRef.current;

      if (dataArray) {
        analyser.getByteFrequencyData(dataArray as any);

        // Limit the rendering to lower/mid ranges since mathematical synthesis is mostly harmonic
        // (usually the first 64 bins out of 128 have the interesting frequencies)
        const totalBins = Math.min(dataArray.length, 72);
        const barWidth = (w / totalBins) * 0.82;
        const gap = (w / totalBins) * 0.18;

        // Draw gradient bars
        for (let i = 0; i < totalBins; i++) {
          const val = dataArray[i]; // 0 to 255
          const percent = val / 255;
          const barHeight = percent * h * 0.85;

          const x = i * (barWidth + gap) + gap / 2;
          const y = h - barHeight;

          // Color gradient: Cyan -> Fuchsia -> Purple
          const grad = ctx.createLinearGradient(0, y, 0, h);
          grad.addColorStop(0, "#06b6d4"); // Cyan
          grad.addColorStop(0.5, "#d946ef"); // Fuchsia
          grad.addColorStop(1, "rgba(99, 102, 241, 0.15)"); // Translucent Indigo

          ctx.fillStyle = grad;
          
          // Draw rounded top bar
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, [2, 2, 0, 0]);
          ctx.fill();

          // Peak holding logic
          if (val > peaks[i]) {
            peaks[i] = val;
          } else {
            peaks[i] = Math.max(0, peaks[i] - 1.5); // Slow falloff
          }

          // Draw peak indicator dots
          const peakY = h - (peaks[i] / 255) * h * 0.85 - 2;
          ctx.fillStyle = "#22d3ee"; // Neon Cyan
          ctx.beginPath();
          ctx.arc(x + barWidth / 2, Math.max(2, peakY), 1.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw time-domain glow overlay (Oscilloscope wave overlay)
        const timeData = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(timeData as any);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.lineWidth = 1.5;
        ctx.shadowColor = "#06b6d4";
        ctx.shadowBlur = 6;
        ctx.beginPath();
        for (let i = 0; i < w; i++) {
          const dataIdx = Math.floor((i / w) * timeData.length);
          const v = timeData[dataIdx] / 128.0; // 0.0 to 2.0
          const y = (v * h) / 2;
          if (i === 0) ctx.moveTo(i, y);
          else ctx.lineTo(i, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", resize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, getMasterAnalyser]);

  const activeTracksCount = instrumentsState.filter(inst => !inst.isMuted).length;

  return (
    <div className="w-full bg-zinc-950/70 border border-zinc-900 rounded-2xl p-5 md:p-6 shadow-2xl relative overflow-hidden backdrop-blur-md">
      {/* Decorative Neon Top Border Line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-500 via-fuchsia-500 to-indigo-500 opacity-80" />

      {/* Header Telemetry bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-zinc-900 pb-4 mb-4 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-800/40 text-cyan-400">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-widest">
              MASTER AUDIO INTERFEROMETER
            </h2>
            <p className="text-[10px] text-zinc-500 font-mono">
              Combined frequency domain analysis (FFT Spectrum)
            </p>
          </div>
        </div>

        {/* Live Grid Metrics */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-6 font-mono text-[10px] tracking-wide text-zinc-400 bg-zinc-900/40 border border-zinc-800/50 px-4 py-2 rounded-xl">
          <div className="flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-pink-400" />
            CHORD: <span className="text-pink-400 font-bold">{currentChordName}</span>
          </div>
          <div className="h-3 w-[1px] bg-zinc-800" />
          <div>
            TEMPO: <span className="text-cyan-400 font-bold">{tempo} BPM</span>
          </div>
          <div className="h-3 w-[1px] bg-zinc-800" />
          <div>
            TUNING: <span className="text-indigo-400 font-bold">{basePitch} Hz</span>
          </div>
          <div className="h-3 w-[1px] bg-zinc-800" />
          <div className="flex items-center gap-1">
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            CHANNELS: <span className="text-emerald-400 font-bold">{activeTracksCount}/6</span>
          </div>
        </div>
      </div>

      {/* Canvas FFT Visualizer */}
      <div className="relative w-full h-28 md:h-36 bg-zinc-950 rounded-xl overflow-hidden border border-zinc-900/50">
        <canvas ref={canvasRef} className="w-full h-full block" />
        
        {/* Sub-labeling frequency zones */}
        <div className="absolute bottom-1.5 left-3 right-3 flex justify-between pointer-events-none font-mono text-[8px] text-zinc-600 select-none">
          <span>20 Hz (SUB)</span>
          <span>250 Hz (LOW)</span>
          <span>1 kHz (MID)</span>
          <span>4 kHz (HI)</span>
          <span>10 kHz (AIR)</span>
        </div>
      </div>
    </div>
  );
};
