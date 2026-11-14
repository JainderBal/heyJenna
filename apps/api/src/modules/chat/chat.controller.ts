import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../../common/auth/auth.decorators';
import { ZodPipe } from '../../common/validation/zod.pipe';
import { ChatService } from './chat.service';
import { ChatRequestDto, ChatRequestSchema } from './dto/chat.dto';

@Controller('rooms/:roomId')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  /** POST /rooms/:roomId/chat  { message, history? } → { reply, actions[] } */
  @Post('chat')
  send(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string, @Body(new ZodPipe(ChatRequestSchema)) dto: ChatRequestDto) {
    return this.chat.chat(roomId, user.id, dto);
  }
}
