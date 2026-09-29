import { useEffect, useState } from "react";

const DEFAULT_MESSAGES = ["Gathering stories", "Reading designs", "Counting tests", "Linking the twin"];

const RING = ["#2f6bff", "#3ec6ff", "#3dce4a", "#8ee04a", "#d6e23a", "#ffe14a", "#ffb020", "#ff7a2f", "#ff4d6a", "#ff3d9a", "#d13dff", "#8a3dff", "#6a6bff", "#8aa4ff", "#a9bfff", "#7eb6ff"];

const DOTS = RING.map((color, index) => {
  const angle = (index / RING.length) * Math.PI * 2 - Math.PI / 2;
  return {
    color,
    delay: `${index * 0.12}s`,
    x: 160 + Math.cos(angle) * 126,
    y: 148 + Math.sin(angle) * 126,
  };
});

const SPARKLES = [
  { x: 108, y: 108, delay: "0s" },
  { x: 132, y: 88, delay: "0.4s" },
  { x: 96, y: 140, delay: "0.8s" },
  { x: 188, y: 86, delay: "0.2s" },
  { x: 206, y: 104, delay: "0.7s" },
  { x: 228, y: 118, delay: "1.1s" },
  { x: 158, y: 162, delay: "0.3s" },
  { x: 176, y: 176, delay: "0.9s" },
  { x: 214, y: 186, delay: "0.5s" },
  { x: 196, y: 200, delay: "1.3s" },
] as const;

type BrainLoaderProps = {
  messages?: string[];
};

function Sparkle({ x, y, delay }: { x: number; y: number; delay: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path className="brain-sparkle" style={{ animationDelay: delay }} d="M0 -6 L1.3 -1.3 L6 0 L1.3 1.3 L0 6 L-1.3 1.3 L-6 0 L-1.3 -1.3 Z" />
    </g>
  );
}

export function BrainLoader({ messages = DEFAULT_MESSAGES }: BrainLoaderProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (messages.length < 2) {
      return;
    }
    const timer = window.setInterval(() => {
      setIndex((value) => (value + 1) % messages.length);
    }, 1600);
    return () => window.clearInterval(timer);
  }, [messages]);

  const message = messages[index] ?? messages[0] ?? "Loading";

  return (
    <div className="brain-loader" role="status" aria-live="polite" aria-label={message}>
      <svg className="brain-loader-svg" viewBox="0 0 320 300" aria-hidden="true">
        {DOTS.map((dot) => (
          <circle
            key={`${dot.x}-${dot.y}`}
            className="brain-ring-dot"
            cx={dot.x}
            cy={dot.y}
            r="8"
            fill={dot.color}
            style={{ animationDelay: dot.delay }}
          />
        ))}
        <path className="lobe lobe-blue" d="M78 148 C62 112 88 70 132 64 C158 60 172 90 160 118 C174 146 156 174 124 180 C94 186 70 168 78 148 Z" />
        <path className="lobe lobe-green" d="M148 74 C170 50 214 54 228 82 C238 104 216 122 188 118 C162 114 138 100 148 74 Z" />
        <path className="lobe lobe-purple" d="M204 90 C234 74 262 100 258 132 C254 162 224 168 202 146 C186 128 182 106 204 90 Z" />
        <path className="lobe lobe-orange" d="M124 150 C152 134 190 146 198 172 C192 198 154 206 128 186 C110 172 108 160 124 150 Z" />
        <path className="lobe lobe-pink" d="M186 168 C214 156 246 172 244 198 C236 220 204 224 186 204 C174 190 172 176 186 168 Z" />
        <path className="lobe lobe-stem" d="M168 190 C176 208 172 230 158 246 C150 228 154 206 168 190 Z" />
        <path className="lobe-fold" d="M96 100 C116 112 124 132 112 148" />
        <path className="lobe-fold" d="M112 84 C132 98 128 118 116 128" />
        <path className="lobe-fold" d="M168 78 C186 92 182 108 168 112" />
        <path className="lobe-fold" d="M214 104 C230 116 228 136 214 144" />
        <path className="lobe-fold" d="M142 160 C160 168 166 182 154 190" />
        <path className="lobe-fold" d="M200 180 C216 190 218 204 206 210" />
        {SPARKLES.map((spark) => (
          <Sparkle key={`${spark.x}-${spark.y}`} x={spark.x} y={spark.y} delay={spark.delay} />
        ))}
      </svg>
      <p className="brain-loader-label">{message}</p>
      <p className="brain-loader-hint muted">Loading information into the twin</p>
    </div>
  );
}
