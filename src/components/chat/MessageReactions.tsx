import { memo, useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';
import { getUserColor } from '@/lib/roomUtils';

export interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  username: string;
  emoji: string;
  created_at: string;
}

export interface GroupedReaction {
  emoji: string;
  count: number;
  hasMine: boolean;
  reactions: Reaction[];
}

/**
 * Group a flat reactions array by emoji and tag whether the current user
 * is one of the reactors. Hoisted out of the per-message component so it
 * runs once per render cycle in the parent's memo, not once per item.
 */
export function groupReactions(
  reactions: Reaction[] | undefined,
  currentUserId: string,
): GroupedReaction[] {
  if (!reactions || reactions.length === 0) return [];
  const byEmoji = new Map<string, GroupedReaction>();
  for (const r of reactions) {
    const existing = byEmoji.get(r.emoji);
    if (existing) {
      existing.count += 1;
      existing.reactions.push(r);
      if (r.user_id === currentUserId) existing.hasMine = true;
    } else {
      byEmoji.set(r.emoji, {
        emoji: r.emoji,
        count: 1,
        hasMine: r.user_id === currentUserId,
        reactions: [r],
      });
    }
  }
  return Array.from(byEmoji.values());
}

interface MessageReactionsProps {
  groupedReactions: GroupedReaction[];
  currentUserId: string;
  isSelfMessage: boolean;
  onUnreact: (emoji: string) => void;
}

/**
 * Renders the reaction-chip row beneath a message, with reactor-list
 * popovers per emoji. Pure presentation — all grouping happens in the
 * parent's memo.
 */
// Manual memo. Remove when React Compiler is enabled (currently blocked: SWC plugin support pending).
export const MessageReactions = memo(function MessageReactions({
  groupedReactions,
  currentUserId,
  isSelfMessage,
  onUnreact,
}: MessageReactionsProps) {
  // Only one reactor-list popover at a time per message — track which
  // emoji's list is open (or null when nothing is open).
  const [openEmoji, setOpenEmoji] = useState<string | null>(null);

  if (groupedReactions.length === 0) return null;

  return (
    <div className="msg-reactions-row">
      {groupedReactions.map((g) => (
        <Popover
          key={g.emoji}
          open={openEmoji === g.emoji}
          onOpenChange={(open) => setOpenEmoji(open ? g.emoji : null)}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              className={`msg-reaction-chip ${g.hasMine ? 'is-mine' : ''}`}
              aria-label={`${g.count} ${g.emoji} reaction${g.count > 1 ? 's' : ''} — click to see who`}
            >
              <span className="msg-reaction-chip-emoji">{g.emoji}</span>
              <span className="msg-reaction-chip-count">{g.count}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="msg-reactors-popover"
            side="top"
            align={isSelfMessage ? 'end' : 'start'}
            sideOffset={6}
          >
            <div className="msg-reactors-header">
              <span className="msg-reactors-header-emoji">{g.emoji}</span>
              <span className="msg-reactors-header-count">
                {g.count} reaction{g.count === 1 ? '' : 's'}
              </span>
            </div>
            <ul className="msg-reactors-list">
              {g.reactions.map((r) => {
                const mine = r.user_id === currentUserId;
                return (
                  <li
                    key={r.id}
                    className={`msg-reactor-row ${mine ? 'msg-reactor-row-mine' : ''}`}
                  >
                    <span
                      className="msg-reactor-avatar"
                      style={{ backgroundColor: getUserColor(r.user_id) }}
                    >
                      {r.username[0].toUpperCase()}
                    </span>
                    <span className="msg-reactor-name">
                      {r.username}
                      {mine && <span className="msg-reactor-you"> (you)</span>}
                    </span>
                    {mine && (
                      <button
                        type="button"
                        className="msg-reactor-remove"
                        onClick={() => {
                          onUnreact(g.emoji);
                          setOpenEmoji(null);
                        }}
                        aria-label="Remove your reaction"
                      >
                        Remove
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </PopoverContent>
        </Popover>
      ))}
    </div>
  );
});
