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
  // --- Composition ---
  // Motion equation m(t): t is time in beats, output is measured in scale steps
  // above the current chord root. The engine snaps it into key every step.
  motion: string;
  register: number; // scale-degree offset (7 = one octave)
  chordSnap: "always" | "beats"; // snap to chord tones always, or only on beats
  hex: string;
  // --- Mix ---
  pan: number;
  reverbSend: number;
  delaySend: number;
}

// "x...x..." → boolean[16]
const pattern = (p: string) => p.split("").map((c) => c === "x");

export const INSTRUMENTS: InstrumentConfig[] = [
  {
    id: 1,
    name: "The Bass",
    latex: "y = 3\\sin(x) + 0.5\\sin(2x)",
    description: "Low-frequency fundamental with a strong second harmonic, generating a thick, warm, and pulsing tone.",
    whyUnique: "The Bass relies on a strong fundamental sine wave combined with its second harmonic (one octave higher) at reduced amplitude. In Web Audio, we synthesize this timbre by constructing a custom Periodic Wave containing only the 1st and 2nd harmonic coefficients. It is wrapped in a Bass envelope (50ms attack, 80% sustain level, and a rapid 150ms release) to maintain clear low-end definition.",
    color: "from-blue-600 to-indigo-600",
    glowColor: "rgba(59, 130, 246, 0.4)",
    defaultSteps: pattern("x.....x.x.....x."),
    motion: "4sin(pi*t/2)",
    register: 0,
    chordSnap: "always",
    hex: "#4f46e5",
    pan: 0,
    reverbSend: 0.08,
    delaySend: 0,
    formula: (x: number) => 3 * Math.sin(x) + 0.5 * Math.sin(2 * x)
  },
  {
    id: 2,
    name: "The Cello",
    latex: "y = \\sin(x) + 0.8\\sin(2x) + 0.4\\sin(3x)",
    description: "Warm bowed string with cello-like low-mid resonance",
    whyUnique: "The Cello uses a three-harmonic formula to produce a warm, bowed string timbre with a solid low-mid body. Built using a custom Periodic Wave, it mimics a classic cello sound profile.",
    color: "from-violet-600 to-purple-600",
    glowColor: "rgba(139, 92, 246, 0.4)",
    defaultSteps: pattern("x.......x......."),
    motion: "3sin(pi*t/8) + sin(pi*t/2)",
    register: 7,
    chordSnap: "beats",
    hex: "#8b5cf6",
    pan: -0.35,
    reverbSend: 0.35,
    delaySend: 0,
    formula: (x: number) => Math.sin(x) + 0.8 * Math.sin(2 * x) + 0.4 * Math.sin(3 * x)
  },
  {
    id: 3,
    name: "The Piano",
    latex: "y = \\sum_{n=1}^{8}\\frac{1}{n^2}\\sin(nx)",
    description: "Bright, rich harmonic stack with an exponential decay, simulating struck acoustic strings.",
    whyUnique: "The Piano features a full harmonic series where each harmonic's amplitude drops exponentially with the square of its number (1/n²). This creates a bright strike that quickly mellows. Its Web Audio implementation uses a custom Periodic Wave mapped to the first 8 harmonics, shaped by a sharp 10ms attack and a 2.0-second exponential decay to zero sustain, capturing the natural resonance of a grand piano soundboard.",
    color: "from-indigo-600 to-violet-600",
    glowColor: "rgba(99, 102, 241, 0.4)",
    defaultSteps: pattern("x..x..x.x..x..x."),
    motion: "2 + 3tri(pi*t/2) + sin(t/phi)",
    register: 14,
    chordSnap: "always",
    hex: "#fbbf24",
    pan: 0.2,
    reverbSend: 0.3,
    delaySend: 0.1,
    formula: (x: number) => {
      let y = 0;
      for (let n = 1; n <= 8; n++) {
        y += (1 / (n * n)) * Math.sin(n * x);
      }
      return y;
    }
  },
  {
    id: 4,
    name: "The Violin",
    latex: "y = \\sin(x)+0.7\\sin(2x)+0.5\\sin(3x)+0.3\\sin(4x)",
    description: "Sustained bowing timbre with slight frequency modulation to simulate natural finger vibrato.",
    whyUnique: "The Violin represents a classic bowed string timbre with a rich set of lower harmonics. We map this mathematical stack into a Periodic Wave and feed it through a pitch modulator. A low-frequency oscillator (LFO) running at 5.5 Hz subtly shifts the fundamental frequency (vibrato). It is controlled by a slow ADSR envelope (500ms attack and 500ms release) to mirror the expressive lag of bowing.",
    color: "from-fuchsia-600 to-pink-600",
    glowColor: "rgba(217, 70, 239, 0.4)",
    defaultSteps: pattern("x.....x.....x..."),
    motion: "3sin(t/phi) + 2cos(sqrt(2)*t)",
    register: 14,
    chordSnap: "beats",
    hex: "#d946ef",
    pan: 0.35,
    reverbSend: 0.45,
    delaySend: 0.15,
    formula: (x: number) => {
      return Math.sin(x) + 0.7 * Math.sin(2 * x) + 0.5 * Math.sin(3 * x) + 0.3 * Math.sin(4 * x);
    }
  },
  {
    id: 5,
    name: "The Pad",
    latex: "y = \\sum_{n=1}^{6}\\frac{1}{n}\\sin(nx)",
    description: "Slow-attack harmonic pad — fills chord gaps with warmth",
    whyUnique: "The Pad combines six harmonics in a classic sawtooth-like distribution to generate a dense, rich texture. It is driven by a very slow attack envelope (500ms) to allow the chord changes to blend smoothly together as harmonic glue.",
    color: "from-cyan-500 to-blue-500",
    glowColor: "rgba(6, 182, 212, 0.4)",
    defaultSteps: pattern("x..............."),
    motion: "2sin(t/8)",
    register: 7,
    chordSnap: "always",
    hex: "#06b6d4",
    pan: 0,
    reverbSend: 0.6,
    delaySend: 0,
    formula: (x: number) => {
      let y = 0;
      for (let n = 1; n <= 6; n++) {
        y += (1 / n) * Math.sin(n * x);
      }
      return y;
    }
  },
  {
    id: 6,
    name: "The Marimba",
    latex: "y = \\sin(x) + 0.3\\sin(2x)",
    description: "Struck bar percussion — rhythmic without killing harmony",
    whyUnique: "The Marimba is a percussive harmonic instrument generated with a fundamental and a subtle second harmonic. Using a highly percussive envelope (5ms attack, 80ms decay, zero sustain), it provides rhythmic pulse without bleeding harmonic noise into the mix.",
    color: "from-amber-500 to-orange-500",
    glowColor: "rgba(245, 158, 11, 0.4)",
    defaultSteps: pattern("..x..x....x..x.x"),
    motion: "2 + 3sin(3t)*cos(t/4)",
    register: 14,
    chordSnap: "beats",
    hex: "#f97316",
    pan: -0.5,
    reverbSend: 0.2,
    delaySend: 0.2,
    formula: (x: number) => Math.sin(x) + 0.3 * Math.sin(2 * x)
  },
  {
    id: 7,
    name: "The Flute",
    latex: "y = \\sin(x) + 0.15\\sin(3x) + 0.05\\sin(5x)",
    description: "Pure breathy high-register melody carrier with odd harmonics",
    whyUnique: "The Flute uses a base frequency plus two light odd harmonics (3rd and 5th), playing an octave higher than normal notes. It has a fast-medium attack (40ms) and high sustain (75%), mimicking the breath profile of woodwinds.",
    color: "from-emerald-500 to-teal-500",
    glowColor: "rgba(16, 185, 129, 0.4)",
    defaultSteps: pattern("....x.....x.x..."),
    motion: "4sin(phi*t) + 2sin(t/3)",
    register: 21,
    chordSnap: "beats",
    hex: "#10b981",
    pan: 0.5,
    reverbSend: 0.45,
    delaySend: 0.35,
    formula: (x: number) => Math.sin(x) + 0.15 * Math.sin(3 * x) + 0.05 * Math.sin(5 * x)
  },
  {
    id: 8,
    name: "The Bell",
    latex: "y = \\sin(x)+0.6\\sin(2.71x)+0.3\\sin(5.8x)",
    description: "Metallic, striking sound made of highly inharmonic frequencies that decay slowly over several seconds.",
    whyUnique: "A bell's unique character comes from inharmonic partials (non-integer multiples of the fundamental, here 2.71 and 5.8). Because periodic waves only support harmonic integers, we synthesize the Bell by dynamically summing three independent oscillators tuned to these exact ratios. It is triggered with an instant attack and a long 3.5-second exponential decay to zero sustain, creating a lingering metallic ring.",
    color: "from-pink-600 to-rose-600",
    glowColor: "rgba(236, 72, 153, 0.4)",
    defaultSteps: pattern("........x......."),
    motion: "2 + 2round(sin(t/2))",
    register: 21,
    chordSnap: "always",
    hex: "#ec4899",
    pan: -0.25,
    reverbSend: 0.6,
    delaySend: 0.3,
    formula: (x: number) => {
      return Math.sin(x) + 0.6 * Math.sin(2.71 * x) + 0.3 * Math.sin(5.8 * x);
    }
  }
];
