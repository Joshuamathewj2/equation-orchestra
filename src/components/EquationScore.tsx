"use client";

import React, { useEffect, useRef } from "react";
import { useAudioEngine } from "@/context/AudioEngineContext";
import { INSTRUMENTS } from "@/constants/instruments";
import {
  NOTE_NAMES,
  chordName,
  chordRootDegree,
  degreeToMidi,
  fractionalDegreeToMidi,
  tonicMidi,
  voicedChordRoot,
} from "@/lib/music";
import { Dices, RotateCcw, Sigma, AlertTriangle } from "lucide-react";

const PAST_BEATS = 10;
const FUTURE_BEATS = 6;
const LOW_OFFSET = -10; // semitones below the tonic
const HIGH_OFFSET = 50; // semitones above the tonic

export const EquationScore: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const {
    getScoreSnapshot,
    instrumentsState,
    motionEquations,
    motionErrors,
    setMotionEquation,
    randomizeMotion,
    resetMotion,
    grid,
  } = useAudioEngine();

  // The draw loop reads these through refs so it never needs to restart
  const instrumentsStateRef = useRef(instrumentsState);
  const gridRef = useRef(grid);
  useEffect(() => {
    instrumentsStateRef.current = instrumentsState;
    gridRef.current = grid;
  }, [instrumentsState, grid]);

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

    let frame = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const { beat, notes, motionFns, keyIndex, scale } = getScoreSnapshot();

      const labelW = 34;
      const plotW = w - labelW;
      const playheadX = labelW + plotW * (PAST_BEATS / (PAST_BEATS + FUTURE_BEATS));
      const pxPerBeat = plotW / (PAST_BEATS + FUTURE_BEATS);
      const beatToX = (b: number) => playheadX + (b - beat) * pxPerBeat;

      const tonic = tonicMidi(keyIndex);
      const lowMidi = tonic + LOW_OFFSET;
      const highMidi = tonic + HIGH_OFFSET;
      const midiToY = (m: number) => h - 8 - ((m - lowMidi) / (highMidi - lowMidi)) * (h - 26);

      ctx.clearRect(0, 0, w, h);

      // --- Bars & chord labels ---
      const firstBar = Math.floor((beat - PAST_BEATS) / 4);
      const lastBar = Math.ceil((beat + FUTURE_BEATS) / 4);
      ctx.font = "10px ui-monospace, monospace";
      for (let bar = firstBar; bar <= lastBar; bar++) {
        if (bar < 0) continue;
        const x0 = beatToX(bar * 4);
        const x1 = beatToX(bar * 4 + 4);
        if (bar % 2 === 0) {
          ctx.fillStyle = "rgba(99, 102, 241, 0.035)";
          ctx.fillRect(Math.max(labelW, x0), 0, Math.min(x1, w) - Math.max(labelW, x0), h);
        }
        ctx.strokeStyle = "rgba(113, 113, 122, 0.25)";
        ctx.beginPath();
        ctx.moveTo(x0, 0);
        ctx.lineTo(x0, h);
        ctx.stroke();
        if (x0 + 4 > labelW) {
          ctx.fillStyle = bar === Math.floor(beat / 4) ? "rgba(244, 114, 182, 0.95)" : "rgba(161, 161, 170, 0.5)";
          ctx.fillText(chordName(chordRootDegree(bar, scale), keyIndex, scale), x0 + 5, 12);
        }
      }

      // --- Scale lines (the "staff" the equations get snapped onto) ---
      for (let deg = -7; deg <= 35; deg++) {
        const m = degreeToMidi(deg, keyIndex, scale);
        if (m < lowMidi || m > highMidi) continue;
        const y = midiToY(m);
        const isTonic = ((deg % 7) + 7) % 7 === 0;
        ctx.strokeStyle = isTonic ? "rgba(161, 161, 170, 0.22)" : "rgba(82, 82, 91, 0.13)";
        ctx.beginPath();
        ctx.moveTo(labelW, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        if (isTonic) {
          ctx.fillStyle = "rgba(161, 161, 170, 0.6)";
          ctx.fillText(`${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`, 4, y + 3);
        }
      }

      const anySoloed = instrumentsStateRef.current.some((s) => s.isSoloed);
      const isSilent = (idx: number) => {
        const s = instrumentsStateRef.current[idx];
        return !s || s.isMuted || (anySoloed && !s.isSoloed) || !gridRef.current[idx].some(Boolean);
      };

      // --- Continuous equation curves m(t), past solid / future dashed ---
      INSTRUMENTS.forEach((inst, idx) => {
        const fn = motionFns[idx];
        if (!fn || isSilent(idx)) return;
        ctx.strokeStyle = inst.hex;
        ctx.lineWidth = 1.25;
        for (const future of [false, true]) {
          ctx.globalAlpha = future ? 0.28 : 0.4;
          ctx.setLineDash(future ? [3, 4] : []);
          ctx.beginPath();
          let penDown = false;
          let prevBar = NaN;
          const from = future ? beat : beat - PAST_BEATS;
          const to = future ? beat + FUTURE_BEATS : beat;
          for (let b = Math.max(0, from); b <= to; b += 0.05) {
            const bar = Math.floor(b / 4);
            const v = fn(b);
            if (!Number.isFinite(v)) {
              penDown = false;
              continue;
            }
            const root = voicedChordRoot(chordRootDegree(bar, scale));
            const clamped = Math.max(-12, Math.min(12, v));
            const y = midiToY(fractionalDegreeToMidi(root + inst.register + clamped, keyIndex, scale));
            const x = beatToX(b);
            // Lift the pen at bar lines, where the chord root jumps
            if (!penDown || bar !== prevBar) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            penDown = true;
            prevBar = bar;
          }
          ctx.stroke();
        }
      });
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // --- Played notes: the curve after it has been snapped into key ---
      for (const n of notes) {
        const x0 = beatToX(n.beat);
        const x1 = beatToX(n.beat + n.durBeats);
        if (x1 < labelW || x0 > w) continue;
        const inst = INSTRUMENTS[n.inst];
        const age = beat - n.beat;
        const fresh = Math.max(0, 1 - age / 0.6);
        const y = midiToY(n.midi);

        // Snap tick: from the raw curve value to the quantized note
        if (Math.abs(n.rawMidi - n.midi) > 0.15) {
          ctx.strokeStyle = inst.hex;
          ctx.globalAlpha = 0.35 + fresh * 0.5;
          ctx.beginPath();
          ctx.moveTo(x0, midiToY(n.rawMidi));
          ctx.lineTo(x0, y);
          ctx.stroke();
        }

        ctx.globalAlpha = 0.55 + fresh * 0.45;
        ctx.fillStyle = inst.hex;
        ctx.shadowColor = inst.hex;
        ctx.shadowBlur = 4 + fresh * 14;
        ctx.beginPath();
        ctx.roundRect(x0, y - 2.5, Math.max(3, x1 - x0 - 1), 5, 2.5);
        ctx.fill();
        if (fresh > 0) {
          ctx.globalAlpha = fresh;
          ctx.beginPath();
          ctx.arc(x0, y, 3 + (1 - fresh) * 9, 0, Math.PI * 2);
          ctx.strokeStyle = inst.hex;
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;

      // --- Playhead ---
      const grad = ctx.createLinearGradient(playheadX - 30, 0, playheadX, 0);
      grad.addColorStop(0, "rgba(34, 211, 238, 0)");
      grad.addColorStop(1, "rgba(34, 211, 238, 0.08)");
      ctx.fillStyle = grad;
      ctx.fillRect(playheadX - 30, 0, 30, h);
      ctx.strokeStyle = "rgba(34, 211, 238, 0.8)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, h);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = "rgba(34, 211, 238, 0.9)";
      ctx.fillText(`t = ${beat.toFixed(2)}`, playheadX + 6, h - 6);

      frame = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frame);
    };
  }, [getScoreSnapshot]);

  return (
    <div className="w-full bg-zinc-950/70 border border-zinc-900 rounded-2xl p-5 md:p-6 shadow-2xl relative overflow-hidden backdrop-blur-md">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500 via-cyan-500 to-fuchsia-500 opacity-80" />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-zinc-900 pb-4 mb-4 gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-widest flex items-center gap-2">
            <Sigma className="w-4 h-4 text-emerald-400" />
            Equation Score
          </h2>
          <p className="text-[10px] text-zinc-500 font-mono max-w-xl">
            Each curve is an instrument&apos;s motion equation m(t). On every step it is sampled and snapped onto the
            key: chord tones on beats, scale tones in between. Dashed lines are the future: the equation already
            knows what comes next.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => randomizeMotion()}
            title="Compose new motion equations from irrational ratios"
            className="p-1.5 px-3 rounded-xl border border-emerald-800/40 bg-emerald-950/30 hover:bg-emerald-950/60 text-emerald-400 transition-colors flex items-center gap-1.5 text-xs font-mono cursor-pointer"
          >
            <Dices className="w-3.5 h-3.5" />
            COMPOSE
          </button>
          <button
            onClick={resetMotion}
            title="Restore the original motion equations"
            className="p-1.5 px-3 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800/80 text-zinc-400 hover:text-white transition-colors flex items-center gap-1 text-xs font-mono cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            RESET
          </button>
        </div>
      </div>

      <div className="relative w-full h-64 md:h-80 bg-zinc-950 rounded-xl overflow-hidden border border-zinc-900/50 mb-4">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* Motion equation editor */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {INSTRUMENTS.map((inst, idx) => {
          const error = motionErrors[idx];
          return (
            <div
              key={inst.id}
              className={`flex items-center gap-2 bg-zinc-900/40 border rounded-xl px-3 py-1.5 transition-colors ${
                error ? "border-red-900/60" : "border-zinc-800/60 focus-within:border-zinc-600"
              }`}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: inst.hex, boxShadow: `0 0 8px ${inst.hex}` }}
              />
              <span className="w-14 shrink-0 text-[10px] font-mono font-bold text-zinc-300 truncate">
                {inst.name.replace("The ", "")}
              </span>
              <span className="text-[11px] math-font text-zinc-500 shrink-0">m(t) =</span>
              <input
                value={motionEquations[idx]}
                onChange={(e) => setMotionEquation(idx, e.target.value)}
                spellCheck={false}
                aria-label={`${inst.name} motion equation`}
                className="flex-1 min-w-0 bg-transparent outline-none text-[11px] font-mono text-zinc-100 placeholder:text-zinc-700"
                placeholder="e.g. 3sin(t/phi)"
              />
              {error && (
                <span title={error} className="text-red-400 shrink-0">
                  <AlertTriangle className="w-3.5 h-3.5" />
                </span>
              )}
              <button
                onClick={() => randomizeMotion(idx)}
                title={`New equation for ${inst.name}`}
                className="text-zinc-600 hover:text-emerald-400 transition-colors shrink-0 cursor-pointer"
              >
                <Dices className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      <p className="text-[9px] text-zinc-600 font-mono mt-3">
        t = time in beats · output = scale steps above the chord root · try sin cos tri saw sq noise abs floor round
        frac mod, constants pi e phi tau
      </p>
    </div>
  );
};
