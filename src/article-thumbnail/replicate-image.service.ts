import { Injectable } from '@nestjs/common';
import axios from 'axios';

const REPLICATE_MODEL = 'black-forest-labs/flux-schnell';
const MAX_ATTEMPTS = 30;
const POLLING_INTERVAL_MS = 2000;

@Injectable()
export class ReplicateImageService {
  private readonly apiToken: string;

  constructor() {
    this.apiToken = process.env.REPLICATE_API_TOKEN ?? '';
  }

  async createPrediction(prompt: string): Promise<string> {
    const response = await axios.post(
      'https://api.replicate.com/v1/predictions',
      {
        version: REPLICATE_MODEL,
        input: {
          prompt,
          aspect_ratio: '1:1',
          output_format: 'png',
        },
      },
      {
        headers: {
          Authorization: `Token ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    return response.data.id as string;
  }

  async waitForImageUrl(predictionId: string): Promise<string> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const res = await axios.get(
        `https://api.replicate.com/v1/predictions/${predictionId}`,
        {
          headers: {
            Authorization: `Token ${this.apiToken}`,
          },
        },
      );

      const prediction = res.data;

      if (prediction.status === 'succeeded') {
        const url = prediction.output?.[0] as string | undefined;
        if (!url) {
          throw new Error('Replicate returned no output URL');
        }
        return url;
      }

      if (prediction.status === 'failed') {
        throw new Error(
          `Replicate prediction failed: ${prediction.error ?? 'unknown'}`,
        );
      }

      await new Promise((r) => setTimeout(r, POLLING_INTERVAL_MS));
    }

    throw new Error(
      `Replicate polling timed out after ${MAX_ATTEMPTS} attempts`,
    );
  }
}
