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

/* ---------- Tip posla za EDF (C, D, A + boja) ---------- */
type EDFJob = {
  id: string;
  name: string;
  runtime: number | ""; // C
  deadline: number | ""; // D (relativni)
  arrivalTime: number | ""; // A
  color: string; // fiksna boja za bedž + simulaciju
  editable: boolean;
};

const PALETTE = ["#f44336", "#ba68c8", "#4caf50", "#00bcd4", "#ffb300"];
const getColor = (i: number) => PALETTE[i % PALETTE.length];

/* ---------- Tablica poslova ---------- */
function EdfTable({
  jobs,
  onUpdate,
  onSave,
  onDelete,
  onSetEditable,
}: {
  jobs: EDFJob[];
  onUpdate: (id: string, field: keyof EDFJob, value: number | "") => void;
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
              <Tooltip title="Runtime (C): maksimalno CPU vrijeme izvršavanja.">
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  Runtime (C){" "}
                  <InfoOutlinedIcon fontSize="small" color="action" />
                </Box>
              </Tooltip>
            </TableCell>
            <TableCell>
              <Tooltip title="Deadline (D): relativni rok u odnosu na dolazak (apsolutni = A + D).">
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  Deadline (D){" "}
                  <InfoOutlinedIcon fontSize="small" color="action" />
                </Box>
              </Tooltip>
            </TableCell>
            <TableCell>
              <Tooltip title="Arrival (A): vrijeme dolaska u sustav.">
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
              <TableCell colSpan={5} align="center">
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

                {(["runtime", "deadline", "arrivalTime"] as const).map(
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
                  {job.editable ? (
                    <IconButton color="success" onClick={() => onSave(job.id)}>
                      <SaveIcon />
                    </IconButton>
                  ) : (
                    <Stack direction="row" spacing={1}>
                      <IconButton
                        color="warning"
                        onClick={() => onSetEditable(job.id, true)}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        color="error"
                        onClick={() => onDelete(job.id)}
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

/* ---------- Stranica: EDF ---------- */
export default function Edf() {
  const [jobs, setJobs] = useState<EDFJob[]>([]);
  const [openInfo, setOpenInfo] = useState(false);
  const navigate = useNavigate();

  const handleAddJob = () => {
    setJobs((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: `Posao ${prev.length + 1}`,
        runtime: "",
        deadline: "",
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
        deadline: Math.floor(Math.random() * 6) + 3, // 3–8 s
        arrivalTime: Math.floor(Math.random() * 6), // 0–5 s
        color: getColor(prev.length),
        editable: false,
      },
    ]);
  };

  const handleSimulate = () => {
    navigate({
      to: "/edf_sim",
      state: (prev) => ({ ...prev, jobs }),
    });
  };

  return (
    <Box sx={{ ml: "240px", p: 4 }}>
      <Header
        title="EDF"
        onAdd={handleAddJob}
        onSimulate={handleSimulate}
        onGenerate={handleGenerateRandomJob}
        onInfoClick={() => setOpenInfo(true)}
      />

      <EdfTable
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

      {/* INFO */}
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
            Earliest Deadline First (EDF)
          </Typography>
          <IconButton onClick={() => setOpenInfo(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent style={{ padding: "10px 40px" }}>
          <Typography gutterBottom>
            EDF je preemptivni: uvijek se izvršava posao s{" "}
            <strong>najranijim apsolutnim rokom</strong> (A + D). Ovdje uređuješ{" "}
            <em>runtime C</em>, <em>deadline D</em> (relativan) i{" "}
            <em>arrival A</em>.
          </Typography>
          <Typography variant="caption" display="block" sx={{ mt: 1.5 }}>
            Pravilo opterećenja (periodični slučaj): ∑(C/T) ≤ 1 (dovoljno).
          </Typography>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
