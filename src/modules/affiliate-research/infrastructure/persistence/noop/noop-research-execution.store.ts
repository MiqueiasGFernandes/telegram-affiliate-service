import type {
  ResearchExecutionStorePort,
  RunSummaryRecord,
} from '../../../application/ports/out/research-ports.js';

export class NoopResearchExecutionStore implements ResearchExecutionStorePort {
  async begin(_input: { executionKey: string; runId: string; startedAt: Date }): Promise<void> {}
  async complete(_summary: RunSummaryRecord): Promise<void> {}
  async fail(_executionKey: string, _failureCode: string): Promise<void> {}
  async markInterrupted(): Promise<void> {}
}
