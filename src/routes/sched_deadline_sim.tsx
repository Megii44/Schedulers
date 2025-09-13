// src/pages/sched_deadline_sim.tsx
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Divider,
  Collapse,
  Tooltip,
} from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PauseCircleIcon from "@mui/icons-material/PauseCircle";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { useLocation, useNavigate } from "@tanstack/react-router";

/* ---------- ulazni tip (isti kao u tablici) ---------- */
type Job = {
  id: string;
  name: string;
  priority: number | ""; // OVDJE: D (relativni rok)
  duration: number | "";
  arrivalTime: number | "";
  editable: boolean;
};

const PALETTE = ["#f44336", "#ba68c8", "#4caf50", "#00bcd4", "#ffb300"];
const colorOf = (i: number) => PALETTE[i % PALETTE.length];

/* helper: hex -> rgba s alfom */
function withAlpha(hex: string, a: number) {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/* ---------- layout ---------- */
const SEC_PX = 36;

const ACTIVE_H = 34;
const READY_H = 26;

const AXIS_PX = 2;
const AXIS = `${AXIS_PX}px solid #222`;

const LEFT_W = 140;
const BOTTOM_H = 78;

/* ----- interni tipovi ----- */
interface NJob {
  id: string;
  name: string;
  dur: number; // C
  arr: number; // r
  dRel: number; // D (relativni rok)
  dAbs: number; // apsolutni rok = arr + dRel
  color: string;
}

type Column = {
  t: number;
  activeIds: (string | undefined)[];
  readyIds: string[];
};

type SimOut = {
  columns: Column[];
  minT: number;
  maxT: number; // exclusive
  maxReadyDepth: number;
  colors: Map<string, string>;
  names: Map<string, string>;
  dAbs: Map<string, number>;
};

/* ============== simulacija SCHED_DEADLINE (EDF, N CPU) ============== */
function simulateEDF(input: Job[], cpus: number): SimOut {
  const ncpu = Math.max(1, Math.floor(cpus || 1));

  const base: NJob[] = input
    .map((j, i) => {
      const arr = Number(j.arrivalTime);
      const dur = Number(j.duration);
      const dRel = Number(j.priority); // “priority” polje = rok D (relativni)
      return {
        id: j.id,
        name: j.name,
        dur,
        arr,
        dRel,
        dAbs: arr + dRel,
        color: colorOf(i),
      };
    })
    .filter(
      (j) =>
        Number.isFinite(j.dur) &&
        Number.isFinite(j.arr) &&
        Number.isFinite(j.dRel) &&
        j.dur > 0 &&
        j.dRel >= 0
    )
    .sort((a, b) => a.arr - b.arr);

  const names = new Map(base.map((b) => [b.id, b.name] as const));
  const colors = new Map(base.map((b) => [b.id, b.color] as const));
  const dAbs = new Map(base.map((b) => [b.id, b.dAbs] as const));

  if (!base.length)
    return {
      columns: [],
      minT: 0,
      maxT: 0,
      maxReadyDepth: 0,
      colors,
      names,
      dAbs,
    };

  const remaining = new Map<string, number>(base.map((b) => [b.id, b.dur]));
  const notArrived = [...base];

  // Red spremnih sortiran po NAJRANIJEM apsolutnom roku (manji = hitnije)
  let ready: NJob[] = [];

  const pushArrivalsUpTo = (t: number) => {
    while (notArrived.length && notArrived[0].arr <= t) {
      ready.push(notArrived.shift()!);
    }
    // sort po apsolutnom roku, pa po dolasku, pa po id-u (stabilno-ish)
    ready.sort((a, b) =>
      a.dAbs !== b.dAbs
        ? a.dAbs - b.dAbs
        : a.arr !== b.arr
        ? a.arr - b.arr
        : a.id.localeCompare(b.id)
    );
  };

  // CPU 0 je dno prikaza.
  let running: (NJob | undefined)[] = Array(ncpu).fill(undefined);
  const columns: Column[] = [];

  const snapshotReadyOrder = () => ready.map((j) => j.id);
  const haveWork = () =>
    running.some(Boolean) || ready.length > 0 || notArrived.length > 0;

  // Bez rupa u prikazu (aktivne trake)
  const compactRunning = () => {
    const live = running.filter((r): r is NJob => Boolean(r));
    running = [
      ...live,
      ...Array(Math.max(0, ncpu - live.length)).fill(undefined),
    ];
  };

  let t = Math.min(...base.map((b) => b.arr));
  pushArrivalsUpTo(t);

  // Glavna petlja: 1s koraci
  while (haveWork()) {
    // Ako nema ničega — skok do sljedećeg dolaska
    if (!running.some(Boolean) && ready.length === 0) {
      if (!notArrived.length) break;
      const nextT = notArrived[0].arr;
      for (let tt = t; tt < nextT; tt++)
        columns.push({
          t: tt,
          activeIds: Array(ncpu).fill(undefined),
          readyIds: [],
        });
      t = nextT;
      pushArrivalsUpTo(t);
    }

    // Odabir: EDF nad (running ∪ ready)
    {
      const candMap = new Map<string, NJob>();
      for (const r of running) if (r) candMap.set(r.id, r);
      for (const r of ready) candMap.set(r.id, r);
      const cands = [...candMap.values()].sort((a, b) =>
        a.dAbs !== b.dAbs
          ? a.dAbs - b.dAbs
          : a.arr !== b.arr
          ? a.arr - b.arr
          : a.id.localeCompare(b.id)
      );

      const pick = cands.slice(0, ncpu);
      // const pickIds = new Set(pick.map((p) => p.id));

      // nova slika “running”
      running = Array.from({ length: ncpu }, (_, i) => pick[i]);

      // ostali u “ready” (u poretku po roku)
      ready = cands.slice(ncpu);
    }

    compactRunning();

    // Snapshot stupca
    columns.push({
      t,
      activeIds: running.map((r) => r?.id),
      readyIds: snapshotReadyOrder(),
    });

    // Izvrši 1s na svima koji rade
    for (let c = 0; c < ncpu; c++) {
      const cur = running[c];
      if (!cur) continue;
      const rem = (remaining.get(cur.id) ?? 0) - 1;
      remaining.set(cur.id, rem);
      if (rem <= 0) {
        running[c] = undefined; // dovršeno
      }
    }

    // sljedeća sekunda + novi dolasci
    t += 1;
    pushArrivalsUpTo(t);
  }

  const maxReadyDepth = Math.max(0, ...columns.map((c) => c.readyIds.length));
  const minT = columns.length ? columns[0].t : 0;
  const maxT = columns.length ? columns[columns.length - 1].t + 1 : minT;

  return { columns, minT, maxT, maxReadyDepth, colors, names, dAbs };
}

/* ================== komponenta ================== */
export default function SchedDeadlineSim() {
  const navigate = useNavigate();
  const location = useLocation() as unknown as { state?: { jobs?: Job[] } };

  const jobs = useMemo<Job[]>(
    () => location.state?.jobs ?? [],
    [location.state]
  );

  // postavka: broj CPU-a
  const [numCpus, setNumCpus] = useState<number>(1);

  const { columns, minT, maxT, maxReadyDepth, colors, names, dAbs } = useMemo(
    () => simulateEDF(jobs, numCpus),
    [jobs, numCpus]
  );

  const totalSecs = Math.max(0, maxT - minT);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(true);
  const [openInfo, setOpenInfo] = useState(false);
  const [statsOpen, setStatsOpen] = useState(true);

  const curSec = Math.min(progress, totalSecs) + minT;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!running || totalSecs === 0) return;
    const id = setInterval(
      () => setProgress((p) => Math.min(totalSecs, p + 1)),
      600
    );
    return () => clearInterval(id);
  }, [running, totalSecs]);

  useEffect(() => setProgress(0), [totalSecs]);

  const resetPlayback = () => {
    setRunning(true);
    setProgress(0);
    scrollRef.current?.scrollTo({ left: 0, behavior: "smooth" });
  };

  const handleReset = () => {
    setRunning(false);
    setProgress(0);
    scrollRef.current?.scrollTo({ left: 0, behavior: "smooth" });
  };

  const handleSkipToEnd = () => {
    setRunning(false);
    setProgress(totalSecs);
  };

  /* ---------- spremi pripravne po razinama (zbijeno) ---------- */
  const readyMatrix = useMemo(() => {
    const upto = Math.min(progress, totalSecs);
    const levels = Array.from({ length: maxReadyDepth }, () =>
      Array<string | undefined>(totalSecs).fill(undefined)
    );

    for (let i = 0; i < upto; i++) {
      const ids = columns[i].readyIds.filter(Boolean);
      for (let lvl = 0; lvl < Math.min(ids.length, maxReadyDepth); lvl++) {
        levels[lvl][i] = ids[lvl];
      }
      for (let lvl = ids.length; lvl < maxReadyDepth; lvl++)
        levels[lvl][i] = undefined;
    }
    return levels;
  }, [columns, maxReadyDepth, progress, totalSecs]);

  /* ---------- aktivna traka – grupiraj segmente za svaki CPU ---------- */
  const activeBlocksPerCpu = useMemo(() => {
    const upto = Math.min(progress, totalSecs);
    const perCpu: { start: number; len: number; id: string }[][] = Array.from(
      { length: numCpus },
      () => []
    );

    for (let cpu = 0; cpu < numCpus; cpu++) {
      let i = 0;
      while (i < upto) {
        const id = columns[i].activeIds[cpu];
        if (!id) {
          i++;
          continue;
        }
        let j = i + 1;
        while (j < upto && columns[j].activeIds[cpu] === id) j++;
        perCpu[cpu].push({ start: i, len: j - i, id });
        i = j;
      }
    }
    return perCpu;
  }, [columns, progress, totalSecs, numCpus]);

  /* ---------- STATISTIKA ---------- */
  type JobStats = {
    id: string;
    name: string;
    color: string;
    arrival: number;
    start: number;
    finish: number;
    response: number; // start - arrival
    turnaround: number; // finish - arrival
    waiting: number; // turnaround - duration
    duration: number; // C
    deadlineAbs: number; // r + D
    lateness: number; // max(0, finish - deadlineAbs)
    met: boolean; // finish <= deadlineAbs
  };

  const { perJob, totals, det } = useMemo(() => {
    const perJob: JobStats[] = [];
    if (!columns.length) {
      return {
        perJob,
        totals: {
          makespan: 0,
          busySlots: 0,
          utilization: 0,
          alpha: 0,
          contextSwitches: 0,
          deadlineMisses: 0,
        },
        det: {
          nrAvg: 0,
          npAvg: 0,
          nAvg: 0,
          tbarJobs: 0,
        },
      };
    }

    const arrMap = new Map<string, number>();
    const durMap = new Map<string, number>();
    for (const j of jobs) {
      if (!names.has(j.id)) continue;
      arrMap.set(j.id, Math.max(0, Number(j.arrivalTime) || 0));
      durMap.set(j.id, Math.max(0, Number(j.duration) || 0));
    }

    const firstStart = new Map<string, number>();
    const lastSeen = new Map<string, number>();
    const ranTicks = new Map<string, number>();

    let busySlots = 0;
    let queueSlots = 0;
    let contextSwitches = 0;

    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      if (i > 0) {
        const prev = columns[i - 1].activeIds;
        for (let c = 0; c < Math.max(prev.length, col.activeIds.length); c++) {
          if ((prev[c] ?? undefined) !== (col.activeIds[c] ?? undefined)) {
            contextSwitches++;
          }
        }
      }
      const activeNow = col.activeIds.filter(Boolean) as string[];
      busySlots += activeNow.length;
      queueSlots += col.readyIds.length;

      for (const id of activeNow) {
        if (!firstStart.has(id)) firstStart.set(id, col.t);
        lastSeen.set(id, col.t);
        ranTicks.set(id, (ranTicks.get(id) ?? 0) + 1);
      }
    }

    const makespan = Math.max(
      0,
      (columns.at(-1)?.t ?? 0) + 1 - (columns[0]?.t ?? 0)
    );
    const utilization = makespan > 0 ? busySlots / (makespan * numCpus) : 0;
    const alpha = makespan > 0 ? names.size / makespan : 0;

    const ids = Array.from(names.keys()).sort(
      (a, b) => (arrMap.get(a) ?? 0) - (arrMap.get(b) ?? 0)
    );

    let sumTurnaround = 0;
    let deadlineMisses = 0;

    for (const id of ids) {
      const name = names.get(id) ?? id;
      const color = colors.get(id) ?? "#90caf9";
      const arrival = arrMap.get(id) ?? 0;
      const duration = durMap.get(id) ?? ranTicks.get(id) ?? 0;

      const start = firstStart.get(id) ?? arrival;
      const finish = (lastSeen.get(id) ?? start) + 1;
      const deadlineAbs = dAbs.get(id) ?? arrival; // r + D

      const response = Math.max(0, start - arrival);
      const turnaround = Math.max(0, finish - arrival);
      const waiting = Math.max(0, turnaround - duration);
      const lateness = Math.max(0, finish - deadlineAbs);
      const met = finish <= deadlineAbs;
      if (!met) deadlineMisses++;

      sumTurnaround += turnaround;

      perJob.push({
        id,
        name,
        color,
        arrival,
        start,
        finish,
        response,
        turnaround,
        waiting,
        duration,
        deadlineAbs,
        lateness,
        met,
      });
    }

    const nrAvg = makespan > 0 ? queueSlots / makespan : 0;
    const npAvg = makespan > 0 ? busySlots / makespan : 0;
    const nAvg = nrAvg + npAvg;
    const tbarJobs = ids.length > 0 ? sumTurnaround / ids.length : 0;

    return {
      perJob,
      totals: {
        makespan,
        busySlots,
        utilization,
        alpha,
        contextSwitches,
        deadlineMisses,
      },
      det: { nrAvg, npAvg, nAvg, tbarJobs },
    };
  }, [columns, names, colors, jobs, numCpus, dAbs]);

  /* ---------- crtanje ---------- */
  const width = LEFT_W + totalSecs * SEC_PX;
  const activeAreaH = ACTIVE_H * Math.max(1, numCpus);
  const height = maxReadyDepth * READY_H + activeAreaH + BOTTOM_H + 50;

  return (
    <Box sx={{ p: 4 }}>
      {/* HEADER */}
      <Box mb={2}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={2}
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="h5" fontWeight="bold">
              SCHED_DEADLINE (EDF)
            </Typography>
            <IconButton
              size="small"
              color="primary"
              onClick={() => setOpenInfo(true)}
            >
              <InfoOutlinedIcon fontSize="small" />
            </IconButton>
            {totalSecs > 0 && (
              <Chip
                size="small"
                color="primary"
                label={`t = ${curSec}${progress >= totalSecs ? " (kraj)" : ""}`}
                sx={{ ml: 1 }}
              />
            )}
          </Stack>

          <Stack direction="row" spacing={1.5} alignItems="center">
            {/* Dropdown: broj aktivnih dretvi (1–8) */}
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel id="akt-dretve-label">Aktivne dretve</InputLabel>
              <Select
                labelId="akt-dretve-label"
                id="akt-dretve"
                label="Aktivne dretve"
                value={numCpus}
                onChange={(e) => {
                  setNumCpus(Number(e.target.value));
                  resetPlayback();
                }}
              >
                {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
                  <MenuItem key={n} value={n}>
                    {n}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Button
              variant="contained"
              startIcon={<ArrowBackIcon />}
              onClick={() => navigate({ to: "/sched_deadline" })}
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
              startIcon={<SkipNextIcon />}
              onClick={handleSkipToEnd}
              disabled={progress >= totalSecs}
            >
              Skoči na kraj
            </Button>
            <Button
              variant="contained"
              onClick={() => setRunning((r) => !r)}
              startIcon={running ? <PauseCircleIcon /> : <PlayCircleIcon />}
              disabled={progress >= totalSecs}
            >
              {running ? "Zaustavi" : "Pokreni"}
            </Button>
          </Stack>
        </Stack>
      </Box>

      {/* BADGEVI – boje + detalji (Prioritet polje = rok D relativno) */}
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 3 }}>
        {jobs.map((j, i) => {
          const dRel = Number(j.priority) || 0;
          const arr = Number(j.arrivalTime) || 0;
          const dAbsVal = arr + dRel;
          return (
            <Box
              key={j.id}
              sx={{
                borderRadius: 2,
                boxShadow: 1,
                minWidth: 220,
                px: 2,
                py: 1.2,
                background: "#fff",
                border: "1px solid #e0e0e0",
                position: "relative",
              }}
              title={`C=${
                j.duration || 0
              }s, r=${arr}s, D(rel)=${dRel}s, rok(aps)=${dAbsVal}s`}
            >
              <Box
                sx={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 8,
                  background: colorOf(i),
                  borderTopLeftRadius: 8,
                  borderBottomLeftRadius: 8,
                }}
              />
              <Typography fontWeight={700} sx={{ ml: 1.5 }}>
                {j.name}
              </Typography>
              <Stack direction="row" spacing={3} sx={{ ml: 1.5, mt: 0.3 }}>
                <Typography variant="body2" color="text.secondary">
                  C: <b>{j.duration || 0}s</b>
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  r: <b>{arr}s</b>
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  D(rel): <b>{dRel}s</b>
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Rok(aps): <b>{dAbsVal}s</b>
                </Typography>
              </Stack>
            </Box>
          );
        })}
      </Box>

      {/* GRAF */}
      <Box
        sx={{
          background: "white",
          borderRadius: 2,
          p: `60px 20px 0px 20px`,
          boxShadow: 1,
          position: "relative",
        }}
      >
        {totalSecs === 0 ? (
          <Typography color="text.secondary">
            Nema podataka za prikaz.
          </Typography>
        ) : (
          <Box ref={scrollRef} sx={{ overflowX: "auto", overflowY: "hidden" }}>
            <Box sx={{ position: "relative", width, height }}>
              {/* GRID vertikale */}
              <Box
                sx={{
                  position: "absolute",
                  left: LEFT_W,
                  right: 0,
                  bottom: BOTTOM_H,
                  top: 0,
                  background: `repeating-linear-gradient(90deg, rgba(0,0,0,0.08) 0, rgba(0,0,0,0.08) 1px, transparent 1px, transparent ${SEC_PX}px)`,
                  pointerEvents: "none",
                  zIndex: 0,
                }}
              />

              {/* PRIPRAVNE razine */}
              <Box
                sx={{
                  position: "absolute",
                  left: LEFT_W,
                  right: 0,
                  bottom: BOTTOM_H + activeAreaH,
                  top: 0,
                  zIndex: 1,
                }}
              >
                {readyMatrix.map((row, lvl) => {
                  const blocks: { start: number; len: number; id: string }[] =
                    [];
                  const upto = Math.min(progress, totalSecs);
                  let i = 0;
                  while (i < upto) {
                    const id = row[i];
                    if (!id) {
                      i++;
                      continue;
                    }
                    let j = i + 1;
                    while (j < upto && row[j] === id) j++;
                    blocks.push({ start: i, len: j - i, id });
                    i = j;
                  }

                  return blocks.map((b, idx) => {
                    const baseColor = colors.get(b.id) ?? "#90caf9";
                    const fill = withAlpha(baseColor, 0.5);
                    const name = names.get(b.id) ?? b.id;
                    const left = b.start * SEC_PX;
                    const width = b.len * SEC_PX;

                    const end = b.start + b.len;
                    const hasNeighborRight =
                      end < Math.min(progress, totalSecs) && !!row[end];

                    const z = 2000 - lvl;

                    const BORDER = "2px solid #9e9e9e";
                    const BORDER_BG = "#9e9e9e";

                    return (
                      <Box
                        key={`${lvl}-${idx}-${b.id}`}
                        title={`pripravna • ${name}`}
                        sx={{
                          position: "absolute",
                          left,
                          bottom: lvl * READY_H,
                          width,
                          height: READY_H,
                          background: fill,
                          boxSizing: "border-box",
                          zIndex: z,
                          borderLeft: BORDER,
                          "&::before": {
                            content: '""',
                            position: "absolute",
                            top: "-2px",
                            left: "-2px",
                            right: hasNeighborRight ? "0" : "-2px",
                            height: "2px",
                            background: BORDER_BG,
                            zIndex: z + 2,
                            pointerEvents: "none",
                          },
                          ...(hasNeighborRight
                            ? {}
                            : {
                                "&::after": {
                                  content: '""',
                                  position: "absolute",
                                  top: "-2px",
                                  bottom: 0,
                                  right: "-2px",
                                  width: "2px",
                                  background: BORDER_BG,
                                  zIndex: z + 2,
                                  pointerEvents: "none",
                                },
                              }),
                        }}
                      />
                    );
                  });
                })}
              </Box>

              {/* AKTIVNE – više traka */}
              <Box
                sx={{
                  position: "absolute",
                  left: LEFT_W,
                  bottom: BOTTOM_H,
                  width: totalSecs * SEC_PX,
                  height: activeAreaH,
                  zIndex: 3000,
                }}
              >
                {activeBlocksPerCpu.map((blocks, cpu) => (
                  <Box
                    key={`cpu-${cpu}`}
                    sx={{
                      position: "absolute",
                      left: 0,
                      bottom: cpu * ACTIVE_H,
                      height: ACTIVE_H,
                      width: "100%",
                    }}
                  >
                    {blocks.map((b) => {
                      const color = colors.get(b.id) ?? "#90caf9";
                      const name = names.get(b.id) ?? b.id;

                      const left = b.start * SEC_PX;
                      const width = b.len * SEC_PX;

                      const end = b.start + b.len;
                      const hasNeighborRight =
                        end < Math.min(progress, totalSecs) &&
                        !!columns[end].activeIds[cpu];

                      return (
                        <Box
                          key={`a-${cpu}-${b.start}-${b.id}`}
                          title={`aktivna (CPU ${cpu + 1}) • ${name}`}
                          sx={{
                            position: "absolute",
                            left,
                            bottom: 0,
                            width,
                            height: "100%",
                            background: color,
                            boxSizing: "border-box",
                            borderLeft: "2px solid #000",
                            "&::before": {
                              content: '""',
                              position: "absolute",
                              top: "-2px",
                              left: "-2px",
                              right: hasNeighborRight ? "0" : "-2px",
                              height: "2px",
                              background: "#000",
                              zIndex: 3002,
                              pointerEvents: "none",
                            },
                            ...(hasNeighborRight
                              ? {}
                              : {
                                  "&::after": {
                                    content: '""',
                                    position: "absolute",
                                    top: "-2px",
                                    bottom: 0,
                                    right: "-2px",
                                    width: "2px",
                                    background: "#000",
                                    zIndex: 3002,
                                    pointerEvents: "none",
                                  },
                                }),
                          }}
                        />
                      );
                    })}
                  </Box>
                ))}
              </Box>

              {/* OSI + natpisi */}
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  zIndex: 4000,
                }}
              >
                <Box
                  sx={{
                    position: "absolute",
                    left: LEFT_W,
                    right: 0,
                    bottom: BOTTOM_H + activeAreaH,
                    height: 0,
                    borderTop: AXIS,
                  }}
                />
                {Array.from({ length: numCpus }, (_, i) => (
                  <Box
                    key={`axis-active-${i}`}
                    sx={{
                      position: "absolute",
                      left: LEFT_W,
                      right: 0,
                      bottom: BOTTOM_H + i * ACTIVE_H,
                      height: 0,
                      borderTop: AXIS,
                    }}
                  />
                ))}
                <Box
                  sx={{
                    position: "absolute",
                    left: LEFT_W,
                    right: 0,
                    bottom: BOTTOM_H,
                    height: 0,
                    borderTop: AXIS,
                  }}
                />
                {Array.from({ length: totalSecs + 1 }).map((_, i) => (
                  <Box
                    key={i}
                    sx={{
                      position: "absolute",
                      left: LEFT_W + i * SEC_PX,
                      bottom: BOTTOM_H - 12,
                      width: 0,
                      height: 12,
                      borderLeft: AXIS,
                    }}
                  >
                    <Typography
                      sx={{
                        position: "absolute",
                        left: -8,
                        bottom: -20,
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {minT + i}
                    </Typography>
                  </Box>
                ))}

                <Typography
                  sx={{
                    position: "absolute",
                    left: 12,
                    bottom: BOTTOM_H + activeAreaH + 8,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  pripravne dretve
                </Typography>
                <Typography
                  sx={{
                    position: "absolute",
                    left: 12,
                    bottom: BOTTOM_H - 20,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  aktivne dretve ({numCpus})
                </Typography>
              </Box>

              {/* Trenutna sekunda */}
              {progress > 0 && (
                <Box
                  sx={{
                    position: "absolute",
                    left: LEFT_W + progress * SEC_PX,
                    bottom: BOTTOM_H,
                    top: 0,
                    width: 0,
                    borderLeft: "2px dashed #1976d2",
                    pointerEvents: "none",
                    zIndex: 4500,
                  }}
                />
              )}
            </Box>
          </Box>
        )}
      </Box>

      {/* --- STATISTIKA ISPOD --- */}
      {columns.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
            >
              <Typography variant="h6" fontWeight={700}>
                Statistika
              </Typography>
              <Button
                size="small"
                startIcon={statsOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                onClick={() => setStatsOpen((o) => !o)}
              >
                {statsOpen ? "Sakrij statistiku" : "Prikaži statistiku"}
              </Button>
            </Stack>

            <Collapse in={statsOpen} timeout="auto" unmountOnExit>
              <Stack
                direction="row"
                spacing={4}
                sx={{ mb: 1, flexWrap: "wrap" }}
              >
                <StatItem
                  label="Trajanje rasporeda"
                  value={`${totals.makespan}s`}
                  hint="Ukupno trajanje od početka do završetka rasporeda."
                />
                <StatItem
                  label="Iskorištenost CPU-a"
                  value={`${(totals.utilization * 100).toFixed(1)}%`}
                  hint="(∑ broj aktivnih poslova po sekundi) / (N_cpu × trajanje)."
                />
                <StatItem
                  label="Stopa dovršenih poslova (α)"
                  value={`${totals.alpha.toFixed(3)} posla/s`}
                  hint="Broj dovršenih poslova podijeljen s trajanjem promatranog intervala."
                />
                <StatItem
                  label="Kontekstni preklopi"
                  value={`${totals.contextSwitches}`}
                  hint="Promjene posla na CPU-u između dvije uzastopne sekunde."
                />
                <StatItem
                  label="Prekoračeni rokovi"
                  value={`${totals.deadlineMisses}`}
                  hint="Broj poslova koji su završili nakon svog apsolutnog roka (finish > deadline)."
                />
              </Stack>

              <Divider sx={{ my: 1.5 }} />

              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Prosjeci po intervalu (Littleovo pravilo)
              </Typography>
              <Stack
                direction="row"
                spacing={4}
                sx={{ mb: 1, flexWrap: "wrap" }}
              >
                <StatItem
                  label="Prosječan broj u redu (n_r)"
                  value={det.nrAvg.toFixed(2)}
                  hint="Srednja veličina reda spremnih: (∑ veličine reda po sekundi) / trajanje."
                />
                <StatItem
                  label="Prosječan broj u poslužitelju (n_p)"
                  value={det.npAvg.toFixed(2)}
                  hint="Srednji broj aktivnih poslova po sekundi (0 do N_cpu)."
                />
                <StatItem
                  label="Prosječan broj u sustavu (n)"
                  value={det.nAvg.toFixed(2)}
                  hint="Vremenski prosjek broja poslova u sustavu: n = n_r + n_p = (∑ N[t]) / T."
                />
                <StatItem
                  label="Srednje vrijeme u sustavu (T)"
                  value={`${det.tbarJobs.toFixed(2)}s`}
                  hint="Prosjek (završetak − dolazak) po poslu. Vrijedi i T = n / α (Little)."
                />
              </Stack>

              <Divider sx={{ my: 1.5 }} />

              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Posao</TableCell>
                    <TableCell align="right">Dolazak (r)</TableCell>
                    <TableCell align="right">Početak</TableCell>
                    <TableCell align="right">Završetak</TableCell>
                    <TableCell align="right">Trajanje (C)</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Apsolutni rok: r + D(rel)." arrow>
                        <span>Rok (aps.)</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip
                        title="Vrijeme do prvog odziva: prvi početak − dolazak."
                        arrow
                      >
                        <span>Vrijeme do prvog odziva</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip
                        title="Vrijeme u sustavu: završetak − dolazak."
                        arrow
                      >
                        <span>Vrijeme u sustavu</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="right">Čekanje</TableCell>
                    <TableCell align="right">
                      <Tooltip
                        title="Pozitivna vrijednost znači kašnjenje iza roka."
                        arrow
                      >
                        <span>Kašnjenje</span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {perJob.map((s) => (
                    <TableRow key={s.id} hover>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Box
                            sx={{
                              width: 12,
                              height: 12,
                              borderRadius: "50%",
                              background: s.color,
                              boxShadow: 1,
                            }}
                          />
                          <Typography>
                            {s.name}
                            {!s.met && (
                              <Typography
                                component="span"
                                sx={{
                                  ml: 1,
                                  fontSize: 11,
                                  px: 0.8,
                                  py: 0.1,
                                  borderRadius: 1,
                                  background: withAlpha("#f44336", 0.15),
                                  color: "#c62828",
                                  fontWeight: 700,
                                }}
                                title="Rok promašen"
                              >
                                LATE
                              </Typography>
                            )}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell align="right">{s.arrival}</TableCell>
                      <TableCell align="right">{s.start}</TableCell>
                      <TableCell align="right">{s.finish}</TableCell>
                      <TableCell align="right">{s.duration}</TableCell>
                      <TableCell align="right">{s.deadlineAbs}</TableCell>
                      <TableCell align="right">{s.response}</TableCell>
                      <TableCell align="right">{s.turnaround}</TableCell>
                      <TableCell align="right">{s.waiting}</TableCell>
                      <TableCell align="right">{s.lateness}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Collapse>
          </Paper>
        </Box>
      )}

      {/* Info dialog */}
      <Dialog
        open={openInfo}
        onClose={() => setOpenInfo(false)}
        maxWidth="md"
        style={{ zIndex: 5000 }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          SCHED_DEADLINE — simulacija (EDF)
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Typography gutterBottom>
            Donji dio prikazuje <b>aktivne dretve</b> (po CPU-u), a iznad su{" "}
            <b>pripravne dretve</b>. Algoritam je <b>Earliest-Deadline-First</b>{" "}
            s preotimanjem. U svakom trenutku se biraju poslovi s najranijim{" "}
            <b>apsolutnim rokom</b> (r + D).
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            U unosu polje <i>Prioritet</i> tretiramo kao{" "}
            <b>D (relativni rok)</b> u sekundama od dolaska. Apsolutni rok je{" "}
            <code>r + D</code>.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Svaka kolona je 1 s. Broj aktivnih dretvi možeš mijenjati gore desno
            — simulacija tad kreće ispočetka.
          </Typography>
        </DialogContent>
      </Dialog>
    </Box>
  );
}

/* --- helper za brojke u statistici (s hover opisom) --- */
function StatItem({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Tooltip title={hint} arrow>
      <Stack spacing={0.2} sx={{ cursor: "help" }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="subtitle1" fontWeight={700}>
          {value}
        </Typography>
      </Stack>
    </Tooltip>
  );
}
