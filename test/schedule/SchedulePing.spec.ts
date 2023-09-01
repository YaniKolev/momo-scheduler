import { anyNumber, instance, mock, verify, when } from 'ts-mockito';

import { SchedulesRepository } from '../../src/repository/SchedulesRepository';
import { SchedulePing } from '../../src/schedule/SchedulePing';
import { sleep } from '../utils/sleep';

describe('SchedulePing', () => {
  const interval = 1000;
  const logData = { name: 'name', scheduleId: 'scheduleId' };
  let error: jest.Mock;

  let schedulesRepository: SchedulesRepository;
  let schedulePing: SchedulePing;
  let startAllJobs: jest.Mock;

  beforeEach(() => {
    startAllJobs = jest.fn();
    schedulesRepository = mock(SchedulesRepository);
    error = jest.fn();
    schedulePing = new SchedulePing(instance(schedulesRepository), { debug: jest.fn(), error }, interval, startAllJobs);
  });

  afterEach(async () => schedulePing.stop());

  it('starts, pings, cleans and stops', async () => {
    when(schedulesRepository.isActiveSchedule(anyNumber())).thenResolve(true);
    when(schedulesRepository.setActiveSchedule(anyNumber())).thenResolve(true);
    await schedulePing.start();

    expect(startAllJobs).toHaveBeenCalledTimes(1);
    verify(schedulesRepository.setActiveSchedule(anyNumber())).once();

    await sleep(1.1 * interval);
    expect(startAllJobs).toHaveBeenCalledTimes(1);
    verify(schedulesRepository.setActiveSchedule(anyNumber())).twice();

    await schedulePing.stop();
    await sleep(interval);

    verify(schedulesRepository.setActiveSchedule(anyNumber())).twice();
    verify(schedulesRepository.deleteOne()).once();
  });

  it('handles mongo errors', async () => {
    when(schedulesRepository.getLogData()).thenReturn(logData);
    when(schedulesRepository.isActiveSchedule(anyNumber())).thenResolve(true);
    const message = 'I am an error that should be caught';
    when(schedulesRepository.setActiveSchedule(anyNumber())).thenReject({
      message,
    } as Error);

    await schedulePing.start();

    verify(schedulesRepository.setActiveSchedule(anyNumber())).once();
    expect(error).toHaveBeenCalledWith(
      'Pinging or cleaning the Schedules repository failed',
      'an internal error occurred',
      logData,
      { message },
    );
  });

  it('does not start any jobs for inactive schedule', async () => {
    when(schedulesRepository.isActiveSchedule(anyNumber())).thenResolve(false);

    await schedulePing.start();

    verify(schedulesRepository.setActiveSchedule(anyNumber())).never();
    expect(startAllJobs).not.toHaveBeenCalled();
  });

  it('does not start any jobs if setting active schedule fails', async () => {
    when(schedulesRepository.isActiveSchedule(anyNumber())).thenResolve(true);
    when(schedulesRepository.setActiveSchedule(anyNumber())).thenResolve(false);

    await schedulePing.start();

    verify(schedulesRepository.setActiveSchedule(anyNumber())).once();
    expect(startAllJobs).not.toHaveBeenCalled();
  });

  it('becomes active when other schedule dies', async () => {
    when(schedulesRepository.isActiveSchedule(anyNumber())).thenResolve(false);

    await schedulePing.start();

    verify(schedulesRepository.setActiveSchedule(anyNumber())).never();
    expect(startAllJobs).toHaveBeenCalledTimes(0);

    // other schedule dies, this one becomes active
    when(schedulesRepository.isActiveSchedule(anyNumber())).thenResolve(true);
    when(schedulesRepository.setActiveSchedule(anyNumber())).thenResolve(true);

    await sleep(1.1 * interval);
    verify(schedulesRepository.setActiveSchedule(anyNumber())).once();
    expect(startAllJobs).toHaveBeenCalledTimes(1);
  });

  it('handles job start taking longer than interval', async () => {
    startAllJobs.mockImplementation(async () => sleep(2 * interval));
    when(schedulesRepository.isActiveSchedule(anyNumber())).thenResolve(true);
    when(schedulesRepository.setActiveSchedule(anyNumber())).thenResolve(true);

    await schedulePing.start();
    verify(schedulesRepository.setActiveSchedule(anyNumber())).once();
    expect(startAllJobs).toHaveBeenCalledTimes(1);

    await sleep(1.1 * interval);
    verify(schedulesRepository.setActiveSchedule(anyNumber())).twice();
    expect(startAllJobs).toHaveBeenCalledTimes(1);

    await schedulePing.stop();

    await sleep(interval);
    verify(schedulesRepository.setActiveSchedule(anyNumber())).twice();
    expect(startAllJobs).toHaveBeenCalledTimes(1);
    verify(schedulesRepository.deleteOne()).once();
  });
});
