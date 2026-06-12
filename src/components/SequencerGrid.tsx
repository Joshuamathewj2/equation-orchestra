"use client";

import React from "react";
import { useAudioEngine } from "@/context/AudioEngineContext";
import { INSTRUMENTS } from "@/constants/instruments";
import { Play, Square, Trash2, RotateCcw, HelpCircle, Music } from "lucide-react";

export const SequencerGrid: React.FC = () => {
  const {
    grid,
    toggleGridStep,
    clearGrid,
    currentStep,
    isPlaying,
    togglePlay,
    triggerManualNote,
    instrumentsState,
  } = useAudioEngine();

  // Reset grid back to the default instrument patterns
  const resetToDefault = () => {
    INSTRUMENTS.forEach((inst, instIdx) => {
      // Clear all steps first
      inst.defaultSteps.forEach((val, stepIdx) => {
        // Force sync with context state by toggling if they differ
        if (grid[instIdx][stepIdx] !== val) {
          toggleGridStep(instIdx, stepIdx);
        }
      });
    });
  };

  return (
    <div className="w-full bg-zinc-950/70 border border-zinc-900 rounded-2xl p-5 md:p-6 shadow-2xl relative overflow-hidden backdrop-blur-md">
      {/* Header bar controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-zinc-900 pb-4 mb-5 gap-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-widest flex items-center gap-2">
            <Music className="w-4 h-4 text-purple-400" />
            CONCERT SEQUENCER GRID
          </h2>
          <p className="text-[10px] text-zinc-500 font-mono">
            Interactive 16-step rhythm grid. Columns group into 4 beats.
          </p>
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-2">
          {/* Play/Pause Button */}
          <button
            onClick={togglePlay}
            className={`px-4 py-1.5 rounded-xl font-mono text-xs font-semibold tracking-wider flex items-center gap-1.5 transition-all duration-300 border cursor-pointer ${
              isPlaying
                ? "bg-fuchsia-950/30 text-fuchsia-400 border-fuchsia-800/40 hover:bg-fuchsia-950/50"
                : "bg-cyan-950/30 text-cyan-400 border-cyan-800/40 hover:bg-cyan-950/50"
            }`}
          >
            {isPlaying ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" />
                PAUSE ENGINE
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current animate-pulse" />
                START ORCHESTRA
              </>
            )}
          </button>

          {/* Reset Defaults */}
          <button
            onClick={resetToDefault}
            title="Reset to original mathematical patterns"
            className="p-1.5 px-3 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800/80 text-zinc-400 hover:text-white transition-colors flex items-center gap-1 text-xs font-mono cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            RESET
          </button>

          {/* Clear Grid */}
          <button
            onClick={clearGrid}
            title="Clear all sequencer steps"
            className="p-1.5 px-3 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800/80 text-zinc-400 hover:text-white transition-colors flex items-center gap-1 text-xs font-mono cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            CLEAR
          </button>
        </div>
      </div>

      {/* Grid Container */}
      <div className="w-full overflow-x-auto select-none scrollbar-thin scrollbar-thumb-zinc-800">
        <div className="min-w-[760px] flex flex-col gap-2.5 pb-2 relative">
          
          {/* Step header markers */}
          <div className="flex items-center gap-2">
            <div className="w-36 shrink-0 font-mono text-[9px] text-zinc-600 uppercase tracking-widest text-center">
              Instruments
            </div>
            <div className="flex-1 grid grid-cols-16 gap-1.5 text-center font-mono text-[9px] text-zinc-500 font-semibold">
              {Array.from({ length: 16 }).map((_, stepIdx) => {
                const isBeattart = stepIdx % 4 === 0;
                const isPlayhead = isPlaying && currentStep === stepIdx;
                return (
                  <span
                    key={stepIdx}
                    className={`transition-colors duration-150 ${
                      isPlayhead
                        ? "text-cyan-400 font-extrabold"
                        : isBeattart
                        ? "text-zinc-400 font-bold"
                        : "text-zinc-600"
                    }`}
                  >
                    {stepIdx + 1}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Sequencer Rows */}
          {INSTRUMENTS.map((inst, instIdx) => {
            const instMixState = instrumentsState[instIdx];
            const isMuted = instMixState?.isMuted;
            const anySoloed = instrumentsState.some(i => i.isSoloed);
            const isSoloed = instMixState?.isSoloed;
            const isDeactive = isMuted || (anySoloed && !isSoloed);

            return (
              <div key={inst.id} className="flex items-center gap-2 group/row">
                
                {/* Instrument label & Manual trigger button */}
                <button
                  onClick={() => triggerManualNote(inst.id)}
                  title={`Click to preview test note for ${inst.name}`}
                  className="w-36 shrink-0 flex items-center justify-between px-3 py-2 bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800/60 rounded-xl transition-all duration-200 group-hover/row:border-zinc-700/80 cursor-pointer text-left font-mono"
                >
                  <span className="text-[10px] font-bold text-zinc-300 group-hover/row:text-white truncate">
                    {inst.name.replace("The ", "")}
                  </span>
                  <span className="text-[8px] bg-zinc-950 px-1.5 py-0.5 rounded text-zinc-500 font-semibold uppercase group-hover/row:text-cyan-400 transition-colors">
                    Preview
                  </span>
                </button>

                {/* Step Cells */}
                <div className="flex-1 grid grid-cols-16 gap-1.5">
                  {grid[instIdx].map((isActive, stepIdx) => {
                    const isBeat = stepIdx % 4 === 0;
                    const isPlayhead = isPlaying && currentStep === stepIdx;
                    
                    // Determine colors based on instrument
                    let activeBg = "bg-purple-500 shadow-[0_0_12px_#a855f7]";
                    if (inst.id === 1) activeBg = "bg-blue-500 shadow-[0_0_12px_#3b82f6]";
                    if (inst.id === 5) activeBg = "bg-cyan-400 shadow-[0_0_12px_#22d3ee]";
                    if (inst.id === 6) activeBg = "bg-emerald-400 shadow-[0_0_12px_#34d399]";
                    if (inst.id === 4) activeBg = "bg-rose-500 shadow-[0_0_12px_#f43f5e]";

                    return (
                      <button
                        key={stepIdx}
                        onClick={() => toggleGridStep(instIdx, stepIdx)}
                        className={`aspect-square w-full rounded-md border transition-all duration-150 relative cursor-pointer ${
                          isActive
                            ? `${activeBg} border-transparent`
                            : isBeat
                            ? "bg-zinc-900/80 border-zinc-800/80 hover:bg-zinc-850 hover:border-zinc-700"
                            : "bg-zinc-950 border-zinc-900/60 hover:bg-zinc-900 hover:border-zinc-800"
                        } ${isPlayhead ? "after:absolute after:inset-0 after:rounded-md after:bg-white/20 after:animate-ping" : ""}`}
                      >
                        {/* Subtle step markings inside cells */}
                        {!isActive && isBeat && (
                          <span className="absolute inset-0 flex items-center justify-center text-[7px] text-zinc-700 font-bold">
                            &bull;
                          </span>
                        )}
                        {/* Draw highlight if playhead passes this cell */}
                        {isPlayhead && (
                          <div className="absolute inset-0 rounded-md border border-white opacity-80 pointer-events-none" />
                        )}
                        {/* Grey out cells if track is silent */}
                        {isActive && isDeactive && (
                          <div className="absolute inset-0 rounded-md bg-zinc-950/60 backdrop-saturate-50 pointer-events-none" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Sweeping playhead line running behind/over the cells */}
          {isPlaying && (
            <div
              className="absolute top-5 bottom-2 w-[2px] bg-cyan-400/30 shadow-[0_0_10px_#22d3ee] pointer-events-none transition-all duration-100 ease-linear hidden md:block"
              style={{
                // Calculate position relative to cell grid
                // Row labels = 144px width, gap = 8px
                // Cell area has 16 cells with 6px gaps
                left: `calc(144px + 8px + ((${currentStep} / 16) * (100% - 152px)))`,
              }}
            />
          )}

        </div>
      </div>
    </div>
  );
};
