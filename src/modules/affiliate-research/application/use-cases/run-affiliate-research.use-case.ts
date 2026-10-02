import { randomUUID } from 'node:crypto';
import type {
  AffiliateEvidenceReaderPort,
  ClockPort,
  LoggerPort,
  MercadoLivreGatewayPort,
  ResearchExecutionStorePort,
  RunSummaryRecord,
} from '../ports/out/research-ports.js';
import type { AppConfig } from '../../../../platform/config/environment-config.js';
import type {
  RunAffiliateResearchInput,
  RunAffiliateResearchPort,
  RunAffiliateResearchResult,
  RunSummary,
} from '../ports/in/run-affiliate-research.port.js';
import { QualificationPolicy } from '../../domain/policies/qualification-policy.js';
import {
  qualifyOffer,
  type QualificationResult,
} from '../../domain/services/offer-qualification.js';
import type { NormalizedOffer } from '../../domain/entities/offer.js';
import { errorDetails } from '../errors/error-details.js';
import {
  compareLeaders,
  leadersByCategory,
  type SelectionCandidate,
} from '../../domain/services/leader-selection.js';

export class RunAffiliateResearchUseCase implements RunAffiliateResearchPort {
  constructor(
    private readonly config: AppConfig,
    private readonly gateway: MercadoLivreGatewayPort,
    private readonly evidenceReader: AffiliateEvidenceReaderPort,
    private readonly store: ResearchExecutionStorePort,
    private readonly clock: ClockPort,
    private readonly logger: LoggerPort,
  ) {}

