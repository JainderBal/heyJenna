import { Style } from '@prisma/client';
import { StyleProfile } from '@hey-jenna/contracts';
import { StyleResponseDto } from '../dto/style-response.dto';

/** Stored JSON → profile. Older rows have no dials: those get the defaults. */
export function readProfile(json: unknown): StyleProfile {
  const parsed = StyleProfile.safeParse(json);
  return parsed.success ? parsed.data : (json as StyleProfile);
}

export function toStyleResponse(style: Style): StyleResponseDto {
  return {
    roomId: style.roomId,
    profile: readProfile(style.profile),
    imageCount: style.imageKeys.length,
    updatedAt: style.updatedAt.toISOString(),
  };
}
