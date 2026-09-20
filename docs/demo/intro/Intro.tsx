import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { loadFont as loadFraunces } from "@remotion/google-fonts/Fraunces";
import { loadFont as loadPlex } from "@remotion/google-fonts/IBMPlexSans";
import { loadFont as loadMono } from "@remotion/google-fonts/IBMPlexMono";

const serif = loadFraunces("normal", { weights: ["400", "600", "700"], subsets: ["latin"] }).fontFamily;
const sans = loadPlex("normal", { weights: ["400", "500", "600"], subsets: ["latin"] }).fontFamily;
const mono = loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] }).fontFamily;

const C = {
  paper: "#f5efe3",
  paper2: "#efe6d3",
  ink: "#1f3d2b",
  ink2: "#2f5540",
  soft: "#5c6b61",
  mute: "#8b958d",
  line: "#d9cfb8",
  tomato: "#d2452b",
  leaf: "#2e7d4f",
  amber: "#b7791f",
  card: "#fbf8f1",
};

const ease = Easing.bezier(0.16, 1, 0.3, 1);

function useRise(delay = 0, dur = 22) {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [delay, delay + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  return { opacity: p, transform: `translateY(${(1 - p) * 18}px)` };
}

const Paper: React.FC<{ children: React.ReactNode; dark?: boolean }> = ({ children, dark }) => (
  <AbsoluteFill
    style={{
      background: dark
        ? `radial-gradient(1200px 700px at 20% 0%, rgba(46,125,79,.35), transparent 60%), ${C.ink}`
        : `radial-gradient(1200px 600px at 10% -10%, rgba(46,125,79,.08), transparent 60%), radial-gradient(900px 500px at 100% 0%, rgba(210,69,43,.06), transparent 55%), ${C.paper}`,
      fontFamily: sans,
      color: dark ? C.paper : C.ink,
    }}
  >
    {children}
  </AbsoluteFill>
);

const Eyebrow: React.FC<{ children: React.ReactNode; light?: boolean; style?: React.CSSProperties }> = ({ children, light, style }) => (
  <div style={{ fontSize: 18, letterSpacing: "0.16em", textTransform: "uppercase", color: light ? "rgba(245,239,227,.7)" : C.mute, fontWeight: 600, ...style }}>{children}</div>
);

// ---------------------------------------------------------------------------
// Scene 1: the shop
// ---------------------------------------------------------------------------

const Shop: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const shutter = interpolate(frame, [10, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const sign = spring({ frame: frame - 5, fps, config: { damping: 14, stiffness: 90 } });
  const sway = Math.sin(frame / 18) * 1.2;
  return (
    <svg viewBox="0 0 640 420" width={640} height={420} style={{ overflow: "visible" }}>
      {/* wall */}
      <rect x="40" y="90" width="560" height="300" rx="6" fill={C.card} stroke={C.line} strokeWidth="3" />
      {/* awning */}
      <g transform={`translate(0 ${(1 - sign) * -40})`}>
        <rect x="20" y="60" width="600" height="46" rx="8" fill={C.tomato} />
        {Array.from({ length: 12 }).map((_, i) => (
          <rect key={i} x={20 + i * 50} y="60" width="25" height="46" fill={C.paper} opacity="0.85" />
        ))}
        {Array.from({ length: 12 }).map((_, i) => (
          <path key={i} d={`M${20 + i * 50} 106 q12.5 ${18 + sway} 25 0`} fill={i % 2 ? C.paper : C.tomato} />
        ))}
        <rect x="120" y="14" width="400" height="40" rx="6" fill={C.ink} />
        <text x="320" y="42" textAnchor="middle" fontFamily={serif} fontSize="24" fontWeight="600" fill={C.paper}>
          PATIL PROVISION STORES
        </text>
      </g>
      {/* door + shutter */}
      <rect x="250" y="150" width="140" height="240" fill={C.ink2} />
      <rect x="250" y="150" width="140" height={240 * (1 - shutter)} fill={C.line} />
      {Array.from({ length: 12 }).map((_, i) => (
        <line key={i} x1="250" x2="390" y1={150 + i * 20 * (1 - shutter)} y2={150 + i * 20 * (1 - shutter)} stroke={C.soft} strokeWidth="2" opacity={0.6} />
      ))}
      {/* shelves */}
      {[190, 250, 310].map((y, r) => (
        <g key={y} style={{ opacity: shutter }}>
          <rect x="70" y={y} width="150" height="6" fill={C.line} />
          <rect x="420" y={y} width="150" height="6" fill={C.line} />
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={78 + i * 36} y={y - 28} width="26" height="26" rx="3" fill={[C.amber, C.leaf, C.tomato, C.ink2][(i + r) % 4]} opacity="0.85" />
          ))}
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={428 + i * 36} y={y - 28} width="26" height="26" rx="3" fill={[C.leaf, C.tomato, C.ink2, C.amber][(i + r) % 4]} opacity="0.85" />
          ))}
        </g>
      ))}
      {/* sacks */}
      <g style={{ opacity: shutter }}>
        <ellipse cx="120" cy="385" rx="42" ry="22" fill={C.amber} />
        <ellipse cx="120" cy="370" rx="36" ry="14" fill="#c98a2c" />
        <ellipse cx="520" cy="385" rx="42" ry="22" fill="#b5a06d" />
        <ellipse cx="520" cy="370" rx="36" ry="14" fill="#c9b47e" />
        <text x="120" y="392" textAnchor="middle" fontFamily={mono} fontSize="12" fill={C.paper}>RICE 25kg</text>
        <text x="520" y="392" textAnchor="middle" fontFamily={mono} fontSize="12" fill={C.ink}>ATTA 10kg</text>
      </g>
      {/* ground */}
      <rect x="0" y="392" width="640" height="10" fill={C.line} />
    </svg>
  );
};

