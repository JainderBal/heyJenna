import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { StorageService } from '../../common/storage/storage.service';
import { LayoutService } from '../layout/layout.service';
import { LayoutData } from '../layout/layout.types';
import { RoomsService } from '../rooms/rooms.service';
import { RenderJobResponseDto } from './dto/render-job-response.dto';
import { toRenderJobResponse } from './mappers/render-job.mapper';
import { RenderRepository } from './render.repository';

export interface ClaimedJob {
  job: RenderJobResponseDto;
  layout: LayoutData;
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const GLB = Buffer.from('glTF');

/** Queues renders of a layout, hands them to workers, and serves the results. */
@Injectable()
export class RenderService {
  private readonly log = new Logger(RenderService.name);

  constructor(
    private readonly repo: RenderRepository,
    private readonly rooms: RoomsService,
    private readonly layouts: LayoutService,
    private readonly storage: StorageService,
  ) {}

  // ---------------------------------------------------------------- for people
  async request(roomId: string, ownerId: string, layoutId: string): Promise<RenderJobResponseDto> {
    await this.layouts.getData(roomId, ownerId, layoutId); // 404 unless it's theirs
    const open = await this.repo.findOpenForLayout(layoutId);
    return toRenderJobResponse(open ?? (await this.repo.create(roomId, layoutId)));
  }

  async get(roomId: string, ownerId: string, jobId: string): Promise<RenderJobResponseDto> {
    await this.rooms.getOwnedRoom(roomId, ownerId);
    return toRenderJobResponse(await this.load(roomId, jobId));
  }

  async list(roomId: string, ownerId: string): Promise<RenderJobResponseDto[]> {
    await this.rooms.getOwnedRoom(roomId, ownerId);
    return (await this.repo.listForRoom(roomId)).map(toRenderJobResponse);
  }

  async file(roomId: string, ownerId: string, jobId: string, kind: 'image' | 'model'): Promise<Buffer> {
    await this.rooms.getOwnedRoom(roomId, ownerId);
    const job = await this.load(roomId, jobId);
    const key = kind === 'image' ? job.imageKey : job.modelKey;
    if (job.status !== 'done' || !key) throw new ConflictException(`No ${kind} yet (status: ${job.status})`);
    return this.storage.load(key);
  }

  // ---------------------------------------------------------------- for render workers
  async claim(workerId: string): Promise<ClaimedJob | null> {
    const job = await this.repo.claimNext(workerId);
    if (!job) return null;
    this.log.log(`job ${job.id} → ${workerId} (attempt ${job.attempts})`);
    return { job: toRenderJobResponse(job), layout: await this.layouts.getDataForWorker(job.roomId, job.layoutId) };
  }

  async complete(jobId: string, image?: Buffer, model?: Buffer): Promise<RenderJobResponseDto> {
    const job = await this.repo.findById(jobId);
    if (!job) throw new NotFoundException('Job not found');
    if (job.status !== 'running') throw new ConflictException(`Job is ${job.status}, not running`);
    if (!image || !image.subarray(0, 4).equals(PNG)) throw new BadRequestException('image must be a PNG');
    if (model && !model.subarray(0, 4).equals(GLB)) throw new BadRequestException('model must be a .glb');
    const folder = `renders/${job.roomId}/${job.id}`;
    const imageKey = await this.storage.save(folder, image, 'png', 'image/png');
    const modelKey = model ? await this.storage.save(folder, model, 'glb', 'model/gltf-binary') : null;
    this.log.log(`job ${job.id} done`);
    return toRenderJobResponse(await this.repo.complete(job.id, imageKey, modelKey));
  }

  async fail(jobId: string, error: string): Promise<RenderJobResponseDto> {
    const job = await this.repo.findById(jobId);
    if (!job) throw new NotFoundException('Job not found');
    this.log.warn(`job ${job.id} failed: ${error.split('\n')[0]}`);
    return toRenderJobResponse(await this.repo.fail(job.id, error));
  }

  private async load(roomId: string, jobId: string) {
    const job = await this.repo.findInRoom(jobId, roomId);
    if (!job) throw new NotFoundException('Render not found');
    return job;
  }
}
