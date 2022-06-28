import { parseExpression } from 'cron-parser';
import { CronJob } from 'cron';
import { DateTime } from 'luxon';
import { CronSchedule } from '../job/MomoJob';
import { ExecutableSchedule, NextExecutionTime } from './ExecutableSchedule';
import { momoError } from '../logging/error/MomoError';

export class ExecutableCronSchedule implements ExecutableSchedule<CronSchedule> {
  private readonly cronSchedule: string;
  private scheduledJob?: CronJob;

  constructor({ cronSchedule }: CronSchedule) {
    this.cronSchedule = cronSchedule;
  }

  toObject(): CronSchedule {
    return { cronSchedule: this.cronSchedule };
  }

  execute(callback: () => Promise<void>): NextExecutionTime {
    this.validateCronSchedule();

    this.scheduledJob = new CronJob(this.cronSchedule, callback);
    this.scheduledJob.start();

    return { date: DateTime.fromMillis(this.scheduledJob.nextDate().toMillis()) };
  }

  stop(): void {
    if (this.scheduledJob !== undefined) {
      this.scheduledJob.stop();
      this.scheduledJob = undefined;
    }
  }

  isStarted(): boolean {
    return this.scheduledJob !== undefined;
  }

  private validateCronSchedule(): void {
    try {
      parseExpression(this.cronSchedule);
    } catch {
      // the cron schedule was already validated when the job was defined
      throw momoError.nonParsableCronSchedule;
    }
  }
}
