import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';

import { ObjectId } from 'mongodb';
import { ExecutionsRepository } from '../../src/repository/ExecutionsRepository';
import { JobDefinition, toJobDefinition } from '../../src/job/Job';
import { JobExecutor } from '../../src/executor/JobExecutor';
import { JobRepository } from '../../src/repository/JobRepository';
import { JobScheduler } from '../../src/scheduler/JobScheduler';
import { MomoErrorType, momoError } from '../../src';
import { loggerForTests } from '../utils/logging';
import { sleep } from '../utils/sleep';

describe('JobScheduler', () => {
  const defaultJob: JobDefinition = {
    name: 'test',
    schedule: { interval: '1 second', firstRunAfter: 1000 },
    concurrency: 1,
    maxRunning: 0,
  };
  const errorFn = jest.fn();
  const scheduleId = '123';

  let executionsRepository: ExecutionsRepository;
  let jobRepository: JobRepository;
  let jobExecutor: JobExecutor;
  let jobScheduler: JobScheduler;

  beforeEach(() => {
    executionsRepository = mock(ExecutionsRepository);
    jobRepository = mock(JobRepository);
    jobExecutor = mock(JobExecutor);
    when(jobExecutor.execute(anything())).thenResolve();
  });

  afterEach(async () => {
    await jobScheduler.stop();
  });

  function createJob(partialJob: Partial<JobDefinition> = {}): JobDefinition {
    const job = { ...defaultJob, ...partialJob };
    jobScheduler = new JobScheduler(
      job.name,
      instance(jobExecutor),
      scheduleId,
      instance(executionsRepository),
      instance(jobRepository),
      loggerForTests(errorFn)
    );
    when(jobRepository.findOne(deepEqual({ name: job.name }))).thenResolve({
      ...toJobDefinition(job),
      _id: new ObjectId(),
    });
    when(executionsRepository.countRunningExecutions(job.name)).thenResolve(0);
    return job;
  }

  describe('single interval job', () => {
    it('executes a job', async () => {
      createJob();
      await jobScheduler.start();

      await sleep(1100);
      verify(await jobExecutor.execute(anything())).once();
    });

    it('executes a job with firstRunAfter=0 immediately', async () => {
      createJob({ schedule: { interval: '1 second', firstRunAfter: 0 } });

      await jobScheduler.start();

      await sleep(100);
      verify(await jobExecutor.execute(anything())).once();
    });

    it('stops a job', async () => {
      createJob();
      await jobScheduler.start();

      await sleep(1100);
      verify(await jobExecutor.execute(anything())).once();

      await jobScheduler.stop();

      await sleep(1100);
      verify(await jobExecutor.execute(anything())).once();
    });

    it('returns job description', async () => {
      const job = createJob();

      const jobDescription = await jobScheduler.getJobDescription();
      expect(jobDescription).toEqual({
        name: job.name,
        schedule: {
          firstRunAfter: 1000,
          interval: '1 second',
        },
        concurrency: job.concurrency,
        maxRunning: job.maxRunning,
      });
    });

    it('returns job description for started job', async () => {
      const job = createJob();
      await jobScheduler.start();

      const jobDescription = await jobScheduler.getJobDescription();
      expect(jobDescription).toEqual({
        name: job.name,
        concurrency: job.concurrency,
        maxRunning: job.maxRunning,
        schedule: {
          firstRunAfter: 1000,
          interval: '1 second',
        },
        schedulerStatus: { schedule: job.schedule, running: 0 },
      });
    });
  });

  describe('single cron scheduler job', () => {
    function createCronScheduleJob(): JobDefinition {
      return createJob({ schedule: { cronSchedule: '*/1 * * * * *' } });
    }

    it('executes a job', async () => {
      createCronScheduleJob();
      await jobScheduler.start();

      await sleep(1000);
      verify(await jobExecutor.execute(anything())).once();
    });

    it('stops a job', async () => {
      createCronScheduleJob();
      await jobScheduler.start();

      await sleep(1000);
      verify(await jobExecutor.execute(anything())).once();

      await jobScheduler.stop();

      await sleep(1000);
      verify(await jobExecutor.execute(anything())).once();
    });

    it('returns job description', async () => {
      const job = createCronScheduleJob();

      const jobDescription = await jobScheduler.getJobDescription();
      expect(jobDescription).toEqual({
        name: job.name,
        concurrency: job.concurrency,
        maxRunning: job.maxRunning,
        schedule: { cronSchedule: '*/1 * * * * *' },
      });
    });

    it('returns job description for started job', async () => {
      const job = createCronScheduleJob();
      await jobScheduler.start();

      const jobDescription = await jobScheduler.getJobDescription();
      expect(jobDescription).toEqual({
        name: job.name,
        concurrency: job.concurrency,
        maxRunning: job.maxRunning,
        schedule: { cronSchedule: '*/1 * * * * *' },
        schedulerStatus: { schedule: job.schedule, running: 0 },
      });
    });
  });

  describe('error cases', () => {
    it('throws on non-parsable interval', async () => {
      createJob({ schedule: { interval: 'not an interval', firstRunAfter: 0 } });

      await expect(async () => jobScheduler.start()).rejects.toThrow(momoError.nonParsableInterval);
    });

    it('throws on non-parsable cron schedule', async () => {
      createJob({ schedule: { cronSchedule: 'not a valid cron string' } });

      await expect(async () => jobScheduler.start()).rejects.toThrow(momoError.nonParsableCronSchedule);
    });

    it('reports error when job was removed before scheduling', async () => {
      const job = createJob();
      when(jobRepository.findOne(deepEqual({ name: job.name }))).thenResolve(undefined);

      await jobScheduler.start();

      expect(errorFn).toHaveBeenCalledWith(
        'cannot schedule job',
        MomoErrorType.scheduleJob,
        { name: job.name },
        momoError.jobNotFound
      );
    });

    it('reports unexpected error with mongo', async () => {
      const job = createJob();
      await jobScheduler.start();

      const error = new Error('something unexpected happened');
      when(jobRepository.findOne(deepEqual({ name: job.name }))).thenThrow(error);

      await sleep(1100);

      expect(errorFn).toHaveBeenCalledWith(
        'an unexpected error occurred while executing job',
        MomoErrorType.executeJob,
        { name: job.name },
        error
      );

      expect(jobScheduler.getUnexpectedErrorCount()).toBe(1);
    });
  });

  describe('concurrent job', () => {
    it('executes job thrice', async () => {
      createJob({ concurrency: 3, maxRunning: 3 });
      await jobScheduler.start();

      await sleep(1100);
      verify(await jobExecutor.execute(anything())).thrice();
    });

    it('executes job when no maxRunning is set', async () => {
      const job = createJob({ maxRunning: 0, concurrency: 3 });
      await jobScheduler.start();

      await sleep(2100);
      verify(await jobExecutor.execute(anything())).times(2 * job.concurrency);
    });

    it('executes job only twice if it is already running', async () => {
      const job = createJob({ concurrency: 3, maxRunning: 3 });
      when(executionsRepository.countRunningExecutions(job.name)).thenResolve(1);

      await jobScheduler.start();

      await sleep(1100);
      verify(await jobExecutor.execute(anything())).twice();
    });
  });
});
