/* ===================== color-gradle · admin data ===================== */
/* Decorative scene gradients so scheduled days read as distinct photos. */

const SCENES = {
  golden: "radial-gradient(120% 78% at 70% 16%, rgba(255,222,165,.95), rgba(255,176,92,.6) 32%, rgba(255,176,92,0) 60%), radial-gradient(90% 60% at 22% 96%, rgba(40,22,18,.88), rgba(40,22,18,0) 55%), linear-gradient(177deg,#f4c781 0%,#ea9e57 30%,#c46c42 50%,#7a4029 68%,#321d16 86%,#1d110d 100%)",
  rain: "radial-gradient(100% 70% at 30% 12%, rgba(206,224,236,.8), rgba(120,150,170,0) 55%), linear-gradient(168deg,#9fb4c4 0%,#6f8aa0 34%,#3f5566 60%,#23323d 82%,#141d24 100%)",
  market: "radial-gradient(110% 70% at 64% 20%, rgba(255,210,160,.7), rgba(255,150,120,0) 55%), linear-gradient(170deg,#d98a5a 0%,#b85f47 32%,#7a8a4e 56%,#46603c 74%,#22301f 100%)",
  harbor: "radial-gradient(120% 80% at 72% 18%, rgba(180,210,225,.65), rgba(90,140,170,0) 58%), linear-gradient(176deg,#7fa7bd 0%,#4f7d9b 30%,#345f7d 52%,#22414f 72%,#111e26 100%)",
  desert: "radial-gradient(120% 76% at 30% 14%, rgba(255,232,190,.85), rgba(230,180,120,0) 60%), linear-gradient(172deg,#e7c896 0%,#d29d61 32%,#b06b3e 56%,#7c4a2c 78%,#3a2417 100%)",
  fog: "radial-gradient(120% 80% at 50% 20%, rgba(224,226,222,.7), rgba(150,160,158,0) 60%), linear-gradient(175deg,#c3c8c2 0%,#9aa39c 36%,#727d76 60%,#4a534d 82%,#272c28 100%)",
  neon: "radial-gradient(90% 60% at 26% 20%, rgba(255,120,210,.55), rgba(120,40,140,0) 55%), radial-gradient(80% 60% at 80% 80%, rgba(90,220,230,.4), rgba(40,90,120,0) 55%), linear-gradient(168deg,#6a2a6f 0%,#46264f 36%,#2a2b4a 60%,#1a2236 82%,#0e1320 100%)",
};

/* days the curator manages — past (archived), today (live), upcoming (queue) */
const SCHEDULE = [
  { day: 132, date: "Sat, Jun 6", theme: "Desert Highway", scene: "desert", status: "draft" },
  { day: 131, date: "Fri, Jun 5", theme: "Blue Hour Harbor", scene: "harbor", status: "scheduled" },
  { day: 130, date: "Thu, Jun 4", theme: "Market Stalls", scene: "market", status: "scheduled" },
  { day: 129, date: "Wed, Jun 3", theme: "Rainy Window", scene: "rain", status: "scheduled" },
  { day: 128, date: "Tue, Jun 2", theme: "Golden Hour Street", scene: "golden", status: "live" },
  { day: 127, date: "Mon, Jun 1", theme: "Morning Fog", scene: "fog", status: "archived", players: 1190, edits: 318 },
  { day: 126, date: "Sun, May 31", theme: "Neon Alley", scene: "neon", status: "archived", players: 1342, edits: 372 },
];

/* analytics — last 7 days completion + a couple of headline stats */
const ANALYTICS = {
  today: { players: 1204, completion: 0.71, median: "3:42", likes: 4820, returning: 0.58 },
  week: [
    { d: "Mon", v: 0.69 }, { d: "Tue", v: 0.71 }, { d: "Wed", v: 0.64 },
    { d: "Thu", v: 0.73 }, { d: "Fri", v: 0.7 }, { d: "Sat", v: 0.78 }, { d: "Sun", v: 0.75 },
  ],
};

/* moderation queue (flagged edits) */
const FLAGGED = [
  { id: "f1", who: "DustPlum44", reason: "Off-topic / not an edit", tone: { saturation: -100, exposure: -40, contrast: 60, blacks: -40, temp: 0, tint: 0, highlights: 0, shadows: 0, whites: 0, vibrance: 0 } },
  { id: "f2", who: "InkTide88", reason: "Auto-flag · extreme values", tone: { exposure: 100, contrast: 100, saturation: 100, temp: 100, tint: 80, highlights: 0, shadows: 0, whites: 0, blacks: 0, vibrance: 100 } },
];

const AI_PLAYERS = [
  { id: "claude", name: "claude-opus-4.8", on: true },
  { id: "gemini", name: "gemini-3-pro", on: true },
  { id: "gpt", name: "gpt-5.4", on: true },
  { id: "llama", name: "llama-4-vision", on: false },
];

Object.assign(window, { SCENES, SCHEDULE, ANALYTICS, FLAGGED, AI_PLAYERS });
