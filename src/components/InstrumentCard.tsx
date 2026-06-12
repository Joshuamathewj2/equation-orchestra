"use client";

import React, { useEffect, useRef } from "react";
import { useAudioEngine } from "@/context/AudioEngineContext";
import { InstrumentConfig } from "@/constants/instruments";
import { 
  Speaker, 
  Music, 
  Wind, 
  Bell, 
  Zap, 
  Disc, 
  Volume2, 
  VolumeX, 
  Maximize2,
  Play
} from "lucide-react";

interface InstrumentCardProps {
  instrument: InstrumentConfig;
  onOpenDetails: (id: number) => void;
}

export const InstrumentCard: React.FC<InstrumentCardProps> = ({
  instrument,
  onOpenDetails,
}) => {
  const {
    instrumentsState,
    setInstrumentVolume,
    toggleMute,
    toggleSolo,
    triggeredInstruments,
    triggerManualNote,
    isPlaying,
    currentStep,
    grid,
  } = useAudioEngine();

  const idx = instrument.id - 1;
  const state = instrumentsState[idx];
  const isTriggered = triggeredInstruments[idx];
  const isStepPlaying = isPlaying && grid[idx][currentStep];

  const anySoloed = instrumentsState.some((inst) => inst.isSoloed);
  const isInactive = state ? (state.isMuted || (anySoloed && !state.isSoloed)) : false;

  const miniOscRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = miniOscRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.resetTransform();
      ctx.scale(dpr, dpr);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    let animationId: number;
    let t = 0;
    
    const anySoloed = instrumentsState.some((inst) => inst.isSoloed);
    const isInactive = state ? (state.isMuted || (anySoloed && !state.isSoloed)) : false;
    let currentAmp = (isInactive || (!isPlaying && !isTriggered)) ? 0 : (state ? state.volume : 0.6);

    const draw = () => {
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      ctx.clearRect(0, 0, w, h);

      // Re-read track states in loop since they can change
      const dynamicAnySoloed = instrumentsState.some((inst) => inst.isSoloed);
      const dynamicIsInactive = state ? (state.isMuted || (dynamicAnySoloed && !state.isSoloed)) : false;
      const dynamicVolume = state ? state.volume : 0.6;

      // Target amplitude: 0 if muted/inactive or if nothing is playing (and no manual hit active)
      const targetAmp = (dynamicIsInactive || (!isPlaying && !isTriggered)) ? 0 : dynamicVolume;
      
      // Lerp for smooth transition (glowing flatline fading)
      currentAmp += (targetAmp - currentAmp) * 0.12;

      // Increment t only if active (playing or manually triggered)
      if ((isPlaying || isTriggered) && !dynamicIsInactive) {
        // Bass (ID 1) travels slower, high-freq Lead (ID 5) / Drum (ID 6) travels faster
        const speed = instrument.id === 1 ? 0.05 : 
                      instrument.id === 6 ? 0.14 : 0.09;
        t += speed;
      }

      ctx.lineWidth = 1.5;

      // Map color-coded neon glow color
      const strokeColor = instrument.id === 1 ? "#3b82f6" : // Bass: Cyan/Blue
                          instrument.id === 2 ? "#6366f1" : // Piano: Indigo
                          instrument.id === 3 ? "#a855f7" : // Violin: Purple
                          instrument.id === 4 ? "#ec4899" : // Bell: Pink
                          instrument.id === 5 ? "#06b6d4" : // Lead Synth: Bright Cyan
                          "#10b981"; // Drum: Emerald

      // Ambient blur level: glows brighter when active
      ctx.shadowBlur = currentAmp > 0.05 ? 6 : 2;
      ctx.shadowColor = strokeColor;

      // Gradient fade to transparent at boundaries
      const gradient = ctx.createLinearGradient(0, 0, w, 0);
      gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
      gradient.addColorStop(0.18, strokeColor);
      gradient.addColorStop(0.82, strokeColor);
      gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.strokeStyle = gradient;

      ctx.beginPath();

      const range = 4 * Math.PI; // 2 complete wave cycles
      const peaks = [3.5, 1.0, 2.0, 1.8, 1.2, 1.0];
      const peak = peaks[instrument.id - 1] || 1.0;

      for (let xPixel = 0; xPixel < w; xPixel++) {
        const xVal = (xPixel / w) * range;
        
        // Evaluate mathematical formula directly with time delta (t)
        const yVal = instrument.formula(xVal + t);
        const normY = yVal / peak;

        // Map to canvas coordinates
        const yPixel = h / 2 - normY * currentAmp * (h * 0.35);

        if (xPixel === 0) {
          ctx.moveTo(xPixel, yPixel);
        } else {
          ctx.lineTo(xPixel, yPixel);
        }
      }
      ctx.stroke();
      ctx.shadowBlur = 0; // reset

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationId);
    };
  }, [instrument, isInactive, isPlaying, isTriggered, state?.volume]);

  if (!state) return null;

  // Resolve Lucide icons
  const getIcon = () => {
    const classNames = "w-6 h-6 transition-transform group-hover:scale-110";
    switch (instrument.id) {
      case 1:
        return <Speaker className={`${classNames} text-blue-400`} />;
      case 2:
        return <Music className={`${classNames} text-indigo-400`} />;
      case 3:
        return <Wind className={`${classNames} text-purple-400`} />;
      case 4:
        return <Bell className={`${classNames} text-rose-400`} />;
      case 5:
        return <Zap className={`${classNames} text-cyan-400`} />;
      case 6:
        return <Disc className={`${classNames} text-emerald-400`} />;
      default:
        return <Music className={classNames} />;
    }
  };

  // Active step markers count
  const activeStepsCount = grid[idx].filter(Boolean).length;

  return (
    <div
      className={`relative rounded-2xl p-5 border backdrop-blur-md transition-all duration-300 flex flex-col justify-between group overflow-hidden ${
        isInactive 
          ? "bg-zinc-950/40 border-zinc-950/60 opacity-60 hover:opacity-80"
          : "bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700/60 shadow-[0_4px_20px_rgba(0,0,0,0.2)]"
      } ${
        isTriggered || isStepPlaying
          ? "ring-2 ring-opacity-80 shadow-[0_0_25px_var(--glow-c)]"
          : ""
      }`}
      style={{
        // Define dynamic neon glowing variable based on instrument style
        "--glow-c": instrument.id === 1 ? "#3b82f6" :
                    instrument.id === 2 ? "#6366f1" :
                    instrument.id === 3 ? "#a855f7" :
                    instrument.id === 4 ? "#ec4899" :
                    instrument.id === 5 ? "#06b6d4" : "#10b981",
      } as React.CSSProperties}
    >
      {/* Decorative colored corner glow */}
      {!isInactive && (
        <div 
          className={`absolute -top-12 -right-12 w-24 h-24 rounded-full blur-2xl opacity-15 pointer-events-none transition-all duration-300 group-hover:scale-150`}
          style={{
            backgroundColor: instrument.id === 1 ? "#3b82f6" :
                             instrument.id === 2 ? "#6366f1" :
                             instrument.id === 3 ? "#a855f7" :
                             instrument.id === 4 ? "#ec4899" :
                             instrument.id === 5 ? "#06b6d4" : "#10b981",
          }}
        />
      )}

      {/* Card Header (Icon & Text) */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Glowing Icon Frame */}
          <div 
            className={`p-2.5 rounded-xl border transition-all duration-300 flex items-center justify-center bg-zinc-950/60 ${
              isTriggered || isStepPlaying
                ? "border-transparent animate-pulse shadow-[0_0_15px_var(--glow-c)]"
                : "border-zinc-800"
            }`}
          >
            {getIcon()}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider group-hover:text-white">
              {instrument.name}
            </h3>
            <span className="text-[10px] text-zinc-500 font-mono italic">
              {instrument.latex}
            </span>
          </div>
        </div>

        {/* Expand / Details Modal Button */}
        <button
          onClick={() => onOpenDetails(instrument.id)}
          title="Open details visualizer & math breakdown"
          className="p-1.5 rounded-lg border border-zinc-800/80 bg-zinc-900/60 hover:bg-zinc-850 text-zinc-500 hover:text-zinc-200 transition-all cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Mini Oscilloscope Preview Canvas */}
      <div className="relative w-full h-11 bg-zinc-950/60 rounded-xl overflow-hidden border border-zinc-900/50 mb-4 flex flex-col justify-center shadow-inner">
        <canvas ref={miniOscRef} className="w-full h-full block" />
      </div>

      {/* Info details */}
      <p className="text-[11px] text-zinc-400 leading-normal mb-5 flex-1 min-h-[36px]">
        {instrument.description}
      </p>

      {/* Controls & sliders */}
      <div className="flex flex-col gap-4 border-t border-zinc-900/60 pt-4 mt-auto">
        
        {/* Volume slider & mute symbol */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => toggleMute(instrument.id)}
            className={`transition-colors cursor-pointer ${isInactive ? "text-red-400" : "text-zinc-500 hover:text-zinc-300"}`}
            title={state.isMuted ? "Unmute instrument" : "Mute instrument"}
          >
            {state.isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          
          <div className="flex-1 flex flex-col gap-1">
            <input
              type="range"
              min="0"
              max="1.0"
              step="0.02"
              value={state.volume}
              onChange={(e) => setInstrumentVolume(instrument.id, parseFloat(e.target.value))}
              className="w-full cursor-pointer h-1 bg-zinc-950 rounded appearance-none"
              style={{
                accentColor: "var(--glow-c)",
              }}
            />
          </div>
          <span className="text-[9px] font-mono text-zinc-500 w-6 text-right">
            {Math.round(state.volume * 100)}%
          </span>
        </div>

        {/* Mute, Solo & Play button row */}
        <div className="flex items-center gap-2">
          {/* Mute button */}
          <button
            onClick={() => toggleMute(instrument.id)}
            className={`flex-1 py-1 rounded-lg border font-mono text-[9px] font-bold tracking-widest transition-all cursor-pointer ${
              state.isMuted
                ? "bg-red-950/20 text-red-400 border-red-900/50 hover:bg-red-950/40"
                : "bg-zinc-950/30 border-zinc-900/60 text-zinc-500 hover:text-zinc-300 hover:border-zinc-800"
            }`}
          >
            MUTE
          </button>

          {/* Solo button */}
          <button
            onClick={() => toggleSolo(instrument.id)}
            className={`flex-1 py-1 rounded-lg border font-mono text-[9px] font-bold tracking-widest transition-all cursor-pointer ${
              state.isSoloed
                ? "bg-amber-950/20 text-amber-400 border-amber-900/50 hover:bg-amber-950/40 shadow-[0_0_10px_rgba(245,158,11,0.15)]"
                : "bg-zinc-950/30 border-zinc-900/60 text-zinc-500 hover:text-zinc-300 hover:border-zinc-800"
            }`}
          >
            SOLO
          </button>

          {/* Manual Play preview trigger */}
          <button
            onClick={() => triggerManualNote(instrument.id)}
            title="Trigger manual preview note"
            className="p-1 px-2.5 rounded-lg border border-zinc-900 bg-zinc-950 text-zinc-500 hover:text-cyan-400 hover:border-cyan-800/30 transition-colors flex items-center justify-center cursor-pointer"
          >
            <Play className="w-3 h-3 fill-current" />
          </button>
        </div>

        {/* Footer info: active steps indicator */}
        <div className="flex justify-between items-center text-[8px] font-mono text-zinc-500 uppercase tracking-widest">
          <span>Rhythm Steps</span>
          <span className={`${activeStepsCount > 0 ? "text-zinc-400" : "text-zinc-600"}`}>
            {activeStepsCount}/16 Active
          </span>
        </div>

      </div>
    </div>
  );
};
