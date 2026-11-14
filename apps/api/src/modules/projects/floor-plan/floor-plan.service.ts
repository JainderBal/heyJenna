import { BadGatewayException, BadRequestException, Inject, Injectable, Optional, UnprocessableEntityException } from '@nestjs/common';
import { RoomResponseDto } from '../../rooms/dto/room-response.dto';
import sharp from 'sharp';
import { safeFetch } from '../../../common/http/safe-fetch';
import { StorageService } from '../../../common/storage/storage.service';
import { ProjectsService } from '../projects.service';
import { FLOOR_PLAN_READER, FloorPlanReader } from './floor-plan.reader';
import { FloorPlanPreview, normalisePlan, toBulkRooms } from './normalise';

/** One floor-plan photo → every room found and measured (preview, or created with ?create=1). */
@Injectable()
export class FloorPlanService {
  constructor(
    private readonly projects: ProjectsService,
    private readonly storage: StorageService,
    @Optional() @Inject(FLOOR_PLAN_READER) private readonly reader: FloorPlanReader | null,
  ) {}

  async read(
    projectId: string,
    ownerId: string,
    input: { file?: Buffer; imageUrl?: string },
    create: boolean,
  ): Promise<FloorPlanPreview & { imageKey: string; created?: RoomResponseDto[] }> {
    await this.projects.getOwnedProject(projectId, ownerId);
    if (!this.reader) throw new UnprocessableEntityException('Reading floor plans needs ANTHROPIC_API_KEY; draw the rooms by hand instead');

    const image = input.file ?? (input.imageUrl ? await this.download(input.imageUrl) : undefined);
    if (!image) throw new BadRequestException('Add a floor plan image (`image` file or `imageUrl`)');
    try {
      const meta = await sharp(image).metadata();
      if (!meta.width || !meta.height) throw new Error();
    } catch {
      throw new BadRequestException('The floor plan is not a readable image');
    }
    const imageKey = await this.storage.save(`floor-plans/${projectId}`, image, 'img', 'application/octet-stream');

    let preview: FloorPlanPreview;
    try {
      preview = normalisePlan(await this.reader.read(image));
    } catch (e) {
      throw new BadGatewayException(`Couldn't read the floor plan: ${(e as Error).message}`);
    }
    if (!preview.rooms.length) throw new UnprocessableEntityException('No rooms found in this image');
    if (!create) return { ...preview, imageKey };
    const created = await this.projects.createRooms(projectId, ownerId, { rooms: toBulkRooms(preview.rooms) });
    return { ...preview, imageKey, created };
  }

  private async download(url: string): Promise<Buffer> {
    try {
      const { body, contentType } = await safeFetch(url, { accept: 'image/*' });
      if (!contentType.startsWith('image/')) throw new Error('not an image');
      return body;
    } catch (e) {
      throw new BadRequestException(`Could not use image link ${url}: ${(e as Error).message}`);
    }
  }
}
