import { memo, useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';
import { LogIn, LogOut, Sparkles, PenLine, SmilePlus, Reply, CornerUpLeft, Zap } from 'lucide-react';
import { MessageReactions, type GroupedReaction } from './MessageReactions';

export interface Message {
  id: string;
  user_id: string;
  username: string;
  message: string;
  message_type: 'chat' | 'system' | 'buzz';
  created_at: string;
  reply_to_id?: string | null;
  reply_to_username?: string | null;
  reply_to_message?: string | null;
  image_url?: string | null;
}

export interface ProcessedMessage extends Message {
  formattedTime: string;
  userColor: string;
  isGrouped: boolean;
  isSelf: boolean;
  isJumbo: boolean;
  daySeparator: string | null;
  // Pre-computed in the parent's memo so we don't run groupReactions per
  // item per render.
  groupedReactions: GroupedReaction[];
}

const QUICK_REACTIONS = ['❤️', '😆', '😮', '😢', '😡', '👍'] as const;

const systemIconFor = (message: string) => {
  if (message.includes('joined')) return { Icon: LogIn, cls: 'sys-color-join' };
  if (message.includes('left')) return { Icon: LogOut, cls: 'sys-color-leave' };
  if (message.includes('is now')) return { Icon: PenLine, cls: 'sys-color-rename' };
  return { Icon: Sparkles, cls: 'sys-color-default' };
};

interface MessageItemProps {
  msg: ProcessedMessage;
  currentUserId: string;
  onReact: (messageId: string, emoji: string) => void;
  onUnreact: (messageId: string, emoji: string) => void;
  onReplyRequest: (msg: Message) => void;
  onJumpToMessage: (messageId: string) => void;
}

// Manual memo. Remove when React Compiler is enabled (currently blocked: SWC plugin support pending).
export const MessageItem = memo(function MessageItem({
  msg,
  currentUserId,
  onReact,
  onUnreact,
  onReplyRequest,
  onJumpToMessage,
}: MessageItemProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  if (msg.message_type === 'system') {
    const { Icon, cls } = systemIconFor(msg.message);
    return (
      <div className="message message-system">
        <Icon className={`sys-lucide ${cls}`} />
        <span className="message-text-system">{msg.message}</span>
      </div>
    );
  }

  if (msg.message_type === 'buzz') {
    return (
      <div className="message message-buzz" role="status">
        <Zap className="message-buzz-icon" />
        <span className="message-buzz-text">
          <strong style={{ color: msg.userColor }}>{msg.username}</strong>
          {' buzzed the room!'}
        </span>
      </div>
    );
  }

  const handlePalettePick = (emoji: string) => {
    const hasMine = msg.groupedReactions.find((g) => g.emoji === emoji)?.hasMine ?? false;
    if (hasMine) onUnreact(msg.id, emoji);
    else onReact(msg.id, emoji);
    setPaletteOpen(false);
  };

  const bubbleClass = msg.isJumbo
    ? 'msg-bubble-jumbo'
    : `msg-bubble ${msg.isSelf ? 'msg-bubble-self' : 'msg-bubble-other'}`;

  return (
    <div
      className={`message msg-row ${msg.isSelf ? 'msg-self' : 'msg-other'} ${msg.isGrouped ? 'msg-grouped' : ''}`}
    >
      {!msg.isSelf && !msg.isGrouped && (
        <div className="msg-avatar" style={{ backgroundColor: msg.userColor }}>
          {msg.username[0].toUpperCase()}
        </div>
      )}
      {!msg.isSelf && msg.isGrouped && <div className="msg-avatar-spacer" />}

      <div className="msg-bubble-wrap">
        {(msg.reply_to_id || msg.reply_to_message) && msg.reply_to_username && (
          <button
            type="button"
            className="msg-reply-quote"
            onClick={() => msg.reply_to_id && onJumpToMessage(msg.reply_to_id)}
            title={msg.reply_to_id ? `Jump to ${msg.reply_to_username}'s message` : 'Original is no longer in view'}
            disabled={!msg.reply_to_id}
          >
            <span className="msg-reply-quote-header">
              <CornerUpLeft className="msg-reply-quote-icon" />
              <span className="msg-reply-quote-name">{msg.reply_to_username}</span>
            </span>
            <span className="msg-reply-quote-snippet">{msg.reply_to_message}</span>
          </button>
        )}
        <div className="msg-bubble-and-react">
          <div className={bubbleClass}>
            {!msg.isJumbo && !msg.isSelf && !msg.isGrouped && (
              <div className="msg-bubble-name" style={{ color: msg.userColor }}>{msg.username}</div>
            )}
            {msg.image_url && (
              <a
                href={msg.image_url}
                target="_blank"
                rel="noopener noreferrer"
                className="msg-bubble-image-link"
                aria-label="Open image in new tab"
              >
                <img
                  src={msg.image_url}
                  alt="Shared by sender"
                  loading="lazy"
                  decoding="async"
                  className="msg-bubble-image"
                />
              </a>
            )}
            {msg.message && <span className="msg-bubble-text">{msg.message}</span>}
          </div>
          <div className="msg-actions-group">
            <button
              type="button"
              className="msg-action-btn msg-reply-btn"
              onClick={() => onReplyRequest(msg)}
              aria-label="Reply"
              title="Reply"
            >
              <Reply className="h-3.5 w-3.5" />
            </button>
            <Popover open={paletteOpen} onOpenChange={setPaletteOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="msg-action-btn msg-react-btn"
                  aria-label="Add reaction"
                  title="Add reaction"
                >
                  <SmilePlus className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="msg-react-palette"
                side="top"
                align={msg.isSelf ? 'end' : 'start'}
                sideOffset={6}
              >
                {QUICK_REACTIONS.map((emoji) => {
                  const mine = msg.groupedReactions.find((g) => g.emoji === emoji)?.hasMine ?? false;
                  return (
                    <button
                      key={emoji}
                      type="button"
                      className={`msg-react-palette-btn ${mine ? 'is-mine' : ''}`}
                      onClick={() => handlePalettePick(emoji)}
                      aria-label={`React with ${emoji}`}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <MessageReactions
          groupedReactions={msg.groupedReactions}
          currentUserId={currentUserId}
          isSelfMessage={msg.isSelf}
          onUnreact={(emoji) => onUnreact(msg.id, emoji)}
        />
        <span className="msg-bubble-time">{msg.formattedTime}</span>
      </div>
    </div>
  );
});
