import { HttpException } from '@nestjs/common';
import { FURNITURE_TYPES, FurnitureType } from '@hey-jenna/contracts';
import { ChatAssistant, ChatInput } from './chat-assistant';

type Intent = 'palette' | 'fit' | 'shopping' | 'similar';

const INTENTS: [Intent, RegExp][] = [
  ['shopping', /\b(shopping|buy|cost|price|total|budget|how much)\b/i],
  ['similar', /\b(similar|like this|like that|alternatives?|more options|find|search|other)\b/i],
  ['fit', /\b(fit|fits|space|room for|too (big|small|full)|layout|arrange|checks?)\b/i],
  ['palette', /\b(palette|colou?rs?|style|vibe|mood)\b/i],
];

const HELP = 'I can tell you the palette, check how things fit, read the shopping list, or find similar pieces (e.g. "find a similar sofa").';

/** No API key: match the message to one of four intents and call the same services. */
export class RuleChatAssistant implements ChatAssistant {
  async reply({ message, tools }: ChatInput) {
    const intent = INTENTS.find(([, re]) => re.test(message))?.[0];
    if (!intent) return { reply: HELP };
    try {
      switch (intent) {
        case 'palette': {
          const s = await tools.readStyle();
          const p = s.palette;
          return { reply: `Your style is "${s.name}". Palette: main ${p.dominant.join(', ')}, secondary ${p.secondary.join(', ')}, accent ${p.accent.join(', ')}.` };
        }
        case 'fit': {
          const f = await tools.fitCheck();
          const parts = [`${f.pieces} pieces placed: ${f.summary.pass} checks pass, ${f.summary.warn} warn, ${f.summary.fail} fail.`];
          if (f.problems.length) parts.push(`To look at: ${f.problems.slice(0, 3).join('; ')}.`);
          if (f.dropped.length) parts.push(`Left out to make it fit: ${f.dropped.map((d) => d.name).join(', ')}.`);
          return { reply: parts.join(' ') };
        }
        case 'shopping': {
          try {
            const l = await tools.shoppingList();
            const missing = l.missing.length ? ` Still missing: ${l.missing.join(', ')}.` : '';
            const cap = l.budgetCad != null
              ? ` Home budget ${Math.round(l.budgetCad)} CAD, this room's share ${Math.round(l.roomShare ?? 0)} CAD, other rooms ${Math.round(l.spentElsewhere ?? 0)} CAD.`
              : '';
            return { reply: `${l.items.length} items, ${l.total.toFixed(2)} ${l.currency} in total.${cap}${missing}` };
          } catch (e) {
            if (!(e instanceof HttpException)) throw e;
            const b = await tools.budget();
            if (!b) return { reply: e.message };
            return { reply: `Home budget ${Math.round(b.budgetCad)} CAD. This room's share is ${Math.round(b.roomShare)} CAD. Other rooms already total ${Math.round(b.spentElsewhere)} CAD. This room has no shopping list yet.` };
          }
        }
        case 'similar': {
          const types = mentionedTypes(message);
          const r = await tools.searchListings({ types: types.length ? types : undefined, perType: 6 });
          const top = r.top.slice(0, 3).map((t) => `${t.title}${t.price != null ? ` (${t.price} ${t.currency})` : ''}`);
          return { reply: top.length ? `Found more pieces in your style, e.g. ${top.join('; ')}.` : 'I searched but found nothing new this time.' };
        }
      }
    } catch (e) {
      if (e instanceof HttpException) return { reply: e.message };
      throw e;
    }
  }
}

/** Furniture types named in the message ("coffee table" → coffee_table, "sofas" → sofa). */
export function mentionedTypes(message: string): FurnitureType[] {
  const text = message.toLowerCase();
  return FURNITURE_TYPES.filter((t) => new RegExp(`\\b${t.replace(/_/g, '[ _-]?')}s?\\b`).test(text));
}
