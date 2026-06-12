"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAudioEngine } from "@/context/AudioEngineContext";
import { InstrumentConfig } from "@/constants/instruments";
import { X, Play, Volume2, Info, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface DetailsPanelProps {
  instrument: InstrumentConfig | null;
  onClose: () => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  opacity: number;
  decay: number;
}

interface Ripple {
  x: number;
  y: number;
  r: number;
  opacity: number;
  speed: number;
}

export const DetailsPanel: React.FC<DetailsPanelProps> = ({
  instrument,
  onClose,
}) => {
  const {
    getTrackAnalyser,
    isPlaying,
    triggeredInstruments,
    triggerManualNote,
    instrumentsState,
  } = useAudioEngine();

  const [activeTab, setActiveTab] = useState<"visualizer" | "acoustics">("visualizer");

  const oscCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fftCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const geoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  
  // Particle & Ripple storage for custom visualizers
  const particlesRef = useRef<Particle[]>([]);
  const ripplesRef = useRef<Ripple[]>([]);
  const phaseRef = useRef<number>(0);
  const lastTriggeredRef = useRef<boolean>(false);

  useEffect(() => {
    if (!instrument) return;

    const oscCanvas = oscCanvasRef.current;
    const fftCanvas = fftCanvasRef.current;
    const geoCanvas = geoCanvasRef.current;
    if (!oscCanvas || !fftCanvas || !geoCanvas) return;

    const oscCtx = oscCanvas.getContext("2d");
    const fftCtx = fftCanvas.getContext("2d");
    const geoCtx = geoCanvas.getContext("2d");
    if (!oscCtx || !fftCtx || !geoCtx) return;

    const dpr = window.devicePixelRatio || 1;

    // Resize handlers
    const resize = () => {
      [oscCanvas, fftCanvas, geoCanvas].forEach((canvas) => {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.resetTransform();
          ctx.scale(dpr, dpr);
        }
      });
    };
    resize();

    const instIdx = instrument.id - 1;
    const analyser = getTrackAnalyser(instrument.id);
    const timeData = new Uint8Array(analyser ? analyser.fftSize : 256);
    const freqData = new Uint8Array(analyser ? analyser.frequencyBinCount : 128);

    // Main animation loop inside the modal
    const loop = () => {
      const wOsc = oscCanvas.width / dpr;
      const hOsc = oscCanvas.height / dpr;
      const wFft = fftCanvas.width / dpr;
      const hFft = fftCanvas.height / dpr;
      const wGeo = geoCanvas.width / dpr;
      const hGeo = geoCanvas.height / dpr;

      // Track triggers
      const isCurrentlyTriggered = triggeredInstruments[instIdx];
      const triggerEdge = isCurrentlyTriggered && !lastTriggeredRef.current;
      lastTriggeredRef.current = isCurrentlyTriggered;

      // Phase increment
      phaseRef.current += isPlaying ? 0.04 : 0.01;
      const phase = phaseRef.current;

      // Extract volume level
      let volumeLevel = 0.05; // default minimal level
      if (analyser && isPlaying) {
        analyser.getByteTimeDomainData(timeData as any);
        analyser.getByteFrequencyData(freqData as any);

        let sum = 0;
        for (let i = 0; i < timeData.length; i++) {
          const val = (timeData[i] - 128) / 128;
          sum += val * val;
        }
        volumeLevel = Math.min(1.0, Math.sqrt(sum / timeData.length) * 4);
      }

      // --- 1. DRAW OSCILLOSCOPE (TIME DOMAIN) ---
      oscCtx.clearRect(0, 0, wOsc, hOsc);
      
      // Grid lines
      oscCtx.strokeStyle = "rgba(63, 63, 70, 0.1)";
      oscCtx.lineWidth = 1;
      oscCtx.beginPath();
      oscCtx.moveTo(0, hOsc / 2);
      oscCtx.lineTo(wOsc, hOsc / 2);
      oscCtx.stroke();

      oscCtx.lineWidth = 1.5;
      oscCtx.strokeStyle = "rgba(6, 182, 212, 0.85)"; // Neon Cyan
      oscCtx.shadowColor = "#06b6d4";
      oscCtx.shadowBlur = 4;
      oscCtx.beginPath();

      if (analyser && isPlaying) {
        // Draw actual live waveform from audio analysis
        const sliceWidth = wOsc / timeData.length;
        let x = 0;
        for (let i = 0; i < timeData.length; i++) {
          const v = timeData[i] / 128.0;
          const y = (v * hOsc) / 2;
          if (i === 0) oscCtx.moveTo(x, y);
          else oscCtx.lineTo(x, y);
          x += sliceWidth;
        }
      } else {
        // Draw static mathematical formula representation: y = f(x - phase)
        for (let col = 0; col < wOsc; col++) {
          const mathX = (col / wOsc) * 4 * Math.PI - phase * 2;
          const mathY = instrument.formula(mathX);
          
          // Normalize mathematically
          let normY = mathY / 4;
          if (instrument.id === 1) normY = mathY / 3.5;
          if (instrument.id === 5) normY = mathY / 1.5;

          const canvasY = hOsc / 2 - normY * (hOsc * 0.38);

          if (col === 0) oscCtx.moveTo(col, canvasY);
          else oscCtx.lineTo(col, canvasY);
        }
      }
      oscCtx.stroke();
      oscCtx.shadowBlur = 0;

      // --- 2. DRAW FFT SPECTRUM (FREQUENCY DOMAIN) ---
      fftCtx.clearRect(0, 0, wFft, hFft);
      fftCtx.strokeStyle = "rgba(63, 63, 70, 0.1)";
      fftCtx.lineWidth = 1;
      fftCtx.beginPath();
      for (let y = hFft * 0.25; y < hFft; y += hFft * 0.25) {
        fftCtx.moveTo(0, y);
        fftCtx.lineTo(wFft, y);
      }
      fftCtx.stroke();

      if (analyser && isPlaying) {
        const barCount = 36;
        const barWidth = wFft / barCount;
        for (let i = 0; i < barCount; i++) {
          // Read from lower portion of spectrum bins
          const freqVal = freqData[Math.floor((i / barCount) * (freqData.length * 0.6))];
          const percent = freqVal / 255;
          const barHeight = percent * hFft * 0.82;
          
          const x = i * barWidth;
          const y = hFft - barHeight;

          const grad = fftCtx.createLinearGradient(0, y, 0, hFft);
          grad.addColorStop(0, "#a855f7"); // Purple
          grad.addColorStop(1, "rgba(99, 102, 241, 0.1)");

          fftCtx.fillStyle = grad;
          fftCtx.fillRect(x + 1, y, barWidth - 2, barHeight);
        }
      } else {
        // Draw flat spectrum line with faint noise
        fftCtx.strokeStyle = "rgba(168, 85, 247, 0.3)";
        fftCtx.lineWidth = 1.5;
        fftCtx.beginPath();
        fftCtx.moveTo(0, hFft - 2);
        for (let x = 0; x < wFft; x += 5) {
          const noise = Math.random() * 2;
          fftCtx.lineTo(x, hFft - 2 - noise);
        }
        fftCtx.stroke();
      }

      // --- 3. DRAW UNIQUE GEOMETRIC TIMBRE ANIMATION ---
      geoCtx.clearRect(0, 0, wGeo, hGeo);
      
      const centerX = wGeo / 2;
      const centerY = hGeo / 2;
      const maxRadius = Math.min(wGeo, hGeo) * 0.45;

      const instGlow = instrument.id === 1 ? "#3b82f6" :
                       instrument.id === 2 ? "#6366f1" :
                       instrument.id === 3 ? "#a855f7" :
                       instrument.id === 4 ? "#ec4899" :
                       instrument.id === 5 ? "#06b6d4" : "#10b981";

      geoCtx.strokeStyle = "rgba(63, 63, 70, 0.15)";
      geoCtx.lineWidth = 1;

      // Visuals selection by instrument
      switch (instrument.id) {
        
        // 1. THE BASS: Pulsing geometric circles
        case 1: {
          const circles = 4;
          const bassPulse = volumeLevel * 30;
          for (let i = 0; i < circles; i++) {
            const rad = maxRadius * 0.25 * (i + 1) + Math.sin(phase + i) * 6 + bassPulse;
            geoCtx.strokeStyle = `rgba(59, 130, 246, ${0.12 + (circles - i) * 0.08 + volumeLevel * 0.2})`;
            geoCtx.lineWidth = 1.5 + (circles - i) * 0.5;
            geoCtx.beginPath();
            geoCtx.arc(centerX, centerY, Math.max(5, rad), 0, Math.PI * 2);
            geoCtx.stroke();
          }
          break;
        }

        // 2. THE PIANO: Dissipating ripples
        case 2: {
          // Trigger a ripple
          if (triggerEdge || (isPlaying && volumeLevel > 0.3 && ripplesRef.current.length < 5 && Math.random() < 0.04)) {
            ripplesRef.current.push({
              x: centerX + (Math.random() - 0.5) * 40,
              y: centerY + (Math.random() - 0.5) * 40,
              r: 5,
              opacity: 0.8,
              speed: 1.8 + Math.random() * 1.5,
            });
          }

          // Draw grid rings
          geoCtx.strokeStyle = "rgba(63, 63, 70, 0.08)";
          geoCtx.beginPath();
          geoCtx.arc(centerX, centerY, maxRadius * 0.6, 0, Math.PI * 2);
          geoCtx.arc(centerX, centerY, maxRadius * 0.9, 0, Math.PI * 2);
          geoCtx.stroke();

          // Render ripples
          ripplesRef.current.forEach((rip, rIdx) => {
            rip.r += rip.speed;
            rip.opacity -= 0.009;

            geoCtx.strokeStyle = `rgba(99, 102, 241, ${rip.opacity})`;
            geoCtx.lineWidth = 2;
            geoCtx.shadowColor = "#6366f1";
            geoCtx.shadowBlur = rip.opacity * 10;
            geoCtx.beginPath();
            geoCtx.arc(rip.x, rip.y, rip.r, 0, Math.PI * 2);
            geoCtx.stroke();
          });
          geoCtx.shadowBlur = 0;

          // Filter out expired ripples
          ripplesRef.current = ripplesRef.current.filter(rip => rip.opacity > 0);
          break;
        }

        // 3. THE VIOLIN: Continuous Lissajous curve ribbon
        case 3: {
          geoCtx.lineWidth = 2;
          geoCtx.strokeStyle = "rgba(168, 85, 247, 0.75)";
          geoCtx.shadowColor = "#a855f7";
          geoCtx.shadowBlur = 10;

          // Phase shift creates ribbon rotation
          geoCtx.beginPath();
          const points = 300;
          for (let i = 0; i <= points; i++) {
            const t = (i / points) * Math.PI * 2;
            // Lissajous equations: A=3, B=4
            // Scaled dynamically by playing volume level
            const curveScale = maxRadius * (0.6 + volumeLevel * 0.3);
            const lx = centerX + Math.sin(3 * t + phase) * curveScale;
            const ly = centerY + Math.sin(4 * t + phase * 0.7) * curveScale;

            if (i === 0) geoCtx.moveTo(lx, ly);
            else geoCtx.lineTo(lx, ly);
          }
          geoCtx.stroke();
          geoCtx.shadowBlur = 0;
          break;
        }

        // 4. THE BELL: Radiating expanding geometric octagons
        case 4: {
          if (triggerEdge || (isPlaying && volumeLevel > 0.4 && ripplesRef.current.length < 4 && Math.random() < 0.02)) {
            ripplesRef.current.push({
              x: centerX,
              y: centerY,
              r: 10,
              opacity: 0.9,
              speed: 2.2,
            });
          }

          ripplesRef.current.forEach((rip) => {
            rip.r += rip.speed;
            rip.opacity -= 0.006; // decays slower like a bell

            geoCtx.strokeStyle = `rgba(236, 72, 153, ${rip.opacity})`;
            geoCtx.lineWidth = 1.5;
            geoCtx.shadowColor = "#ec4899";
            geoCtx.shadowBlur = rip.opacity * 12;

            // Draw octagonal shape instead of circular ring
            const sides = 8;
            geoCtx.beginPath();
            for (let i = 0; i <= sides; i++) {
              const theta = (i / sides) * Math.PI * 2 + phase * 0.1;
              const ox = rip.x + Math.cos(theta) * rip.r;
              const oy = rip.y + Math.sin(theta) * rip.r;
              if (i === 0) geoCtx.moveTo(ox, oy);
              else geoCtx.lineTo(ox, oy);
            }
            geoCtx.closePath();
            geoCtx.stroke();
          });
          geoCtx.shadowBlur = 0;

          ripplesRef.current = ripplesRef.current.filter(rip => rip.opacity > 0);
          break;
        }

        // 5. THE LEAD SYNTH: Rotating audio-modulated star polygons
        case 5: {
          const numPoints = 6;
          const outerR = maxRadius * (0.5 + volumeLevel * 0.45);
          const innerR = maxRadius * (0.22 + volumeLevel * 0.2);
          const rotAngle = phase;

          geoCtx.strokeStyle = "rgba(6, 182, 212, 0.8)";
          geoCtx.lineWidth = 2.5;
          geoCtx.shadowColor = "#06b6d4";
          geoCtx.shadowBlur = 10;

          geoCtx.beginPath();
          for (let i = 0; i < numPoints * 2; i++) {
            const angle = (i / (numPoints * 2)) * Math.PI * 2 + rotAngle;
            const r = i % 2 === 0 ? outerR : innerR;
            const px = centerX + Math.cos(angle) * r;
            const py = centerY + Math.sin(angle) * r;
            if (i === 0) geoCtx.moveTo(px, py);
            else geoCtx.lineTo(px, py);
          }
          geoCtx.closePath();
          geoCtx.stroke();
          geoCtx.shadowBlur = 0;
          break;
        }

        // 6. THE DRUM: Percussive particle bursts
        case 6: {
          // Trigger explosive explosion particles
          if (triggerEdge) {
            const count = 35;
            for (let i = 0; i < count; i++) {
              const theta = Math.random() * Math.PI * 2;
              const speed = 2.5 + Math.random() * 5.5;
              particlesRef.current.push({
                x: centerX,
                y: centerY,
                vx: Math.cos(theta) * speed,
                vy: Math.sin(theta) * speed,
                size: 2.0 + Math.random() * 4.0,
                color: "#10b981", // Emerald
                opacity: 0.9,
                decay: 0.02 + Math.random() * 0.02,
              });
            }
          }

          // Draw concentric guide circles
          geoCtx.strokeStyle = "rgba(16, 185, 129, 0.05)";
          geoCtx.beginPath();
          geoCtx.arc(centerX, centerY, maxRadius * 0.5, 0, Math.PI * 2);
          geoCtx.arc(centerX, centerY, maxRadius * 0.8, 0, Math.PI * 2);
          geoCtx.stroke();

          // Render particles
          particlesRef.current.forEach((part) => {
            part.x += part.vx;
            part.y += part.vy;
            part.opacity -= part.decay;

            geoCtx.fillStyle = `rgba(16, 185, 129, ${part.opacity})`;
            geoCtx.shadowColor = "#10b981";
            geoCtx.shadowBlur = part.opacity * 8;
            geoCtx.beginPath();
            geoCtx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
            geoCtx.fill();
          });
          geoCtx.shadowBlur = 0;

          // Filter out expired particles
          particlesRef.current = particlesRef.current.filter(part => part.opacity > 0);
          break;
        }
      }

      animationRef.current = requestAnimationFrame(loop);
    };

    animationRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("resize", resize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [instrument, isPlaying, triggeredInstruments, getTrackAnalyser]);

  if (!instrument) return null;

  const trackState = instrumentsState[instrument.id - 1];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto"
      >
        <motion.div
          initial={{ scale: 0.95, y: 15, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.95, y: 15, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 180 }}
          className="bg-zinc-950 border border-zinc-900 w-full max-w-5xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] relative"
        >
          {/* Top colored aesthetic strip */}
          <div
            className="h-1.5 w-full"
            style={{
              background: instrument.id === 1 ? "linear-gradient(to right, #3b82f6, #1d4ed8)" :
                          instrument.id === 2 ? "linear-gradient(to right, #6366f1, #4f46e5)" :
                          instrument.id === 3 ? "linear-gradient(to right, #a855f7, #7c3aed)" :
                          instrument.id === 4 ? "linear-gradient(to right, #ec4899, #be185d)" :
                          instrument.id === 5 ? "linear-gradient(to right, #06b6d4, #0891b2)" :
                          "linear-gradient(to right, #10b981, #047857)",
            }}
          />

          {/* Modal Header */}
          <div className="flex items-center justify-between p-5 border-b border-zinc-900 bg-zinc-950/60">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 font-semibold">
                INSTRUMENT 0{instrument.id}
              </span>
              <h2 className="text-lg font-bold text-zinc-100 uppercase tracking-widest">
                {instrument.name} &bull; DETAIL VIEWS
              </h2>
            </div>
            
            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-full border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-700 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Modal Content - Split layout */}
          <div className="flex-1 overflow-y-auto p-5 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left side: Canvas Visualizers (Grid area) */}
            <div className="lg:col-span-7 flex flex-col gap-5">
              
              {/* Primary Geometric Visualizer Canvas */}
              <div className="relative aspect-video w-full bg-zinc-900/30 border border-zinc-900 rounded-2xl p-4 flex flex-col justify-between overflow-hidden shadow-inner select-none">
                <span className="text-[9px] font-bold font-mono tracking-widest text-zinc-500 uppercase select-none z-10">
                  RESONANT GEOMETRY FIELD
                </span>
                
                <canvas ref={geoCanvasRef} className="absolute inset-0 w-full h-full block" />

                <div className="flex justify-between items-end z-10 pointer-events-none">
                  <span className="text-[10px] text-zinc-400 font-medium">
                    {instrument.name} Timbre
                  </span>
                  <span className="text-[8px] font-mono text-zinc-600">
                    r(θ, t) = Math-env(t)
                  </span>
                </div>
              </div>

              {/* Subsplit Oscilloscope & FFT Canvas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 2D Waveform */}
                <div className="bg-zinc-900/30 border border-zinc-900 p-4 rounded-2xl flex flex-col justify-between h-36 relative overflow-hidden select-none">
                  <span className="text-[8px] font-bold font-mono tracking-widest text-zinc-500 uppercase">
                    Live 2D Oscilloscope
                  </span>
                  <canvas ref={oscCanvasRef} className="absolute inset-0 w-full h-full block" />
                  <span className="z-10 text-[8px] text-zinc-600 font-mono mt-auto pt-8">
                    Time-domain waveform
                  </span>
                </div>

                {/* Instrument FFT Spectrum */}
                <div className="bg-zinc-900/30 border border-zinc-900 p-4 rounded-2xl flex flex-col justify-between h-36 relative overflow-hidden select-none">
                  <span className="text-[8px] font-bold font-mono tracking-widest text-zinc-500 uppercase">
                    Timbre Harmonic Bins
                  </span>
                  <canvas ref={fftCanvasRef} className="absolute inset-0 w-full h-full block" />
                  <span className="z-10 text-[8px] text-zinc-600 font-mono mt-auto pt-8">
                    FFT frequency levels
                  </span>
                </div>
              </div>

            </div>

            {/* Right side: Math Details & Analysis */}
            <div className="lg:col-span-5 flex flex-col justify-between gap-5">
              
              <div className="flex flex-col gap-4">
                {/* Math Formulation */}
                <div className="bg-zinc-900/30 border border-zinc-900 rounded-2xl p-5 shadow-inner">
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3 font-mono">
                    MATHEMATICAL FORMULATION
                  </h3>
                  
                  <div className="bg-zinc-950/90 border border-zinc-900 rounded-xl p-4 flex flex-col items-center justify-center select-all group">
                    <span className="text-xl md:text-2xl font-serif text-indigo-300 font-medium italic tracking-wide text-center">
                      {instrument.latex.replace(/\\sum/g, "∑").replace(/\\sin/g, "sin").replace(/\\frac/g, "").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\^/g, "^").replace(/_(\w+|\{.*?\})/g, "")}
                    </span>
                    <span className="text-[8px] font-mono text-zinc-600 mt-2 select-all hover:text-cyan-400 transition-colors">
                      LaTeX: {instrument.latex}
                    </span>
                  </div>
                </div>

                {/* Acoustic description */}
                <div className="bg-zinc-900/30 border border-zinc-900 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Info className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono">
                      TIMBRE CHARACTERISTICS
                    </h3>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {instrument.description}
                  </p>
                </div>

                {/* "What makes this sound unique?" detailed analysis */}
                <div className="bg-zinc-900/20 border border-zinc-900/60 rounded-2xl p-5">
                  <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 font-mono">
                    DSP & Synthesis Breakdown
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed font-normal">
                    {instrument.whyUnique}
                  </p>
                </div>
              </div>

              {/* Action area: Play test trigger */}
              <div className="bg-zinc-900/30 border border-zinc-900 rounded-2xl p-4 flex items-center justify-between gap-3 mt-auto">
                <div className="flex items-center gap-2.5 font-mono text-[9px] tracking-widest text-zinc-500">
                  <Volume2 className="w-4 h-4 text-zinc-400 animate-pulse" />
                  LEVEL: {trackState ? Math.round(trackState.volume * 100) : 60}%
                </div>

                <button
                  onClick={() => triggerManualNote(instrument.id)}
                  className={`px-5 py-2.5 rounded-xl font-mono text-xs font-bold tracking-widest flex items-center gap-2 cursor-pointer transition-all duration-300 bg-gradient-to-r text-white shadow-lg`}
                  style={{
                    backgroundImage: instrument.id === 1 ? "linear-gradient(to right, #2563eb, #1d4ed8)" :
                                     instrument.id === 2 ? "linear-gradient(to right, #4f46e5, #4338ca)" :
                                     instrument.id === 3 ? "linear-gradient(to right, #7c3aed, #6d28d9)" :
                                     instrument.id === 4 ? "linear-gradient(to right, #db2777, #be185d)" :
                                     instrument.id === 5 ? "linear-gradient(to right, #0891b2, #0e7490)" :
                                     "linear-gradient(to right, #059669, #047857)",
                  }}
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  TRIGGER SOUND
                </button>
              </div>

            </div>

          </div>

          {/* Modal Footer */}
          <div className="p-4 bg-zinc-950 border-t border-zinc-900 flex justify-between items-center text-[9px] font-mono text-zinc-600">
            <span>Equation Orchestra &bull; Details Panel</span>
            <span>DSP Analyser Rates: 44.1/48kHz</span>
          </div>

        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
