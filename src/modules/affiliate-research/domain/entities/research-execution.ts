export type ExecutionStatus =
  | 'CREATED'
  | 'RUNNING'
  | 'COMPLETED_WITH_SELECTION'
  | 'COMPLETED_NO_SELECTION'
  | 'INCOMPLETE'
  | 'FAILED'
  | 'INTERRUPTED'
  | 'SKIPPED_OVERLAP';

export interface RunCounts {
  examined: number;
  qualified: number;
  rejected: number;
  selected: 0 | 1;
}

export class ResearchExecution {
  private currentStatus: ExecutionStatus = 'CREATED';
  private constructor(
    readonly executionKey: string,
    readonly runId: string,
    readonly startedAt: Date,
  ) {}

  static create(executionKey: string, runId: string, startedAt: Date): ResearchExecution {
    if (!executionKey || !runId) throw new Error('Execution identifiers are required');
    return new ResearchExecution(executionKey, runId, startedAt);
  }

  get status(): ExecutionStatus {
    return this.currentStatus;
  }

  start(): void {
    if (this.currentStatus !== 'CREATED')
      throw new Error(`Cannot start from ${this.currentStatus}`);
    this.currentStatus = 'RUNNING';
  }

  finish(
    status: Exclude<ExecutionStatus, 'CREATED' | 'RUNNING' | 'SKIPPED_OVERLAP'>,
    hasSelection = false,
  ): void {
    if (this.currentStatus !== 'RUNNING')
      throw new Error(`Cannot finish from ${this.currentStatus}`);
    if (status === 'COMPLETED_WITH_SELECTION' && !hasSelection)
      throw new Error('Selection is required');
    if (status !== 'COMPLETED_WITH_SELECTION' && hasSelection)
      throw new Error('Non-complete execution cannot select a product');
    this.currentStatus = status;
  }
}
