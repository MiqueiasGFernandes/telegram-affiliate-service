export class CategoryId {
  private constructor(readonly value: string) {}
  static create(value: string): CategoryId {
    if (!/^MLB\d+$/.test(value)) throw new Error('Category ID must be an MLB identifier');
    return new CategoryId(value);
  }
}

export class OfferKey {
  private constructor(readonly value: string) {}
  static create(productId: string, variationId?: string | null): OfferKey {
    if (!productId.trim()) throw new Error('Product ID is required');
    const variation = variationId?.trim() || 'NO_VARIATION';
    return new OfferKey(`${productId}:${variation}`);
  }
}
