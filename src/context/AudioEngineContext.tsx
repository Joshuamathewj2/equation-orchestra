"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { INSTRUMENTS, InstrumentConfig } from "@/constants/instruments";

export interface InstrumentState {
  id: number;
  name: string;
  volume: number; // 0.0 to 1.0
  isMuted: boolean;
  isSoloed: boolean;
  color: string;
  latex: string;
}

interface AudioEngineContextType {
  isUnlocked: boolean;
  unlockAudioContext: () => Promise<void>;
  isPlaying: boolean;
  togglePlay: () => void;
  masterVolume: number;
  setMasterVolume: (vol: number) => void;
  tempo: number;
  setTempo: (bpm: number) => void;
  basePitch: number;
  setBasePitch: (pitch: number) => void;
  instrumentsState: InstrumentState[];
  setInstrumentVolume: (id: number, vol: number) => void;
  toggleMute: (id: number) => void;
  toggleSolo: (id: number) => void;
  grid: boolean[][]; // [instrumentIdx][stepIdx]
  toggleGridStep: (instIdx: number, stepIdx: number) => void;
  clearGrid: () => void;
  currentStep: number;
  triggeredInstruments: boolean[]; // whether instrument was just triggered
  getTrackAnalyser: (id: number) => AnalyserNode | null;
  getMasterAnalyser: () => AnalyserNode | null;
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

export const AudioEngineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [masterVolume, setMasterVolumeState] = useState(0.5);
  const [tempo, setTempo] = useState(115);
  const [basePitch, setBasePitch] = useState(130); // Base A2/A3 pitch, range 60-300
  const [currentStep, setCurrentStep] = useState(0);
  const [triggeredInstruments, setTriggeredInstruments] = useState<boolean[]>(new Array(6).fill(false));
  const [currentChordName, setCurrentChordName] = useState("Am");

  // Grid steps: 6 instruments x 16 steps
  const [grid, setGrid] = useState<boolean[][]>(() =>
    INSTRUMENTS.map((inst) => [...inst.defaultSteps])
  );

