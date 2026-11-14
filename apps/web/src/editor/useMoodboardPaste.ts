/**
 * ⌘V / Ctrl+V on a room page (outside text inputs) adds the clipboard to that room's moodboard:
 * image files are added to the board (the upload's append mode keeps what is there), an i.pinimg.com address (text or HTML) is added as a pin.
 * The listener is attached once; the current room and mutations are read through a ref.
 */
import { useEffect, useRef } from 'react';
import { errorText } from '../api/client';
import { useAddMoodboardPins, useUploadMoodboard } from '../api/hooks';
import { toast } from '../app/useEditorStore';
import { pinimgFrom } from './frames/RoomFrames';

const MAX_IMAGES = 8;
const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function useMoodboardPaste(roomId: string | undefined) {
  const upload = useUploadMoodboard(roomId ?? '');
  const addPins = useAddMoodboardPins(roomId ?? '');
  const live = useRef({ roomId, upload, addPins });
  live.current = { roomId, upload, addPins };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const { roomId: id, upload: up, addPins: add } = live.current;
      if (!id || e.defaultPrevented || typing(e.target) || typing(document.activeElement)) return;
      const cd = e.clipboardData;
      if (!cd) return;
      const text = cd.getData('text/plain');
      const html = cd.getData('text/html');
      const pinUrl = pinimgFrom(text + ' ' + html);
      const files = [...cd.files].filter((f) => f.type.startsWith('image/'));

      if (pinUrl) {
        e.preventDefault();
        const name = (pinUrl.split('/').pop() || String(Date.now())).replace(/\.\w+$/, '');
        add.mutate([{ id: `paste-${name}`.slice(0, 64), imageUrl: pinUrl }], {
          onSuccess: () => toast('Pin added to the moodboard'),
          onError: (er) => toast(errorText(er)),
        });
      } else if (files.length) {
        e.preventDefault();
        if (files.length > MAX_IMAGES) toast(`Up to ${MAX_IMAGES} images: using the first ${MAX_IMAGES}`);
        up.mutate(
          { files: files.slice(0, MAX_IMAGES), append: true },
          {
            onSuccess: (s) => toast(`read ${s.imageCount} images: ${s.profile.vibe.slice(0, 3).join(', ') || s.profile.name}`),
            onError: (er) => toast(errorText(er)),
          },
        );
      } else if (/pinterest\.[a-z.]+\/pin\//i.test(text)) {
        e.preventDefault();
        toast("Copy the pin's image (right-click → Copy image) or drag it in");
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);
}
