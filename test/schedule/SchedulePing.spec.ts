import { deepEqual, instance, mock, verify, when } from 'ts-mockito';

import { ExecutionsRepository } from '../../src/repository/ExecutionsRepository';
import { SchedulePing } from '../../src/schedule/SchedulePing';
import { sleep } from '../utils/sleep';

describe('SchedulePing', () => {
  const scheduleId = '123';
  const interval = 1000;
  let error: jest.Mock;

  let executionsRepository: ExecutionsRepository;
  let schedulePing: SchedulePing;

  beforeEach(() => {
    executionsRepository = mock(ExecutionsRepository);
    error = jest.fn();
    schedulePing = new SchedulePing(scheduleId, instance(executionsRepository), { debug: jest.fn(), error }, interval);
  });

  it('starts, pings, cleans and stops', async () => {
    try {
      schedulePing.start();
      await sleep(interval);

      verify(executionsRepository.ping(scheduleId)).once();
      verify(executionsRepository.clean()).once();

      await schedulePing.stop();
      await sleep(interval);

      verify(executionsRepository.ping(scheduleId)).once();
      verify(executionsRepository.deleteOne(deepEqual({ scheduleId }))).once();
    } finally {
      await schedulePing.stop();
    }
  });

  it('handles mongo errors', async () => {
    try {
      when(executionsRepository.ping(scheduleId)).thenReject({
        message: 'I am an error that should be caught',
      } as Error);

      schedulePing.start();
      await sleep(interval);

      verify(executionsRepository.ping(scheduleId)).once();
      expect(error).toHaveBeenCalledWith(
        'Pinging or cleaning the Executions repository failed',
        'an internal error occurred',
        {},
        { message: 'I am an error that should be caught' }
      );
    } finally {
      await schedulePing.stop();
    }
  });
});