  // Instrument Mixer state
  const [instrumentsState, setInstrumentsState] = useState<InstrumentState[]>(() =>
    INSTRUMENTS.map((inst) => ({
      id: inst.id,
      name: inst.name,
      volume: inst.id === 6 ? 0.8 : 0.6, // drums slightly louder, others standard
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
  const trackGainsRef = useRef<(GainNode | null)[]>(new Array(6).fill(null));
  const trackAnalysersRef = useRef<(AnalyserNode | null)[]>(new Array(6).fill(null));

  // Sequencer / Scheduler Refs
  const schedulerTimerId = useRef<number | null>(null);
  const nextNoteTimeRef = useRef<number>(0.0);
  const globalStepRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const tempoRef = useRef<number>(tempo);
  const gridRef = useRef<boolean[][]>(grid);
  const instrumentsStateRef = useRef<InstrumentState[]>(instrumentsState);
  const basePitchRef = useRef<number>(basePitch);

  // Sync refs to avoid stale closures in Web Audio scheduler loop
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    tempoRef.current = tempo;
  }, [tempo]);

  useEffect(() => {
    gridRef.current = grid;
  }, [grid]);

  useEffect(() => {
    instrumentsStateRef.current = instrumentsState;
    updateTrackGains();
  }, [instrumentsState]);

  useEffect(() => {
    basePitchRef.current = basePitch;
  }, [basePitch]);

  // Periodic Waves cache
  const periodicWavesRef = useRef<{ [key: string]: PeriodicWave }>({});

  const unlockAudioContext = async () => {
    if (audioCtxRef.current) return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      
      // Setup master pipeline
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(masterVolume, ctx.currentTime);

      const masterAnalyser = ctx.createAnalyser();
      masterAnalyser.fftSize = 256;

      masterGain.connect(masterAnalyser);
      masterAnalyser.connect(ctx.destination);

      audioCtxRef.current = ctx;
      masterGainRef.current = masterGain;
      masterAnalyserRef.current = masterAnalyser;

      // Setup track pipelines
      INSTRUMENTS.forEach((inst, index) => {
        const trackGain = ctx.createGain();
        trackGain.gain.setValueAtTime(0.6, ctx.currentTime);

        const trackAnalyser = ctx.createAnalyser();
        trackAnalyser.fftSize = 256;

        trackGain.connect(trackAnalyser);
        trackAnalyser.connect(masterGain);

        trackGainsRef.current[index] = trackGain;
        trackAnalysersRef.current[index] = trackAnalyser;
      });

      // Warm up / pre-generate Periodic Waves
      initPeriodicWaves(ctx);

      // Force resume
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      setIsUnlocked(true);
      updateTrackGains();
    } catch (error) {
      console.error("Failed to unlock AudioContext:", error);
    }
  };

  const setMasterVolume = (vol: number) => {
    const safeVol = Math.max(0, Math.min(1.0, vol));
    setMasterVolumeState(safeVol);
    if (masterGainRef.current && audioCtxRef.current) {
      masterGainRef.current.gain.setTargetAtTime(safeVol, audioCtxRef.current.currentTime, 0.01);
    }
  };

  const initPeriodicWaves = (ctx: AudioContext) => {
    // 1. Bass Wave
    const rBass = new Float32Array(3);
    const iBass = new Float32Array(3);
    iBass[1] = 1.0; // Fundamental
    iBass[2] = 0.16; // 2nd harmonic (0.5 / 3.0 scaled)
    periodicWavesRef.current["bass"] = ctx.createPeriodicWave(rBass, iBass);

    // 2. Piano Wave
    const rPiano = new Float32Array(9);
    const iPiano = new Float32Array(9);
    for (let n = 1; n <= 8; n++) {
      iPiano[n] = 1 / (n * n);
    }
    periodicWavesRef.current["piano"] = ctx.createPeriodicWave(rPiano, iPiano);

    // 3. Violin Wave
    const rViolin = new Float32Array(5);
    const iViolin = new Float32Array(5);
    iViolin[1] = 1.0;
    iViolin[2] = 0.7;
    iViolin[3] = 0.5;
    iViolin[4] = 0.3;
    periodicWavesRef.current["violin"] = ctx.createPeriodicWave(rViolin, iViolin);

    // 5. Lead Synth Wave
    const rLead = new Float32Array(19);
    const iLead = new Float32Array(19);
    for (let k = 0; k <= 8; k++) {
      const n = 2 * k + 1;
      iLead[n] = 1 / n;
    }
    periodicWavesRef.current["lead"] = ctx.createPeriodicWave(rLead, iLead);
  };

  const updateTrackGains = () => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;

    const anySoloed = instrumentsStateRef.current.some((inst) => inst.isSoloed);

    instrumentsStateRef.current.forEach((inst, index) => {
      const trackGainNode = trackGainsRef.current[index];
      if (!trackGainNode) return;

      let targetVolume = inst.volume;

      if (inst.isMuted) {
        targetVolume = 0;
      } else if (anySoloed && !inst.isSoloed) {
        targetVolume = 0;
      }

      // Smooth gain transition to prevent audio pops
      trackGainNode.gain.setTargetAtTime(targetVolume, ctx.currentTime, 0.02);
    });
  };

  // Chord notes mapping based on basePitch (tuning frequency)
  // Progression: Am -> F -> C -> G
  const getChordFrequencies = (chordIdx: number, instName: string, stepIdx: number) => {
    const f0 = basePitchRef.current;
    
    // Chord relative pitch multipliers
    // Am (Root: A), F (Root: F), C (Root: C), G (Root: G)
    const chordRoots = [1.0, 0.84, 0.59, 0.89];
    const rootMultiplier = chordRoots[chordIdx];
    
    const rootFreq = f0 * rootMultiplier;

    switch (instName) {
      case "The Bass":
        // Sub-bass root note (octave down)
        return rootFreq * 0.5;
      case "The Piano": {
        // Retriggering arpeggios
        // Chord structures:
        // Am: [A, C, E, A]
        // F: [F, A, C, F]
        // C: [C, E, G, C]
        // G: [G, B, D, G]
        const intervals = chordIdx === 0 ? [1.0, 1.19, 1.5, 2.0] : // Minor
                          chordIdx === 1 ? [1.0, 1.26, 1.5, 2.0] : // Major
                          chordIdx === 2 ? [1.0, 1.26, 1.5, 2.0] : // Major
                          [1.0, 1.26, 1.5, 2.0]; // G Major
        const mult = intervals[stepIdx % intervals.length];
        return rootFreq * mult;
      }
      case "The Violin":
        // Double stop (root & fifth)
        return [rootFreq, rootFreq * 1.5];
      case "The Bell": {
        // High sparkle harmonics
        const bellIntervals = [2.0, 2.5, 3.0, 4.0];
        return rootFreq * bellIntervals[(stepIdx * 3) % bellIntervals.length];
      }
      case "The Lead Synth": {
        // Pentatonic sequence
        const pentatonic = [1.0, 1.12, 1.25, 1.5, 1.68, 2.0];
        const scaleIdx = (stepIdx * 2 + 1) % pentatonic.length;
        return rootFreq * pentatonic[scaleIdx] * 1.5;
      }
      case "The Drum":
        // Low percussive thud frequency
        return rootFreq * 0.35;
      default:
        return rootFreq;
    }
  };

