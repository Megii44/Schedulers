// src/components/Header.tsx
import { Stack, Typography, IconButton, Button, Box } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import AddIcon from "@mui/icons-material/Add";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ShuffleIcon from "@mui/icons-material/Shuffle";

interface HeaderProps {
  title: string;
  onAdd: () => void;
  onSimulate: () => void;
  onGenerate: () => void;
  onInfoClick?: () => void;
}

export default function Header({
  title,
  onAdd,
  onSimulate,
  onGenerate,
  onInfoClick,
}: HeaderProps) {
  return (
    <Box mb={3}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h5" fontWeight="bold">
            {title}
          </Typography>
          <IconButton size="small" color="primary" onClick={onInfoClick}>
            <InfoOutlinedIcon fontSize="small" />
          </IconButton>
        </Stack>

        <Stack direction="row" spacing={2}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={onAdd}
            style={{ backgroundColor: "#3F8CFF", color: "white" }}
            sx={{ borderRadius: 2, boxShadow: 2 }}
          >
            Dodaj novi posao
          </Button>
          <Button
            variant="contained"
            onClick={onSimulate}
            startIcon={<PlayArrowIcon />}
            sx={{
              backgroundColor: "#6c63ff",
              color: "white",
              "&:hover": { backgroundColor: "#5a52d4" },
              borderRadius: 2,
              boxShadow: 2,
            }}
          >
            Pokreni simulaciju
          </Button>
        </Stack>
      </Stack>

      <Box mt={2}>
        <Button
          variant="text"
          startIcon={<ShuffleIcon />}
          onClick={onGenerate}
          sx={{ textTransform: "none", color: "#1976d2" }}
        >
          Generiraj posao nasumično
        </Button>
      </Box>
    </Box>
  );
}
