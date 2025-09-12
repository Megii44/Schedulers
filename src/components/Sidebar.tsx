// src/components/Sidebar.tsx
import {
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
  Box,
} from "@mui/material";
import LayersIcon from "@mui/icons-material/Layers";
import { Link, useRouterState } from "@tanstack/react-router";

const schedulers = [
  { label: "SCHED_FIFO", path: "/sched_fifo" },
  { label: "SCHED_RR", path: "/sched_rr" },
  { label: "SCHED_DEADLINE", path: "/sched_deadline" },
  { label: "SCHED_SPORADIC", path: "/sched_sporadic" },
  { label: "RMPA", path: "/rmpa" },
  { label: "EDF", path: "/edf" },
  { label: "LLF", path: "/llf" },
  { label: "CFS", path: "/cfs" },
];

export default function Sidebar() {
  const { location } = useRouterState();

  return (
    <Drawer
      variant="permanent"
      anchor="left"
      PaperProps={{
        sx: {
          bgcolor: "#ffffff",
          width: 260,
          m: 2,
          borderRadius: "16px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        },
      }}
    >
      <List sx={{ pt: 2 }} style={{ paddingRight: "15px" }}>
        <ListItem>
          <Typography
            variant="h6"
            fontWeight="bold"
            sx={{ pl: 1 }}
            fontFamily="'Nunito Sans', sans-serif"
          >
            Simulator raspoređivača
          </Typography>
        </ListItem>

        {schedulers.map(({ label, path }) => {
          const isActive = location.pathname === path;
          return (
            <ListItem key={label} disablePadding>
              <Box
                component={Link}
                to={path}
                sx={{
                  textDecoration: "none",
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 16px",
                  margin: "4px 12px",
                  borderRadius: "12px",
                  backgroundColor: isActive ? "#e3f2fd" : "transparent",
                  color: isActive ? "#1976d2" : "#424242",
                  position: "relative",
                  transition: "background 0.2s, color 0.2s",
                  "&:hover": {
                    backgroundColor: isActive ? "#e3f2fd" : "#f0f4f8",
                    color: isActive ? "#1976d2" : "#1976d2",
                    textDecoration: "none",
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <LayersIcon
                    sx={{ color: isActive ? "#1976d2" : "#9e9e9e" }}
                  />
                </ListItemIcon>
                <ListItemText
                  primary={label}
                  primaryTypographyProps={{
                    fontWeight: isActive ? "600" : "normal",
                    fontSize: "0.95rem",
                  }}
                />
              </Box>
              {/* PLAVA TRAKA DESNO */}
              {isActive && (
                <Box
                  sx={{
                    position: "absolute",
                    right: 0,
                    marginLeft: "8px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: "4px",
                    height: "75%",
                    bgcolor: "#1976d2",
                    borderRadius: "4px 4px 4px 4px",
                  }}
                />
              )}
            </ListItem>
          );
        })}
      </List>
    </Drawer>
  );
}
