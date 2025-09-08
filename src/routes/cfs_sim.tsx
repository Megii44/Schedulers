// src/pages/cfs_sim.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Stack,
  Typography,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  Chip,
  Slider,
} from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PauseCircleIcon from "@mui/icons-material/PauseCircle";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import { useLocation, useNavigate } from "@tanstack/react-router";

/* ------- tip posla (isti kao na cfs.tsx) ------- */
type CfsJob = {
  id: string;
  name: string;
  duration: number | "";
  nice: number | "";
  arrivalTime: number | "";
  color?: string; // boja iz tablice
  editable: boolean;
};

/* nice -> weight tablica (točna) */
const NICE_WEIGHTS = [
  88761, 71755, 56483, 46273, 36291, 29154, 23254, 18705, 14949, 11916, 9548,
  7620, 6100, 4904, 3906, 3121, 2501, 1991, 1586, 1277, 1024, 820, 655, 526,
  423, 335, 272, 215, 172, 137, 110, 87, 70, 56, 45, 36, 29, 23, 18, 15,
];
const weightFromNice = (nice: number) => {
  const idx = Math.max(-20, Math.min(19, Math.trunc(nice))) + 20;
  return NICE_WEIGHTS[idx];
};

const PALETTE = ["#f44336", "#ba68c8", "#4caf50", "#00bcd4", "#ffb300"];
const getColor = (i: number) => PALETTE[i % PALETTE.length];

/* ================== CFS SIM (precompute timeline) ==================
   Tick = 1s. Svaki tick: izaberi MIN vruntime među ready,
   remaining -= 1, vruntime += 1024/weight(nice).
   Prekomputiramo sve "snapshote" kako bi slider mogao skakati.
==================================================================== */

type SimTask = {
  id: string;
  name: string;
  color: string;
  remaining: number;
  nice: number;
  weight: number;
  arrival: number;
  vruntime: number;
  done: boolean;
};

type ReadyInfo = {
  id: string;
  name: string;
  color: string;
  vr: number;
  nice: number;
  weight: number;
};

type Snapshot = {
  t: number; // vrijeme početka ovog ticka
  tasks: SimTask[]; // stanje NAKON odrađenog ticka
  chosenId?: string; // koji je bio izabran NA početku ticka
  deltaVr?: number; // koliko mu je porastao vruntime u tom ticku
  readyBefore: ReadyInfo[]; // poredak ready zadataka na početku ticka
};

function normalize(input: CfsJob[]): SimTask[] {
  return input
    .map((j, i) => ({
      id: j.id,
      name: j.name,
      color: j.color ?? getColor(i),
      remaining: Number(j.duration),
      nice: Number(j.nice),
      weight: weightFromNice(Number(j.nice)),
      arrival: Number(j.arrivalTime),
      vruntime: 0,
      done: false,
    }))
    .filter(
      (t) =>
        Number.isFinite(t.remaining) &&
        Number.isFinite(t.nice) &&
        Number.isFinite(t.arrival) &&
        t.remaining > 0
    )
    .sort((a, b) => a.arrival - b.arrival);
}

function allDone(tasks: SimTask[]) {
  return tasks.every((t) => t.done || t.remaining <= 0);
}

/** Precompute cijelu vremensku liniju od t0 do završetka */
function simulateTimeline(initial: SimTask[]): Snapshot[] {
  const tasks = initial.map((x) => ({ ...x })); // kopija
  if (!tasks.length) return [];

  let t = Math.min(...tasks.map((x) => x.arrival));
  const snaps: Snapshot[] = [];
  const MAX_TICKS = 10000;

  while (!allDone(tasks) && snaps.length < MAX_TICKS) {
    // --- stanje na početku ticka (za objašnjenje) ---
    const ready = tasks
      .filter((x) => !x.done && x.arrival <= t)
      .sort((a, b) => a.vruntime - b.vruntime);
    const chosen = ready[0];
    const readyBefore: ReadyInfo[] = ready.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      vr: r.vruntime,
      nice: r.nice,
      weight: r.weight,
    }));
    const deltaVr = chosen ? 1024 / chosen.weight : undefined;

    // --- izvrši tick ---
    if (chosen) {
      chosen.remaining -= 1;
      chosen.vruntime += deltaVr!;
      if (chosen.remaining <= 0) chosen.done = true;
    }

    // snimi snapshot (stanje NAKON ticka)
    snaps.push({
      t,
      tasks: tasks.map((x) => ({ ...x })),
      chosenId: chosen?.id,
      deltaVr,
      readyBefore,
    });

    t += 1;
  }

  return snaps;
}

