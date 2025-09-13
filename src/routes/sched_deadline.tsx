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
  priority: number; // OVDJE: rok D (relativno od dolaska), >= 0
  duration: number; // C >= 0
  arrivalTime: number; // r >= 0
  editable: boolean;
};

// Pretvori bilo koji unos u nenegativan cijeli broj; nevaljano -> 0
const toNonNegativeInt = (v: unknown): number => {
  if (v === "" || v == null) return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
};

// “Prioritet” stupac koristimo kao rok D (dopuštam i "#5")
const parseDeadline = (v: unknown): number => {
  if (v === "" || v == null) return 0;
  const s = String(v).trim();
  const m = s.match(/^#?\s*([0-9]+)$/);
  if (!m) return 0;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
};

export default function SchedDeadline() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [openInfo, setOpenInfo] = useState(false);
  const navigate = useNavigate();

  const handleAddJob = () => {
    setJobs((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: `Posao ${prev.length + 1}`,
        priority: 0, // D (relativni rok)
        duration: 0, // C
        arrivalTime: 0, // r
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
        // D ~ 2..12s od dolaska, C ~ 1..8s, r ~ 0..10s
        priority: Math.floor(Math.random() * 11) + 2,
        duration: Math.floor(Math.random() * 8) + 1,
        arrivalTime: Math.floor(Math.random() * 11),
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

      <JobTable
        jobs={jobs}
        onUpdate={(id, field, value) =>
          setJobs((prev) =>
            prev.map((job) => {
              if (job.id !== id) return job;

              if (field === "priority") {
                // Ovdje “priority” = rok D (relativno)
                return { ...job, priority: parseDeadline(value) };
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
                    priority: parseDeadline(job.priority),
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
            SCHED_DEADLINE (EDF)
          </Typography>
          <IconButton onClick={() => setOpenInfo(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent style={{ padding: "10px 40px" }}>
          <Typography gutterBottom>
            Ovdje simuliramo <strong>Earliest-Deadline-First</strong> s
            preotimanjem. U svakom trenutku CPU dobivaju poslovi s{" "}
            <em>najranijim apsolutnim rokom</em>. Ako stigne posao s ranijim
            rokom, preuzima CPU od posla s kasnijim rokom.
          </Typography>
          <Typography variant="subtitle2" gutterBottom>
            <strong>Napomena:</strong> u tablici polje <em>Prioritet</em>{" "}
            tumačimo kao <strong>rok D</strong> izražen u sekundama{" "}
            <u>relativno na dolazak</u> (apsolutni rok je{" "}
            <code>arrivalTime + D</code>).
          </Typography>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
