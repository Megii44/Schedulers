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
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import { useState } from "react";
import Header from "../components/Header";
import { useNavigate } from "@tanstack/react-router";

/* ---------- Tip posla za SCHED_DEADLINE (C,D,T + A + boja) ---------- */
type DLJob = {
  id: string;
  name: string;
  runtime: number | ""; // C
  deadline: number | ""; // D
  period: number | ""; // T
  arrivalTime: number | ""; // A (za simulaciju)
  color: string; // boja bedgea i simulacije
  editable: boolean;
};

const PALETTE = ["#f44336", "#ba68c8", "#4caf50", "#00bcd4", "#ffb300"];
const getColor = (i: number) => PALETTE[i % PALETTE.length];

/* ---------- Lokalna tablica (analogno JobTable iz FIFO) ---------- */
function DeadlineTable({
  jobs,
  onUpdate,
  onSave,
  onDelete,
  onSetEditable,
}: {
  jobs: DLJob[];
  onUpdate: (id: string, field: keyof DLJob, value: number | "") => void;
  onSave: (id: string) => void;
  onDelete: (id: string) => void;
  onSetEditable: (id: string, value: boolean) => void;
}) {
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
              <Tooltip title="Runtime (C): maksimalno CPU vrijeme unutar perioda.">
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  Runtime (C){" "}
                  <InfoOutlinedIcon fontSize="small" color="action" />
                </Box>
              </Tooltip>
            </TableCell>
            <TableCell>
              <Tooltip title="Deadline (D): rok unutar kojeg posao mora završiti.">
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  Deadline (D){" "}
                  <InfoOutlinedIcon fontSize="small" color="action" />
                </Box>
              </Tooltip>
            </TableCell>
            <TableCell>
              <Tooltip title="Period (T): interval ponavljanja zadatka.">
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  Period (T){" "}
                  <InfoOutlinedIcon fontSize="small" color="action" />
                </Box>
              </Tooltip>
            </TableCell>
            <TableCell>
              <Tooltip title="Arrival (A): vrijeme dolaska (za simulaciju).">
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  Arrival (A){" "}
                  <InfoOutlinedIcon fontSize="small" color="action" />
                </Box>
              </Tooltip>
            </TableCell>
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
            jobs.map((job) => (
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

                {(
                  ["runtime", "deadline", "period", "arrivalTime"] as const
                ).map((field) => (
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
                ))}

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
            ))
          )}
        </TableBody>
      </Table>
    </Paper>
  );
}

/* ---------- Stranica: SCHED_DEADLINE ---------- */
export default function SchedDeadline() {
  const [jobs, setJobs] = useState<DLJob[]>([]);
  const [openInfo, setOpenInfo] = useState(false);
  const navigate = useNavigate();

  /* Dodaj posao -> prazna edit polja + fiksiraj boju */
  const handleAddJob = () => {
    setJobs((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: `Posao ${prev.length + 1}`,
        runtime: "",
        deadline: "",
        period: "",
        arrivalTime: "",
        color: getColor(prev.length),
        editable: true,
      },
    ]);
  };

  /* Generiraj -> popunjena polja, nije edit + fiksiraj boju */
  const handleGenerateRandomJob = () => {
    setJobs((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: `Posao ${prev.length + 1}`,
        runtime: Math.floor(Math.random() * 3) + 1, // 1–3 s
        deadline: Math.floor(Math.random() * 6) + 3, // 3–8 s
        period: Math.floor(Math.random() * 8) + 4, // 4–11 s
        arrivalTime: Math.floor(Math.random() * 6), // 0–5 s
        color: getColor(prev.length),
        editable: false,
      },
    ]);
  };

  const handleSimulate = () => {
    navigate({
      to: "/sched_deadline_sim",
      state: (prev) => ({ ...prev, jobs }),
    });
  };

  return (
    <Box sx={{ ml: "240px", p: 4 }}>
      <Header
        title="SCHED_DEADLINE"
        onAdd={handleAddJob}
        onSimulate={handleSimulate}
        onGenerate={handleGenerateRandomJob}
        onInfoClick={() => setOpenInfo(true)}
      />

      <DeadlineTable
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
            SCHED_DEADLINE
          </Typography>
          <IconButton onClick={() => setOpenInfo(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent style={{ padding: "10px 40px" }}>
          <Typography gutterBottom>
            <strong>SCHED_DEADLINE</strong> planira prema{" "}
            <strong>Earliest Deadline First (EDF)</strong> uz{" "}
            <strong>Constant Bandwidth Server (CBS)</strong>. Svaki posao ima{" "}
            <em>runtime (C)</em>, <em>deadline (D)</em> i <em>period (T)</em>, a
            u ovoj aplikaciji dodan je i <em>arrival (A)</em> radi simulacije
            dolaska.
          </Typography>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
