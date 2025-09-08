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
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";

type Job = {
  id: string;
  name: string;
  priority: number | "";
  duration: number | "";
  arrivalTime: number | "";
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
                <TableCell>
                  {job.editable ? (
                    <TextField
                      size="small"
                      value={job.priority}
                      onChange={(e) =>
                        onUpdate(job.id, "priority", parseInt(e.target.value))
                      }
                    />
                  ) : (
                    job.priority
                  )}
                </TableCell>
                <TableCell>
                  {job.editable ? (
                    <TextField
                      size="small"
                      value={job.duration}
                      onChange={(e) =>
                        onUpdate(job.id, "duration", parseInt(e.target.value))
                      }
                    />
                  ) : (
                    `${job.duration} sekundi`
                  )}
                </TableCell>
                <TableCell>
                  {job.editable ? (
                    <TextField
                      size="small"
                      value={job.arrivalTime}
                      onChange={(e) =>
                        onUpdate(
                          job.id,
                          "arrivalTime",
                          parseInt(e.target.value)
                        )
                      }
                    />
                  ) : (
                    `${job.arrivalTime}. sekunda`
                  )}
                </TableCell>
                <TableCell>
                  {job.editable ? (
                    <IconButton color="success" onClick={() => onSave(job.id)}>
                      <SaveIcon />
                    </IconButton>
                  ) : (
                    <>
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
