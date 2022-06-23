import { Handler, MomoJob } from './MomoJob';

export class MomoJobBuilder {
  private momoJob: Partial<MomoJob> = {};

  withName(name: string): this {
    this.momoJob.name = name;
    return this;
  }

  withInterval(interval: string): this {
    this.momoJob.interval = interval;
    return this;
  }

  withCronSchedule(cronSchedule: string): this {
    this.momoJob.cronSchedule = cronSchedule;
    return this;
  }

  withFirstRunAfter(firstRunAfter: number): this {
    this.momoJob.firstRunAfter = firstRunAfter;
    return this;
  }

  withConcurrency(concurrency: number): this {
    this.momoJob.concurrency = concurrency;
    return this;
  }

  withMaxRunning(maxRunning: number): this {
    this.momoJob.maxRunning = maxRunning;
    return this;
  }

  withHandler(handler: Handler): this {
    this.momoJob.handler = handler;
    return this;
  }

  build(): MomoJob {
    if (this.momoJob.name === undefined) {
      throw Error('Error: Job must have a specified name');
    }

    if (this.momoJob.interval === undefined && this.momoJob.cronSchedule === undefined) {
      throw Error('Error: Job must have either a specified interval or a cron schedule');
    }

    if (this.momoJob.interval !== undefined && this.momoJob.cronSchedule !== undefined) {
      throw Error('Error: Job cannot have both an interval and a cron schedule');
    }

    if (this.momoJob.handler === undefined) {
      throw Error('Error: Job must have a specified handler');
    }

    return this.momoJob as MomoJob;
  }
}
