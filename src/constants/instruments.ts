export interface InstrumentConfig {
  id: number;
  name: string;
  latex: string;
  description: string;
  whyUnique: string;
  color: string; // Tailwind color name like 'indigo' or hex value
  glowColor: string;
  defaultSteps: boolean[]; // 16 steps default pattern
  formula: (x: number) => number;
  freqMultiplier?: number;
}

export const INSTRUMENTS: InstrumentConfig[] = [
  {
    id: 1,
    name: "The Bass",
    latex: "y = 3\\sin(x) + 0.5\\sin(2x)",
    description: "Low-frequency fundamental with a strong second harmonic, generating a thick, warm, and pulsing tone.",
    whyUnique: "The Bass relies on a strong fundamental sine wave combined with its second harmonic (one octave higher) at reduced amplitude. In Web Audio, we synthesize this timbre by constructing a custom Periodic Wave containing only the 1st and 2nd harmonic coefficients. It is wrapped in a Bass envelope (50ms attack, 80% sustain level, and a rapid 150ms release) to maintain clear low-end definition.",
    color: "from-blue-600 to-indigo-600",
    glowColor: "rgba(59, 130, 246, 0.4)",
    defaultSteps: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
    formula: (x: number) => 3 * Math.sin(x) + 0.5 * Math.sin(2 * x)
  },
  {
    id: 2,
    name: "The Piano",
    latex: "y = \\sum_{n=1}^{8}\\frac{1}{n^2}\\sin(nx)",
    description: "Bright, rich harmonic stack with an exponential decay, simulating struck acoustic strings.",
    whyUnique: "The Piano features a full harmonic series where each harmonic's amplitude drops exponentially with the square of its number (1/n²). This creates a bright strike that quickly mellows. Its Web Audio implementation uses a custom Periodic Wave mapped to the first 8 harmonics, shaped by a sharp 10ms attack and a 2.0-second exponential decay to zero sustain, capturing the natural resonance of a grand piano soundboard.",
    color: "from-indigo-600 to-violet-600",
    glowColor: "rgba(99, 102, 241, 0.4)",
    defaultSteps: [true, false, true, false, false, true, false, true, true, false, true, false, false, true, false, true],
    formula: (x: number) => {
      let y = 0;
      for (let n = 1; n <= 8; n++) {
        y += (1 / (n * n)) * Math.sin(n * x);
      }
      return y;
    }
  },
  {
    id: 3,
    name: "The Violin",
    latex: "y = \\sin(x)+0.7\\sin(2x)+0.5\\sin(3x)+0.3\\sin(4x)",
    description: "Sustained bowing timbre with slight frequency modulation to simulate natural finger vibrato.",
    whyUnique: "The Violin represents a classic bowed string timbre with a rich set of lower harmonics. We map this mathematical stack into a Periodic Wave and feed it through a pitch modulator. A low-frequency oscillator (LFO) running at 5.5 Hz subtly shifts the fundamental frequency (vibrato). It is controlled by a slow ADSR envelope (500ms attack and 500ms release) to mirror the expressive lag of bowing.",
    color: "from-violet-600 to-fuchsia-600",
    glowColor: "rgba(168, 85, 247, 0.4)",
    defaultSteps: [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
    formula: (x: number) => {
      return Math.sin(x) + 0.7 * Math.sin(2 * x) + 0.5 * Math.sin(3 * x) + 0.3 * Math.sin(4 * x);
    }
  },
  {
    id: 4,
    name: "The Bell",
    latex: "y = \\sin(x)+0.6\\sin(2.71x)+0.3\\sin(5.8x)",
    description: "Metallic, striking sound made of highly inharmonic frequencies that decay slowly over several seconds.",
    whyUnique: "A bell's unique character comes from inharmonic partials (non-integer multiples of the fundamental, here 2.71 and 5.8). Because periodic waves only support harmonic integers, we synthesize the Bell by dynamically summing three independent oscillators tuned to these exact ratios. It is triggered with an instant attack and a long 3.5-second exponential decay to zero sustain, creating a lingering metallic ring.",
    color: "from-pink-600 to-rose-600",
    glowColor: "rgba(236, 72, 153, 0.4)",
    defaultSteps: [false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
    formula: (x: number) => {
      return Math.sin(x) + 0.6 * Math.sin(2.71 * x) + 0.3 * Math.sin(5.8 * x);
    }
  },
  {
    id: 5,
    name: "The Lead Synth",
    latex: "y = \\sum_{k=0}^{8}\\frac{1}{2k+1}\\sin((2k+1)x)",
    description: "Buzzing square-wave approximation filtered through a dynamic, sweeping low-pass filter node.",
    whyUnique: "The Lead Synth uses a Fourier series summation of odd harmonics, approximating a sharp square wave. This generates a hollow, bright tone. In our audio pipeline, the oscillator outputs to a BiquadFilterNode set to low-pass mode. Every note trigger initiates a filter sweep that glides from 2500 Hz down to 800 Hz, adding movement and grit, shaped by a medium attack (100ms) and high sustain (70%).",
    color: "from-cyan-500 to-blue-500",
    glowColor: "rgba(6, 182, 212, 0.4)",
    defaultSteps: [false, false, true, false, false, false, true, false, false, true, false, false, true, false, false, true],
    formula: (x: number) => {
      let y = 0;
      for (let k = 0; k <= 8; k++) {
        const n = 2 * k + 1;
        y += (1 / n) * Math.sin(n * x);
      }
      return y;
    }
  },
  {
    id: 6,
    name: "The Drum",
    latex: "y = e^{-0.3x}\\sin(15x)",
    description: "A fast-decaying percussive wave that creates a punchy kick or tom-like mathematical thump.",
    whyUnique: "The Drum uses an exponential decay multiplier directly inside the equation. For real-time percussive synthesis, we trigger a sine wave oscillator at a high octave (15 times the fundamental) and quickly sweep both the pitch and gain down in a tight envelope of 100ms. The result is a mathematically precise percussive kick thump that loops rhythmically on the beat sequencer.",
    color: "from-emerald-500 to-teal-500",
    glowColor: "rgba(16, 185, 129, 0.4)",
    defaultSteps: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
    formula: (x: number) => {
      // Avoid exponent overflow for large numbers during plotting
      // We wrap x in a smaller interval for visualization
      const xMod = x % (2 * Math.PI);
      return Math.exp(-0.3 * xMod) * Math.sin(15 * xMod);
    }
  }
];
