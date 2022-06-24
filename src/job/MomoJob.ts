export type Handler = () => Promise<string | undefined | void> | string | undefined | void;

export interface MomoJob {
  handler: Handler;
  name: string;
  schedule: Interval | CronSchedule;
  concurrency?: number;
  maxRunning?: number;
}

export interface Interval {
  interval: string;
  firstRunAfter: number;
}

export interface CronSchedule {
  cronSchedule: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isInterval(input: any): input is Interval {
  return (
    input.interval !== undefined &&
    input.firstRunAfter !== undefined &&
    typeof input.interval == 'string' &&
    typeof input.firstRunAfter == 'number'
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isCronSchedule(input: any): input is CronSchedule {
  return input.cronSchedule !== undefined && typeof input.cronSchedule == 'string';
}
