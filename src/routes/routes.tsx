import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import App from "../App";

// Komponente za pojedinačne raspoređivače
import SchedFifo from "./sched_fifo";
import SchedDeadline from "./sched_deadline";
import SchedSporadic from "./sched_sporadic";
import Edf from "./edf";
import Llf from "./llf";
import Rmpa from "./rmpa";
import Cfs from "./cfs";
import SchedFifoSim from "./sched_fifo_sim";
import SchedDeadlineSim from "./sched_deadline_sim";
import SchedSporadicSim from "./sched_sporadic_sim";
import RmpaSim from "./rmpa_sim";
import EdfSim from "./edf_sim";
import LlfSim from "./llf_sim";
import CfsSim from "./cfs_sim";

// Root layout (App.tsx sadrži Sidebar i Outlet)
const rootRoute = createRootRoute({
  component: App,
});

// Pojedinačne rute za algoritme
const schedFifoRoute = createRoute({
  path: "/sched_fifo",
  getParentRoute: () => rootRoute,
  component: SchedFifo,
});

const schedDeadlineRoute = createRoute({
  path: "/sched_deadline",
  getParentRoute: () => rootRoute,
  component: SchedDeadline,
});

const schedSporadicRoute = createRoute({
  path: "/sched_sporadic",
  getParentRoute: () => rootRoute,
  component: SchedSporadic,
});

const edfRoute = createRoute({
  path: "/edf",
  getParentRoute: () => rootRoute,
  component: Edf,
});

const llfRoute = createRoute({
  path: "/llf",
  getParentRoute: () => rootRoute,
  component: Llf,
});

const rmpaRoute = createRoute({
  path: "/rmpa",
  getParentRoute: () => rootRoute,
  component: Rmpa,
});

const cfsRoute = createRoute({
  path: "/cfs",
  getParentRoute: () => rootRoute,
  component: Cfs,
});

const schedFifoSimRoute = createRoute({
  path: "/sched_fifo_sim",
  getParentRoute: () => rootRoute,
  component: SchedFifoSim,
});

const schedDeadlineSimRoute = createRoute({
  path: "/sched_deadline_sim",
  getParentRoute: () => rootRoute,
  component: SchedDeadlineSim,
});

const schedSporadicSimRoute = createRoute({
  path: "/sched_sporadic_sim",
  getParentRoute: () => rootRoute,
  component: SchedSporadicSim,
});

const rmpaSimRoute = createRoute({
  path: "/rmpa_sim",
  getParentRoute: () => rootRoute,
  component: RmpaSim,
});

const edfSimRoute = createRoute({
  path: "/edf_sim",
  getParentRoute: () => rootRoute,
  component: EdfSim,
});

const llfSimRoute = createRoute({
  path: "/llf_sim",
  getParentRoute: () => rootRoute,
  component: LlfSim,
});

const cfsSimRoute = createRoute({
  path: "/cfs_sim",
  getParentRoute: () => rootRoute,
  component: CfsSim,
});

// Početna ruta – redirekcija na FIFO (možeš promeniti ako želiš drugi default)
const indexRoute = createRoute({
  path: "/",
  getParentRoute: () => rootRoute,
  component: () => {
    window.location.href = "/sched_fifo";
    return null;
  },
});

// Router stablo
const routeTree = rootRoute.addChildren([
  indexRoute,
  schedFifoRoute,
  schedFifoSimRoute,
  schedDeadlineRoute,
  schedDeadlineSimRoute,
  schedSporadicRoute,
  schedSporadicSimRoute,
  edfRoute,
  edfSimRoute,
  llfRoute,
  llfSimRoute,
  rmpaRoute,
  rmpaSimRoute,
  cfsRoute,
  cfsSimRoute,
]);

export const router = createRouter({ routeTree });

// Potrebno za tipove
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
