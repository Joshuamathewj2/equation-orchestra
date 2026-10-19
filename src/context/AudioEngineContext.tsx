"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { INSTRUMENTS } from "@/constants/instruments";
import { compileExpression, randomMotionEquation, CompiledExpr } from "@/lib/mathExpr";
import {
  SCALES,
  ScaleKey,
  ScaleDef,
  chordRootDegree,
  chordName,
  degreeToMidi,
  fractionalDegreeToMidi,
  midiToFreq,
  quantizeSteps,
  voicedChordRoot,
} from "@/lib/music";

export interface InstrumentState {
  id: number;
  name: string;
  volume: number; // 0.0 to 1.0
  isMuted: boolean;
  isSoloed: boolean;
  color: string;
  latex: string;
}

// A note that the engine actually played, used by the score visualizer
export interface NoteEvent {
  beat: number;
  midi: number;
  rawMidi: number; // where the un-quantized curve was when the note fired
  inst: number;
  durBeats: number;
  velocity: number;
}

export interface ScoreSnapshot {
  beat: number;
  notes: NoteEvent[];
  motionFns: (CompiledExpr | null)[];
  keyIndex: number;
  scale: ScaleDef;
}

interface AudioEngineContextType {
  isUnlocked: boolean;
  unlockAudioContext: () => Promise<AudioContext | null>;
  isPlaying: boolean;
  togglePlay: () => void;
  masterVolume: number;
  setMasterVolume: (vol: number) => void;
  tempo: number;
  setTempo: (bpm: number) => void;
  keyIndex: number;
  setKeyIndex: (key: number) => void;
  scaleKey: ScaleKey;
  setScaleKey: (scale: ScaleKey) => void;
  motionEquations: string[];
  motionErrors: (string | null)[];
  setMotionEquation: (instIdx: number, src: string) => void;
  randomizeMotion: (instIdx?: number) => void;
  resetMotion: () => void;
  instrumentsState: InstrumentState[];
  setInstrumentVolume: (id: number, vol: number) => void;
  toggleMute: (id: number) => void;
  toggleSolo: (id: number) => void;
  grid: boolean[][]; // [instrumentIdx][stepIdx]
  toggleGridStep: (instIdx: number, stepIdx: number) => void;
  clearGrid: () => void;
  resetGrid: () => void;
  currentStep: number;
  triggeredInstruments: boolean[]; // whether instrument was just triggered
  getTrackAnalyser: (id: number) => AnalyserNode | null;
  getMasterAnalyser: () => AnalyserNode | null;
  getScoreSnapshot: () => ScoreSnapshot;
  triggerManualNote: (id: number) => void;
  currentChordName: string;
}

const AudioEngineContext = createContext<AudioEngineContextType | undefined>(undefined);

export const useAudioEngine = () => {
  const context = useContext(AudioEngineContext);
  if (!context) {
    throw new Error("useAudioEngine must be used within an AudioEngineProvider");
  }
  return context;
};

const DEFAULT_VOLUMES = [0.75, 0.6, 0.6, 0.55, 0.5, 0.55, 0.5, 0.45];
const NOTE_HISTORY_LIMIT = 400;

const nextChordTone = (steps: number) => {
  let c = steps + 1;
  while (![0, 2, 4].includes(((c % 7) + 7) % 7)) c++;
  return c;
};

// The room is an equation too: h(t) = n(t)·e^(-t/τ), with high frequencies
// decaying faster than lows (a one-pole lowpass that closes over time).
const createImpulseResponse = (ctx: AudioContext, seconds: number, tau: number) => {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const t = i / ctx.sampleRate;
      const brightness = 0.9 * Math.exp(-t / (tau * 0.6)) + 0.08;
      lp += brightness * (Math.random() * 2 - 1 - lp);
      const predelay = t < 0.012 ? 0 : 1;
      data[i] = lp * Math.exp(-t / tau) * predelay;
    }
  }
  return buffer;
};

