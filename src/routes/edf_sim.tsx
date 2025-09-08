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
} from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PauseCircleIcon from "@mui/icons-material/PauseCircle";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { useLocation, useNavigate } from "@tanstack/react-router";

/* ------- Tip posla (isti kao na edf.tsx) ------- */
type EDFJob = {
  id: string;
  name: string;
  runtime: number | "";
  deadline: number | "";
  arrivalTime: number | "";
  color?: string;
  editable: boolean;
};

const PALETTE = ["#f44336", "#ba68c8", "#4caf50", "#00bcd4", "#ffb300"];
const getColor = (i: number) => PALETTE[i % PALETTE.length];

// dimenzije i slojevi — kao FIFO
const SEC_PX = 36;
const COL_H = 34;

const AXIS_PX = 2;
const AXIS = `${AXIS_PX}px solid #222`;

const YW = 76; // lijeva margina (oznake Y)
const XH = 78; // donja margina (oznake X)

const Z_GRID = 0;
const Z_BLOCKS = 1;
const Z_AXES = 2;

/* ---------------- EDF simulacija (one-shot, preemptivno) ----------------
   - Svaki posao se izvršava JEDNOM (nema re-releasea).
   - U svakom trenutku vrti se posao s najmanjim apsolutnim rokom: A + D.
   - Prethvat kad novi dolazni ima raniji rok od trenutno aktivnog.
--------------------------------------------------------------------------- */
function simulateEdf(input: EDFJob[]) {
  const jobs = input
    .map((j, i) => ({
      id: j.id,
      name: j.name,
      C: Number(j.runtime),
      D: Number(j.deadline),
      A: Number(j.arrivalTime),
      absD: Number(j.arrivalTime) + Number(j.deadline),
      color: j.color ?? getColor(i),
    }))
    .filter(
      (j) =>
        Number.isFinite(j.C) &&
        Number.isFinite(j.D) &&
        Number.isFinite(j.A) &&
        j.C > 0 &&
        j.D > 0
    )
    .sort((a, b) => a.A - b.A);

  const completionById = new Map<string, number>();
  if (!jobs.length) return { completionById };

  const remaining = new Map<string, number>();
  jobs.forEach((j) => remaining.set(j.id, j.C));

  const notArrived = [...jobs];
  const ready: typeof jobs = [];
  const addArrivalsUpTo = (t: number) => {
    while (notArrived.length && notArrived[0].A <= t) {
      ready.push(notArrived.shift()!);
    }
  };
  const popEarliestDeadline = () => {
    ready.sort((a, b) => a.absD - b.absD || a.A - b.A);
    return ready.shift();
  };
  const nextArrival = () => (notArrived.length ? notArrived[0].A : Infinity);

  let t = Math.min(...jobs.map((j) => j.A));
  addArrivalsUpTo(t);
  let running: (typeof jobs)[number] | undefined;

  while (notArrived.length || ready.length || running) {
    if (!running) {
      if (!ready.length) {
        t = nextArrival();
        addArrivalsUpTo(t);
      }
      running = popEarliestDeadline();
      if (!running) break;
    }

    const rem = remaining.get(running.id)!;
    const finishAt = t + rem;
    const na = nextArrival();

    // preempt ako dolazi novi s ranijim rokom od trenutnog
    let preemptAt = Infinity;
    if (na < finishAt) {
      const arrivals = notArrived.filter((j) => j.A === na);
      const earliestIncoming = Math.min(...arrivals.map((j) => j.absD));
      if (arrivals.length && earliestIncoming < running.absD) preemptAt = na;
    }

    if (preemptAt < Infinity) {
      remaining.set(running.id, rem - (preemptAt - t));
      t = preemptAt;
      addArrivalsUpTo(t);
      ready.push(running); // vrati u ready; poredak će srediti popEarliestDeadline
      running = undefined;
    } else {
      t = finishAt;
      remaining.delete(running.id);
      completionById.set(running.id, finishAt);
      addArrivalsUpTo(t);
      running = undefined;
    }
  }

  return { completionById };
}

/* --------- broj poslova u sustavu po sekundi (isti vizual kao FIFO) --------- */
function buildStackColumns(
  jobs: EDFJob[],
  completionById: Map<string, number>
) {
  const colorById = new Map(jobs.map((j, i) => [j.id, j.color ?? getColor(i)]));
  const normalized = jobs.map((j) => ({
    id: j.id,
    arrival: Number(j.arrivalTime),
    color: colorById.get(j.id)!,
  }));
  if (!normalized.length)
    return { columns: [] as any[], minT: 0, maxT: 0, maxStack: 0 };

  const minT = Math.floor(Math.min(...normalized.map((j) => j.arrival)));
  const maxT = Math.ceil(Math.max(...[...completionById.values(), minT + 1]));

  const columns: { t: number; stack: { id: string; color: string }[] }[] = [];
  for (let t = minT; t < maxT; t++) {
    const stack = normalized
      .filter(
        (j) => j.arrival <= t && (completionById.get(j.id) ?? Infinity) > t
      )
      .sort((a, b) => PALETTE.indexOf(a.color) - PALETTE.indexOf(b.color))
      .map((j) => ({ id: j.id, color: j.color }));
    columns.push({ t, stack });
  }
  const maxStack = Math.max(1, ...columns.map((c) => c.stack.length));
  return { columns, minT, maxT, maxStack };
}

