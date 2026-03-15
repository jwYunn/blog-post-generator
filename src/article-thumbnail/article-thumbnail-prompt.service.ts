import { Injectable } from '@nestjs/common';

interface BuildThumbnailPromptInput {
  title: string;
  keyword: string;
  outline?: {
    sections?: string[];
  } | null;
}

@Injectable()
export class ArticleThumbnailPromptService {
  buildThumbnailPrompt(input: BuildThumbnailPromptInput): string {
    const { keyword, outline } = input;

    const sectionHint =
      outline?.sections && outline.sections.length > 0
        ? outline.sections.slice(0, 2).join(', ')
        : '';

    const parts = [
      `modern flat vector illustration for an English learning blog thumbnail`,
      `illustrating the concept of "${keyword}"`,
      sectionHint ? `covering topics like ${sectionHint}` : null,
      `students studying English in a classroom`,
      `cute characters`,
      `soft pastel color palette`,
      `clean minimal design`,
      `white background`,
      `center composition`,
      `space for title text`,
      `high quality vector illustration`,
    ].filter(Boolean) as string[];

    return parts.join(',\n');
  }
}
