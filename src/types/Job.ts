// types/Job.ts
export type Job = {
  id: string;
  name: string;
  priority: number | "";
  duration: number | "";
  arrivalTime: number | "";
  deadline?: number | ""; // samo za algoritme koji koriste deadline
  editable?: boolean;
};
