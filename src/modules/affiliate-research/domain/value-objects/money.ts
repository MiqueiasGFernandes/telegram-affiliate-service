import { decimalToUnits } from './decimal.js';

export class Money {
  private constructor(
    readonly amount: string,
    readonly currency: string,
  ) {}
  static create(amount: string, currency: string): Money {
    decimalToUnits(amount, 2);
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Currency must be ISO 4217');
    return new Money(amount, currency);
  }
}
