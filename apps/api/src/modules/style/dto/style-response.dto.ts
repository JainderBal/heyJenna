import { StyleProfile } from '@hey-jenna/contracts';

export interface StyleResponseDto {
  roomId: string;
  profile: StyleProfile;
  imageCount: number;
  updatedAt: string;
}
