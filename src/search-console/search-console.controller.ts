import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ListOpportunitiesQueryDto } from './dto/list-opportunities-query.dto';
import {
  OpportunityRow,
  SearchConsoleSchedule,
  SearchConsoleService,
} from './search-console.service';

@Controller('search-console')
export class SearchConsoleController {
  constructor(private readonly searchConsoleService: SearchConsoleService) {}

  /**
   * What is configured and when it fires next. `configured: false` is the way
   * to tell "the credentials never reached the server" from "the sync ran and
   * found nothing", which look identical from the data alone.
   */
  @Get('schedule')
  schedule(): Promise<SearchConsoleSchedule> {
    return this.searchConsoleService.describeSchedule();
  }

  /** Run the sync now, on the same path the schedule uses */
  @Post('sync')
  @HttpCode(HttpStatus.ACCEPTED)
  sync(): Promise<{ jobId: string }> {
    return this.searchConsoleService.runNow();
  }

  /**
   * Queries ranked close enough that another article could push them onto the
   * first page. This is what the collection stage exists to produce.
   */
  @Get('opportunities')
  opportunities(
    @Query() query: ListOpportunitiesQueryDto,
  ): Promise<OpportunityRow[]> {
    return this.searchConsoleService.listOpportunities(query.limit ?? 50);
  }
}
