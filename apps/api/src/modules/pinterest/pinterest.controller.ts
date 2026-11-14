import { Controller, Get, Param, Query } from '@nestjs/common';
import { PinterestService } from './pinterest.service';

@Controller('pinterest')
export class PinterestController {
  constructor(private readonly pinterest: PinterestService) {}

  @Get('boards')
  boards(@Query('bookmark') bookmark?: string) {
    return this.pinterest.boards(bookmark);
  }

  @Get('boards/:boardId/pins')
  pins(@Param('boardId') boardId: string, @Query('bookmark') bookmark?: string) {
    return this.pinterest.pins(boardId, bookmark);
  }
}
