import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useState } from "react";
import Header from "../components/Header";
import JobTable from "../components/JobTable";
import { useNavigate } from "@tanstack/react-router";

type Job = {
  id: string;
  name: string;
  priority: number; // uvijek broj >= 0
  duration: number; // uvijek broj >= 0
  arrivalTime: number; // uvijek broj >= 0
  editable: boolean;
};

// Pretvori bilo koji unos u nenegativan cijeli broj; nevaljano -> 0
const toNonNegativeInt = (v: unknown): number => {
  if (v === "" || v == null) return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
};

// Priority: dozvoli "#5" ili "5", sve ostalo -> 0
const parsePriority = (v: unknown): number => {
  if (v === "" || v == null) return 0;
  const s = String(v).trim();
  const m = s.match(/^#?\s*([0-9]+)$/);
  if (!m) return 0;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
};

export default function SchedFifo() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [openInfo, setOpenInfo] = useState(false);

  const navigate = useNavigate();

  const handleAddJob = () => {
    setJobs((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: `Posao ${prev.length + 1}`,
        priority: 0,
        duration: 0,
        arrivalTime: 0,
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
        priority: Math.floor(Math.random() * 10) + 1,
        duration: Math.floor(Math.random() * 10) + 1,
        arrivalTime: Math.floor(Math.random() * 10),
        editable: false,
      },
    ]);
  };

  const handleSimulate = () => {
    navigate({
      to: "/sched_fifo_sim",
      state: (prev) => ({ ...prev, jobs }),
    });
  };

  return (
    <Box sx={{ ml: "240px", p: 4 }}>
      <Header
        title="SCHED_FIFO"
        onAdd={handleAddJob}
        onSimulate={handleSimulate}
        onGenerate={handleGenerateRandomJob}
        onInfoClick={() => setOpenInfo(true)}
      />

      <JobTable
        jobs={jobs}
        onUpdate={(id, field, value) =>
          setJobs((prev) =>
            prev.map((job) => {
              if (job.id !== id) return job;

              if (field === "priority") {
                return { ...job, priority: parsePriority(value) };
              }
              if (field === "duration") {
                return { ...job, duration: toNonNegativeInt(value) };
              }
              if (field === "arrivalTime") {
                return { ...job, arrivalTime: toNonNegativeInt(value) };
              }

              return { ...job, [field]: value as any };
            })
          )
        }
        onSave={(id) =>
          setJobs((prev) =>
            prev.map((job) =>
              job.id === id
                ? {
                    ...job,
                    priority: parsePriority(job.priority),
                    duration: toNonNegativeInt(job.duration),
                    arrivalTime: toNonNegativeInt(job.arrivalTime),
                    editable: false,
                  }
                : job
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
            SCHED_FIFO
          </Typography>
          <IconButton onClick={() => setOpenInfo(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent style={{ padding: "10px 40px" }}>
          <Typography gutterBottom>
            <strong>SCHED_FIFO</strong> poslužuje prema{" "}
            <strong>prioritetu</strong>, a zatim po{" "}
            <strong>redu prispijeća</strong>. Posao se izvršava sve dok ne
            završi ili dok ga ne prekine zadatak s višim prioritetom.
          </Typography>
          <Typography variant="subtitle2" gutterBottom>
            <strong>Primjer:</strong>
            <br />
            <span style={{ color: "#f44336" }}>P1</span> (prioritet 2, dolazi u
            0s, traje 4s)
            <br />
            <span style={{ color: "#2196f3" }}>P2</span> (prioritet 1, dolazi u
            1s, traje 3s)
            <br />
            <span style={{ color: "#4caf50" }}>P3</span> (prioritet 2, dolazi u
            4s, traje 2s)
          </Typography>
          <Typography gutterBottom>
            <ol>
              <li>P1 započinje u 0s</li>
              <li>P2 dolazi u 1s i prekida P1 jer ima viši prioritet</li>
              <li>P2 završava, P1 nastavlja</li>
              <li>
                P3 čeka dok P1 ne završi (isti prioritet, kasniji dolazak)
              </li>
            </ol>
          </Typography>
          <Box mt={2}>
            <img
              src="/images/SCHED_FIFO.png"
              alt="SCHED_FIFO"
              style={{ maxWidth: "100%", borderRadius: 8 }}
            />
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