const SceneShop: React.FC = () => {
  const a = useRise(20);
  const b = useRise(48);
  return (
    <Paper>
      <div style={{ position: "absolute", left: 90, top: 120, width: 640 }}>
        <Eyebrow style={{ ...useRise(4) }}>Where this started</Eyebrow>
        <div style={{ fontFamily: serif, fontSize: 64, lineHeight: 1.05, fontWeight: 600, marginTop: 18, ...a }}>
          My family runs a small provision shop back home.
        </div>
        <div style={{ fontSize: 26, color: C.soft, marginTop: 26, maxWidth: 560, lineHeight: 1.4, ...b }}>
          Rice, oil, sugar, tea, atta. The same twenty things, every single week.
        </div>
      </div>
      <div style={{ position: "absolute", right: 90, top: 240 }}>
        <Shop />
      </div>
    </Paper>
  );
};

// ---------------------------------------------------------------------------
// Scene 2: the weekly list
// ---------------------------------------------------------------------------

const LIST = [
  ["Rice (sona masoori)", "50 kg"],
  ["Sunflower oil", "30 L"],
  ["Sugar", "25 kg"],
  ["Tea powder", "5 kg"],
  ["Atta", "40 kg"],
  ["Toor dal", "20 kg"],
  ["Paneer", "6 kg"],
  ["Biscuits (assorted)", "12 boxes"],
];

const SceneList: React.FC = () => {
  const frame = useCurrentFrame();
  const title = useRise(6);
  return (
    <Paper>
      <div style={{ position: "absolute", left: 90, top: 100, width: 620 }}>
        <Eyebrow>Every Thursday</Eyebrow>
        <div style={{ fontFamily: serif, fontSize: 60, lineHeight: 1.05, fontWeight: 600, marginTop: 16, ...title }}>
          The reorder list is easy.
        </div>
        <div style={{ fontSize: 26, color: C.soft, marginTop: 24, lineHeight: 1.4, ...useRise(30) }}>
          It is written in two minutes on the back of a bill.
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: 110,
          top: 90,
          width: 560,
          padding: "34px 40px",
          background: C.card,
          border: `1px solid ${C.line}`,
          borderRadius: 12,
          boxShadow: "0 1px 0 rgba(31,61,43,.06), 0 24px 50px -30px rgba(31,61,43,.45)",
          transform: "rotate(-1.5deg)",
        }}
      >
        <div style={{ fontFamily: serif, fontSize: 28, fontWeight: 600, borderBottom: `1px dashed ${C.line}`, paddingBottom: 12 }}>This week</div>
        {LIST.map(([name, qty], i) => {
          const t = interpolate(frame, [18 + i * 9, 30 + i * 9], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
          return (
            <div key={name} style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", borderBottom: `1px solid ${C.paper2}`, fontSize: 24, opacity: t, transform: `translateX(${(1 - t) * -12}px)` }}>
              <span>{name}</span>
              <span style={{ fontFamily: mono, color: C.ink2 }}>{qty}</span>
            </div>
          );
        })}
      </div>
    </Paper>
  );
};

// ---------------------------------------------------------------------------
// Scene 3: the chaos of getting prices
// ---------------------------------------------------------------------------

const Bubble: React.FC<{ from: "me" | "them"; text: string; at: number; tone?: string }> = ({ from, text, at, tone }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at, fps, config: { damping: 16, stiffness: 120 } });
  if (frame < at) return null;
  return (
    <div
      style={{
        alignSelf: from === "me" ? "flex-end" : "flex-start",
        maxWidth: "78%",
        padding: "10px 14px",
        borderRadius: 14,
        background: from === "me" ? C.ink : tone ?? "#fff",
        color: from === "me" ? C.paper : C.ink,
        fontSize: 19,
        lineHeight: 1.35,
        transform: `scale(${0.85 + 0.15 * s})`,
        transformOrigin: from === "me" ? "bottom right" : "bottom left",
        opacity: s,
        boxShadow: "0 2px 6px rgba(0,0,0,.08)",
        marginBottom: 8,
      }}
    >
      {text}
    </div>
  );
};

