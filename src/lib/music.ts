// Music-theory layer: turns raw equation output into in-key, chord-aware pitches.

export const NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

export interface ScaleDef {
  name: string;
  intervals: number[]; // 7 semitone offsets from the tonic
  progression: number[]; // scale degrees (0-based), one chord per bar
}

export const SCALES: Record<string, ScaleDef> = {
  aeolian: { name: "Minor", intervals: [0, 2, 3, 5, 7, 8, 10], progression: [0, 5, 2, 6] }, // i VI III VII
  dorian: { name: "Dorian", intervals: [0, 2, 3, 5, 7, 9, 10], progression: [0, 3, 0, 6] }, // i IV i VII
  ionian: { name: "Major", intervals: [0, 2, 4, 5, 7, 9, 11], progression: [0, 4, 5, 3] }, // I V vi IV
  lydian: { name: "Lydian", intervals: [0, 2, 4, 6, 7, 9, 11], progression: [0, 1, 5, 1] }, // I II vi II
  phrygian: { name: "Phrygian", intervals: [0, 1, 3, 5, 7, 8, 10], progression: [0, 1, 6, 1] }, // i bII bVII bII
};

export type ScaleKey = keyof typeof SCALES;

const mod = (a: number, n: number) => ((a % n) + n) % n;

// Lowest tonic of the key; C2 (MIDI 36) .. B2 (MIDI 47). A → A2 = 110 Hz.
export const tonicMidi = (keyIndex: number) => 36 + keyIndex;

export const midiToFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// Scale degree (can be negative / span octaves) → MIDI note
export const degreeToMidi = (degree: number, keyIndex: number, scale: ScaleDef) => {
  const octave = Math.floor(degree / 7);
  return tonicMidi(keyIndex) + octave * 12 + scale.intervals[mod(degree, 7)];
};

// Continuous version (for drawing un-quantized curves)
export const fractionalDegreeToMidi = (degree: number, keyIndex: number, scale: ScaleDef) => {
  const lo = Math.floor(degree);
  const f = degree - lo;
  const a = degreeToMidi(lo, keyIndex, scale);
  const b = degreeToMidi(lo + 1, keyIndex, scale);
  return a + (b - a) * f;
};

// Snap a value measured in scale steps (relative to the chord root) to the
// nearest chord tone (root / third / fifth) or simply the nearest scale step.
export const quantizeSteps = (value: number, toChord: boolean) => {
  if (!toChord) return Math.round(value);
  const base = Math.round(value);
  for (let d = 0; d <= 3; d++) {
    // Prefer the candidate on the side the curve is heading
    const candidates = value >= base ? [base + d, base - d] : [base - d, base + d];
    for (const c of candidates) {
      if ([0, 2, 4].includes(mod(c, 7))) return c;
    }
  }
  return base;
};

export const chordRootDegree = (bar: number, scale: ScaleDef) =>
  scale.progression[mod(bar, scale.progression.length)];

// Bars move the chord root; keep it within a fifth of the tonic so every
// instrument stays in its register instead of leaping an octave.
export const voicedChordRoot = (degree: number) => (degree > 3 ? degree - 7 : degree);

export const chordName = (rootDegree: number, keyIndex: number, scale: ScaleDef) => {
  const root = degreeToMidi(rootDegree, keyIndex, scale);
  const third = degreeToMidi(rootDegree + 2, keyIndex, scale) - root;
  const fifth = degreeToMidi(rootDegree + 4, keyIndex, scale) - root;
  const name = NOTE_NAMES[mod(root, 12)];
  if (fifth === 6) return `${name}dim`;
  return third === 3 ? `${name}m` : name;
};

export const keyLabel = (keyIndex: number, scale: ScaleDef) => `${NOTE_NAMES[keyIndex]} ${scale.name}`;
