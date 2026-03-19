import { PartialType } from '@nestjs/mapped-types';
import { CreateBlogCssDto } from './create-blog-css.dto';

export class UpdateBlogCssDto extends PartialType(CreateBlogCssDto) {}