const Phone: React.FC<{ name: string; x: number; delay: number; convo: Array<[("me" | "them"), string, string?]> }> = ({ name, x, delay, convo }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 100 } });
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: 250,
        width: 300,
        height: 560,
        borderRadius: 34,
        background: "#111",
        padding: 12,
        transform: `translateY(${(1 - s) * 80}px)`,
        opacity: s,
        boxShadow: "0 30px 60px -30px rgba(0,0,0,.6)",
      }}
    >
      <div style={{ background: "#e9e2d3", borderRadius: 26, height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ background: C.leaf, color: "#fff", padding: "14px 16px", fontWeight: 600, fontSize: 18 }}>{name}</div>
        <div style={{ padding: 12, display: "flex", flexDirection: "column", flex: 1 }}>
          {convo.map(([from, text, tone], i) => (
            <Bubble key={i} from={from} text={text} at={delay + 14 + i * 22} tone={tone} />
          ))}
        </div>
      </div>
    </div>
  );
};

const Clock: React.FC = () => {
  const frame = useCurrentFrame();
  const hand = frame * 6;
  return (
    <svg width="150" height="150" viewBox="0 0 150 150" style={{ position: "absolute", right: 110, top: 96 }}>
      <circle cx="75" cy="75" r="68" fill={C.card} stroke={C.ink} strokeWidth="5" />
      {Array.from({ length: 12 }).map((_, i) => (
        <line key={i} x1="75" y1="14" x2="75" y2="24" stroke={C.ink} strokeWidth="3" transform={`rotate(${i * 30} 75 75)`} />
      ))}
      <line x1="75" y1="75" x2="75" y2="30" stroke={C.tomato} strokeWidth="5" strokeLinecap="round" transform={`rotate(${hand} 75 75)`} />
      <line x1="75" y1="75" x2="75" y2="44" stroke={C.ink} strokeWidth="6" strokeLinecap="round" transform={`rotate(${hand / 12} 75 75)`} />
      <circle cx="75" cy="75" r="5" fill={C.ink} />
    </svg>
  );
};

