import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ImportBoardRequest } from '@hey-jenna/contracts';
import { ZodPipe } from '../../common/validation/zod.pipe';
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

  /** POST /pinterest/boards/import  { boardUrl } → a public board's pins from its RSS feed (no API key) */
  @Post('boards/import')
  import(@Body(new ZodPipe(ImportBoardRequest)) dto: ImportBoardRequest) {
    return this.pinterest.importBoard(dto.boardUrl);
  }
}
