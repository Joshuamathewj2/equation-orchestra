// Tiny, safe math-expression compiler for user-editable motion equations.
// Supports: + - * / % ^, implicit multiplication (2t, 3sin(t), (t)(t)),
// constants (pi, π, e, phi, φ, tau) and the variable t.

export type CompiledExpr = (t: number) => number;

export type CompileResult =
  | { ok: true; fn: CompiledExpr }
  | { ok: false; error: string };

const TAU = Math.PI * 2;
const PHI = (1 + Math.sqrt(5)) / 2;

const wrap = (x: number) => ((x % TAU) + TAU) % TAU;

// Smooth deterministic value-noise in [-1, 1]
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
};
const noise = (x: number) => {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
};

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  abs: Math.abs,
  sqrt: Math.sqrt,
  exp: Math.exp,
  log: Math.log,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sign: Math.sign,
  min: Math.min,
  max: Math.max,
  frac: (x) => x - Math.floor(x),
  mod: (a, b) => ((a % b) + b) % b,
  // Periodic waves with period 2π, range [-1, 1]
  tri: (x) => (2 / Math.PI) * Math.asin(Math.sin(x)),
  saw: (x) => wrap(x) / Math.PI - 1,
  sq: (x) => (Math.sin(x) >= 0 ? 1 : -1),
  noise,
};

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  "π": Math.PI,
  e: Math.E,
  phi: PHI,
  "φ": PHI,
  tau: TAU,
};

type Token =
  | { type: "num"; value: number }
  | { type: "id"; value: string }
  | { type: "op"; value: string };

const tokenize = (src: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)/.exec(src.slice(i));
      if (!m) throw new Error(`Bad number at ${i + 1}`);
      tokens.push({ type: "num", value: parseFloat(m[0]) });
      i += m[0].length;
    } else if (/[a-zA-Zπφ]/.test(c)) {
      const m = /^([a-zA-Z]+|π|φ)/.exec(src.slice(i))!;
      tokens.push({ type: "id", value: m[0] });
      i += m[0].length;
    } else if ("+-*/%^(),·×".includes(c)) {
      const op = c === "·" || c === "×" ? "*" : c;
      tokens.push({ type: "op", value: op });
      i++;
    } else {
      throw new Error(`Unexpected "${c}"`);
    }
  }
  return tokens;
};

