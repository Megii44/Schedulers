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
  Select,
  MenuItem,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import { useState } from "react";
import Header from "../components/Header";
import { useNavigate } from "@tanstack/react-router";

/* ---------- tip CFS posla ---------- */
type CfsJob = {
  id: string;
  name: string;
  duration: number | ""; // ukupno posla (s)
  nice: number | ""; // -20..+19
  arrivalTime: number | ""; // A
  color: string; // stabilna boja (tablica + simulacija)
  editable: boolean;
};

/* Linux nice -> weight (točna tablica) */
const NICE_WEIGHTS = [
  88761,
  71755,
  56483,
  46273,
  36291,
  29154,
  23254,
  18705,
  14949,
  11916, // -20..-11
  9548,
  7620,
  6100,
  4904,
  3906,
  3121,
  2501,
  1991,
  1586,
  1277, // -10.. -1
  1024,
  820,
  655,
  526,
  423,
  335,
  272,
  215,
  172,
  137, //   0.. +9
  110,
  87,
  70,
  56,
  45,
  36,
  29,
  23,
  18,
  15, // +10..+19
];
const weightFromNice = (nice: number) => {
  const idx = Math.max(-20, Math.min(19, Math.trunc(nice))) + 20;
  return NICE_WEIGHTS[idx];
};

const PALETTE = ["#f44336", "#ba68c8", "#4caf50", "#00bcd4", "#ffb300"];
const getColor = (i: number) => PALETTE[i % PALETTE.length];

/* ---------- Tablica poslova ---------- */
function CfsTable({
  jobs,
  onUpdate,
  onSave,
  onDelete,
  onSetEditable,
}: {
  jobs: CfsJob[];
  onUpdate: (id: string, field: keyof CfsJob, value: number | "") => void;
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
              <Tooltip title="Ukupno posla (u sekundama) koje zadaća treba odraditi.">
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  Duration <InfoOutlinedIcon fontSize="small" color="action" />
                </Box>
              </Tooltip>
            </TableCell>
            <TableCell>
              <Tooltip title="nice: −20 (veći weight)… +19 (manji weight). CFS dijeli CPU proporcionalno težinama.">
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  nice <InfoOutlinedIcon fontSize="small" color="action" />
                </Box>
              </Tooltip>
            </TableCell>
            <TableCell>
              <Tooltip title="Vrijeme dolaska u sustav.">
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

                {/* Duration */}
                <TableCell>
                  {job.editable ? (
                    <TextField
                      size="small"
                      value={job.duration}
                      onChange={(e) =>
                        onUpdate(
                          job.id,
                          "duration",
                          parseNumOrEmpty(e.target.value)
                        )
                      }
                      type="number"
                      inputProps={{ min: 1 }}
                    />
                  ) : (
                    `${job.duration} s`
                  )}
                </TableCell>

                {/* nice */}
                <TableCell>
                  {job.editable ? (
                    <Select
                      size="small"
                      value={job.nice === "" ? 0 : job.nice}
                      onChange={(e) =>
                        onUpdate(job.id, "nice", Number(e.target.value))
                      }
                      sx={{ minWidth: 90 }}
                    >
                      {Array.from({ length: 40 }).map((_, i) => {
                        const val = i - 20;
                        return (
                          <MenuItem key={val} value={val}>
                            {val}
                          </MenuItem>
                        );
                      })}
                    </Select>
                  ) : (
                    <>
                      {job.nice}
                      <Typography
                        variant="caption"
                        sx={{ ml: 1, opacity: 0.7 }}
                      >
                        w=
                        {typeof job.nice === "number"
                          ? weightFromNice(job.nice)
                          : "-"}
                      </Typography>
                    </>
                  )}
                </TableCell>

                {/* Arrival */}
                <TableCell>
                  {job.editable ? (
                    <TextField
                      size="small"
                      value={job.arrivalTime}
                      onChange={(e) =>
                        onUpdate(
                          job.id,
                          "arrivalTime",
                          parseNumOrEmpty(e.target.value)
                        )
                      }
                      type="number"
                      inputProps={{ min: 0 }}
                    />
                  ) : (
                    `${job.arrivalTime} s`
                  )}
                </TableCell>

                {/* Akcije */}
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

/* ---------- Stranica: CFS ---------- */
export default function Cfs() {
  const [jobs, setJobs] = useState<CfsJob[]>([]);
  const [openInfo, setOpenInfo] = useState(false);
  const navigate = useNavigate();

  const handleAddJob = () => {
    setJobs((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: `Posao ${prev.length + 1}`,
        duration: "",
        nice: 0,
        arrivalTime: "",
        color: getColor(prev.length), // stabilna boja
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
        duration: Math.floor(Math.random() * 8) + 3, // 3–10 s
        nice: Math.floor(Math.random() * 15) - 7, // oko 0
        arrivalTime: Math.floor(Math.random() * 6), // 0–5 s
        color: getColor(prev.length),
        editable: false,
      },
    ]);
  };

  const handleSimulate = () => {
    navigate({
      to: "/cfs_sim",
      state: (prev) => ({ ...prev, jobs }),
    });
  };

  return (
    <Box sx={{ ml: "240px", p: 4 }}>
      <Header
        title="CFS"
        onAdd={handleAddJob}
        onSimulate={handleSimulate}
        onGenerate={handleGenerateRandomJob}
        onInfoClick={() => setOpenInfo(true)}
      />

      <CfsTable
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
            Completely Fair Scheduler (CFS)
          </Typography>
          <IconButton onClick={() => setOpenInfo(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent style={{ padding: "10px 40px" }}>
          <Typography gutterBottom>
            CFS uvijek bira zadatak s <strong>najmanjim vruntime</strong>.
            Tijekom 1s rada vruntime se poveća za približno{" "}
            <em>1024 / weight(nice)</em>, pa zadaće s boljim (nižim) niceom
            sporije “stare” i dobivaju veći udio CPU-a.
          </Typography>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
