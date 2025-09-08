import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TextField,
  Stack,
  Tooltip,
  Chip,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import { useMemo, useState } from "react";
import Header from "../components/Header";
import { useNavigate } from "@tanstack/react-router";

/* ---------- Tip posla za RMPA (C, T, A + boja) ---------- */
type RMJob = {
  id: string;
  name: string;
  runtime: number | ""; // C (exec time)
  period: number | ""; // T (RM bazira prioritet na T)
  arrivalTime: number | ""; // A (za simulaciju)
  color: string; // fiksna boja za bedž + simulaciju
  editable: boolean;
};

const PALETTE = ["#f44336", "#ba68c8", "#4caf50", "#00bcd4", "#ffb300"];
const getColor = (i: number) => PALETTE[i % PALETTE.length];

/* ---------- Izračun RM prioriteta (manji T => veći prioritet=1) ---------- */
function useRmPriorities(jobs: RMJob[]) {
  return useMemo(() => {
    const norm = jobs
      .map((j) => ({
        id: j.id,
        T: typeof j.period === "number" ? j.period : Number.POSITIVE_INFINITY,
      }))
      .map((j, idx) => ({ ...j, idx }));

    const sorted = [...norm].sort((a, b) => a.T - b.T || a.idx - b.idx);
    const prio = new Map<string, number>();
    sorted.forEach((j, i) => prio.set(j.id, i + 1)); // 1 = najviši
    return prio;
  }, [jobs]);
}