/* ----- balansirano “RB” stablo iz sortirane liste (po vruntime) ----- */
type TreeNode = {
  id: string;
  x: number;
  y: number;
  value: number;
  color?: string; // boja posla (za label)
  name?: string; // puno ime posla (za tooltip i label)
  left?: TreeNode;
  right?: TreeNode;
  rb?: "red" | "black"; // vizual RB boje
};

function buildBalancedTree(
  leaves: { id: string; value: number; color: string; name: string }[],
  depth = 0
): TreeNode | undefined {
  if (!leaves.length) return undefined;
  if (leaves.length === 1) {
    return {
      id: leaves[0].id,
      x: 0,
      y: depth,
      value: leaves[0].value,
      color: leaves[0].color,
      name: leaves[0].name,
    };
  }
  const mid = Math.floor(leaves.length / 2);
  const left = buildBalancedTree(leaves.slice(0, mid), depth + 1);
  const right = buildBalancedTree(leaves.slice(mid + 1), depth + 1);
  const me: TreeNode = {
    id: `n-${leaves[mid].id}-${depth}`,
    x: 0,
    y: depth,
    value: (left?.value ?? 0) + leaves[mid].value + (right?.value ?? 0),
  };
  me.left = left;
  me.right = right;
  return me;
}

/* vizualno RB bojanje: root black, zatim izmjena po razinama (bez red–red) */
function colorAsRedBlack(
  n?: TreeNode,
  parentColor: "red" | "black" | null = null
) {
  if (!n) return;
  if (parentColor === null) n.rb = "black";
  else n.rb = parentColor === "black" ? "red" : "black";
  colorAsRedBlack(n.left, n.rb);
  colorAsRedBlack(n.right, n.rb);
}

/* layout */
const NODE_R = 18;
const LAYER_H = 90;
const H_SPACING = 140; // malo veći razmak radi labela

function layoutTree(root: TreeNode | undefined) {
  const nodes: TreeNode[] = [];
  const edges: [TreeNode, TreeNode][] = [];
  if (!root) return { nodes, edges, width: 0, height: 0 };

  let curX = 0;
  const visit = (n?: TreeNode, depth = 0) => {
    if (!n) return;
    visit(n.left, depth + 1);
    n.x = curX * H_SPACING + NODE_R * 2;
    n.y = depth * LAYER_H + NODE_R * 2;
    nodes.push(n);
    if (n.left) edges.push([n, n.left]);
    if (n.right) edges.push([n, n.right]);
    curX++;
    visit(n.right, depth + 1);
  };
  visit(root, 0);

  const width = Math.max(nodes.length * H_SPACING + NODE_R * 4, 700);
  const maxDepth = Math.max(0, ...nodes.map((n) => n.y));
  const height = maxDepth + NODE_R * 4 + 60;
  return { nodes, edges, width, height };
}

