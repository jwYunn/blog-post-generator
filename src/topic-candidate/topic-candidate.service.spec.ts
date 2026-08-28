import { ConflictException, NotFoundException } from '@nestjs/common';
import { ArticleDraftEntity } from '../article-draft/article-draft.entity';
import { ArticleDraftStatus } from '../article-draft/enums/article-draft-status.enum';
import { GENERATE_ARTICLE_OUTLINE_JOB } from '../article-outline/article-outline.constants';
import { AllowedCandidateStatus } from './dto/update-topic-candidate-status.dto';
import { TopicCandidateStatus } from './enums/topic-candidate-status.enum';
import { TopicCandidateEntity } from './topic-candidate.entity';
import { TopicCandidateService } from './topic-candidate.service';

const CANDIDATE_ID = 'candidate-1';
const DRAFT_ID = 'draft-1';

/** The slice of EntityManager that approveCandidate drives inside its transaction */
interface TxManager {
  findOne: jest.Mock;
  update: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
}

function buildCandidate(
  over: Partial<TopicCandidateEntity> = {},
): TopicCandidateEntity {
  return {
    id: CANDIDATE_ID,
    title: 'Present perfect explained',
    keyword: 'present perfect',
    status: TopicCandidateStatus.PENDING,
    topicSeed: { category: 'grammar' },
    ...over,
  } as TopicCandidateEntity;
}

function buildDraft(status: ArticleDraftStatus): ArticleDraftEntity {
  return { id: DRAFT_ID, status } as ArticleDraftEntity;
}