/* ---------- Tablica poslova ---------- */
function RmTable({
  jobs,
  onUpdate,
  onSave,
  onDelete,
  onSetEditable,
}: {
  jobs: RMJob[];
  onUpdate: (id: string, field: keyof RMJob, value: number | "") => void;
  onSave: (id: string) => void;
  onDelete: (id: string) => void;
  onSetEditable: (id: string, value: boolean) => void;
}) {
  const prioMap = useRmPriorities(jobs);

  const parseNumOrEmpty = (v: string): number | "" => {
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? "" : n;
  };

  return (
    <Paper>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Posao</TableCell>
            <TableCell>
              <Tooltip title="Runtime (C): maksimalno CPU vrijeme izvršavanja.">
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  Runtime (C){" "}
                  <InfoOutlinedIcon fontSize="small" color="action" />
                </Box>
              </Tooltip>
            </TableCell>
            <TableCell>
              <Tooltip title="Period (T): razdoblje ponavljanja; manji T ⇒ viši RM prioritet.">
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  Period (T){" "}
                  <InfoOutlinedIcon fontSize="small" color="action" />
                </Box>
              </Tooltip>
            </TableCell>
            <TableCell>
              <Tooltip title="Arrival (A): vrijeme dolaska u sustav (za simulaciju).">
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  Arrival (A){" "}
                  <InfoOutlinedIcon fontSize="small" color="action" />
                </Box>
              </Tooltip>
            </TableCell>
            <TableCell>RM prioritet</TableCell>
            <TableCell>Akcije</TableCell>
          </TableRow>
        </TableHead>

        <TableBody>
          {jobs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} align="center">
                Nema unesenih poslova
              </TableCell>
            </TableRow>
          ) : (
            jobs.map((job) => {
              const pr = prioMap.get(job.id) ?? "-";
              return (
                <TableRow key={job.id}>
                  <TableCell>
                    <Box
                      px={2}
                      py={0.5}
                      borderRadius="12px"
                      fontWeight="bold"
                      color="white"
                      sx={{
                        backgroundColor: job.color,
                        display: "inline-block",
                        boxShadow: 2,
                      }}
                    >
                      {job.name}
                    </Box>
                  </TableCell>

                  {(["runtime", "period", "arrivalTime"] as const).map(
                    (field) => (
                      <TableCell key={field}>
                        {job.editable ? (
                          <TextField
                            size="small"
                            value={job[field]}
                            onChange={(e) =>
                              onUpdate(
                                job.id,
                                field,
                                parseNumOrEmpty(e.target.value)
                              )
                            }
                            type="number"
                            inputProps={{ min: 0 }}
                          />
                        ) : (
                          `${job[field]} s`
                        )}
                      </TableCell>
                    )
                  )}

                  <TableCell>
                    <Chip
                      size="small"
                      color="primary"
                      label={typeof pr === "number" ? `#${pr}` : "-"}
                    />
                  </TableCell>

                  <TableCell>
                    {job.editable ? (
                      <IconButton
                        color="success"
                        onClick={() => onSave(job.id)}
                        aria-label="Spremi posao"
                      >
                        <SaveIcon />
                      </IconButton>
                    ) : (
                      <Stack direction="row" spacing={1}>
                        <IconButton
                          color="warning"
                          onClick={() => onSetEditable(job.id, true)}
                          aria-label="Uredi posao"
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          color="error"
                          onClick={() => onDelete(job.id)}
                          aria-label="Obriši posao"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Stack>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </Paper>
  );
}

/* ---------- Stranica: RMPA ---------- */
export default function Rmpa() {
  const [jobs, setJobs] = useState<RMJob[]>([]);
  const [openInfo, setOpenInfo] = useState(false);
  const navigate = useNavigate();

  const handleAddJob = () => {
    setJobs((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: `Posao ${prev.length + 1}`,
        runtime: "",
        period: "",
        arrivalTime: "",
        color: getColor(prev.length),
        editable: true,
      },
    ]);
  };

  const handleGenerateRandomJob = () => {
    setJobs((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: `Posao ${prev.length + 1}`,
        runtime: Math.floor(Math.random() * 3) + 1, // 1–3 s
        period: Math.floor(Math.random() * 8) + 3, // 3–10 s
        arrivalTime: Math.floor(Math.random() * 6), // 0–5 s
        color: getColor(prev.length),
        editable: false,
      },
    ]);
  };

  const handleSimulate = () => {
    navigate({
      to: "/rmpa_sim",
      state: (prev) => ({ ...prev, jobs }),
    });
  };

  return (
    <Box sx={{ ml: "240px", p: 4 }}>
      <Header
        title="RMPA (Rate-Monotonic)"
        onAdd={handleAddJob}
        onSimulate={handleSimulate}
        onGenerate={handleGenerateRandomJob}
        onInfoClick={() => setOpenInfo(true)}
      />

      <RmTable
        jobs={jobs}
        onUpdate={(id, field, value) =>
          setJobs((prev) =>
            prev.map((job) =>
              job.id === id ? { ...job, [field]: value } : job
            )
          )
        }
        onSave={(id) =>
          setJobs((prev) =>
            prev.map((job) =>
              job.id === id ? { ...job, editable: false } : job
            )
          )
        }
        onDelete={(id) => setJobs((prev) => prev.filter((j) => j.id !== id))}
        onSetEditable={(id, v) =>
          setJobs((prev) =>
            prev.map((job) => (job.id === id ? { ...job, editable: v } : job))
          )
        }
      />

      {/* INFO DIALOG */}
      <Dialog open={openInfo} onClose={() => setOpenInfo(false)} maxWidth="md">
        <DialogTitle
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
          style={{ padding: "40px" }}
        >
          <Typography fontWeight="bold" variant="h4">
            RMPA (Rate-Monotonic Priority Assignment)
          </Typography>
          <IconButton onClick={() => setOpenInfo(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent style={{ padding: "10px 40px" }}>
          <Typography gutterBottom>
            RMPA dodjeljuje **statičke** prioritete na temelju perioda: kraći
            period ⇒ veći prioritet. Uobičajeno se pretpostavlja D = T. Na ovoj
            stranici uređuješ <em>C, T, A</em>, a prioritet se računa
            automatski.
          </Typography>
          <Typography variant="caption" display="block" sx={{ mt: 1.5 }}>
            Kriterij opterećenja (n jobs): ∑(C<sub>i</sub>/T<sub>i</sub>) ≤
            n·(2^ 1 / n -1) (dovoljni uvjet zakazivosti).
          </Typography>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
