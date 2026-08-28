import { Job } from 'bullmq';
import { ThumbnailGeneratorProcessor } from './thumbnail-generator.processor';

const PROMPT_ID = 'prompt-1';

describe('ThumbnailGeneratorProcessor', () => {
  let generatorService: any;
  let aiService: any;
  let s3Service: any;
  let job: Job;
  let processor: ThumbnailGeneratorProcessor;

  function buildOutputs(count: number) {
    return Array.from({ length: count }, (_unused, index) => ({
      buffer: Buffer.from(`image-${index + 1}`),
      mimeType: 'image/png',
    }));
  }

  function jobLogText(): string {
    return (job.log as jest.Mock).mock.calls.map((call) => call[0]).join('\n');
  }

  beforeEach(() => {
    generatorService = {
      findOne: jest.fn(async () => ({
        id: PROMPT_ID,
        prompt: 'a flat illustration of a notebook',
        model: 'black-forest-labs/flux-schnell',
        meta: { aspect_ratio: '16:9' },
      })),
      saveThumbnailAndMapping: jest.fn(),
      updatePromptStatus: jest.fn(),
    };
    aiService = { generate: jest.fn(async () => buildOutputs(2)) };
    s3Service = {
      upload: jest.fn(
        async (id: string) => `https://cdn.example.com/${id}.png`,
      ),
    };
    job = {
      data: { promptId: PROMPT_ID },
      log: jest.fn(),
      updateProgress: jest.fn(),
    } as unknown as Job;

    processor = new ThumbnailGeneratorProcessor(
      generatorService,
      aiService,
      s3Service,
    );
  });

  it('sends the stored prompt, model and options to replicate', async () => {
    await processor.process(job);

    expect(aiService.generate).toHaveBeenCalledWith(
      'a flat illustration of a notebook',
      'black-forest-labs/flux-schnell',
      { aspect_ratio: '16:9' },
    );
  });

  it('uploads and records every image replicate returned', async () => {
    await processor.process(job);

    expect(s3Service.upload).toHaveBeenCalledTimes(2);
    expect(generatorService.saveThumbnailAndMapping).toHaveBeenCalledTimes(2);
  });

  // The sort order is what fixes which image is offered first in the UI
  it('records the images in the order replicate returned them', async () => {
    await processor.process(job);

    const orders = generatorService.saveThumbnailAndMapping.mock.calls.map(
      (call: unknown[]) => call[3],
    );
    expect(orders).toEqual([1, 2]);
  });

  it('records each image against the url it was uploaded to', async () => {
    await processor.process(job);

    const [firstCall] = generatorService.saveThumbnailAndMapping.mock.calls;
    const [uploadedId] = s3Service.upload.mock.calls[0];
    expect(firstCall[0]).toBe(PROMPT_ID);
    expect(firstCall[1]).toBe(`https://cdn.example.com/${uploadedId}.png`);
    expect(firstCall[2]).toBe('image/png');
  });

  it('marks the prompt done', async () => {
    await processor.process(job);

    expect(generatorService.updatePromptStatus).toHaveBeenCalledWith(
      PROMPT_ID,
      'done',
    );
  });

  it('handles a single image without dividing by zero on progress', async () => {
    aiService.generate.mockResolvedValue(buildOutputs(1));

    await processor.process(job);

    expect(job.updateProgress).toHaveBeenCalledWith(95);
    expect(generatorService.updatePromptStatus).toHaveBeenCalledWith(
      PROMPT_ID,
      'done',
    );
  });

  describe('when the run fails', () => {
    it('marks the prompt failed and rethrows', async () => {
      aiService.generate.mockRejectedValue(new Error('replicate timed out'));

      await expect(processor.process(job)).rejects.toThrow(
        'replicate timed out',
      );

      expect(generatorService.updatePromptStatus).toHaveBeenCalledWith(
        PROMPT_ID,
        'failed',
      );
      expect(jobLogText()).toContain('FAILED: replicate timed out');
    });

    // A batch that dies partway has already stored what it uploaded, and the
    // prompt still has to stop looking like it is running
    it('marks the prompt failed after a partial upload', async () => {
      s3Service.upload
        .mockResolvedValueOnce('https://cdn.example.com/one.png')
        .mockRejectedValueOnce(new Error('s3 refused the object'));

      await expect(processor.process(job)).rejects.toThrow(
        's3 refused the object',
      );

      expect(generatorService.saveThumbnailAndMapping).toHaveBeenCalledTimes(1);
      expect(generatorService.updatePromptStatus).toHaveBeenCalledWith(
        PROMPT_ID,
        'failed',
      );
    });

    // The lookup sits outside the try, so there is no prompt row to mark
    it('fails without marking anything when the prompt is gone', async () => {
      generatorService.findOne.mockRejectedValue(
        new Error('ThumbnailPrompt #prompt-1 not found'),
      );

      await expect(processor.process(job)).rejects.toThrow(/not found/);

      expect(aiService.generate).not.toHaveBeenCalled();
      expect(generatorService.updatePromptStatus).not.toHaveBeenCalled();
    });
  });
});