  const triggerInstrumentNode = (
    instIdx: number,
    time: number,
    manual: boolean = false,
    manualStep: number = 0
  ) => {
    const ctx = audioCtxRef.current;
    const trackGain = trackGainsRef.current[instIdx];
    if (!ctx || !trackGain) return;

    const instConfig = INSTRUMENTS[instIdx];
    const stepIdx = manual ? manualStep : globalStepRef.current % 16;
    const chordIdx = manual ? 0 : Math.floor(globalStepRef.current / 16) % 4;

    const freqs = getChordFrequencies(chordIdx, instConfig.name, stepIdx);
    const stepDuration = 60.0 / tempoRef.current / 4; // 16th note duration

    // 1. BASS SYNTHESIS
    if (instIdx === 0) {
      const freq = Array.isArray(freqs) ? freqs[0] : freqs;
      const osc = ctx.createOscillator();
      const bassWave = periodicWavesRef.current["bass"];
      if (bassWave) {
        osc.setPeriodicWave(bassWave);
      } else {
        osc.type = "sawtooth";
      }
      osc.frequency.setValueAtTime(freq, time);

      const noteGain = ctx.createGain();
      noteGain.gain.setValueAtTime(0, time);
      // Fast Attack
      noteGain.gain.linearRampToValueAtTime(1.0, time + 0.02);
      // Sustained Hold
      noteGain.gain.setValueAtTime(1.0, time + stepDuration - 0.03);
      // Fast Release
      noteGain.gain.linearRampToValueAtTime(0, time + stepDuration);

      osc.connect(noteGain);
      noteGain.connect(trackGain);

      osc.start(time);
      osc.stop(time + stepDuration);
      
      osc.onended = () => {
        osc.disconnect();
        noteGain.disconnect();
      };
    }

    // 2. PIANO SYNTHESIS
    else if (instIdx === 1) {
      const freq = Array.isArray(freqs) ? freqs[0] : freqs;
      const osc = ctx.createOscillator();
      const pianoWave = periodicWavesRef.current["piano"];
      if (pianoWave) osc.setPeriodicWave(pianoWave);
      osc.frequency.setValueAtTime(freq, time);

      const noteGain = ctx.createGain();
      noteGain.gain.setValueAtTime(0, time);
      // Sharp Attack
      noteGain.gain.linearRampToValueAtTime(0.8, time + 0.008);
      // Exponential decay over 1.8 seconds, zero sustain
      noteGain.gain.exponentialRampToValueAtTime(0.001, time + 1.8);

      osc.connect(noteGain);
      noteGain.connect(trackGain);

      osc.start(time);
      osc.stop(time + 1.85);

      osc.onended = () => {
        osc.disconnect();
        noteGain.disconnect();
      };
    }

    // 3. VIOLIN SYNTHESIS
    else if (instIdx === 2) {
      const freqList = Array.isArray(freqs) ? freqs : [freqs, freqs * 1.5];
      
      // Violin plays as a double stop (two notes in unison or fifths)
      freqList.forEach((freq) => {
        const osc = ctx.createOscillator();
        const violinWave = periodicWavesRef.current["violin"];
        if (violinWave) osc.setPeriodicWave(violinWave);
        osc.frequency.setValueAtTime(freq, time);

        // Apply a slight LFO vibrato (5.5 Hz pitch wobbling)
        const lfo = ctx.createOscillator();
        lfo.frequency.setValueAtTime(5.5, time);

        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(freq * 0.007, time); // 0.7% frequency variation

        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        const noteGain = ctx.createGain();
        noteGain.gain.setValueAtTime(0, time);
        // Slow bow attack
        noteGain.gain.linearRampToValueAtTime(0.4, time + 0.4);
        // Full Sustain & Slow Release
        noteGain.gain.setValueAtTime(0.4, time + stepDuration * 2 - 0.4);
        noteGain.gain.linearRampToValueAtTime(0, time + stepDuration * 2);

        osc.connect(noteGain);
        noteGain.connect(trackGain);

        lfo.start(time);
        osc.start(time);
        
        lfo.stop(time + stepDuration * 2);
        osc.stop(time + stepDuration * 2);

        osc.onended = () => {
          lfo.disconnect();
          lfoGain.disconnect();
          osc.disconnect();
          noteGain.disconnect();
        };
      });
    }

    // 4. BELL SYNTHESIS
    else if (instIdx === 3) {
      const baseF = Array.isArray(freqs) ? freqs[0] : freqs;
      // Inharmonic summation components: y = sin(x) + 0.6sin(2.71x) + 0.3sin(5.8x)
      const frequencies = [baseF, baseF * 2.71, baseF * 5.8];
      const gains = [0.8, 0.48, 0.24]; // scaled by 0.8 for safety limit

      const noteGain = ctx.createGain();
      noteGain.gain.setValueAtTime(0, time);
      // Instant strike attack
      noteGain.gain.linearRampToValueAtTime(1.0, time + 0.005);
      // Long exponential decay
      noteGain.gain.exponentialRampToValueAtTime(0.001, time + 3.2);

      noteGain.connect(trackGain);

      frequencies.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, time);

        const partialGain = ctx.createGain();
        partialGain.gain.setValueAtTime(gains[i], time);

        osc.connect(partialGain);
        partialGain.connect(noteGain);

        osc.start(time);
        osc.stop(time + 3.25);

        osc.onended = () => {
          osc.disconnect();
          partialGain.disconnect();
        };
      });

      // Cleanup note gain node
      setTimeout(() => {
        try {
          noteGain.disconnect();
        } catch (e) {}
      }, 3300);
    }

    // 5. LEAD SYNTH SYNTHESIS
    else if (instIdx === 4) {
      const freq = Array.isArray(freqs) ? freqs[0] : freqs;
      const osc = ctx.createOscillator();
      const leadWave = periodicWavesRef.current["lead"];
      if (leadWave) osc.setPeriodicWave(leadWave);
      osc.frequency.setValueAtTime(freq, time);

      // Low pass filter sweeps
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(2500, time);
      filter.frequency.exponentialRampToValueAtTime(800, time + 0.25);

      const noteGain = ctx.createGain();
      noteGain.gain.setValueAtTime(0, time);
      // Medium attack
      noteGain.gain.linearRampToValueAtTime(0.6, time + 0.08);
      // Decay down to sustain level
      noteGain.gain.linearRampToValueAtTime(0.4, time + 0.18);
      noteGain.gain.setValueAtTime(0.4, time + stepDuration - 0.05);
      noteGain.gain.linearRampToValueAtTime(0, time + stepDuration);

      osc.connect(filter);
      filter.connect(noteGain);
      noteGain.connect(trackGain);

      osc.start(time);
      osc.stop(time + stepDuration);

      osc.onended = () => {
        osc.disconnect();
        filter.disconnect();
        noteGain.disconnect();
      };
    }

    // 6. DRUM SYNTHESIS
    else if (instIdx === 5) {
      const baseF = Array.isArray(freqs) ? freqs[0] : freqs;
      const osc = ctx.createOscillator();
      osc.type = "sine";

      // Pitch sweep: from 180Hz down to 45Hz exponentially for punchy kick
      const startFreq = Math.min(220, baseF * 4);
      const endFreq = Math.max(30, baseF * 0.45);
      osc.frequency.setValueAtTime(startFreq, time);
      osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.07);

      const noteGain = ctx.createGain();
      noteGain.gain.setValueAtTime(0, time);
      // Instant thump attack
      noteGain.gain.linearRampToValueAtTime(1.2, time + 0.004);
      // Fast percussive decay envelope
      noteGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

      osc.connect(noteGain);
      noteGain.connect(trackGain);

      osc.start(time);
      osc.stop(time + 0.12);

      osc.onended = () => {
        osc.disconnect();
        noteGain.disconnect();
      };
    }
  };

  // Look-ahead Scheduler Loop
  const lookahead = 100.0; // milliseconds
  const scheduleAheadTime = 0.1; // seconds

  const scheduler = () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    while (nextNoteTimeRef.current < ctx.currentTime + scheduleAheadTime) {
      const time = nextNoteTimeRef.current;
      const step = globalStepRef.current % 16;

      // Chord progression naming updates
      const chordIdx = Math.floor(globalStepRef.current / 16) % 4;
      const chordNames = ["Am", "F", "C", "G"];
      
      // Trigger instruments that are active on this step
      INSTRUMENTS.forEach((inst, idx) => {
        const isStepActive = gridRef.current[idx][step];
        if (isStepActive) {
          triggerInstrumentNode(idx, time);
        }
      });

      // Synchronize playhead visual state with audio context clock
      const delay = (time - ctx.currentTime) * 1000;
      const stepScheduled = globalStepRef.current;
      
      setTimeout(() => {
        if (!isPlayingRef.current) return;
        setCurrentStep(step);
        setCurrentChordName(chordNames[chordIdx]);

        // Flash visual highlights for triggered tracks
        setTriggeredInstruments((prev) => {
          const next = [...prev];
          INSTRUMENTS.forEach((_, idx) => {
            next[idx] = gridRef.current[idx][step];
          });
          return next;
        });

        // Decay visual highlights quickly
        setTimeout(() => {
          setTriggeredInstruments(new Array(6).fill(false));
        }, 120);

      }, Math.max(0, delay));

      // Advance clock by 16th note
      const secondsPerBeat = 60.0 / tempoRef.current;
      nextNoteTimeRef.current += 0.25 * secondsPerBeat; // 16th note = 1/4 of beat
      globalStepRef.current = stepScheduled + 1;
    }

    if (isPlayingRef.current) {
      schedulerTimerId.current = window.setTimeout(scheduler, lookahead);
    }
  };

  const togglePlay = () => {
    if (!isUnlocked) {
      unlockAudioContext();
    }

    if (isPlaying) {
      // Pause
      setIsPlaying(false);
      isPlayingRef.current = false;
      if (schedulerTimerId.current) {
        clearTimeout(schedulerTimerId.current);
        schedulerTimerId.current = null;
      }
      setTriggeredInstruments(new Array(6).fill(false));
    } else {
      // Play
      const ctx = audioCtxRef.current;
      if (ctx) {
        setIsPlaying(true);
        isPlayingRef.current = true;
        nextNoteTimeRef.current = ctx.currentTime + 0.05;
        // Keep currentStep but resume scheduling
        scheduler();
      }
    }
  };

  const triggerManualNote = (id: number) => {
    if (!isUnlocked) {
      unlockAudioContext();
    }
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    // Trigger instantly
    const now = ctx.currentTime;
    triggerInstrumentNode(id - 1, now, true, 0);

    // Briefly trigger card flash
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

  const setInstrumentVolume = (id: number, vol: number) => {
    const safeVol = Math.max(0, Math.min(1.0, vol));
    setInstrumentsState((prev) =>
      prev.map((inst) => (inst.id === id ? { ...inst, volume: safeVol } : inst))
    );
  };

  const toggleMute = (id: number) => {
    setInstrumentsState((prev) =>
      prev.map((inst) => (inst.id === id ? { ...inst, isMuted: !inst.isMuted } : inst))
    );
  };

  const toggleSolo = (id: number) => {
    setInstrumentsState((prev) => {
      const isCurrentlySoloed = prev.find((inst) => inst.id === id)?.isSoloed || false;
      return prev.map((inst) =>
        inst.id === id ? { ...inst, isSoloed: !isCurrentlySoloed } : inst
      );
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
    setGrid(Array.from({ length: 6 }, () => new Array(16).fill(false)));
  };

  const getTrackAnalyser = (id: number) => {
    return trackAnalysersRef.current[id - 1];
  };

  const getMasterAnalyser = () => {
    return masterAnalyserRef.current;
  };

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
        basePitch,
        setBasePitch,
        instrumentsState,
        setInstrumentVolume,
        toggleMute,
        toggleSolo,
        grid,
        toggleGridStep,
        clearGrid,
        currentStep,
        triggeredInstruments,
        getTrackAnalyser,
        getMasterAnalyser,
        triggerManualNote,
        currentChordName,
      }}
    >
      {children}
    </AudioEngineContext.Provider>
  );
};
