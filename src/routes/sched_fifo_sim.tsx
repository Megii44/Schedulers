// src/pages/SchedFifoSim.tsx
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
  Divider,
  Paper,
} from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PauseCircleIcon from "@mui/icons-material/PauseCircle";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { useLocation, useNavigate } from "@tanstack/react-router";

/* ---------- Tip posla ---------- */
type Job = {
  id: string;
  name: string;
  priority: number | "";
  duration: number | "";
  arrivalTime: number | "";
  editable: boolean;
};

const PALETTE = ["#f44336", "#ba68c8", "#4caf50", "#00bcd4", "#ffb300"];
const getColor = (i: number) => PALETTE[i % PALETTE.length];

/* ---------- dimenzije ---------- */
const SEC_PX = 36;
const LANE_H = 34;

const AXIS_PX = 2;
const AXIS = `${AXIS_PX}px solid #222`;

const YW = 76;
const XH = 78;

const Z_GRID = 0;
const Z_BLOCKS = 1;
const Z_AXES = 2;

/* ======================================================================
   FIFO s K CPU jezgri (tick = 1s) — vraća “Gantt” timeline i metrike.
   VAŽNO: u SVAKOJ sekundi aktivni poslovi se kompaktiraju “od dna naviše”.
====================================================================== */
type NormJob = {
  id: string;
  name: string;
  prio: number;
  dur: number;
  arr: number;
  color: string;
};
type TimelineCol = { t: number; lanes: (string | null)[] };
type PerSecond = {
  t: number;
  running: number;
  system: number;
  waiting: number;
};
type SimResult = {
  timeline: TimelineCol[];
  minT: number;
  maxT: number; // exclusive
  lanesCount: number;
  perSecond: PerSecond[];
  completions: Map<string, number>;
  jobs: NormJob[];
};

function simulateSchedFifoTimeline(
  input: Job[],
  maxParallel: number | "inf"
): SimResult {
  const jobs: NormJob[] = input
    .map((j, i) => ({
      id: j.id,
      name: j.name,
      prio: Number(j.priority),
      dur: Number(j.duration),
      arr: Number(j.arrivalTime),
      color: getColor(i),
    }))
    .filter(
      (j) =>
        Number.isFinite(j.prio) &&
        Number.isFinite(j.dur) &&
        Number.isFinite(j.arr) &&
        j.dur > 0
    )
    .sort((a, b) => a.arr - b.arr);

  if (!jobs.length) {
    return {
      timeline: [],
      minT: 0,
      maxT: 0,
      lanesCount: 0,
      perSecond: [],
      completions: new Map(),
      jobs: [],
    };
  }

  const Kfinite =
    maxParallel === "inf" ? Infinity : Math.max(1, Number(maxParallel));
  const minT = Math.min(...jobs.map((j) => j.arr));

  // stanje
  const remaining = new Map<string, number>(jobs.map((j) => [j.id, j.dur]));
  const completions = new Map<string, number>();
  const readyByPri = new Map<number, NormJob[]>(); // FIFO red za svaki prioritet
  const notArrived = [...jobs];

  const enqueue = (j: NormJob) => {
    if (!readyByPri.has(j.prio)) readyByPri.set(j.prio, []);
    readyByPri.get(j.prio)!.push(j);
  };

  // init dolasci na minT
  let t = minT;
  while (notArrived.length && notArrived[0].arr <= t)
    enqueue(notArrived.shift()!);

  const timeline: TimelineCol[] = [];
  const perSecond: PerSecond[] = [];

  const haveWork = () =>
    notArrived.length ||
    Array.from(readyByPri.values()).some((q) => q.length) ||
    [...remaining.values()].some((x) => x > 0);

  const popReady = (k: number): NormJob[] => {
    // izaberi do k poslova: prvo viši prioritet (manji broj), unutar prioriteta FIFO
    const sel: NormJob[] = [];
    const prios = [...readyByPri.keys()].sort((a, b) => a - b);
    for (const p of prios) {
      const q = readyByPri.get(p)!;
      while (q.length && sel.length < k) sel.push(q.shift()!);
      readyByPri.set(p, q);
      if (sel.length >= k) break;
    }
    return sel;
  };

  while (haveWork()) {
    // ako trenutno nema ničega spremnog, skoči do sljedećeg dolaska
    if (!Array.from(readyByPri.values()).some((q) => q.length)) {
      if (!notArrived.length) break;
      t = notArrived[0].arr;
      while (notArrived.length && notArrived[0].arr <= t)
        enqueue(notArrived.shift()!);
    }

    // koliko možemo paralelno izvršavati
    const capacity = Number.isFinite(Kfinite) ? Number(Kfinite) : Infinity;

    // odaberi poslove za ovu sekundu (preemptivno ako stigne viši prioritet — jer svaki tik biramo ispočetka)
    const running = popReady(capacity);

    // metrika (prije izvršavanja)
    const systemCount = jobs.filter(
      (j) => j.arr <= t && (remaining.get(j.id) ?? 0) > 0
    ).length;
    const runningCount = running.length;
    const waitingCount = Math.max(0, systemCount - runningCount);
    perSecond.push({
      t,
      running: runningCount,
      system: systemCount,
      waiting: waitingCount,
    });

    // raspored u “koloni”: kompaktiraj od dna naviše
    const lanesCount = Number.isFinite(Kfinite)
      ? Number(Kfinite)
      : Math.max(1, running.length);
    const lanes: (string | null)[] = Array(lanesCount).fill(null);

    // stabilan poredak u koloni: po prioritetu, pa dolasku, pa id-u
    const order = [...running].sort(
      (a, b) => a.prio - b.prio || a.arr - b.arr || a.id.localeCompare(b.id)
    );
    order.forEach((r, idx) => {
      if (idx < lanes.length) lanes[idx] = r.color; // lane 0 = DNO
    });

    timeline.push({ t, lanes });

    // izvrši 1 sekundu
    for (const r of running) {
      const rem = (remaining.get(r.id) ?? 0) - 1;
      remaining.set(r.id, rem);
      if (rem <= 0) completions.set(r.id, t + 1);
      else {
        // ako nije završio, vraća se na KRAJ svog prioritetnog reda (FIFO)
        const q = readyByPri.get(r.prio) ?? [];
        q.push(r);
        readyByPri.set(r.prio, q);
      }
    }

    // dolasci u t+1
    const nextT = t + 1;
    while (notArrived.length && notArrived[0].arr <= nextT)
      enqueue(notArrived.shift()!);

    t = nextT;
  }

  const maxT = timeline.length ? timeline[timeline.length - 1].t + 1 : minT;

  // poravnaj duljine lane nizova (ako je ∞ i neki stupci imaju manje od maksimuma)
  const maxLanes = timeline.reduce((m, c) => Math.max(m, c.lanes.length), 0);
  for (const c of timeline) {
    while (c.lanes.length < maxLanes) c.lanes.push(null);
  }

  return {
    timeline,
    minT,
    maxT,
    lanesCount: maxLanes,
    perSecond,
    completions,
    jobs,
  };
}