  async execute(input: RunAffiliateResearchInput): Promise<RunAffiliateResearchResult> {
    const startedAt = this.clock.now();
    const runId = randomUUID();
    const executionKey = `affiliate-research:${input.scheduledFor.toISOString()}`;
    const policy = QualificationPolicy.create({
      currency: this.config.currency,
      lowTicketMin: this.config.lowTicketMin,
      lowTicketMax: this.config.lowTicketMax,
      mediumTicketMin: this.config.mediumTicketMin,
      mediumTicketMax: this.config.mediumTicketMax,
      minimumDiscountPercent: this.config.minimumDiscountPercent,
      categoryIds: this.config.categoryIds,
      fingerprint: this.config.policyFingerprint,
    });
    await this.store.begin({ executionKey, runId, startedAt });
    const categories: RunSummaryRecord['categories'][number][] = [];
    const rejectionReasons: RunSummary['rejections'][number][] = [];
    const rankingReferences: NonNullable<RunSummaryRecord['rankingReferences']>[number][] = [];
    const assessmentRecords: NonNullable<RunSummaryRecord['assessments']>[number][] = [];
    const offerRefs = new Map<
      string,
      { offer: NormalizedOffer; refs: { categoryId: string; position: number; observedAt: Date }[] }
    >();
    let candidates: SelectionCandidate[] = [];
    let examined = 0;
    let qualified = 0;
    let rejected = 0;
    let stage = 'category_validation';
    let currentCategoryId: string | undefined;

    try {
      await this.gateway.validateLeafCategories(this.config.categoryIds);
      for (const categoryId of this.config.categoryIds) {
        currentCategoryId = categoryId;
        stage = 'ranking_fetch';
        const ranking = await this.gateway.getBestSellerRanking(categoryId);
        if (ranking.kind === 'NO_RANKING') {
          categories.push({ categoryId, status: 'PROCESSED_NO_RANKING', referenceCount: 0 });
          continue;
        }
        if (ranking.kind === 'UNAVAILABLE') {
          categories.push({
            categoryId,
            status: 'UNAVAILABLE',
            referenceCount: 0,
            failureCode: ranking.failureCode,
          });
          continue;
        }
        if (ranking.references.length > 20) {
          categories.push({
            categoryId,
            status: 'UNAVAILABLE',
            referenceCount: ranking.references.length,
            failureCode: 'RANKING_LIMIT_EXCEEDED',
          });
          continue;
        }
        const positions = new Set<number>();
        let invalidRanking = false;
        for (const ref of ranking.references) {
          if (
            ref.categoryId !== categoryId ||
            !Number.isInteger(ref.effectivePosition) ||
            ref.effectivePosition < 1 ||
            ref.effectivePosition > 20 ||
            positions.has(ref.effectivePosition)
          )
            invalidRanking = true;
          positions.add(ref.effectivePosition);
        }
        if (invalidRanking) {
          categories.push({
            categoryId,
            status: 'UNAVAILABLE',
            referenceCount: ranking.references.length,
            failureCode: 'INVALID_RANKING_CONTRACT',
          });
          continue;
        }
        categories.push({
          categoryId,
          status: 'PROCESSED_WITH_RANKING',
          referenceCount: ranking.references.length,
        });
        for (const ref of ranking.references) {
          stage = 'reference_resolution';
          const referenceRecord: (typeof rankingReferences)[number] = {
            categoryId: ref.categoryId,
            effectivePosition: ref.effectivePosition,
            ...(ref.reportedPosition !== undefined
              ? { reportedPosition: ref.reportedPosition }
              : {}),
            referenceType: ref.type,
            sourceId: ref.sourceId,
            observedAt: ref.observedAt,
          };
          rankingReferences.push(referenceRecord);
          const resolved = await this.gateway.resolveRankedReferences(ref);
          if (resolved.kind === 'REJECTED') {
            rejected++;
            referenceRecord.rejectionCode = resolved.reason;
            rejectionReasons.push({
              reasonCode: resolved.reason,
              referenceType: ref.type,
              sourceId: ref.sourceId,
            });
            continue;
          }
          if (resolved.kind === 'UNAVAILABLE') {
            referenceRecord.rejectionCode = resolved.failureCode;
            const index = categories.findIndex((category) => category.categoryId === categoryId);
            categories[index] = {
              categoryId,
              status: 'UNAVAILABLE',
              referenceCount: ranking.references.length,
              failureCode: resolved.failureCode,
            };
            break;
          }
          const offer = resolved.offer;
          const key = `${offer.productId}:${offer.variationKey || 'NO_VARIATION'}`;
          referenceRecord.assessmentKey = key;
          const existing = offerRefs.get(key);
          if (existing)
            existing.refs.push({
              categoryId,
              position: ref.effectivePosition,
              observedAt: ref.observedAt,
            });
          else
            offerRefs.set(key, {
              offer,
              refs: [{ categoryId, position: ref.effectivePosition, observedAt: ref.observedAt }],
            });
        }
      }

      for (const [assessmentKey, assessed] of offerRefs) {
        currentCategoryId = undefined;
        stage = 'evidence_lookup';
        const { offer, refs } = assessed;
        examined++;
        const evidence = await this.evidenceReader.find(offer.productId, offer.variationKey);
        const result = qualifyOffer(offer, evidence, policy, this.clock.now());
        assessmentRecords.push({
          canonicalKey: assessmentKey,
          productId: offer.productId,
          variationKey: offer.variationKey || 'NO_VARIATION',
          outcome: result.qualified ? 'QUALIFIED' : 'REJECTED',
          reasonCodes: result.qualified ? [] : [result.reason],
          snapshot: {
            offer,
            affiliateEvidence: evidence ?? null,
            capturedAt: this.clock.now().toISOString(),
          },
        });
        if (!result.qualified) {
          rejected++;
          rejectionReasons.push({ reasonCode: result.reason, canonicalKey: assessmentKey });
          continue;
        }
        qualified++;
        candidates.push(
          ...refs.map((ref) => ({
            categoryId: ref.categoryId,
            position: ref.position,
            assessmentKey,
            observedAt: ref.observedAt,
            qualified: result.value,
          })),
        );
      }

      let selectedProduct: Record<string, unknown> | undefined;
      let hasUnavailable = categories.some((category) => category.status === 'UNAVAILABLE');
      if (!hasUnavailable) {
        let mandatoryPromotionCategory: string | undefined;
        for (let revalidations = 0; revalidations < 200; revalidations++) {
          const leaders = leadersByCategory(candidates);
          const provisional =
            (mandatoryPromotionCategory
              ? leaders.find((leader) => leader.categoryId === mandatoryPromotionCategory)
              : undefined) ?? [...leaders].sort(compareLeaders)[0];
          mandatoryPromotionCategory = undefined;
          if (!provisional) break;
          currentCategoryId = provisional.categoryId;
          let current: NormalizedOffer;
          try {
            stage = 'offer_revalidation';
            current = await this.gateway.getCurrentOffer(provisional.qualified.offer.itemId);
          } catch (error) {
            this.logger.error('affiliate_research.revalidation_failed', {
              runId,
              stage: 'offer_revalidation',
              categoryId: provisional.categoryId,
              ...errorDetails(error),
            });
            hasUnavailable = true;
            const category = categories.find(
              (entry) => entry.categoryId === provisional.categoryId,
            );
            if (category)
              categories[categories.indexOf(category)] = {
                ...category,
                status: 'UNAVAILABLE',
                failureCode: 'REVALIDATION_FAILED',
              };
            break;
          }
          let revalidated: QualificationResult = {
            qualified: false,
            reason: 'REVALIDATION_FAILED',
          };
          try {
            stage = 'evidence_or_destination_validation';
            const currentEvidence = await this.evidenceReader.find(
              current.productId,
              current.variationKey,
            );
            revalidated = qualifyOffer(current, currentEvidence, policy, this.clock.now());
            if (revalidated.qualified) {
              if (
                `${current.productId}:${current.variationKey || 'NO_VARIATION'}` !==
                provisional.assessmentKey
              )
                revalidated = { qualified: false, reason: 'PRODUCT_IDENTITY_CHANGED' };
              else if (
                !(await this.gateway.validateAffiliateDestination(
                  revalidated.value.affiliate.affiliateUrl,
                  current.productId,
                  current.itemId,
                ))
              )
                revalidated = { qualified: false, reason: 'AFFILIATE_DESTINATION_MISMATCH' };
              else revalidated = qualifyOffer(current, currentEvidence, policy, this.clock.now());
            }
          } catch (error) {
            this.logger.error('affiliate_research.revalidation_failed', {
              runId,
              stage: 'evidence_or_destination_validation',
              categoryId: provisional.categoryId,
              ...errorDetails(error),
            });
            hasUnavailable = true;
            const category = categories.find(
              (entry) => entry.categoryId === provisional.categoryId,
            );
            if (category)
              categories[categories.indexOf(category)] = {
                ...category,
                status: 'UNAVAILABLE',
                failureCode: 'REVALIDATION_FAILED',
              };
            break;
          }
          if (!revalidated.qualified) {
            candidates = candidates.filter(
              (candidate) => candidate.assessmentKey !== provisional.assessmentKey,
            );
            qualified = Math.max(0, qualified - 1);
            rejected++;
            rejectionReasons.push({
              reasonCode: revalidated.reason,
              canonicalKey: provisional.assessmentKey,
            });
            if (
              leadersByCategory(candidates).some(
                (candidate) => candidate.categoryId === provisional.categoryId,
              )
            )
              mandatoryPromotionCategory = provisional.categoryId;
            continue;
          }
          const qualifiedSnapshot = revalidated.value;
          const refreshed = candidates
            .filter((candidate) => candidate.assessmentKey === provisional.assessmentKey)
            .map((candidate) => ({ ...candidate, qualified: qualifiedSnapshot }));
          candidates = candidates
            .filter((candidate) => candidate.assessmentKey !== provisional.assessmentKey)
            .concat(refreshed);
          const nextLeader = leadersByCategory(candidates).sort(compareLeaders)[0];
          if (nextLeader?.assessmentKey !== provisional.assessmentKey) continue;
          const validatedAt = this.clock.now();
          selectedProduct = {
            schemaVersion: 1,
            runId,
            executionKey,
            productId: current.productId,
            variationKey: current.variationKey,
            categoryId: provisional.categoryId,
            categoryPosition: provisional.position,
            title: current.title,
            ticketBand: revalidated.value.ticketBand,
            currency: current.currency,
            originalPrice: current.originalPrice,
            discountedPrice: current.discountedPrice,
            discountAmount: qualifiedSnapshot.discountAmount,
            discountPercent: qualifiedSnapshot.discountPercent,
            affiliateUrl: qualifiedSnapshot.affiliate.affiliateUrl,
            expectedCommissionAmount: qualifiedSnapshot.expectedCommissionAmount,
            commissionPercent: qualifiedSnapshot.commissionPercent,
            commissionDerivation: {
              percentDerived: false,
              amountDerived: !qualifiedSnapshot.affiliate.expectedCommissionAmount,
            },
            mainImageUrl: current.imageUrl,
            salesEvidence: {
              kind: 'BEST_SELLER_RANK',
              value: provisional.position,
              source: `/highlights/MLB/category/${provisional.categoryId}`,
              observedAt: provisional.observedAt.toISOString(),
            },
            selectionRationale: [
              `Líder qualificado da categoria ${provisional.categoryId} na posição ${provisional.position}; vencedor do torneio por desconto e comissão após revalidação.`,
            ],
            capturedAt: qualifiedSnapshot.capturedAt.toISOString(),
            validatedAt: validatedAt.toISOString(),
          };
          break;
        }
      }
      if (hasUnavailable) selectedProduct = undefined;
      const finishedAt = this.clock.now();
      const status = hasUnavailable
        ? 'INCOMPLETE'
        : selectedProduct
          ? 'COMPLETED_WITH_SELECTION'
          : 'COMPLETED_NO_SELECTION';
      const counts = {
        examined,
        qualified,
        rejected,
        selected: (selectedProduct ? 1 : 0) as 0 | 1,
      };
      const coverage = {
        configured: categories.length,
        processedWithRanking: categories.filter(
          ({ status: state }) => state === 'PROCESSED_WITH_RANKING',
        ).length,
        processedWithoutRanking: categories.filter(
          ({ status: state }) => state === 'PROCESSED_NO_RANKING',
        ).length,
        unavailable: categories.filter(({ status: state }) => state === 'UNAVAILABLE').length,
      };
      const summary: RunSummary = {
        schemaVersion: 1,
        event: 'affiliate_research.completed',
        runId,
        executionKey,
        mode: input.mode,
        status,
        scheduledFor: input.scheduledFor.toISOString(),
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
        counts,
        rejections: rejectionReasons,
        categoryCoverage: { ...coverage, categories },
        selectedProductId:
          typeof selectedProduct?.['productId'] === 'string' ? selectedProduct['productId'] : null,
        persistence: this.config.persistenceEnabled ? 'SAVED' : 'DISABLED',
        ...(hasUnavailable
          ? {
              failure: {
                code: 'CATEGORY_UNAVAILABLE',
                message: 'One or more configured categories could not be fully processed.',
              },
            }
          : {}),
      };
      const summaryRecord: RunSummaryRecord = {
        executionKey,
        runId,
        mode: input.mode,
        scheduledFor: input.scheduledFor,
        status,
        startedAt,
        finishedAt,
        durationMs: summary.durationMs,
        counts,
        categories,
        categoryCoverage: coverage,
        policySnapshot: { ...policy.value },
        rankingReferences,
        assessments: assessmentRecords,
        ...(selectedProduct ? { selectedProduct } : {}),
      };
      stage = 'persistence_complete';
      await this.store.complete(summaryRecord);
      this.logger.info('affiliate_research.completed', {
        runId,
        executionKey,
        status,
        counts,
        rejections: rejectionReasons,
        categoryCoverage: coverage,
      });
      return { summary, ...(selectedProduct ? { selectedProduct } : {}) };
    } catch (error) {
      this.logger.error('affiliate_research.failed', {
        runId,
        executionKey,
        failureCode: 'RESEARCH_FAILED',
        stage,
        ...(currentCategoryId ? { categoryId: currentCategoryId } : {}),
        ...errorDetails(error),
      });
      try {
        await this.store.fail(executionKey, 'RESEARCH_FAILED');
      } catch (storeError) {
        this.logger.error('affiliate_research.failure_record_failed', {
          runId,
          executionKey,
          stage: 'persistence_failure_record',
          ...errorDetails(storeError),
        });
      }
      throw error;
    }
  }
}