/* pomoć: generiraj kratku oznaku (P1 iz "Posao 1", inače inicijali) */
function shortLabel(name?: string) {
  if (!name) return "J";
  const m = name.match(/posao\s*(\d+)/i);
  if (m) return `P${m[1]}`;
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/* --------- komponenta --------- */
export default function CfsSim() {
  const navigate = useNavigate();
  const location = useLocation() as unknown as { state?: { jobs?: CfsJob[] } };

  const baseJobs = useMemo<CfsJob[]>(
    () => location.state?.jobs ?? [],
    [location.state]
  );
  const timeline = useMemo<Snapshot[]>(
    () => simulateTimeline(normalize(baseJobs)),
    [baseJobs]
  );

  // indeks trenutno prikazanog snapshota (timeline korak)
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(true);
  const [openInfo, setOpenInfo] = useState(false);

  const totalSteps = timeline.length;
  const snap = timeline[progress];

  // lookup mapa (za fiksni redoslijed badgeva po baseJobs)
  const taskById = useMemo(() => {
    const m = new Map<string, SimTask>();
    if (snap) snap.tasks.forEach((t) => m.set(t.id, t));
    return m;
  }, [snap]);

  // izgradi RB-stablo za ovaj korak
  const { nodes, edges, width, height } = useMemo(() => {
    if (!snap)
      return {
        nodes: [] as TreeNode[],
        edges: [] as [TreeNode, TreeNode][],
        width: 0,
        height: 0,
      };
    const leaves = snap.tasks
      .filter((x) => !x.done && x.arrival <= snap.t)
      .sort((a, b) => a.vruntime - b.vruntime)
      .map((x) => ({
        id: x.id,
        value: Math.round(x.vruntime),
        color: x.color,
        name: x.name,
      }));
    const root = buildBalancedTree(leaves);
    colorAsRedBlack(root); // RB bojanje prije layouta
    return layoutTree(root);
  }, [snap]);

  // autoplay
  useEffect(() => {
    if (!running || totalSteps === 0) return;
    if (progress >= totalSteps - 1) return;
    const id = setInterval(() => {
      setProgress((p) => Math.min(totalSteps - 1, p + 1));
    }, 650);
    return () => clearInterval(id);
  }, [running, totalSteps, progress]);

  // reset na promjenu inputa
  useEffect(() => setProgress(0), [totalSteps]);

  // scroll na sredinu grafa
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({
      left: Math.max(0, width / 2 - 400),
      behavior: "smooth",
    });
  }, [width, progress]);

  const handleReset = () => {
    setRunning(false);
    setProgress(0);
  };

  const handleStep = (delta: number) => {
    setRunning(false);
    setProgress((p) => Math.max(0, Math.min(totalSteps - 1, p + delta)));
  };

  /* --- TIMELINE: točkice za SVAKI korak + label samo za start/mid/end --- */
  const allMarks = useMemo(() => {
    if (totalSteps <= 0) return [];
    const mid = Math.floor((totalSteps - 1) / 2);
    return Array.from({ length: totalSteps }, (_, i) => ({
      value: i,
      label:
        i === 0
          ? "start"
          : i === mid
          ? "mid"
          : i === totalSteps - 1
          ? "end"
          : "",
    }));
  }, [totalSteps]);

  const chosenMeta = useMemo(() => {
    if (!snap?.chosenId) return undefined;
    const t = snap.tasks.find((x) => x.id === snap.chosenId);
    return t
      ? {
          name: t.name,
          color: t.color,
          nice: t.nice,
          deltaVr: snap.deltaVr ?? 0,
        }
      : undefined;
  }, [snap]);

  return (
    <Box sx={{ p: 4, bgcolor: "#f9f9f9", minHeight: "100vh" }}>
      {/* HEADER */}
      <Box mb={2}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="h5" fontWeight="bold">
              CFS
            </Typography>
            <IconButton
              size="small"
              color="primary"
              onClick={() => setOpenInfo(true)}
            >
              <InfoOutlinedIcon fontSize="small" />
            </IconButton>
            {snap && (
              <Chip
                size="small"
                color="primary"
                label={`t = ${snap.t}s`}
                sx={{ ml: 1 }}
              />
            )}
          </Stack>
          <Stack direction="row" spacing={1.5}>
            <Button
              variant="contained"
              startIcon={<ArrowBackIcon />}
              onClick={() => navigate({ to: "/cfs" })}
            >
              Nazad
            </Button>
            <Button
              variant="contained"
              startIcon={<RestartAltIcon />}
              onClick={handleReset}
            >
              Resetiraj
            </Button>
            <Button
              variant="contained"
              onClick={() => setRunning((r) => !r)}
              startIcon={running ? <PauseCircleIcon /> : <PlayCircleIcon />}
            >
              {running ? "Pauza" : "Play"}
            </Button>
            <IconButton
              color="primary"
              onClick={() => handleStep(-1)}
              disabled={progress <= 0}
            >
              <NavigateBeforeIcon />
            </IconButton>
            <IconButton
              color="primary"
              onClick={() => handleStep(+1)}
              disabled={progress >= totalSteps - 1 || totalSteps === 0}
            >
              <NavigateNextIcon />
            </IconButton>
          </Stack>
        </Stack>
      </Box>

      {/* BADGEVI POSLOVA – fiksni redoslijed kao u tablici */}
      <Box sx={{ display: "flex", gap: 2.5, flexWrap: "wrap", mb: 2 }}>
        {baseJobs.map((j, i) => {
          const t = taskById.get(j.id);
          return (
            <Box
              key={j.id}
              sx={{
                background: j.color ?? getColor(i),
                color: "white",
                px: 3,
                py: 1,
                borderRadius: 3,
                boxShadow: 2,
                minWidth: 160,
                textAlign: "center",
              }}
            >
              <Typography fontWeight={700}>{j.name}</Typography>
              <Typography
                variant="caption"
                sx={{ opacity: 0.9, display: "block" }}
              >
                VR ≈ {Math.round(t?.vruntime ?? 0)} | nice {t?.nice ?? 0} | rem{" "}
                {t?.remaining ?? 0}s
              </Typography>
            </Box>
          );
        })}
      </Box>

      {/* OBJAŠNJENJE KORAKA */}
      {snap && (
        <Box
          sx={{
            background: "white",
            borderRadius: 2,
            p: 2,
            boxShadow: 1,
            mb: 2,
          }}
        >
          {snap.readyBefore.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Nitko nije spreman (idle).
            </Typography>
          ) : (
            <>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Spremni (sortirano po vruntimeu):{" "}
                {snap.readyBefore.map((r) => (
                  <Box
                    key={r.id}
                    component="span"
                    sx={{
                      display: "inline-block",
                      px: 1,
                      py: 0.2,
                      mx: 0.4,
                      borderRadius: 1,
                      bgcolor: r.color,
                      color: "white",
                      fontWeight: 700,
                      fontSize: 12,
                    }}
                  >
                    {r.name}
                  </Box>
                ))}
              </Typography>

              {chosenMeta ? (
                <Typography variant="body2">
                  Odabran je <b>{chosenMeta.name}</b> (najmanji VR). U ovoj
                  sekundi mu vruntime raste za ≈{" "}
                  <b>{chosenMeta.deltaVr?.toFixed(3)}</b> (≈ 1024 / weight, nice{" "}
                  {chosenMeta.nice}).
                </Typography>
              ) : (
                <Typography variant="body2">
                  U ovoj sekundi nitko nije odabran.
                </Typography>
              )}
            </>
          )}
        </Box>
      )}

      {/* TIMELINE (točkice za svaku sekundu, margine i blagi stil) */}
      <Box
        sx={{
          background: "white",
          borderRadius: 2,
          p: 2,
          px: 3,
          boxShadow: 1,
          mb: 2,
        }}
      >
        {totalSteps === 0 ? (
          <Typography color="text.secondary">
            Nema podataka za prikaz.
          </Typography>
        ) : (
          <Stack spacing={1} style={{ padding: "20px" }}>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
              Timeline (klikni ili povuci za skok na korak)
            </Typography>
            <Slider
              value={progress}
              min={0}
              max={totalSteps - 1}
              step={1}
              marks={allMarks} // točkice za SVAKU sekundu (labela samo start/mid/end)
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `t=${timeline[v]?.t ?? 0}s`}
              onChange={(_, v) => {
                setRunning(false);
                setProgress(Array.isArray(v) ? v[0] : v);
              }}
              sx={{
                mx: 4, // bočni razmak
                "& .MuiSlider-rail": { opacity: 0.5 },
                "& .MuiSlider-mark": {
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  bgcolor: "#c5cae9",
                  transform: "translateX(-50%) translateY(-50%)",
                  top: "50%",
                },
                "& .MuiSlider-markActive": {
                  bgcolor: "#3f51b5",
                },
                "& .MuiSlider-markLabel": {
                  px: 0.6,
                  py: 0.1,
                  bgcolor: "#f6f6f9",
                  borderRadius: 1,
                  transform: "translateY(4px)",
                },
              }}
            />
          </Stack>
        )}
      </Box>

      {/* RUNQUEUE RB-STABLO — minimalistički čvorovi + bočni label na listovima */}
      <Box
        sx={{
          background: "white",
          borderRadius: 2,
          p: 2,
          boxShadow: 1,
          position: "relative",
          mt: 2,
        }}
      >
        <Box ref={scrollRef} sx={{ overflowX: "auto", overflowY: "hidden" }}>
          {!snap || nodes.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 4 }}>
              {totalSteps === 0
                ? "Nema podataka."
                : `Nema spremnih poslova u t=${snap?.t}.`}
            </Typography>
          ) : (
            <svg width={width} height={height}>
              {/* grane */}
              {edges.map(([p, c], i) => (
                <line
                  key={i}
                  x1={p.x}
                  y1={p.y}
                  x2={c.x}
                  y2={c.y}
                  stroke="#999"
                  strokeWidth={2}
                />
              ))}

              {/* čvorovi */}
              {nodes.map((n) => {
                const isLeaf = !n.left && !n.right;
                const isChosen = snap?.chosenId && n.id === snap.chosenId;
                const rbFill = n.rb === "red" ? "#d32f2f" : "#212121"; // RB boje

                // leaf tooltip info iz stanja
                const tinfo = isLeaf ? taskById.get(n.id) : undefined;
                const leafTooltip =
                  isLeaf && tinfo
                    ? `${tinfo.name}\nVR≈${tinfo.vruntime.toFixed(2)}, nice ${
                        tinfo.nice
                      } (w=${tinfo.weight})\nremaining ${
                        tinfo.remaining
                      }s, arrival ${tinfo.arrival}s`
                    : undefined;

                // bočni label (P1) dimenzije
                const lbl = isLeaf ? shortLabel(n.name) : "";
                const padX = 8;
                // const padY = 4;
                const charW = 8; // aproks.
                const lblW = lbl.length * charW + padX * 2;
                const lblH = 18;

                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x}, ${n.y})`}
                    style={{ cursor: isLeaf ? "pointer" : "default" }}
                  >
                    {/* native tooltip */}
                    <title>
                      {isLeaf
                        ? leafTooltip
                        : `RB čvor (interni)\nsum = ${n.value}\ncolor = ${n.rb}`}
                    </title>

                    {/* jedini prsten: zeleni highlight za izabrani list */}
                    {isLeaf && isChosen && (
                      <circle
                        r={NODE_R + 5}
                        fill="none"
                        stroke="#2e7d32"
                        strokeWidth={3}
                      />
                    )}

                    {/* glavni RB krug — BEZ sivog okvira */}
                    <circle r={NODE_R} fill={rbFill} />

                    {/* broj (vruntime) */}
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize="12"
                      fontWeight={700}
                      fill="#fff"
                    >
                      {n.value}
                    </text>

                    {/* bočni label za list: obojeni "P1" i sl. */}
                    {isLeaf && (
                      <g transform={`translate(${NODE_R + 10}, ${-lblH / 2})`}>
                        <rect
                          width={lblW}
                          height={21}
                          rx={6}
                          ry={6}
                          fill={n.color ?? "#666"}
                          opacity={0.95}
                        />
                        <text
                          x={lblW / 2}
                          y={lblH / 2 + 1}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize="12"
                          fontWeight={400}
                          fill="#fff"
                        >
                          {lbl}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </Box>
      </Box>

      {/* Info dialog */}
      <Dialog open={openInfo} onClose={() => setOpenInfo(false)} maxWidth="md">
        <DialogTitle sx={{ fontWeight: 700 }}>CFS — run simulation</DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          {/* LEGENDA */}
          <Typography variant="h6" sx={{ mb: 1 }}>
            Legenda (što vidiš)
          </Typography>

          <Stack spacing={1.2} sx={{ mb: 2 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              {/* zeleni highlight */}
              <Box
                sx={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  bgcolor: "#212121",
                  boxShadow: "0 0 0 3px #2e7d32 inset",
                }}
              />
              <Typography variant="body2">
                <strong>Zeleni prsten</strong> = posao koji je izabran u tom
                ticku.
              </Typography>
            </Stack>

            <Stack direction="row" spacing={1.5} alignItems="center">
              {/* RB crni i crveni čvor */}
              <Box
                sx={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  bgcolor: "#212121",
                }}
              />
              <Box
                sx={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  bgcolor: "#d32f2f",
                }}
              />
              <Typography variant="body2">
                <strong>Crno/crveni krugovi</strong> = vizual red-black stabla
                runqueue-a.
              </Typography>
            </Stack>

            <Stack direction="row" spacing={1.5} alignItems="center">
              {/* bočni P1 label u boji posla */}
              <Box
                sx={{
                  px: 1,
                  py: 0.2,
                  borderRadius: 1,
                  bgcolor: "#42a5f5",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 800,
                  lineHeight: 1,
                }}
              >
                P1
              </Box>
              <Typography variant="body2">
                <strong>Bočni label (P1, P2…)</strong> = identitet posla (ista
                boja kao u tablici). Na <em>hover</em> dobiješ VR, nice/weight,
                remaining i arrival.
              </Typography>
            </Stack>
          </Stack>

          {/* KAKO CFS BIRA */}
          <Typography variant="h6" sx={{ mb: 1 }}>
            Kako CFS bira
          </Typography>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            U svakom koraku (tick = 1s) CFS pokreće{" "}
            <strong>posao s najmanjim virtualnim vremenom (VR)</strong>. Dok
            radi 1s, njegov VR poraste za:
          </Typography>
          <Box
            sx={{
              display: "inline-block",
              px: 1,
              py: 0.5,
              borderRadius: 1,
              bgcolor: "#eee",
              fontFamily: "monospace",
              fontSize: 13,
              mb: 1.5,
            }}
          >
            Δvruntime = 1024 / weight(nice)
          </Box>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Manji <strong>nice</strong> ⇒ veći <strong>weight</strong> ⇒{" "}
            <em>sporiji</em> rast VR ⇒ posao češće dolazi na red.
          </Typography>

          {/* MINI TABLICA NICE → WEIGHT → ΔVR */}
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            Primjeri (po sekundi rada)
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "110px 110px 140px",
              rowGap: 0.5,
              columnGap: 1.5,
              alignItems: "center",
              mb: 2,
            }}
          >
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              nice
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              weight
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Δvruntime
            </Typography>

            <Typography variant="body2">−5</Typography>
            <Typography variant="body2">≈ 3121</Typography>
            <Typography variant="body2">≈ 0.328</Typography>

            <Typography variant="body2">0</Typography>
            <Typography variant="body2">1024</Typography>
            <Typography variant="body2">1.000</Typography>

            <Typography variant="body2">+5</Typography>
            <Typography variant="body2">≈ 335</Typography>
            <Typography variant="body2">≈ 3.055</Typography>
          </Box>

          {/* KAKO ČITATI GRAF */}
          <Typography variant="h6" sx={{ mb: 1 }}>
            Kako čitati graf
          </Typography>
          <Stack spacing={0.6}>
            <Typography variant="body2">
              • <strong>Listovi</strong> su stvarni poslovi; broj u krugu je
              njihov trenutačni VR (zaokružen).
            </Typography>
            <Typography variant="body2">
              • Listovi su poredani lijevo→desno po <strong>VR</strong>;
              najlijevlji ide “prvi”.
            </Typography>
            <Typography variant="body2">
              • Novi poslovi ulaze kad im <strong>arrival</strong> ≤ trenutno
              vrijeme; završeni nestaju.
            </Typography>
            <Typography variant="body2">
              • <strong>Timeline</strong> s točkicama prikazuje snimku po
              sekundi — klikni bilo koju točku ili koristi Play / ◀ / ▶ za
              pregled kadra po kadar.
            </Typography>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
