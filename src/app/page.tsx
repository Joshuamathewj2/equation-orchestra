"use client";

import React, { useState } from "react";
import { AudioEngineProvider, useAudioEngine } from "@/context/AudioEngineContext";
import { INSTRUMENTS } from "@/constants/instruments";
import { FloatingParticles } from "@/components/FloatingParticles";
import { MasterMixVisualizer } from "@/components/MasterMixVisualizer";
import { SequencerGrid } from "@/components/SequencerGrid";
import { InstrumentCard } from "@/components/InstrumentCard";
import { DetailsPanel } from "@/components/DetailsPanel";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Play, 
  Volume2, 
  Settings2, 
  Torus, 
  Info, 
  Activity, 
  ChevronRight, 
  HelpCircle 
} from "lucide-react";
import Image from "next/image";

function OrchestraApp() {
  const {
    isUnlocked,
    unlockAudioContext,
    isPlaying,
    togglePlay,
    masterVolume,
    setMasterVolume,
    tempo,
    setTempo,
    basePitch,
    setBasePitch,
  } = useAudioEngine();

  const [selectedInstrumentId, setSelectedInstrumentId] = useState<number | null>(null);

  const selectedInstrument = selectedInstrumentId
    ? INSTRUMENTS.find((inst) => inst.id === selectedInstrumentId) || null
    : null;

  return (
    <div className="flex-1 w-full min-h-screen text-white flex flex-col items-center justify-between p-4 md:p-8 relative select-none font-sans overflow-x-hidden">
      
      {/* Dynamic Background Particle System */}
      <FloatingParticles />

      <style>{`
        @keyframes breathing-glow {
          0%, 100% {
            filter: drop-shadow(0 0 20px rgba(129, 140, 248, 0.4)) drop-shadow(0 0 40px rgba(99, 102, 241, 0.2));
          }
          50% {
            filter: drop-shadow(0 0 40px rgba(129, 140, 248, 0.8)) drop-shadow(0 0 80px rgba(99, 102, 241, 0.5)) drop-shadow(0 0 10px rgba(6, 182, 212, 0.3));
          }
        }

        .logo-breathing {
          animation: breathing-glow 4s ease-in-out infinite;
        }

        .logo-container {
          perspective: 1000px;
        }
      `}</style>

      <AnimatePresence mode="wait">
        {!isUnlocked ? (
          /* --- LANDING LOCK SCREEN --- */
          <motion.main
            key="landing"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.5 }}
            className="flex-1 flex flex-col items-center justify-center text-center max-w-2xl px-4 z-10 py-16"
          >
            {/* Logo Image */}
            <div className="logo-container mb-4 relative">
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="logo-breathing drop-shadow-2xl w-80 h-auto"
              >
                <Image
                  src="/logo.png"
                  alt="Equation Orchestra Logo"
                  width={320}
                  height={320}
                  priority
                  className="w-full h-auto"
                />
              </motion.div>
            </div>

            <span className="text-[10px] tracking-[0.4em] text-cyan-400 font-bold uppercase mb-2 animate-pulse">
              Interactive Digital Concert Hall
            </span>

            <h1 className="text-3xl md:text-5xl font-extrabold tracking-[0.18em] uppercase bg-clip-text text-transparent bg-gradient-to-r from-indigo-200 via-zinc-100 to-pink-200 mb-4 font-mono">
              Equation Orchestra
            </h1>

            <p className="text-xs md:text-sm text-zinc-400 leading-relaxed max-w-lg mb-10 font-normal">
              Step into a mathematical soundscape where equations become instruments. Mix, solo, and sequence sines, Fourier series, exponential decay and more. Where Mathematics Becomes Music.
            </p>

            {/* Lock Unlock Giant Landing Button */}
            <button
              onClick={unlockAudioContext}
              className="px-8 py-5 rounded-2xl bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 text-white font-bold tracking-[0.25em] text-xs md:text-sm shadow-xl shadow-indigo-500/20 hover:shadow-2xl hover:shadow-indigo-400/40 transition-all duration-300 group flex items-center gap-2 hover:from-indigo-500 hover:via-fuchsia-500 hover:to-pink-500"
            >
              <Play className="w-4 h-4 fill-white transition-transform group-hover:scale-110" />
              Enter Concert Hall
            </button>
          </motion.main>
        ) : (
          /* --- MAIN DASHBOARD INTERFACE --- */
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="w-full max-w-6xl flex-1 flex flex-col gap-6 z-10 pb-8"
          >
            
            {/* Header section */}
            <header className="flex flex-col md:flex-row items-center justify-between border-b border-zinc-900 pb-5 gap-4">
              <div className="text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-2.5 mb-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                  <h1 className="text-xl md:text-2xl font-extrabold tracking-[0.22em] text-zinc-100 uppercase font-mono">
                    EQUATION ORCHESTRA
                  </h1>
                </div>
                <p className="text-[10px] tracking-[0.1em] text-indigo-400 font-medium uppercase font-mono">
                  Synthesized Client-Side via Web Audio API & Canvas
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="text-[9px] font-mono text-zinc-500 border border-zinc-900 px-3 py-1.5 rounded-xl bg-zinc-950/60 uppercase">
                  Audio Link: ACTIVE
                </span>
              </div>
            </header>

            {/* Master Dashboard (Top) controls */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              
              {/* Master Mixer Controls Slider (Left) */}
              <div className="lg:col-span-5 bg-zinc-950/70 border border-zinc-900 rounded-2xl p-5 md:p-6 shadow-2xl flex flex-col justify-between backdrop-blur-md relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-pink-500/5 pointer-events-none" />
                <div className="flex items-center gap-2 mb-4 border-b border-zinc-900 pb-3 relative z-10">
                  <Settings2 className="w-4 h-4 text-indigo-400" />
                  <h2 className="text-xs font-semibold text-zinc-100 uppercase tracking-widest">
                    Master Console Panel
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 relative z-10">
                  {/* Master Volume */}
                  <div className="flex flex-col gap-1.5 bg-zinc-900/30 border border-zinc-900/60 p-3 rounded-xl">
                    <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                      Volume <span>{Math.round(masterVolume * 100)}%</span>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="1.0"
                      step="0.05"
                      value={masterVolume}
                      onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                      className="w-full cursor-pointer h-1 bg-zinc-950 rounded appearance-none"
                      style={{ accentColor: "#6366f1" }}
                    />
                  </div>

                  {/* Tuning Fundamental Pitch */}
                  <div className="flex flex-col gap-1.5 bg-zinc-900/30 border border-zinc-900/60 p-3 rounded-xl">
                    <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                      Tuning <span>{basePitch} Hz</span>
                    </span>
                    <input
                      type="range"
                      min="65"
                      max="300"
                      step="5"
                      value={basePitch}
                      onChange={(e) => setBasePitch(parseInt(e.target.value))}
                      className="w-full cursor-pointer h-1 bg-zinc-950 rounded appearance-none"
                      style={{ accentColor: "#a855f7" }}
                    />
                  </div>

                  {/* Tempo BPM */}
                  <div className="flex flex-col gap-1.5 bg-zinc-900/30 border border-zinc-900/60 p-3 rounded-xl">
                    <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                      Tempo <span>{tempo} BPM</span>
                    </span>
                    <input
                      type="range"
                      min="60"
                      max="180"
                      step="2"
                      value={tempo}
                      onChange={(e) => setTempo(parseInt(e.target.value))}
                      className="w-full cursor-pointer h-1 bg-zinc-950 rounded appearance-none"
                      style={{ accentColor: "#06b6d4" }}
                    />
                  </div>
                </div>

                <div className="text-[8px] text-zinc-600 font-mono mt-4 text-right relative z-10">
                  Base pitch: A3 Reference tuning scale
                </div>
              </div>

              {/* Master Mix Visualizer (Right) */}
              <div className="lg:col-span-7">
                <MasterMixVisualizer />
              </div>

            </section>

            {/* Concert Sequencer Grid (Middle) */}
            <section>
              <SequencerGrid />
            </section>

            {/* Orchestra Stage (Bottom Grid of Cards) */}
            <section className="flex flex-col gap-4">
              <div className="flex justify-between items-center px-1">
                <div>
                  <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                    Orchestra Stage Mix
                  </h2>
                  <p className="text-[9px] text-zinc-600 font-mono">
                    6 active channels. Set track volumes, mute/solo states or click details to tune.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {INSTRUMENTS.map((inst) => (
                  <InstrumentCard
                    key={inst.id}
                    instrument={inst}
                    onOpenDetails={setSelectedInstrumentId}
                  />
                ))}
              </div>
            </section>

            {/* Explanatory footer panel */}
            <footer className="bg-zinc-950/50 border border-zinc-900 p-4 rounded-2xl flex gap-3.5 items-start mt-4">
              <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-indigo-400 shrink-0">
                <Info className="w-4.5 h-4.5" />
              </div>
              <div className="flex-1 flex flex-col justify-center">
                <span className="text-[9px] tracking-widest text-zinc-500 uppercase font-mono mb-1.5">
                  Concert Hall Physics &amp; Mathematics
                </span>
                <p className="text-[11px] text-zinc-400 leading-relaxed font-normal">
                  In classical physics, mathematical functions correspond to physical shapes of waves. Timbre is created by stacking harmonic integers or adding inharmonic frequencies to explore [...]
                </p>
              </div>
            </footer>

            <div className="text-center text-[9px] text-zinc-700 font-mono mt-2">
              Equation Orchestra &bullet; Portfolio-Grade digital concert environment.
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* Selected Instrument Details Modal */}
      <AnimatePresence>
        {selectedInstrumentId && (
          <DetailsPanel
            instrument={selectedInstrument}
            onClose={() => setSelectedInstrumentId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Home() {
  return (
    <AudioEngineProvider>
      <OrchestraApp />
    </AudioEngineProvider>
  );
}