// Recursive-descent parser that compiles directly into closures
export const compileExpression = (src: string): CompileResult => {
  try {
    const tokens = tokenize(src);
    if (tokens.length === 0) throw new Error("Empty equation");
    let pos = 0;

    const peek = () => tokens[pos];
    const isOp = (v: string) => peek()?.type === "op" && peek()!.value === v;
    const expect = (v: string) => {
      if (!isOp(v)) throw new Error(`Expected "${v}"`);
      pos++;
    };

    // Identifiers like "sint" or "pit" are split greedily into known names
    const splitIdentifier = (id: string): string[] => {
      const names = [...Object.keys(FUNCTIONS), ...Object.keys(CONSTANTS), "t"].sort(
        (a, b) => b.length - a.length
      );
      const parts: string[] = [];
      let rest = id;
      while (rest.length) {
        const name = names.find((n) => rest.startsWith(n));
        if (!name) throw new Error(`Unknown name "${rest}"`);
        parts.push(name);
        rest = rest.slice(name.length);
      }
      return parts;
    };

    const parseExpr = (): CompiledExpr => {
      let left = parseTerm();
      while (isOp("+") || isOp("-")) {
        const op = tokens[pos++].value;
        const a = left;
        const b = parseTerm();
        left = op === "+" ? (t) => a(t) + b(t) : (t) => a(t) - b(t);
      }
      return left;
    };

    const startsFactor = () => {
      const tok = peek();
      return !!tok && (tok.type === "num" || tok.type === "id" || (tok.type === "op" && tok.value === "("));
    };

    const parseTerm = (): CompiledExpr => {
      let left = parseUnary();
      for (;;) {
        if (isOp("*") || isOp("/") || isOp("%")) {
          const op = tokens[pos++].value;
          const a = left;
          const b = parseUnary();
          left =
            op === "*" ? (t) => a(t) * b(t) : op === "/" ? (t) => a(t) / b(t) : (t) => a(t) % b(t);
        } else if (startsFactor()) {
          // Implicit multiplication: 2t, 3sin(t), (t+1)(t-1)
          const a = left;
          const b = parseUnary();
          left = (t) => a(t) * b(t);
        } else {
          return left;
        }
      }
    };

    const parseUnary = (): CompiledExpr => {
      if (isOp("-")) {
        pos++;
        const a = parseUnary();
        return (t) => -a(t);
      }
      if (isOp("+")) {
        pos++;
        return parseUnary();
      }
      return parsePower();
    };

    const parsePower = (): CompiledExpr => {
      const base = parsePrimary();
      if (isOp("^")) {
        pos++;
        const exp = parseUnary(); // right-associative
        return (t) => Math.pow(base(t), exp(t));
      }
      return base;
    };

    const parseCall = (name: string): CompiledExpr => {
      const fn = FUNCTIONS[name];
      expect("(");
      const args: CompiledExpr[] = [parseExpr()];
      while (isOp(",")) {
        pos++;
        args.push(parseExpr());
      }
      expect(")");
      if (args.length === 1) {
        const a = args[0];
        return (t) => fn(a(t));
      }
      return (t) => fn(...args.map((a) => a(t)));
    };

    const parsePrimary = (): CompiledExpr => {
      const tok = peek();
      if (!tok) throw new Error("Unexpected end");
      if (tok.type === "num") {
        pos++;
        const v = tok.value;
        return () => v;
      }
      if (tok.type === "op" && tok.value === "(") {
        pos++;
        const inner = parseExpr();
        expect(")");
        return inner;
      }
      if (tok.type === "id") {
        pos++;
        const parts = splitIdentifier(tok.value);
        // All but the last part are multiplied constants/variables, e.g. "pit" → pi * t
        const leading = parts.slice(0, -1).map((p) => {
          if (FUNCTIONS[p]) throw new Error(`${p} needs parentheses`);
          return atom(p);
        });
        const last = parts[parts.length - 1];
        let lastFn: CompiledExpr;
        if (FUNCTIONS[last]) {
          if (!isOp("(")) throw new Error(`${last} needs parentheses`);
          lastFn = parseCall(last);
        } else {
          lastFn = atom(last);
        }
        return [...leading, lastFn].reduce((a, b) => (t) => a(t) * b(t));
      }
      throw new Error(`Unexpected "${tok.value}"`);
    };

    const atom = (name: string): CompiledExpr => {
      if (name === "t") return (t) => t;
      const v = CONSTANTS[name];
      return () => v;
    };

    const fn = parseExpr();
    if (pos < tokens.length) throw new Error(`Unexpected "${tokens[pos].value}"`);

    // Sanity probe so obviously broken expressions are reported immediately
    fn(0.37);
    return { ok: true, fn };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};

// Generates a fresh, musically-scaled motion equation from irrational ratios,
// so the resulting melody is quasi-periodic (it never repeats exactly).
export const randomMotionEquation = (amplitude: number): string => {
  const ratios = ["phi", "sqrt(2)", "pi/4", "e/2", "1/phi", "pi/3", "sqrt(3)/2", "1/2", "3/4"];
  const waves = ["sin", "sin", "cos", "tri"];
  const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
  const a = Math.max(1, Math.round(amplitude * (0.5 + Math.random() * 0.5)));
  const b = Math.max(1, Math.round(amplitude * 0.4 * Math.random()));
  const first = `${a}${pick(waves)}(${pick(ratios)}*t)`;
  const second = `${b}${pick(waves)}(${pick(ratios)}*t)`;
  return Math.random() < 0.3 ? `${first} + ${second}*cos(t/4)` : `${first} + ${second}`;
};
