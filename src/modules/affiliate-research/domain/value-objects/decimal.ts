export function decimalToUnits(value: string, scale = 2): bigint {
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(value)) throw new Error('Invalid decimal');
  const [whole = '0', fraction = ''] = value.split('.');
  if (fraction.length > scale)
    throw new Error(`Decimal supports at most ${scale} fractional digits`);
  return (
    BigInt(whole) * 10n ** BigInt(scale) +
    BigInt((fraction + '0'.repeat(scale)).slice(0, scale) || '0')
  );
}

export function formatUnits(value: bigint, scale = 2): string {
  const factor = 10n ** BigInt(scale);
  const whole = value / factor;
  const fraction = (value % factor).toString().padStart(scale, '0');
  return `${whole}.${fraction}`;
}

export function compareDecimal(left: string, right: string, scale = 4): number {
  const a = decimalToUnits(left, scale);
  const b = decimalToUnits(right, scale);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function discountPercent(original: string, discounted: string): string {
  const originalCents = decimalToUnits(original, 2);
  const discountedCents = decimalToUnits(discounted, 2);
  if (originalCents <= 0n || discountedCents < 0n) throw new Error('Invalid prices');
  const percentTenThousandths =
    ((originalCents - discountedCents) * 1_000_000n + originalCents / 2n) / originalCents;
  return formatUnits(percentTenThousandths, 4);
}

export function commissionAmount(price: string, percent: string): string {
  const cents = decimalToUnits(price, 2);
  const percentUnits = decimalToUnits(percent, 4);
  return formatUnits((cents * percentUnits + 500_000n) / 1_000_000n, 2);
}
