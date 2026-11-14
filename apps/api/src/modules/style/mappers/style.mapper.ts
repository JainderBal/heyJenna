import { Style } from '@prisma/client';
import { StyleProfile } from '@hey-jenna/contracts';
import { StyleResponseDto } from '../dto/style-response.dto';

export function toStyleResponse(style: Style): StyleResponseDto {
  return {
    roomId: style.roomId,
    profile: style.profile as unknown as StyleProfile,
    imageCount: style.imageKeys.length,
    updatedAt: style.updatedAt.toISOString(),
  };
}
