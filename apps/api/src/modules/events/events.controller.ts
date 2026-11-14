import { Controller, Get, Param, ParseUUIDPipe, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthUser, CurrentUser } from '../../common/auth/auth.decorators';
import { AppConfig } from '../../common/config/app-config.service';
import { RoomEventsService } from '../../common/events/events.service';
import { RoomsService } from '../rooms/rooms.service';

/**
 * Live updates for one room as server-sent events. Each event is `data: {type, roomId, at, data}`
 * (unnamed, so EventSource.onmessage gets them); a `: ping` comment keeps proxies from closing it.
 * EventSource can't send headers, so the token may come as ?access_token= (see AuthGuard).
 */
@Controller('rooms/:roomId/events')
export class EventsController {
  constructor(private readonly rooms: RoomsService, private readonly events: RoomEventsService, private readonly config: AppConfig) {}

  @Get()
  async stream(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string, @Req() req: Request, @Res() res: Response) {
    await this.rooms.getOwnedRoom(roomId, user.id); // 404 before the stream opens

    res.status(200);
    res.setHeader('content-type', 'text/event-stream; charset=utf-8');
    res.setHeader('cache-control', 'no-cache, no-transform');
    res.setHeader('connection', 'keep-alive');
    res.setHeader('x-accel-buffering', 'no'); // nginx: don't buffer
    res.flushHeaders();
    res.write('retry: 3000\n: connected\n\n');

    const off = this.events.subscribe(roomId, (e) => res.write(`data: ${JSON.stringify(e)}\n\n`));
    const ping = setInterval(() => res.write(': ping\n\n'), this.config.get('SSE_HEARTBEAT_MS'));
    req.on('close', () => {
      clearInterval(ping);
      off();
    });
  }
}