const SceneChaos: React.FC = () => {
  const frame = useCurrentFrame();
  const title = useRise(6);
  const punch = useRise(190);
  return (
    <Paper>
      <div style={{ position: "absolute", left: 90, top: 90, width: 900 }}>
        <Eyebrow>Getting the prices is not</Eyebrow>
        <div style={{ fontFamily: serif, fontSize: 56, lineHeight: 1.05, fontWeight: 600, marginTop: 14, ...title }}>
          Three suppliers. Three phones. One whole morning.
        </div>
      </div>
      <Clock />
      <Phone
        name="Suresh Traders"
        x={120}
        delay={30}
        convo={[
          ["me", "Rate for 50 kg rice and 30 L oil?"],
          ["them", "Call me after 4", "#fff"],
          ["me", "Please message the rate"],
          ["them", "🎤 Voice note 0:41", "#fff3d6"],
        ]}
      />
      <Phone
        name="Kaveri Wholesale"
        x={470}
        delay={55}
        convo={[
          ["me", "Rate for 50 kg rice and 30 L oil?"],
          ["them", "📷 price-list.jpg", "#fff3d6"],
          ["them", "old rates, new list next week", "#fff"],
        ]}
      />
      <Phone
        name="Lakshmi Agencies"
        x={820}
        delay={80}
        convo={[
          ["me", "Rate for 50 kg rice and 30 L oil?"],
          ["them", "rice 42 oil 138 sugar 44 dal 118", "#fff"],
          ["me", "per kg? delivery?"],
          ["them", "✓✓", "#fff"],
        ]}
      />
      <div
        style={{
          position: "absolute",
          left: 1170,
          top: 300,
          width: 350,
          fontFamily: serif,
          fontSize: 34,
          lineHeight: 1.25,
          color: C.tomato,
          ...punch,
        }}
      >
        Nothing is comparable.
        <div style={{ fontFamily: sans, fontSize: 22, color: C.soft, marginTop: 18, lineHeight: 1.45 }}>
          Prices arrive as calls, voice notes and photos. Nobody knows who was cheapest last week, or whether the rate just went up.
        </div>
      </div>
      <div style={{ position: "absolute", left: 90, bottom: 40, fontSize: 20, color: C.mute, opacity: interpolate(frame, [220, 250], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        Multiply by every small restaurant, cafe and shop on the street.
      </div>
    </Paper>
  );
};

// ---------------------------------------------------------------------------
// Scene 4: what if
// ---------------------------------------------------------------------------

const SceneWhatIf: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = useRise(6);
  const typed = "20 kg paneer, 10 L sunflower oil, 5 kg tomatoes, and some eggs";
  const chars = Math.round(interpolate(frame, [30, 120], [0, typed.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const steps = ["finds suppliers", "emails them for quotes", "reads every reply", "ranks the quotes", "sends the purchase order"];
  return (
    <Paper dark>
      <div style={{ position: "absolute", left: 100, top: 110, width: 760 }}>
        <Eyebrow light>What if</Eyebrow>
        <div style={{ fontFamily: serif, fontSize: 60, lineHeight: 1.05, fontWeight: 600, marginTop: 16, ...a }}>
          The shop just typed the list, and everything else happened by email.
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 400,
          width: 760,
          padding: "22px 26px",
          borderRadius: 12,
          background: "rgba(245,239,227,.08)",
          border: "1px solid rgba(245,239,227,.25)",
          fontFamily: mono,
          fontSize: 26,
          minHeight: 110,
        }}
      >
        {typed.slice(0, chars)}
        <span style={{ opacity: frame % 20 < 10 ? 1 : 0 }}>▍</span>
      </div>
      <div style={{ position: "absolute", left: 960, top: 150, width: 560 }}>
        {steps.map((s, i) => {
          const p = spring({ frame: frame - (110 + i * 18), fps, config: { damping: 16, stiffness: 110 } });
          return (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 22, opacity: p, transform: `translateX(${(1 - p) * 30}px)` }}>
              <div style={{ width: 44, height: 44, borderRadius: 22, background: C.tomato, color: "#fff", display: "grid", placeItems: "center", fontFamily: mono, fontSize: 20 }}>{i + 1}</div>
              <div style={{ fontSize: 30, fontFamily: serif }}>{s}</div>
            </div>
          );
        })}
        <div style={{ marginTop: 20, fontSize: 21, color: "rgba(245,239,227,.7)", opacity: interpolate(frame, [215, 240], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          while the owner watches the quotes land, live.
        </div>
      </div>
    </Paper>
  );
};

// ---------------------------------------------------------------------------
// Scene 5: title card
// ---------------------------------------------------------------------------

const SceneTitle: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 80 } });
  const tag = useRise(28);
  const stack = useRise(55);
  const pills = ["Convex", "Firecrawl", "AgentMail", "OpenAI"];
  return (
    <Paper>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 22, transform: `scale(${0.7 + 0.3 * s})`, opacity: s }}>
            <div style={{ width: 110, height: 110, borderRadius: 26, background: C.ink, color: C.paper, fontFamily: serif, fontSize: 68, fontWeight: 700, display: "grid", placeItems: "center" }}>S</div>
            <div style={{ fontFamily: serif, fontSize: 112, fontWeight: 600, letterSpacing: "-0.02em" }}>Sourcer</div>
          </div>
          <div style={{ fontSize: 34, color: C.ink2, marginTop: 24, fontFamily: serif, fontStyle: "italic", ...tag }}>
            Your weekly reorder, quoted and ranked before service.
          </div>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 46, ...stack }}>
            {pills.map((p, i) => (
              <div key={p} style={{ padding: "10px 22px", borderRadius: 999, border: `2px solid ${i === 0 ? C.ink : C.line}`, background: i === 0 ? C.ink : C.card, color: i === 0 ? C.paper : C.ink, fontSize: 22, fontWeight: 600 }}>{p}</div>
            ))}
          </div>
          <div style={{ fontSize: 20, color: C.mute, marginTop: 30, opacity: interpolate(frame, [80, 100], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
            Convex All Gas Hackathon · built and tested end to end on real email
          </div>
        </div>
      </div>
    </Paper>
  );
};

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

export const SCENES = {
  shop: 7 * 30,
  list: 9 * 30,
  chaos: 11 * 30,
  whatIf: 10 * 30,
  title: 5 * 30,
};
const T = 18;
export const INTRO_FRAMES = SCENES.shop + SCENES.list + SCENES.chaos + SCENES.whatIf + SCENES.title - 4 * T;

export const Intro: React.FC = () => (
  <TransitionSeries>
    <TransitionSeries.Sequence durationInFrames={SCENES.shop}>
      <SceneShop />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: T })} />
    <TransitionSeries.Sequence durationInFrames={SCENES.list}>
      <SceneList />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />
    <TransitionSeries.Sequence durationInFrames={SCENES.chaos}>
      <SceneChaos />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={linearTiming({ durationInFrames: T })} />
    <TransitionSeries.Sequence durationInFrames={SCENES.whatIf}>
      <SceneWhatIf />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />
    <TransitionSeries.Sequence durationInFrames={SCENES.title}>
      <SceneTitle />
    </TransitionSeries.Sequence>
  </TransitionSeries>
);
