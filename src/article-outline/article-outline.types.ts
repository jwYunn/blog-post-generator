import { ArticleDepth } from '../topic-candidate/enums/article-depth.enum';

export interface ArticleOutline {
  title: string;
  keyword: string;
  searchIntent: string;
  sections: string[];
  faqs: string[];
  /**
   * The depth this outline was built for. Set by the pipeline after the model
   * answers, not asked of the model, so the content stage writes to the length
   * of the structure it is actually given. Absent on outlines from before depth
   * existed, which are standard.
   */
  depth?: ArticleDepth;
}
