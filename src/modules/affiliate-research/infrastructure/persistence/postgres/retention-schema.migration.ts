import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RetentionSchema20261001010000 implements MigrationInterface {
  name = 'RetentionSchema20261001010000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE research_execution ADD CONSTRAINT research_execution_finished_at_lifecycle
      CHECK ((status = 'RUNNING' AND finished_at IS NULL) OR (status <> 'RUNNING' AND finished_at IS NOT NULL))`);
    await queryRunner.query(
      'CREATE INDEX idx_research_execution_finished_at ON research_execution (finished_at)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX idx_research_execution_finished_at');
    await queryRunner.query(
      'ALTER TABLE research_execution DROP CONSTRAINT research_execution_finished_at_lifecycle',
    );
  }
}
