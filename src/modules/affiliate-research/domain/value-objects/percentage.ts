import { decimalToUnits } from './decimal.js';

export class Percentage {
  private constructor(readonly value: string) {}
  static create(value: string): Percentage {
    decimalToUnits(value, 4);
    if (decimalToUnits(value, 4) <= 0n || decimalToUnits(value, 4) > 1_000_000n) {
      throw new Error('Percentage must be greater than zero and at most 100');
    }
    return new Percentage(value);
  }
}
