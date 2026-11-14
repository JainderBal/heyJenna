import Anthropic from '@anthropic-ai/sdk';
import { Module } from '@nestjs/common';
import { AppConfig } from '../../common/config/app-config.service';
import { LayoutModule } from '../layout/layout.module';
import { RoomsModule } from '../rooms/rooms.module';
import { SourcingModule } from '../sourcing/sourcing.module';
import { StyleModule } from '../style/style.module';
import { CHAT_ASSISTANT } from './assistant/chat-assistant';
import { ClaudeChatAssistant } from './assistant/claude-chat.assistant';
import { RuleChatAssistant } from './assistant/rule-chat.assistant';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [RoomsModule, StyleModule, SourcingModule, LayoutModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    {
      // Claude with tools when a key is set; otherwise rule-based intent matching
      provide: CHAT_ASSISTANT,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => {
        const key = config.get('ANTHROPIC_API_KEY');
        return key ? new ClaudeChatAssistant(new Anthropic({ apiKey: key }), config.get('ANTHROPIC_MODEL')) : new RuleChatAssistant();
      },
    },
  ],
})
export class ChatModule {}
