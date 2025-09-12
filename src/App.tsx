import { Outlet, useLocation } from "@tanstack/react-router";
import Sidebar from "./components/Sidebar";
import { Box } from "@mui/material";

export default function App() {
  const location = useLocation();
  const hideSidebar =
    location.pathname === "/sched_fifo_sim" ||
    location.pathname === "/sched_deadline_sim" ||
    location.pathname === "/sched_sporadic_sim" ||
    location.pathname === "/rmpa_sim" ||
    location.pathname === "/edf_sim" ||
    location.pathname === "/llf_sim" ||
    location.pathname === "/cfs_sim" ||
    location.pathname === "/sched_rr_sim";

  return (
    <Box
      sx={{
        display: "flex",
        backgroundColor: "#f1f8fe",
        minHeight: "100vh",
        width: "100vw",
        overflowX: "hidden",
      }}
    >
      {!hideSidebar && <Sidebar />}
      <Box flex={1} sx={{ p: 4 }}>
        <Outlet />
      </Box>
    </Box>
  );
}
