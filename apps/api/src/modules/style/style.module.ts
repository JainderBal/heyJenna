import { Module } from '@nestjs/common';
import { AppConfig } from '../../common/config/app-config.service';
import { RoomsModule } from '../rooms/rooms.module';
import { ClaudeVibeReader } from './analysis/claude-vibe.reader';
import { RuleVibeReader } from './analysis/rule-vibe.reader';
import { VIBE_READER } from './analysis/vibe';
import { StyleController } from './style.controller';
import { StyleRepository } from './style.repository';
import { StyleService } from './style.service';

@Module({
  imports: [RoomsModule],
  controllers: [StyleController],
  providers: [
    StyleService,
    StyleRepository,
    {
      // Claude reads the moodboard when a key is set; otherwise the rule-based reader does
      provide: VIBE_READER,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => {
        const key = config.get('ANTHROPIC_API_KEY');
        return key ? new ClaudeVibeReader(key, config.get('ANTHROPIC_MODEL')) : new RuleVibeReader();
      },
    },
  ],
  exports: [StyleService],
})
export class StyleModule {}