export const AudioEngineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [masterVolume, setMasterVolumeState] = useState(0.6);
  const [tempo, setTempo] = useState(96);
  const [keyIndex, setKeyIndex] = useState(9); // A
  const [scaleKey, setScaleKey] = useState<ScaleKey>("aeolian");
  const [currentStep, setCurrentStep] = useState(0);
  const [triggeredInstruments, setTriggeredInstruments] = useState<boolean[]>(new Array(8).fill(false));
  const [currentChordName, setCurrentChordName] = useState("Am");

  // Motion equations: one editable m(t) per instrument
  const [motionEquations, setMotionEquations] = useState<string[]>(() => INSTRUMENTS.map((inst) => inst.motion));
  const [motionErrors, setMotionErrors] = useState<(string | null)[]>(new Array(8).fill(null));
  const motionFnsRef = useRef<(CompiledExpr | null)[]>(
    INSTRUMENTS.map((inst) => {
      const res = compileExpression(inst.motion);
      return res.ok ? res.fn : null;
    })
  );

  // Grid steps: 8 instruments x 16 steps
  const [grid, setGrid] = useState<boolean[][]>(() => INSTRUMENTS.map((inst) => [...inst.defaultSteps]));

  // Instrument Mixer state
  const [instrumentsState, setInstrumentsState] = useState<InstrumentState[]>(() =>
    INSTRUMENTS.map((inst, idx) => ({
      id: inst.id,
      name: inst.name,
      volume: DEFAULT_VOLUMES[idx],
      isMuted: false,
      isSoloed: false,
      color: inst.color,
      latex: inst.latex,
    }))
  );

  // Web Audio Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const masterAnalyserRef = useRef<AnalyserNode | null>(null);
  const delayRef = useRef<DelayNode | null>(null);
  const trackGainsRef = useRef<(GainNode | null)[]>(new Array(8).fill(null));
  const trackAnalysersRef = useRef<(AnalyserNode | null)[]>(new Array(8).fill(null));
  const periodicWavesRef = useRef<{ [key: string]: PeriodicWave }>({});

  // Sequencer / Scheduler Refs
  const schedulerTimerId = useRef<number | null>(null);
  const nextNoteTimeRef = useRef<number>(0.0);
  const globalStepRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const tempoRef = useRef<number>(tempo);
  const gridRef = useRef<boolean[][]>(grid);
  const instrumentsStateRef = useRef<InstrumentState[]>(instrumentsState);
  const keyIndexRef = useRef<number>(keyIndex);
  const scaleKeyRef = useRef<ScaleKey>(scaleKey);
  const noteHistoryRef = useRef<NoteEvent[]>([]);
  const stepQueueRef = useRef<{ time: number; step: number }[]>([]);
  const pausedBeatRef = useRef<number>(0);

  // Sync refs to avoid stale closures in Web Audio scheduler loop
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    tempoRef.current = tempo;
    const ctx = audioCtxRef.current;
    if (ctx && delayRef.current) {
      // Dotted-eighth echo, locked to the tempo
      delayRef.current.delayTime.setTargetAtTime((60 / tempo) * 0.75, ctx.currentTime, 0.05);
    }
  }, [tempo]);

  useEffect(() => {
    gridRef.current = grid;
  }, [grid]);

  useEffect(() => {
    keyIndexRef.current = keyIndex;
    scaleKeyRef.current = scaleKey;
    const scale = SCALES[scaleKey];
    const bar = Math.floor(globalStepRef.current / 16);
    setCurrentChordName(chordName(chordRootDegree(bar, scale), keyIndex, scale));
  }, [keyIndex, scaleKey]);

  const unlockAudioContext = async (): Promise<AudioContext | null> => {
    if (audioCtxRef.current) return audioCtxRef.current;

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx: AudioContext = new AudioCtx();

      // Master pipeline: bus → compressor → master gain → analyser → out
      const bus = ctx.createGain();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-16, ctx.currentTime);
      compressor.knee.setValueAtTime(12, ctx.currentTime);
      compressor.ratio.setValueAtTime(3.5, ctx.currentTime);
      compressor.attack.setValueAtTime(0.008, ctx.currentTime);
      compressor.release.setValueAtTime(0.25, ctx.currentTime);

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(masterVolume, ctx.currentTime);

      const masterAnalyser = ctx.createAnalyser();
      masterAnalyser.fftSize = 256;

      bus.connect(compressor);
      compressor.connect(masterGain);
      masterGain.connect(masterAnalyser);
      masterAnalyser.connect(ctx.destination);

      // Shared reverb
      const reverb = ctx.createConvolver();
      reverb.buffer = createImpulseResponse(ctx, 3.5, 0.9);
      const reverbReturn = ctx.createGain();
      reverbReturn.gain.setValueAtTime(0.8, ctx.currentTime);
      reverb.connect(reverbReturn);
      reverbReturn.connect(bus);

      // Shared tempo-synced echo with a darkening feedback loop
      const delay = ctx.createDelay(2.0);
      delay.delayTime.setValueAtTime((60 / tempoRef.current) * 0.75, ctx.currentTime);
      const feedback = ctx.createGain();
      feedback.gain.setValueAtTime(0.38, ctx.currentTime);
      const delayTone = ctx.createBiquadFilter();
      delayTone.type = "lowpass";
      delayTone.frequency.setValueAtTime(2400, ctx.currentTime);
      delay.connect(delayTone);
      delayTone.connect(feedback);
      feedback.connect(delay);
      const delayReturn = ctx.createGain();
      delayReturn.gain.setValueAtTime(0.5, ctx.currentTime);
      delayTone.connect(delayReturn);
      delayReturn.connect(bus);
      delayReturn.connect(reverb);

      audioCtxRef.current = ctx;
      masterGainRef.current = masterGain;
      masterAnalyserRef.current = masterAnalyser;
      delayRef.current = delay;

      // Track pipelines: voices → gain → analyser → pan → (dry, reverb, delay)
      INSTRUMENTS.forEach((inst, index) => {
        const trackGain = ctx.createGain();
        trackGain.gain.setValueAtTime(DEFAULT_VOLUMES[index], ctx.currentTime);

        const trackAnalyser = ctx.createAnalyser();
        trackAnalyser.fftSize = 256;

        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(inst.pan, ctx.currentTime);

        const reverbSend = ctx.createGain();
        reverbSend.gain.setValueAtTime(inst.reverbSend, ctx.currentTime);
        const delaySend = ctx.createGain();
        delaySend.gain.setValueAtTime(inst.delaySend, ctx.currentTime);

        trackGain.connect(trackAnalyser);
        trackAnalyser.connect(panner);
        panner.connect(bus);
        panner.connect(reverbSend);
        panner.connect(delaySend);
        reverbSend.connect(reverb);
        delaySend.connect(delay);

        trackGainsRef.current[index] = trackGain;
        trackAnalysersRef.current[index] = trackAnalyser;
      });

      initPeriodicWaves(ctx);

      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      setIsUnlocked(true);
      updateTrackGains();
      return ctx;
    } catch (error) {
      console.error("Failed to unlock AudioContext:", error);
      return null;
    }
  };

  const setMasterVolume = (vol: number) => {
    const safeVol = Math.max(0, Math.min(1.0, vol));
    setMasterVolumeState(safeVol);
    if (masterGainRef.current && audioCtxRef.current) {
      masterGainRef.current.gain.setTargetAtTime(safeVol, audioCtxRef.current.currentTime, 0.01);
    }
  };

  // Each timbre equation y = Σ bₙ·sin(nx) becomes a PeriodicWave with imag[n] = bₙ
  const initPeriodicWaves = (ctx: AudioContext) => {
    const fromSineSeries = (coeffs: number[]) => {
      const real = new Float32Array(coeffs.length + 1);
      const imag = new Float32Array(coeffs.length + 1);
      coeffs.forEach((c, i) => (imag[i + 1] = c));
      return ctx.createPeriodicWave(real, imag);
    };
    const series = (n: number, f: (k: number) => number) => Array.from({ length: n }, (_, i) => f(i + 1));

    periodicWavesRef.current = {
      bass: fromSineSeries([3, 0.5]),
      cello: fromSineSeries([1, 0.8, 0.4]),
      piano: fromSineSeries(series(8, (n) => 1 / (n * n))),
      violin: fromSineSeries([1, 0.7, 0.5, 0.3]),
      pad: fromSineSeries(series(6, (n) => 1 / n)),
      marimba: fromSineSeries([1, 0.3]),
      flute: fromSineSeries([1, 0, 0.15, 0, 0.05]),
    };
  };

  const updateTrackGains = () => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;

    const anySoloed = instrumentsStateRef.current.some((inst) => inst.isSoloed);

    instrumentsStateRef.current.forEach((inst, index) => {
      const trackGainNode = trackGainsRef.current[index];
      if (!trackGainNode) return;

      let targetVolume = inst.volume;
      if (inst.isMuted || (anySoloed && !inst.isSoloed)) {
        targetVolume = 0;
      }

      // Smooth gain transition to prevent audio pops
      trackGainNode.gain.setTargetAtTime(targetVolume, ctx.currentTime, 0.02);
    });
  };

  useEffect(() => {
    instrumentsStateRef.current = instrumentsState;
    updateTrackGains();
  }, [instrumentsState]);

  interface VoiceOptions {
    time: number;
    freqs: number[]; // partial frequencies (each gets its own oscillator)
    partialGains?: number[];
    wave?: string; // periodic wave key, or sine when omitted
    detuneCents?: number[]; // extra unison oscillators per partial
    peak: number;
    attack: number;
    decay: number; // time constant-ish seconds to reach sustain
    sustain: number; // 0..1 of peak
    hold: number; // seconds from note start until release
    release: number;
    filter?: { from: number; to: number; q?: number; glide: number };
    vibrato?: { rate: number; depth: number; delay: number };
  }

  // One ADSR-shaped voice. Every automation event is scheduled in time order,
  // which is what keeps the envelopes click-free.
  const playVoice = (dest: AudioNode, o: VoiceOptions) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const { time } = o;
    const releaseStart = time + Math.max(o.hold, o.attack + 0.01);
    const end = releaseStart + o.release * 1.6;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(o.peak, time + o.attack);
    env.gain.setTargetAtTime(o.peak * o.sustain, time + o.attack, Math.max(0.005, o.decay / 3));
    env.gain.setTargetAtTime(0, releaseStart, Math.max(0.005, o.release / 4));

    let output: AudioNode = env;
    let filter: BiquadFilterNode | null = null;
    if (o.filter) {
      filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.Q.setValueAtTime(o.filter.q ?? 0.7, time);
      filter.frequency.setValueAtTime(o.filter.from, time);
      filter.frequency.setTargetAtTime(o.filter.to, time + 0.005, o.filter.glide);
      env.connect(filter);
      output = filter;
    }
    output.connect(dest);

    const nodes: AudioNode[] = [env];
    if (filter) nodes.push(filter);

    let vibratoGain: GainNode | null = null;
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      lfo.frequency.setValueAtTime(o.vibrato.rate, time);
      vibratoGain = ctx.createGain();
      vibratoGain.gain.setValueAtTime(0, time);
      vibratoGain.gain.setTargetAtTime(o.vibrato.depth, time + o.vibrato.delay, 0.15);
      lfo.connect(vibratoGain);
      lfo.start(time);
      lfo.stop(end);
      nodes.push(lfo, vibratoGain);
    }

    const wave = o.wave ? periodicWavesRef.current[o.wave] : undefined;
    const detunes = o.detuneCents ?? [0];
    const oscillators: OscillatorNode[] = [];

    o.freqs.forEach((freq, i) => {
      detunes.forEach((cents) => {
        const osc = ctx.createOscillator();
        if (wave) osc.setPeriodicWave(wave);
        osc.frequency.setValueAtTime(freq, time);
        osc.detune.setValueAtTime(cents, time);
        // Vibrato depth is in cents so every partial wobbles together
        if (vibratoGain) vibratoGain.connect(osc.detune);

        const partial = ctx.createGain();
        partial.gain.setValueAtTime((o.partialGains?.[i] ?? 1) / detunes.length, time);
        osc.connect(partial);
        partial.connect(env);
        osc.start(time);
        osc.stop(end);
        oscillators.push(osc);
        nodes.push(osc, partial);
      });
    });

    oscillators[oscillators.length - 1].onended = () => {
      nodes.forEach((n) => {
        try {
          n.disconnect();
        } catch {}
      });
    };
  };

  // Evaluate an instrument's motion equation at time t (beats) and land it in key
  const resolvePitches = (instIdx: number, beat: number, step: number) => {
    const fn = motionFnsRef.current[instIdx];
    if (!fn) return null;
    const raw = fn(beat);
    if (!Number.isFinite(raw)) return null;

    const inst = INSTRUMENTS[instIdx];
    const scale = SCALES[scaleKeyRef.current];
    const key = keyIndexRef.current;
    const bar = Math.floor(beat / 4);
    const chordRoot = voicedChordRoot(chordRootDegree(bar, scale));

    const value = Math.max(-12, Math.min(12, raw));
    const toChord = inst.chordSnap === "always" || step % 4 === 0;
    const q = quantizeSteps(value, toChord);

    // The pad voices a full triad starting from the snapped chord tone (inversions!)
    const stepsList = inst.name === "The Pad" ? [q, nextChordTone(q), nextChordTone(nextChordTone(q))] : [q];
    return {
      midis: stepsList.map((s) => degreeToMidi(chordRoot + inst.register + s, key, scale)),
      rawMidi: fractionalDegreeToMidi(chordRoot + inst.register + value, key, scale),
    };
  };

  const triggerInstrumentNode = (instIdx: number, time: number, beat: number, step: number, velocity: number) => {
    const ctx = audioCtxRef.current;
    const trackGain = trackGainsRef.current[instIdx];
    if (!ctx || !trackGain) return;

    const resolved = resolvePitches(instIdx, beat, step);
    if (!resolved) return;
    const { midis, rawMidi } = resolved;

    const freqs = midis.map(midiToFreq);
    const spb = 60.0 / tempoRef.current; // seconds per beat
    const v = velocity;
    let durBeats = 0.5;

    switch (instIdx) {
      case 0: // BASS — round, plucky, tucked under the mix
        durBeats = 0.7;
        playVoice(trackGain, {
          time, freqs, wave: "bass", peak: 0.22 * v,
          attack: 0.008, decay: 0.25, sustain: 0.6, hold: spb * 0.7, release: 0.12,
          filter: { from: 1400, to: 380, q: 1.2, glide: 0.08 },
        });
        break;
      case 1: // CELLO — slow bow, gentle vibrato
        durBeats = 2;
        playVoice(trackGain, {
          time, freqs, wave: "cello", peak: 0.2 * v,
          attack: 0.18, decay: 0.4, sustain: 0.8, hold: spb * 2, release: 0.6,
          filter: { from: 900, to: 1800, glide: 0.3 },
          vibrato: { rate: 5, depth: 10, delay: 0.3 },
        });
        break;
      case 2: // PIANO — bright strike that darkens as it decays
        durBeats = 1;
        playVoice(trackGain, {
          time, freqs, wave: "piano", peak: 0.22 * v,
          attack: 0.004, decay: 1.6, sustain: 0, hold: 1.8, release: 0.3,
          filter: { from: 5200, to: 1100, glide: 0.35 },
        });
        break;
      case 3: // VIOLIN — singing lead with delayed vibrato
        durBeats = 1.5;
        playVoice(trackGain, {
          time, freqs, wave: "violin", peak: 0.13 * v, detuneCents: [-4, 4],
          attack: 0.09, decay: 0.3, sustain: 0.85, hold: spb * 1.5, release: 0.35,
          filter: { from: 2200, to: 3600, glide: 0.2 },
          vibrato: { rate: 5.5, depth: 14, delay: 0.25 },
        });
        break;
      case 4: // PAD — detuned triad that breathes across the whole bar
        durBeats = 4;
        playVoice(trackGain, {
          time, freqs, wave: "pad", peak: 0.075 * v, detuneCents: [-7, 0, 7],
          attack: 0.9, decay: 1.0, sustain: 0.9, hold: spb * 4, release: 1.4,
          filter: { from: 500, to: 1600, q: 0.9, glide: 1.2 },
        });
        break;
      case 5: // MARIMBA — woody, short
        durBeats = 0.25;
        playVoice(trackGain, {
          time, freqs, wave: "marimba", peak: 0.2 * v,
          attack: 0.003, decay: 0.45, sustain: 0, hold: 0.5, release: 0.1,
          filter: { from: 4000, to: 1600, glide: 0.06 },
        });
        break;
      case 6: // FLUTE — airy, soft vibrato
        durBeats = 1;
        playVoice(trackGain, {
          time, freqs, wave: "flute", peak: 0.11 * v,
          attack: 0.06, decay: 0.2, sustain: 0.8, hold: spb * 0.9, release: 0.25,
          vibrato: { rate: 4.8, depth: 9, delay: 0.2 },
        });
        break;
      case 7: { // BELL — inharmonic partials 1, 2.71, 5.8 straight from its equation
        durBeats = 4;
        const f = freqs[0];
        playVoice(trackGain, {
          time, freqs: [f, f * 2.71, f * 5.8], partialGains: [1, 0.6, 0.3], peak: 0.07 * v,
          attack: 0.002, decay: 3.2, sustain: 0, hold: 3.5, release: 0.4,
        });
        break;
      }
    }

    const history = noteHistoryRef.current;
    midis.forEach((midi) => history.push({ beat, midi, rawMidi, inst: instIdx, durBeats, velocity: v }));
    if (history.length > NOTE_HISTORY_LIMIT) history.splice(0, history.length - NOTE_HISTORY_LIMIT);
  };

  // Look-ahead Scheduler Loop
  const lookahead = 25.0; // milliseconds
  const scheduleAheadTime = 0.12; // seconds

  const scheduler = () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    while (nextNoteTimeRef.current < ctx.currentTime + scheduleAheadTime) {
      const time = nextNoteTimeRef.current;
      const stepScheduled = globalStepRef.current;
      const step = stepScheduled % 16;
      const beat = stepScheduled / 4;

      // Accents: downbeat > beats > off-beats, with a touch of human variation
      const accent = step === 0 ? 1.0 : step % 4 === 0 ? 0.82 : 0.62;

      const scale = SCALES[scaleKeyRef.current];
      const bar = Math.floor(stepScheduled / 16);
      const chord = chordName(chordRootDegree(bar, scale), keyIndexRef.current, scale);

      INSTRUMENTS.forEach((_, idx) => {
        if (gridRef.current[idx][step]) {
          const velocity = accent * (0.9 + Math.random() * 0.2);
          const jitter = idx === 0 ? 0 : Math.random() * 0.006;
          triggerInstrumentNode(idx, time + jitter, beat, step, velocity);
        }
      });

      stepQueueRef.current.push({ time, step: stepScheduled });

      // Synchronize UI with the audio clock
      const delay = (time - ctx.currentTime) * 1000;
      setTimeout(() => {
        if (!isPlayingRef.current) return;
        setCurrentStep(step);
        setCurrentChordName(chord);
        setTriggeredInstruments(INSTRUMENTS.map((_, idx) => gridRef.current[idx][step]));
        setTimeout(() => setTriggeredInstruments(new Array(8).fill(false)), 120);
      }, Math.max(0, delay));

      nextNoteTimeRef.current += 0.25 * (60.0 / tempoRef.current); // 16th note
      globalStepRef.current = stepScheduled + 1;
    }

    if (isPlayingRef.current) {
      schedulerTimerId.current = window.setTimeout(scheduler, lookahead);
    }
  };

  // Current musical time in beats, interpolated from the audio clock
  const getTransportBeat = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || !isPlayingRef.current) return pausedBeatRef.current;
    const queue = stepQueueRef.current;
    const now = ctx.currentTime;
    while (queue.length > 1 && queue[1].time <= now) queue.shift();
    if (!queue.length) return pausedBeatRef.current;
    const head = queue[0];
    if (head.time > now) return Math.max(0, head.step / 4 - 0.001);
    const elapsedBeats = (now - head.time) / (60 / tempoRef.current);
    return head.step / 4 + Math.min(elapsedBeats, 0.25);
  }, []);

  const togglePlay = async () => {
    const ctx = audioCtxRef.current ?? (await unlockAudioContext());
    if (!ctx) return;

    if (isPlayingRef.current) {
      pausedBeatRef.current = getTransportBeat();
      setIsPlaying(false);
      isPlayingRef.current = false;
      if (schedulerTimerId.current) {
        clearTimeout(schedulerTimerId.current);
        schedulerTimerId.current = null;
      }
      // Resume from where the playhead visibly was
      globalStepRef.current = Math.ceil(pausedBeatRef.current * 4);
      stepQueueRef.current = [];
      setTriggeredInstruments(new Array(8).fill(false));
    } else {
      if (ctx.state === "suspended") await ctx.resume();
      setIsPlaying(true);
      isPlayingRef.current = true;
      nextNoteTimeRef.current = ctx.currentTime + 0.06;
      scheduler();
    }
  };

  const triggerManualNote = async (id: number) => {
    const ctx = audioCtxRef.current ?? (await unlockAudioContext());
    if (!ctx) return;

    const beat = getTransportBeat();
    triggerInstrumentNode(id - 1, ctx.currentTime + 0.01, beat, 0, 0.9);

    setTriggeredInstruments((prev) => {
      const next = [...prev];
      next[id - 1] = true;
      return next;
    });
    setTimeout(() => {
      setTriggeredInstruments((prev) => {
        const next = [...prev];
        next[id - 1] = false;
        return next;
      });
    }, 150);
  };

  const setMotionEquation = (instIdx: number, src: string) => {
    setMotionEquations((prev) => prev.map((e, i) => (i === instIdx ? src : e)));
    const res = compileExpression(src);
    // Keep the last working equation playing while the user is mid-edit
    if (res.ok) motionFnsRef.current[instIdx] = res.fn;
    setMotionErrors((prev) => prev.map((e, i) => (i === instIdx ? (res.ok ? null : res.error) : e)));
  };

  const randomizeMotion = (instIdx?: number) => {
    const targets = instIdx === undefined ? INSTRUMENTS.map((_, i) => i) : [instIdx];
    targets.forEach((i) => {
      // Rhythmic low instruments get smaller leaps than the melodic voices
      const amplitude = i === 0 || i === 4 ? 2 : i === 7 ? 3 : 5;
      setMotionEquation(i, randomMotionEquation(amplitude));
    });
  };

  const resetMotion = () => {
    INSTRUMENTS.forEach((inst, i) => setMotionEquation(i, inst.motion));
  };

  const setInstrumentVolume = (id: number, vol: number) => {
    const safeVol = Math.max(0, Math.min(1.0, vol));
    setInstrumentsState((prev) => prev.map((inst) => (inst.id === id ? { ...inst, volume: safeVol } : inst)));
  };

  const toggleMute = (id: number) => {
    setInstrumentsState((prev) => prev.map((inst) => (inst.id === id ? { ...inst, isMuted: !inst.isMuted } : inst)));
  };

  const toggleSolo = (id: number) => {
    setInstrumentsState((prev) => {
      const isCurrentlySoloed = prev.find((inst) => inst.id === id)?.isSoloed || false;
      return prev.map((inst) => (inst.id === id ? { ...inst, isSoloed: !isCurrentlySoloed } : inst));
    });
  };

  const toggleGridStep = (instIdx: number, stepIdx: number) => {
    setGrid((prev) => {
      const next = prev.map((row) => [...row]);
      next[instIdx][stepIdx] = !next[instIdx][stepIdx];
      return next;
    });
  };

  const clearGrid = () => {
    setGrid(Array.from({ length: 8 }, () => new Array(16).fill(false)));
  };

  const resetGrid = () => {
    setGrid(INSTRUMENTS.map((inst) => [...inst.defaultSteps]));
  };

  const getTrackAnalyser = (id: number) => trackAnalysersRef.current[id - 1];

  const getMasterAnalyser = () => masterAnalyserRef.current;

  const getScoreSnapshot = useCallback(
    (): ScoreSnapshot => ({
      beat: getTransportBeat(),
      notes: noteHistoryRef.current,
      motionFns: motionFnsRef.current,
      keyIndex: keyIndexRef.current,
      scale: SCALES[scaleKeyRef.current],
    }),
    [getTransportBeat]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (schedulerTimerId.current) {
        clearTimeout(schedulerTimerId.current);
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
    };
  }, []);

  return (
    <AudioEngineContext.Provider
      value={{
        isUnlocked,
        unlockAudioContext,
        isPlaying,
        togglePlay,
        masterVolume,
        setMasterVolume,
        tempo,
        setTempo,
        keyIndex,
        setKeyIndex,
        scaleKey,
        setScaleKey,
        motionEquations,
        motionErrors,
        setMotionEquation,
        randomizeMotion,
        resetMotion,
        instrumentsState,
        setInstrumentVolume,
        toggleMute,
        toggleSolo,
        grid,
        toggleGridStep,
        clearGrid,
        resetGrid,
        currentStep,
        triggeredInstruments,
        getTrackAnalyser,
        getMasterAnalyser,
        getScoreSnapshot,
        triggerManualNote,
        currentChordName,
      }}
    >
      {children}
    </AudioEngineContext.Provider>
  );
};
