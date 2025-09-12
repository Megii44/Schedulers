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
} from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PauseCircleIcon from "@mui/icons-material/PauseCircle";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import { useLocation, useNavigate } from "@tanstack/react-router";

/* ---------- tip posla (isti kao u sched_fifo.tsx) ---------- */
type Job = {
  id: string;
  name: string;
  priority: number | "";
  duration: number | "";
  arrivalTime: number | "";
  editable: boolean;
};

const PALETTE = ["#f44336", "#ba68c8", "#4caf50", "#00bcd4", "#ffb300"];
const colorOf = (i: number) => PALETTE[i % PALETTE.length];

/* helper: hex -> rgba s alfo m */
function withAlpha(hex: string, a: number) {
  // očekujemo #RRGGBB
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

const ACTIVE_H = 34; // visina jedne trake “aktivna dretva”
const READY_H = 26; // visina jedne razine “pripravnih”

const AXIS_PX = 2;
const AXIS = `${AXIS_PX}px solid #222`;

const LEFT_W = 140; // lijevi rub (za natpise)
const BOTTOM_H = 78; // donji rub (za X-os)

/* ----- interni tipovi ----- */
interface NJob {
  id: string;
  name: string;
  prio: number;
  dur: number;
  arr: number;
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
};

/* ================== simulacija SCHED_FIFO (N CPU) ================== */
function simulate(input: Job[], cpus: number): SimOut {
  const ncpu = Math.max(1, Math.floor(cpus || 1));

  const base: NJob[] = input
    .map((j, i) => ({
      id: j.id,
      name: j.name,
      prio: Number(j.priority),
      dur: Number(j.duration),
      arr: Number(j.arrivalTime),
      color: colorOf(i),
    }))
    .filter(
      (j) =>
        Number.isFinite(j.prio) &&
        Number.isFinite(j.dur) &&
        Number.isFinite(j.arr) &&
        j.dur > 0
    )
    .sort((a, b) => a.arr - b.arr);

  const names = new Map(base.map((b) => [b.id, b.name] as const));
  const colors = new Map(base.map((b) => [b.id, b.color] as const));

  if (!base.length)
    return { columns: [], minT: 0, maxT: 0, maxReadyDepth: 0, colors, names };

  const remaining = new Map<string, number>(base.map((b) => [b.id, b.dur]));
  const notArrived = [...base];

  const readyByPri = new Map<number, NJob[]>();
  const pushReady = (job: NJob) => {
    if (!readyByPri.has(job.prio)) readyByPri.set(job.prio, []);
    readyByPri.get(job.prio)!.push(job); // FIFO (push na kraj)
  };
  const popFromHighest = (): NJob | undefined => {
    const prios = [...readyByPri.keys()].sort((a, b) => a - b);
    for (const p of prios) {
      const q = readyByPri.get(p)!;
      if (q.length) return q.shift(); // FIFO: uzmi s glave
    }
    return undefined;
  };
  const hasReady = () => [...readyByPri.values()].some((q) => q.length);

  const highestPrioReady = () => {
    const prios = [...readyByPri.keys()].filter(
      (p) => (readyByPri.get(p)?.length ?? 0) > 0
    );
    return prios.length ? Math.min(...prios) : undefined;
  };

  let t = Math.min(...base.map((b) => b.arr));
  while (notArrived.length && notArrived[0].arr <= t)
    pushReady(notArrived.shift()!);

  // CPU 0 je najbliže dnu prikaza.
  let running: (NJob | undefined)[] = Array(ncpu).fill(undefined);
  const columns: Column[] = [];

  const snapshotReadyOrder = (): string[] => {
    const order: string[] = [];
    const prios = [...readyByPri.keys()].sort((a, b) => a - b);
    for (const p of prios) for (const j of readyByPri.get(p)!) order.push(j.id);
    return order;
  };

  const haveWork = () =>
    running.some(Boolean) || hasReady() || notArrived.length > 0;

  // Pakiraj aktivne prema dnu bez rupa, čuvajući trenutni redoslijed.
  const compactRunning = () => {
    const live = running.filter((r): r is NJob => Boolean(r));
    running = [
      ...live,
      ...Array(Math.max(0, ncpu - live.length)).fill(undefined),
    ];
  };

  while (haveWork()) {
    // Ako nema spremnih, preskoči do sljedećeg dolaska
    if (!running.some(Boolean) && !hasReady()) {
      if (!notArrived.length) break;
      const nextT = notArrived[0].arr;
      for (let tt = t; tt < nextT; tt++)
        columns.push({
          t: tt,
          activeIds: Array(ncpu).fill(undefined),
          readyIds: [],
        });
      t = nextT;
      while (notArrived.length && notArrived[0].arr <= t)
        pushReady(notArrived.shift()!);
    }

    // Dolazak višeg prioriteta može preuzeti CPU od nižeg
    const hp = highestPrioReady();
    if (hp !== undefined) {
      // Preuzimanje krene od donjeg CPU-a (CPU 0) kako bi viši prioritet završio što bliže dnu.
      for (let c = 0; c < ncpu; c++) {
        const cur = running[c];
        if (cur && cur.prio > hp) {
          const q = readyByPri.get(cur.prio) ?? [];
          // Prekinuti posao ide na čelo svog FIFO reda (SCHED_FIFO semantika).
          readyByPri.set(cur.prio, [cur, ...q]);
          running[c] = undefined;
        }
      }
    }

    // Popuni slobodne CPU-e od dna prema vrhu (CPU 0 je dno u prikazu).
    for (let c = 0; c < ncpu; c++) {
      if (!running[c]) running[c] = popFromHighest();
    }

    // >>> Ključ: nema rupa – zapakiraj prema dnu svaku iteraciju.
    compactRunning();

    columns.push({
      t,
      activeIds: running.map((r) => r?.id),
      readyIds: snapshotReadyOrder(),
    });

    // Odradi 1 s na svima koji rade
    for (let c = 0; c < ncpu; c++) {
      const cur = running[c];
      if (!cur) continue;
      const rem = (remaining.get(cur.id) ?? 0) - 1;
      remaining.set(cur.id, rem);
      if (rem <= 0) running[c] = undefined;
    }

    t += 1;
    while (notArrived.length && notArrived[0].arr <= t)
      pushReady(notArrived.shift()!);
  }

  const maxReadyDepth = Math.max(0, ...columns.map((c) => c.readyIds.length));
  const minT = columns.length ? columns[0].t : 0;
  const maxT = columns.length ? columns[columns.length - 1].t + 1 : minT;

  return { columns, minT, maxT, maxReadyDepth, colors, names };
}

/* ================== komponenta ================== */
export default function SchedFifoSim() {
  const navigate = useNavigate();
  const location = useLocation() as unknown as { state?: { jobs?: Job[] } };

  const jobs = useMemo<Job[]>(
    () => location.state?.jobs ?? [],
    [location.state]
  );

  // DEFAULT = 1; dropdown kontrola
  const [numCpus, setNumCpus] = useState<number>(1);

  const { columns, minT, maxT, maxReadyDepth, colors, names } = useMemo(
    () => simulate(jobs, numCpus),
    [jobs, numCpus]
  );

  const totalSecs = Math.max(0, maxT - minT);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(true);
  const [openInfo, setOpenInfo] = useState(false);

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
                color="primary"
                label={`t = ${curSec}${progress >= totalSecs ? " (kraj)" : ""}`}
                sx={{ ml: 1 }}
              />
            )}
          </Stack>

          <Stack direction="row" spacing={1.5} alignItems="center">
            {/* Dropdown: manje opcija (1–8) i reset simulacije na promjenu */}
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel id="akt-dretve-label">Aktivne dretve</InputLabel>
              <Select
                labelId="akt-dretve-label"
                id="akt-dretve"
                label="Aktivne dretve"
                value={numCpus}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setNumCpus(v);
                  // odmah kreni "od nule"
                  setRunning(true);
                  setProgress(0);
                  scrollRef.current?.scrollTo({ left: 0, behavior: "smooth" });
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

      {/* BADGEVI – boje iz tablice + detalji */}
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 3 }}>
        {jobs.map((j, i) => (
          <Box
            key={j.id}
            sx={{
              borderRadius: 2,
              boxShadow: 1,
              minWidth: 200,
              px: 2,
              py: 1.2,
              background: "#fff",
              border: "1px solid #e0e0e0",
              position: "relative",
            }}
            title={`prioritet=${j.priority || 0}, trajanje=${
              j.duration || 0
            }s, dolazak=${j.arrivalTime || 0}s`}
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
                Prioritet: <b>{j.priority || 0}</b>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Trajanje: <b>{j.duration || 0}s</b>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Dolazak: <b>{j.arrivalTime || 0}s</b>
              </Typography>
            </Stack>
          </Box>
        ))}
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

      {/* Info dialog */}
      <Dialog
        open={openInfo}
        onClose={() => setOpenInfo(false)}
        maxWidth="md"
        style={{ zIndex: 5000 }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          SCHED_FIFO — simulacija
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Typography gutterBottom>
            Donji dio prikazuje <b>aktivne dretve</b> (po CPU-u), a iznad su{" "}
            <b>pripravne dretve</b> složene po FIFO-u unutar prioriteta (dno je
            glava reda). Preuzimanje se događa pri dolasku{" "}
            <b>višeg prioriteta</b>. Svaka kolona je 1 s. Broj aktivnih dretvi
            možeš mijenjati gore desno — simulacija tad kreće ispočetka.
          </Typography>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