describe('TopicCandidateService', () => {
  let manager: TxManager;
  let candidateRepository: any;
  let draftRepository: any;
  let outlineQueue: any;
  let service: TopicCandidateService;

  /**
   * approveCandidate reads two different entities through the same manager, so
   * the stub answers by entity class rather than by call order.
   */
  function stubTransaction(
    candidate: TopicCandidateEntity | null,
    existingDraft: ArticleDraftEntity | null,
  ) {
    manager.findOne.mockImplementation(async (entity: unknown) =>
      entity === TopicCandidateEntity ? candidate : existingDraft,
    );
  }

  function approve() {
    return service.updateStatus(CANDIDATE_ID, {
      status: AllowedCandidateStatus.APPROVED,
    });
  }

  beforeEach(() => {
    manager = {
      findOne: jest.fn(),
      update: jest.fn(),
      create: jest.fn((_entity, data) => data),
      save: jest.fn(async (entity) => ({ id: DRAFT_ID, ...entity })),
    };
    candidateRepository = {
      manager: {
        transaction: jest.fn(async (work: (m: TxManager) => Promise<unknown>) =>
          work(manager),
        ),
      },
      findOne: jest.fn(),
      save: jest.fn(async (entity) => entity),
    };
    draftRepository = {};
    outlineQueue = { add: jest.fn() };
    service = new TopicCandidateService(
      candidateRepository,
      draftRepository,
      outlineQueue,
    );
  });

  describe('approving a candidate for the first time', () => {
    beforeEach(() => stubTransaction(buildCandidate(), null));

    it('creates a draft and starts the generation pipeline', async () => {
      const result = await approve();

      expect(result).toEqual({
        id: CANDIDATE_ID,
        status: 'approved',
        articleDraftId: DRAFT_ID,
        articleDraftCreated: true,
        pipelineQueued: true,
      });
      expect(outlineQueue.add).toHaveBeenCalledTimes(1);
      expect(outlineQueue.add).toHaveBeenCalledWith(
        GENERATE_ARTICLE_OUTLINE_JOB,
        { articleDraftId: DRAFT_ID },
      );
    });

    it('marks the candidate approved', async () => {
      await approve();

      expect(manager.update).toHaveBeenCalledWith(
        TopicCandidateEntity,
        { id: CANDIDATE_ID },
        { status: TopicCandidateStatus.APPROVED },
      );
    });

    it('carries the seed category into the draft title', async () => {
      await approve();

      expect(manager.create).toHaveBeenCalledWith(
        ArticleDraftEntity,
        expect.objectContaining({
          topicCandidateId: CANDIDATE_ID,
          title: '[Grammar] Present perfect explained',
          keyword: 'present perfect',
          status: ArticleDraftStatus.QUEUED,
        }),
      );
    });

    // A worker that picks the job up before the draft row is visible finds
    // nothing to work on, so the enqueue has to wait for the commit.
    it('enqueues only after the transaction has committed', async () => {
      const order: string[] = [];
      candidateRepository.manager.transaction.mockImplementation(
        async (work: (m: TxManager) => Promise<unknown>) => {
          const result = await work(manager);
          order.push('commit');
          return result;
        },
      );
      outlineQueue.add.mockImplementation(async () => {
        order.push('enqueue');
      });

      await approve();

      expect(order).toEqual(['commit', 'enqueue']);
    });
  });

  /**
   * The guard that keeps a second approval from destroying finished work. The
   * candidate status check refuses most repeat approvals outright; these cover
   * the second line of defence, where a draft already exists and its own status
   * decides whether the pipeline may run again.
   */
  describe('approving a candidate that already has a draft', () => {
    const RESTARTED_FROM = [ArticleDraftStatus.FAILED];
    const PRESERVED = Object.values(ArticleDraftStatus).filter(
      (status) => !RESTARTED_FROM.includes(status),
    );

    it.each(PRESERVED)(
      'leaves a draft in %s alone rather than regenerating it',
      async (status) => {
        stubTransaction(
          buildCandidate({ status: TopicCandidateStatus.REJECTED }),
          buildDraft(status),
        );

        const result = await approve();

        expect(outlineQueue.add).not.toHaveBeenCalled();
        expect(manager.save).not.toHaveBeenCalled();
        expect(result).toMatchObject({
          articleDraftId: DRAFT_ID,
          articleDraftCreated: false,
          pipelineQueued: false,
        });
      },
    );

    it.each(RESTARTED_FROM)(
      'restarts a draft in %s, which has nothing to lose',
      async (status) => {
        stubTransaction(
          buildCandidate({ status: TopicCandidateStatus.REJECTED }),
          buildDraft(status),
        );

        const result = await approve();

        expect(outlineQueue.add).toHaveBeenCalledWith(
          GENERATE_ARTICLE_OUTLINE_JOB,
          { articleDraftId: DRAFT_ID },
        );
        expect(result).toMatchObject({
          articleDraftId: DRAFT_ID,
          articleDraftCreated: false,
          pipelineQueued: true,
        });
      },
    );
  });

  describe('approvals that are refused', () => {
    it('refuses a candidate that is already approved', async () => {
      stubTransaction(
        buildCandidate({ status: TopicCandidateStatus.APPROVED }),
        null,
      );

      await expect(approve()).rejects.toBeInstanceOf(ConflictException);
      expect(manager.update).not.toHaveBeenCalled();
      expect(outlineQueue.add).not.toHaveBeenCalled();
    });

    it('refuses a candidate that does not exist', async () => {
      stubTransaction(null, null);

      await expect(approve()).rejects.toBeInstanceOf(NotFoundException);
      expect(outlineQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('rejecting a candidate', () => {
    it('marks a pending candidate rejected', async () => {
      const candidate = buildCandidate();
      candidateRepository.findOne.mockResolvedValue(candidate);

      const result = await service.updateStatus(CANDIDATE_ID, {
        status: AllowedCandidateStatus.REJECTED,
      });

      expect(result).toEqual({ id: CANDIDATE_ID, status: 'rejected' });
      expect(candidate.status).toBe(TopicCandidateStatus.REJECTED);
    });

    // Rejecting an approved candidate would orphan the draft the approval made
    it('refuses an approved candidate', async () => {
      candidateRepository.findOne.mockResolvedValue(
        buildCandidate({ status: TopicCandidateStatus.APPROVED }),
      );

      await expect(
        service.updateStatus(CANDIDATE_ID, {
          status: AllowedCandidateStatus.REJECTED,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(candidateRepository.save).not.toHaveBeenCalled();
    });

    it('refuses a candidate that does not exist', async () => {
      candidateRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateStatus(CANDIDATE_ID, {
          status: AllowedCandidateStatus.REJECTED,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