/* --------- helper: rubovi blokova --------- */
function borderFlags(
  prevColor: string | null,
  currColor: string | null,
  nextColor: string | null
) {
  const needsLeft = prevColor !== currColor;
  const needsRight = currColor !== nextColor;
  return { needsLeft, needsRight };
}

/* ====================================================================== */

export default function SchedFifoSim() {
  const navigate = useNavigate();
  const location = useLocation() as unknown as { state?: { jobs?: Job[] } };

  const [running, setRunning] = useState(true);
  const [openInfo, setOpenInfo] = useState(false);
  const [progress, setProgress] = useState(0);
  const [parallelSel, setParallelSel] = useState<number | "inf">(1); // default 1 jezgra
  const [showStats, setShowStats] = useState(true); // toggle za statistiku
  const scrollRef = useRef<HTMLDivElement>(null);

  const jobs = useMemo<Job[]>(
    () => location.state?.jobs ?? [],
    [location.state]
  );

  const {
    timeline,
    minT,
    maxT,
    lanesCount,
    perSecond,
    completions,
    jobs: normJobs,
  } = useMemo(
    () => simulateSchedFifoTimeline(jobs, parallelSel),
    [jobs, parallelSel]
  );

  const totalSecs = Math.max(0, maxT - minT);
  const currentSecond = Math.min(progress, totalSecs) + minT;
  const finished = totalSecs === 0 ? false : progress >= totalSecs;

  // statistika — računamo iz punog rezultata, ali prikazujemo tek po završetku
  const stats = useMemo(() => {
    if (!perSecond.length || !normJobs.length) return null;
    const horizon = maxT - minT;
    const sumRunning = perSecond.reduce((s, x) => s + x.running, 0);
    const sumWaiting = perSecond.reduce((s, x) => s + x.waiting, 0);
    const sumSystem = perSecond.reduce((s, x) => s + x.system, 0);

    const n_p = sumRunning / horizon;
    const n_r = sumWaiting / horizon;
    const n_all = sumSystem / horizon;

    const N = normJobs.length;
    const arrivalRate = N / horizon;

    let sumResp = 0;
    let sumWait = 0;
    let sumService = 0;
    for (const j of normJobs) {
      const C = j.dur;
      const F = completions.get(j.id) ?? maxT;
      const R = F - j.arr;
      const W = R - C;
      sumResp += R;
      sumWait += W;
      sumService += C;
    }
    const avgResponse = sumResp / N;
    const avgWaiting = sumWait / N;
    const littleT = n_all / arrivalRate;
    const utilization = Math.min(1, n_p / (lanesCount || 1));

    return {
      horizon,
      n_p,
      n_r,
      n_all,
      arrivalRate,
      avgResponse,
      avgWaiting,
      avgService: sumService / N,
      littleT,
      utilization,
      N,
    };
  }, [perSecond, normJobs, completions, minT, maxT, lanesCount]);

  /* animacija */
  useEffect(() => {
    if (!running || totalSecs === 0) return;
    const id = setInterval(
      () => setProgress((p) => Math.min(totalSecs, p + 1)),
      600
    );
    return () => clearInterval(id);
  }, [running, totalSecs]);

  // promjena duljine simulacije resetira prikaz
  useEffect(() => setProgress(0), [totalSecs, lanesCount]);

  // zaustavi kad završi
  useEffect(() => {
    if (finished) setRunning(false);
  }, [finished]);

  const handleReset = () => {
    setRunning(false);
    setProgress(0);
    scrollRef.current?.scrollTo({ left: 0, behavior: "smooth" });
  };

  // omogućimo mijenjanje K u bilo kojem trenutku (pauziramo i resetiramo prikaz)
  const handleChangeK = (v: number | "inf") => {
    setParallelSel(v);
    setRunning(false);
    setProgress(0);
  };

  return (
    <Box sx={{ p: 4 }}>
      {/* HEADER */}
      <Box mb={2}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="h5" fontWeight="bold">
              SCHED_FIFO
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
                color={finished ? "success" : "primary"}
                label={
                  finished
                    ? "Završeno"
                    : `Trenutna sekunda: ${currentSecond} / ${maxT - 1}`
                }
                sx={{ ml: 1 }}
              />
            )}
          </Stack>

          <Stack direction="row" spacing={2} alignItems="center">
            <FormControl size="small" sx={{ minWidth: 240 }}>
              <InputLabel id="par-k-label">
                Istovremeno poslova (CPU jezgre)
              </InputLabel>
              <Select
                labelId="par-k-label"
                value={parallelSel}
                label="Istovremeno poslova (CPU jezgre)"
                onChange={(e) =>
                  handleChangeK(e.target.value as number | "inf")
                }
              >
                <MenuItem value={1}>1 (klasično)</MenuItem>
                <MenuItem value={2}>2</MenuItem>
                <MenuItem value={3}>3</MenuItem>
                <MenuItem value={4}>4</MenuItem>
                <MenuItem value={8}>8</MenuItem>
                <MenuItem value={16}>16</MenuItem>
                <MenuItem value={"inf"}>∞ (neograničeno)</MenuItem>
              </Select>
            </FormControl>

            <Button
              variant="contained"
              startIcon={<ArrowBackIcon />}
              onClick={() => navigate({ to: "/sched_fifo" })}
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
              disabled={finished}
            >
              {running ? "Pauziraj" : "Pokreni"}
            </Button>
          </Stack>
        </Stack>
      </Box>

      {/* BADGEVI POSLOVA */}
      <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", mb: 3 }}>
        {jobs.map((j, i) => (
          <Box
            key={j.id}
            sx={{
              background: getColor(i),
              color: "white",
              px: 3,
              py: 1,
              borderRadius: 3,
              boxShadow: 2,
              minWidth: 140,
            }}
            title={`prioritet=${j.priority || 0}, trajanje=${
              j.duration || 0
            }s, dolazak=${j.arrivalTime || 0}s`}
          >
            <Typography fontWeight={700} textAlign="center">
              {j.name}
            </Typography>
            <Typography
              variant="caption"
              sx={{ opacity: 0.9, display: "block", textAlign: "center" }}
            >
              trajanje = {j.duration || 0}
              <br />
              prioritet = {j.priority || 0}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* GANTT GRAF */}
      <Box
        sx={{
          background: "white",
          borderRadius: 2,
          p: `60px 20px 0px 20px`,
          boxShadow: 1,
          position: "relative",
          mt: 5,
        }}
      >
        {totalSecs === 0 ? (
          <Typography color="text.secondary">
            Nema podataka za prikaz.
          </Typography>
        ) : (
          <Box ref={scrollRef} sx={{ overflowX: "auto", overflowY: "hidden" }}>
            <Box
              sx={{
                position: "relative",
                width: YW + totalSecs * SEC_PX,
                height: lanesCount * LANE_H + XH + 50,
              }}
            >
              {/* GRID */}
              <Box
                sx={{
                  position: "absolute",
                  left: YW,
                  right: 0,
                  bottom: XH,
                  top: 0,
                  background: `repeating-linear-gradient(90deg, rgba(0,0,0,0.08) 0, rgba(0,0,0,0.08) 1px, transparent 1px, transparent ${SEC_PX}px)`,
                  pointerEvents: "none",
                  zIndex: Z_GRID,
                }}
              />

              {/* BLOKOVI */}
              <Box
                sx={{
                  position: "absolute",
                  left: YW,
                  bottom: XH,
                  width: totalSecs * SEC_PX,
                  height: lanesCount * LANE_H,
                  zIndex: Z_BLOCKS,
                }}
              >
                {timeline.slice(0, progress).map((col, idx) => {
                  const prev = idx > 0 ? timeline[idx - 1] : undefined;
                  const next =
                    idx + 1 < timeline.length ? timeline[idx + 1] : undefined;

                  return (
                    <Box
                      key={col.t}
                      sx={{
                        position: "absolute",
                        left: idx * SEC_PX,
                        bottom: 0,
                        width: SEC_PX,
                        height: "100%",
                      }}
                    >
                      {col.lanes.map((color, lane) => {
                        if (!color) return null;
                        const prevColor = prev?.lanes[lane] ?? null;
                        const nextColor = next?.lanes[lane] ?? null;
                        const { needsLeft, needsRight } = borderFlags(
                          prevColor,
                          color,
                          nextColor
                        );
                        const z = 1000 - lane;

                        return (
                          <Box
                            key={`${col.t}-lane-${lane}`}
                            sx={{
                              position: "absolute",
                              left: 0,
                              right: 0,
                              bottom: lane * LANE_H,
                              height: LANE_H,
                              background: color,
                              borderLeft: needsLeft ? "2px solid #000" : "none",
                              zIndex: z,
                              "&::before": {
                                content: '""',
                                position: "absolute",
                                top: "-2px",
                                left: needsLeft ? "-2px" : "0",
                                right: needsRight ? "-2px" : "0",
                                height: "2px",
                                background: "#000",
                                pointerEvents: "none",
                                zIndex: z + 2,
                              },
                              ...(needsRight && {
                                "&::after": {
                                  content: '""',
                                  position: "absolute",
                                  right: "-2px",
                                  top: "-2px",
                                  bottom: 0,
                                  width: "2px",
                                  background: "#000",
                                  pointerEvents: "none",
                                  zIndex: z + 2,
                                },
                              }),
                            }}
                            title={`t=${col.t}s · lane=${lane + 1}`}
                          />
                        );
                      })}
                    </Box>
                  );
                })}
              </Box>

              {/* OSI */}
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  zIndex: Z_AXES,
                  pointerEvents: "none",
                }}
              >
                {/* Y-osa */}
                <Box
                  sx={{
                    position: "absolute",
                    left: YW,
                    top: 0,
                    bottom: XH,
                    borderLeft: AXIS,
                  }}
                />
                {/* Y tick + brojevi (trake) */}
                {Array.from({ length: lanesCount + 1 }).map((_, i) => (
                  <Box key={i}>
                    <Box
                      sx={{
                        position: "absolute",
                        left: YW - 10,
                        bottom: XH + i * LANE_H,
                        width: 10,
                        height: 0,
                        borderTop: AXIS,
                      }}
                    />
                    {i > 0 && (
                      <Typography
                        sx={{
                          position: "absolute",
                          left: 0,
                          bottom: XH + (i - 1) * LANE_H + LANE_H / 2 - 11,
                          width: YW - 14,
                          textAlign: "right",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {i}
                      </Typography>
                    )}
                  </Box>
                ))}

                {/* X-osa */}
                <Box
                  sx={{
                    position: "absolute",
                    left: YW,
                    right: 0,
                    bottom: XH,
                    height: 0,
                    borderTop: AXIS,
                  }}
                />
                {/* X tick + brojevi */}
                {Array.from({ length: totalSecs + 1 }).map((_, i) => (
                  <Box
                    key={i}
                    sx={{
                      position: "absolute",
                      left: YW + i * SEC_PX,
                      bottom: XH - 12,
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

                {/* nazivi osi */}
                <Typography
                  sx={{
                    position: "absolute",
                    left: 10,
                    top: 150,
                    transform: "rotate(-90deg)",
                    transformOrigin: "left top",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  CPU jezgre (K)
                </Typography>
                <Typography
                  sx={{
                    position: "absolute",
                    right: 10,
                    bottom: 12,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  Vrijeme (u sekundama)
                </Typography>
              </Box>

              {/* Trenutna sekunda */}
              {progress > 0 && (
                <Box
                  sx={{
                    position: "absolute",
                    left: YW + progress * SEC_PX,
                    bottom: XH,
                    top: 0,
                    width: 0,
                    borderLeft: "2px dashed #1976d2",
                    pointerEvents: "none",
                    zIndex: Z_AXES,
                  }}
                />
              )}
            </Box>
          </Box>
        )}
      </Box>

      {/* STATISTIKA — dostupna po završetku; s gumbom za sakriti/prikazati */}
      {finished && stats && (
        <Box sx={{ mt: 3 }}>
          <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
            <Button variant="outlined" onClick={() => setShowStats((v) => !v)}>
              {showStats ? "Sakrij statistiku" : "Prikazi statistiku"}
            </Button>
          </Stack>

          {showStats && (
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5 }}>
                Statistika simulacije
              </Typography>

              <Box
                sx={{
                  display: "grid",
                  gap: 2,
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2, 1fr)",
                    md: "repeat(4, 1fr)",
                  },
                }}
              >
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Ukupno poslova
                  </Typography>
                  <Typography fontWeight={700}>{stats.N}</Typography>
                </Box>

                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Trajanje simulacije
                  </Typography>
                  <Typography fontWeight={700}>
                    {stats.horizon.toFixed(0)} s
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Prosj. u posluzitelju (n_p)
                  </Typography>
                  <Typography fontWeight={700}>
                    {stats.n_p.toFixed(2)}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Prosj. u redu (n_r)
                  </Typography>
                  <Typography fontWeight={700}>
                    {stats.n_r.toFixed(2)}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Prosj. u sustavu (n)
                  </Typography>
                  <Typography fontWeight={700}>
                    {stats.n_all.toFixed(2)}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Stopa dolazaka (alpha)
                  </Typography>
                  <Typography fontWeight={700}>
                    {stats.arrivalRate.toFixed(2)} /s
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Prosj. vrijeme u sustavu (T)
                  </Typography>
                  <Typography fontWeight={700}>
                    {stats.avgResponse.toFixed(2)} s
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Provjera: n / alpha
                  </Typography>
                  <Typography fontWeight={700}>
                    {stats.littleT.toFixed(2)} s
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Prosj. cekanje u redu (W_q)
                  </Typography>
                  <Typography fontWeight={700}>
                    {stats.avgWaiting.toFixed(2)} s
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Prosj. servisno vrijeme
                  </Typography>
                  <Typography fontWeight={700}>
                    {stats.avgService.toFixed(2)} s
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Iskoristenje CPU-a (rho)
                  </Typography>
                  <Typography fontWeight={700}>
                    {(stats.utilization * 100).toFixed(1)}%
                    <Typography
                      component="span"
                      sx={{ ml: 1 }}
                      color="text.secondary"
                    >
                      (K = {lanesCount})
                    </Typography>
                  </Typography>
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />
              <Typography variant="caption" color="text.secondary">
                Velicine su racunate diskretno po sekundama. n_p, n_r i n su
                vremenski prosjeci; T je izracunat iz vremena zavrsetaka po
                poslu, a n/alpha je Littleov zakon (trebao bi priblizno
                odgovarati T).
              </Typography>
            </Paper>
          )}
        </Box>
      )}

      {/* Info dialog */}
      <Dialog open={openInfo} onClose={() => setOpenInfo(false)} maxWidth="md">
        <DialogTitle sx={{ fontWeight: 700 }}>SCHED_FIFO</DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Typography sx={{ mb: 1.5 }}>
            <b>SCHED_FIFO</b> uzima najviši prioritet (manji broj = viši).
            Unutar istog prioriteta poslove poslužuje{" "}
            <b>po redu prispijeća (FIFO)</b>. Svaki je tik 1 s; pri svakom tiku
            biramo do <b>K</b> poslova za izvršavanje. U prikazu se aktivni
            poslovi u toj sekundi
            <b> kompaktiraju od dna naviše</b>.
          </Typography>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
