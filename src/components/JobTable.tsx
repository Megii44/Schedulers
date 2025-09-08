// src/components/JobTable.tsx
import {
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Box,
  IconButton,
  TextField,
  Chip,
  Tooltip,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";

type Job = {
  id: string;
  name: string;
  priority: number; // držimo kao broj (parent osigurava >= 0)
  duration: number; // broj >= 0
  arrivalTime: number; // broj >= 0
  editable: boolean;
};

interface JobTableProps {
  jobs: Job[];
  onUpdate: (id: string, field: keyof Job, value: any) => void;
  onSave: (id: string) => void;
  onDelete: (id: string) => void;
  onSetEditable: (id: string, editable: boolean) => void;
}

const getColor = (index: number) => {
  const colors = ["#2196f3", "#4caf50", "#f44336", "#ff9800", "#ba68c8"];
  return colors[index % colors.length];
};

export default function JobTable({
  jobs,
  onUpdate,
  onSave,
  onDelete,
  onSetEditable,
}: JobTableProps) {
  return (
    <Paper>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Posao</TableCell>
            <TableCell>Prioritet</TableCell>
            <TableCell>Trajanje</TableCell>
            <TableCell>Trenutak pojave</TableCell>
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
            jobs.map((job, index) => (
              <TableRow key={job.id}>
                {/* Naziv posla kao obojani badge */}
                <TableCell>
                  <Box
                    px={2}
                    py={0.5}
                    borderRadius="12px"
                    fontWeight="bold"
                    color="white"
                    sx={{
                      backgroundColor: getColor(index),
                      display: "inline-block",
                      boxShadow: 2,
                    }}
                  >
                    {job.name}
                  </Box>
                </TableCell>

                {/* Prioritet: Chip u view modu; TextField s # u edit modu */}
                <TableCell>
                  {job.editable ? (
                    <TextField
                      size="small"
                      placeholder="#5"
                      style={{
                        paddingLeft: 2,
                        paddingTop: 2,
                        paddingBottom: 2,
                        paddingRight: 2,
                      }}
                      value={job.priority > 0 ? `# ${job.priority}` : ""}
                      onChange={(e) =>
                        // parent (SchedFifo) radi parsePriority, tu samo šaljemo sirovi input
                        onUpdate(job.id, "priority", e.target.value)
                      }
                      inputProps={{ inputMode: "numeric", pattern: "#?[0-9]*" }}
                    />
                  ) : (
                    <Chip
                      style={{
                        paddingLeft: 2,
                        paddingTop: 2,
                        paddingBottom: 2,
                        paddingRight: 2,
                      }}
                      size="small"
                      color="primary"
                      label={job.priority > 0 ? `# ${job.priority}` : "-"}
                    />
                  )}
                </TableCell>

                {/* Trajanje */}
                <TableCell>
                  {job.editable ? (
                    <TextField
                      size="small"
                      type="number"
                      inputProps={{ min: 0, step: 1 }}
                      value={Number.isFinite(job.duration) ? job.duration : 0}
                      onChange={(e) =>
                        // bez parseInt ovdje; parent će normalizirati u nenegativan int
                        onUpdate(job.id, "duration", e.target.value)
                      }
                    />
                  ) : (
                    `${job.duration} sekundi`
                  )}
                </TableCell>

                {/* Trenutak pojave */}
                <TableCell>
                  {job.editable ? (
                    <TextField
                      size="small"
                      type="number"
                      inputProps={{ min: 0, step: 1 }}
                      value={
                        Number.isFinite(job.arrivalTime) ? job.arrivalTime : 0
                      }
                      onChange={(e) =>
                        onUpdate(job.id, "arrivalTime", e.target.value)
                      }
                    />
                  ) : (
                    `${job.arrivalTime}. sekunda`
                  )}
                </TableCell>

                {/* Akcije */}
                <TableCell>
                  {job.editable ? (
                    <Tooltip title="Spremi">
                      <IconButton
                        color="success"
                        onClick={() => onSave(job.id)}
                      >
                        <SaveIcon />
                      </IconButton>
                    </Tooltip>
                  ) : (
                    <>
                      <Tooltip title="Uredi">
                        <IconButton
                          color="warning"
                          onClick={() => onSetEditable(job.id, true)}
                        >
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Obriši">
                        <IconButton
                          color="error"
                          onClick={() => onDelete(job.id)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </>
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
