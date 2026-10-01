import type { ClockPort } from '../../modules/affiliate-research/application/ports/out/research-ports.js';

export class SystemClock implements ClockPort {
  now(): Date {
    return new Date();
  }
}