export default function EdfSim() {
  const navigate = useNavigate();
  const location = useLocation() as unknown as { state?: { jobs?: EDFJob[] } };

  const jobs = useMemo<EDFJob[]>(
    () => location.state?.jobs ?? [],
    [location.state]
  );
  const { completionById } = useMemo(() => simulateEdf(jobs), [jobs]);
  const { columns, minT, maxT, maxStack } = useMemo(
    () => buildStackColumns(jobs, completionById),
    [jobs, completionById]
  );

  const [running, setRunning] = useState(true);
  const [openInfo, setOpenInfo] = useState(false);
  const [progress, setProgress] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const totalSecs = Math.max(0, maxT - minT);
  const currentSecond = Math.min(progress, totalSecs) + minT;

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
              EDF
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
                label={`Trenutna sekunda: ${currentSecond}`}
                sx={{ ml: 1 }}
              />
            )}
          </Stack>
          <Stack direction="row" spacing={2}>
            <Button
              variant="contained"
              startIcon={<ArrowBackIcon />}
              onClick={() => navigate({ to: "/edf" })}
            >
              Nazad
            </Button>
            <Button
              variant="contained"
              startIcon={<RestartAltIcon />}
              onClick={handleReset}
            >
              Resetiraj simulaciju
            </Button>
            <Button
              variant="contained"
              onClick={() => setRunning((r) => !r)}
              startIcon={running ? <PauseCircleIcon /> : <PlayCircleIcon />}
            >
              {running ? "Zaustavi simulaciju" : "Pokreni simulaciju"}
            </Button>
          </Stack>
        </Stack>
      </Box>

      {/* BADGEVI POSLOVA (boje iz tablice) */}
      <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", mb: 3 }}>
        {jobs.map((j, i) => (
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
            }}
          >
            <Typography fontWeight={700} textAlign="center">
              {j.name}
            </Typography>
            <Typography
              variant="caption"
              sx={{ opacity: 0.9, display: "block", textAlign: "center" }}
            >
              C={j.runtime || 0}s, D={j.deadline || 0}s, A={j.arrivalTime || 0}s
            </Typography>
          </Box>
        ))}
      </Box>

      {/* GRAF — kao FIFO (grid, jednaki rubovi, “trenutna sekunda”) */}
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
                height: maxStack * COL_H + XH + 50,
              }}
            >
              {/* GRID (ispod svega) */}
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

              {/* BLOKOVI (iznad grida, ispod osi) */}
              <Box
                sx={{
                  position: "absolute",
                  left: YW,
                  bottom: XH,
                  width: totalSecs * SEC_PX,
                  height: maxStack * COL_H,
                  zIndex: Z_BLOCKS,
                }}
              >
                {(() => {
                  const colorById = new Map(
                    jobs.map((j, idx) => [j.id, j.color ?? getColor(idx)])
                  );
                  return columns.slice(0, progress).map((col, idx) => {
                    const prev = idx > 0 ? columns[idx - 1] : undefined;
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
                        {col.stack.map((s: any, level: number) => {
                          const thisColor = colorById.get(s.id) ?? s.color;
                          const prevColor = prev?.stack[level]
                            ? colorById.get(prev.stack[level].id) ??
                              prev.stack[level].color
                            : undefined;
                          const nextBlock = columns[idx + 1]?.stack[level];
                          const nextColor = nextBlock
                            ? colorById.get(nextBlock.id) ?? nextBlock.color
                            : undefined;

                          const needsLeft =
                            idx === 0 || !prevColor || prevColor !== thisColor;
                          const needsRight = !nextColor; // nema bloka iduće sekunde na istoj razini
                          const z = 1000 - level;

                          return (
                            <Box
                              key={s.id + "-" + level}
                              sx={{
                                position: "absolute",
                                left: 0,
                                right: 0,
                                bottom: level * COL_H,
                                height: COL_H,
                                background: thisColor,
                                borderLeft: needsLeft
                                  ? "2px solid #000"
                                  : "none",
                                zIndex: z,

                                /* TOP rub (izvan) */
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

                                /* RIGHT rub (izvan) */
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
                            />
                          );
                        })}
                      </Box>
                    );
                  });
                })()}
              </Box>

              {/* OSI (najviše) */}
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
                {/* Y tickovi i brojevi */}
                {Array.from({ length: maxStack + 1 }).map((_, i) => (
                  <Box key={i}>
                    <Box
                      sx={{
                        position: "absolute",
                        left: YW - 10,
                        bottom: XH + i * COL_H,
                        width: 10,
                        height: 0,
                        borderTop: AXIS,
                      }}
                    />
                    <Typography
                      sx={{
                        position: "absolute",
                        left: 0,
                        bottom: XH + i * COL_H - 11,
                        width: YW - 14,
                        textAlign: "right",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {i}
                    </Typography>
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
                {/* X tickovi + brojevi */}
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

                {/* Nazivi osi */}
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
                  Broj poslova u sustavu
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

      {/* Info dialog */}
      <Dialog open={openInfo} onClose={() => setOpenInfo(false)} maxWidth="md">
        <DialogTitle sx={{ fontWeight: 700 }}>EDF — simulacija</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            Prikaz je kao kod FIFO: stupci su broj aktivnih poslova po sekundi.
            Raspored je <strong>preemptivni EDF</strong>: uvijek radi onaj s
            najmanjim apsolutnim rokom (A + D). Kad stigne posao s ranijim
            rokom, preuzima CPU.
          </Typography>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
