import { Inject, Injectable, Logger } from '@nestjs/common';
import { LayoutService } from '../layout/layout.service';
import { RoomsService } from '../rooms/rooms.service';
import { SourcingService } from '../sourcing/sourcing.service';
import { StyleService } from '../style/style.service';
import { CHAT_ASSISTANT, ChatAssistant } from './assistant/chat-assistant';
import { RuleChatAssistant } from './assistant/rule-chat.assistant';
import { ChatTools } from './chat-tools';
import { ChatRequestDto, ChatResponseDto } from './dto/chat.dto';

/** Chat with Jenna about one room. Nothing is stored: the client sends `history` each time. */
@Injectable()
export class ChatService {
  private readonly log = new Logger(ChatService.name);
  private readonly fallback = new RuleChatAssistant();

  constructor(
    private readonly rooms: RoomsService,
    private readonly style: StyleService,
    private readonly sourcing: SourcingService,
    private readonly layout: LayoutService,
    @Inject(CHAT_ASSISTANT) private readonly assistant: ChatAssistant,
  ) {}

  async chat(roomId: string, ownerId: string, dto: ChatRequestDto): Promise<ChatResponseDto> {
    await this.rooms.getOwnedRoom(roomId, ownerId);
    const deps = { style: this.style, sourcing: this.sourcing, layout: this.layout };
    let tools = new ChatTools(roomId, ownerId, deps);
    let reply: string;
    try {
      ({ reply } = await this.assistant.reply({ message: dto.message, history: dto.history, tools }));
    } catch (e) {
      if (this.assistant instanceof RuleChatAssistant) throw e;
      this.log.warn(`chat assistant failed, using rules instead: ${(e as Error).message}`);
      const actionsSoFar = tools.actions;
      tools = new ChatTools(roomId, ownerId, deps);
      ({ reply } = await this.fallback.reply({ message: dto.message, history: dto.history, tools }));
      tools.actions.unshift(...actionsSoFar);
    }
    return { reply, actions: tools.actions };
  }
}
