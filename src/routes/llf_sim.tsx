// src/pages/llf_sim.tsx
import { useEffect, useMemo, useState } from "react";
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

/* ------- Tip posla (isti kao na llf.tsx) ------- */
type LLFJob = {
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

/* ================== LLF SIM — snapshots po sekundama ==================
   Tick = 1s. U svakoj sekundi:
   - uzmi sve spremne poslove (A ≤ t i remaining > 0)
   - izračunaj laksnost: L = (A + D) - t - remaining
   - pokreni onaj s najmanjom L (preemptivno), remaining -= 1
   Snimamo "snapshot" stanja PRIJE izvršenja (tko je na vrhu, L vrijednosti),
   uz ID posla koji je za taj tick izabran.
======================================================================= */
type RankRow = {
  id: string;
  name: string;
  laxity: number;
  remaining: number;
  absDeadline: number;
};

type Snapshot = {
  t: number;
  ranking: RankRow[]; // sortirano uzlazno po laxity
  runningId?: string; // izabran za taj tick (ako ga ima)
};

function simulateLLF(input: LLFJob[]) {
  const jobs = input
    .map((j, i) => ({
      id: j.id,
      name: j.name,
      C: Number(j.runtime),
      D: Number(j.deadline),
      A: Number(j.arrivalTime),
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

  const snapshots: Snapshot[] = [];
  const colorById = new Map<string, string>();
  const nameById = new Map<string, string>();
  jobs.forEach((j) => {
    colorById.set(j.id, j.color);
    nameById.set(j.id, j.name);
  });

  if (!jobs.length) return { snapshots, colorById, nameById };

  const remaining = new Map<string, number>();
  jobs.forEach((j) => remaining.set(j.id, j.C));

  const allDone = () => [...remaining.values()].every((r) => r <= 0);

  let t = Math.min(...jobs.map((j) => j.A));
  const maxAbsDeadline = Math.max(...jobs.map((j) => j.A + j.D));

  while (t <= maxAbsDeadline && !allDone()) {
    // spremni u trenutku t
    const ready = jobs.filter(
      (j) => j.A <= t && (remaining.get(j.id) ?? 0) > 0
    );

    // izračun laksnosti PRIJE izvršenja u ovoj sekundi
    const ranking: RankRow[] = ready
      .map((j) => {
        const rem = remaining.get(j.id) ?? 0;
        return {
          id: j.id,
          name: j.name,
          remaining: rem,
          absDeadline: j.A + j.D,
          laxity: j.A + j.D - t - rem,
        };
      })
      .sort((a, b) => a.laxity - b.laxity || tieOrder(a.id) - tieOrder(b.id));

    // izaberi i "odradi" 1 sekundu
    let runningId: string | undefined;
    if (ranking.length > 0) {
      runningId = ranking[0].id;
      remaining.set(runningId, (remaining.get(runningId) ?? 0) - 1);
    }

    // snimi snapshot stanja PRIJE izvršenja (s info o tome koga smo pokrenuli)
    snapshots.push({ t, ranking, runningId });
    t += 1;
  }

  return { snapshots, colorById, nameById };

  // stabilni tie-breaker po ID-u (da se poredak ne "trese")
  function tieOrder(id: string) {
    let sum = 0;
    for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
    return sum;
  }
}

/* ------------------ Mini-plot komponenta (SVG) ------------------
   - 3x3 grid
   - zelene oznake z1,z2,… na mjestima 1..9 po ranku (u boji posla)
   - crveni obrub ćelije ako je laxity < 0 (deadline promašen u tom t)
   - mala "CPU" točka desno dolje ako je snapshot imao running
------------------------------------------------------------------ */
function MiniGrid({
  snapshot,
  colorById,
}: {
  snapshot: Snapshot;
  colorById: Map<string, string>;
}) {
  const W = 180;
  const H = 140;
  const margin = 20;

  const cellW = (W - margin * 2) / 3;
  const cellH = (H - margin * 2) / 3;

  // centri 9 ćelija
  const cells = Array.from({ length: 9 }).map((_, i) => {
    const cx = i % 3;
    const cy = Math.floor(i / 3);
    return {
      x: margin + cx * cellW + cellW / 2,
      y: margin + cy * cellH + cellH / 2,
      rx: margin + cx * cellW,
      ry: margin + cy * cellH,
    };
  });

  const top9 = snapshot.ranking.slice(0, 9);

  return (
    <svg width={W} height={H}>
      {/* osi */}
      <line
        x1={margin}
        y1={margin}
        x2={margin}
        y2={H - margin}
        stroke="#111"
        strokeWidth={1}
      />
      <line
        x1={margin}
        y1={H - margin}
        x2={W - margin}
        y2={H - margin}
        stroke="#111"
        strokeWidth={1}
      />

      {/* grid linije */}
      {[1, 2].map((k) => (
        <line
          key={"v" + k}
          x1={margin + (k * (W - 2 * margin)) / 3}
          y1={margin}
          x2={margin + (k * (W - 2 * margin)) / 3}
          y2={H - margin}
          stroke="#d0d0d0"
          strokeWidth={1}
        />
      ))}
      {[1, 2].map((k) => (
        <line
          key={"h" + k}
          x1={margin}
          y1={margin + (k * (H - 2 * margin)) / 3}
          x2={W - margin}
          y2={margin + (k * (H - 2 * margin)) / 3}
          stroke="#d0d0d0"
          strokeWidth={1}
        />
      ))}

      {/* r = rank 1..9 */}
      {top9.map((r, idx) => {
        const p = cells[idx];
        const color = colorById.get(r.id) ?? "#2e7d32";
        const missed = r.laxity < 0;

        return (
          <g key={r.id}>
            {/* obrub ćelije ako je L < 0 (kasni) */}
            {missed && (
              <rect
                x={p.rx + 1}
                y={p.ry + 1}
                width={cellW - 2}
                height={cellH - 2}
                fill="none"
                stroke="#d32f2f"
                strokeWidth={2}
                rx={6}
              />
            )}
            {/* label z# u boji posla */}
            <text
              x={p.x - 10}
              y={p.y + 5}
              fontSize="12"
              fontWeight={700}
              fill={color}
            >
              {`z${idx + 1}`}
            </text>
            {/* tooltip s detaljima */}
            <title>
              {`${r.name}
VR=${r.absDeadline - snapshot.t - r.laxity} (rem=${r.remaining})
Laxity L=${r.laxity}  |  absD=${r.absDeadline}  |  t=${snapshot.t}
${missed ? "⚠ Propušten rok (L < 0)" : ""}`}
            </title>
          </g>
        );
      })}

      {/* CPU indikator (ako je nešto radilo u toj sekundi) */}
      {snapshot.runningId && (
        <circle cx={W - margin - 7} cy={H - margin - 7} r={5} fill="#2e7d32">
          <title>CPU u ovoj sekundi: {top9[0]?.name ?? "—"}</title>
        </circle>
      )}
    </svg>
  );
}

export default function LlfSim() {
  const navigate = useNavigate();
  const location = useLocation() as unknown as { state?: { jobs?: LLFJob[] } };

  const baseJobs = useMemo<LLFJob[]>(
    () => location.state?.jobs ?? [],
    [location.state]
  );
  const { snapshots, colorById, nameById } = useMemo(
    () => simulateLLF(baseJobs),
    [baseJobs]
  );

  const [running, setRunning] = useState(true);
  const [openInfo, setOpenInfo] = useState(false);
  const [progress, setProgress] = useState(0);

  const totalSteps = snapshots.length;
  const shown = snapshots.slice(0, progress); // “rastuća” traka – kao na slici

  useEffect(() => {
    if (!running || totalSteps === 0) return;
    const id = setInterval(() => {
      setProgress((p) => Math.min(totalSteps, p + 1));
    }, 600);
    return () => clearInterval(id);
  }, [running, totalSteps]);

  useEffect(() => setProgress(0), [totalSteps]);

  const handleReset = () => {
    setRunning(false);
    setProgress(0);
  };

  // indikator je li igdje u prikazanim koracima došlo do kašnjenja
  const anyMissed = shown.some((s) => s.ranking.some((r) => r.laxity < 0));

  return (
    <Box sx={{ p: 4, bgcolor: "#f5f7fb", minHeight: "100vh" }}>
      {/* HEADER */}
      <Box mb={2}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="h5" fontWeight="bold">
              LLF
            </Typography>
            <IconButton
              size="small"
              color="primary"
              onClick={() => setOpenInfo(true)}
            >
              <InfoOutlinedIcon fontSize="small" />
            </IconButton>
            {totalSteps > 0 && (
              <Chip
                size="small"
                color={anyMissed ? "error" : "primary"}
                label={`Korak: ${Math.min(progress, totalSteps)}/${totalSteps}`}
                sx={{ ml: 1 }}
              />
            )}
          </Stack>
          <Stack direction="row" spacing={2}>
            <Button
              variant="contained"
              startIcon={<ArrowBackIcon />}
              onClick={() => navigate({ to: "/llf" })}
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

      {/* BADGEVI POSLOVA – boje iz tablice */}
      <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", mb: 3 }}>
        {baseJobs.map((j, i) => (
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
              trajanje = {j.runtime || 0}s, rok = {j.deadline || 0}s, dolazak ={" "}
              {j.arrivalTime || 0}s
            </Typography>
          </Box>
        ))}
      </Box>

      {/* GRID SNAPSHOTS */}
      <Box sx={{ background: "white", borderRadius: 2, p: 3, boxShadow: 1 }}>
        {totalSteps === 0 ? (
          <Typography color="text.secondary">
            Nema podataka za prikaz.
          </Typography>
        ) : (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 28,
            }}
          >
            {shown.map((snap, idx) => {
              const cpuName = snap.runningId
                ? nameById.get(snap.runningId) ?? "—"
                : "—";
              return (
                <Box key={snap.t}>
                  {/* broj ploče i vrijeme */}
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ mb: 1 }}
                  >
                    <Box
                      sx={{
                        width: 46,
                        height: 46,
                        borderRadius: "50%",
                        border: "2px solid #3f8cff",
                        color: "#3f8cff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                      }}
                      title={`korak #${idx + 1} (t = ${snap.t}s)`}
                    >
                      {idx + 1}
                    </Box>
                    <Chip
                      size="small"
                      label={`t=${snap.t}s · CPU: ${cpuName}`}
                    />
                  </Stack>

                  <MiniGrid snapshot={snap} colorById={colorById} />
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      {/* Info dialog */}
      <Dialog open={openInfo} onClose={() => setOpenInfo(false)} maxWidth="md">
        <DialogTitle sx={{ fontWeight: 700 }}>LLF — run simulation</DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Što vidiš
          </Typography>
          <Typography sx={{ mb: 2 }}>
            Svaka ploča je jedan <strong>tick = 1s</strong>. U tablici iznad su
            poslovi i njihove boje. U svakoj ploči mini-grid (3×3) prikazuje{" "}
            <em>poredak po laksnosti</em>: oznake <strong>z1, z2, …</strong> su
            rang 1–9 (1 = najmanja laksnost, prvi na redu). Ako je neka ćelija
            označena crvenim okvirom, to znači da je u toj sekundi
            <strong> L &lt; 0</strong> (deadline je već propušten). Zelena
            točkica dolje desno znači da je u toj sekundi netko radio na CPU-u.
            Zadrži pokazivač iznad oznake za detalje (ime, L, remaining,
            apsolutni rok).
          </Typography>

          <Typography variant="h6" sx={{ mb: 1 }}>
            Kako LLF odlučuje
          </Typography>
          <Typography>
            Za posao s dolaskom <code>A</code>, relativnim rokom <code>D</code>{" "}
            i preostalim trajanjem
            <code> rem</code> u trenutku <code>t</code>, laksnost je
            <code> L = (A + D) − t − rem</code>. Algoritam u svakoj sekundi
            pokreće posao s<strong> najmanjom L</strong> (preemptivno). Ako je{" "}
            <code>L &lt; 0</code>, rok je već nemoguće ispoštovati.
          </Typography>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
