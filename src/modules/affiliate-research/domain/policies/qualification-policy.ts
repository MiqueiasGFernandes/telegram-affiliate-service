import { compareDecimal } from '../value-objects/decimal.js';

export interface QualificationPolicyInput {
  readonly currency: string;
  readonly lowTicketMin: string;
  readonly lowTicketMax: string;
  readonly mediumTicketMin: string;
  readonly mediumTicketMax: string;
  readonly minimumDiscountPercent: string;
  readonly categoryIds: readonly string[];
  readonly fingerprint: string;
}

export class QualificationPolicy {
  private constructor(readonly value: QualificationPolicyInput) {}

  static create(input: QualificationPolicyInput): QualificationPolicy {
    if (compareDecimal(input.lowTicketMin, input.lowTicketMax) > 0)
      throw new Error('Invalid low ticket range');
    if (compareDecimal(input.mediumTicketMin, input.lowTicketMax) <= 0)
      throw new Error('Ticket ranges overlap');
    if (compareDecimal(input.mediumTicketMin, input.mediumTicketMax) > 0)
      throw new Error('Invalid medium ticket range');
    if (
      compareDecimal(input.minimumDiscountPercent, '0') <= 0 ||
      compareDecimal(input.minimumDiscountPercent, '100') > 0
    )
      throw new Error('Invalid minimum discount');
    if (
      input.categoryIds.length < 1 ||
      input.categoryIds.length > 10 ||
      new Set(input.categoryIds).size !== input.categoryIds.length
    )
      throw new Error('Expected one to ten unique categories');
    if (!/^[A-Z]{3}$/.test(input.currency) || !/^[a-f0-9]{64}$/.test(input.fingerprint))
      throw new Error('Invalid currency or fingerprint');
    return new QualificationPolicy(
      Object.freeze({ ...input, categoryIds: Object.freeze([...input.categoryIds]) }),
    );
  }
}
