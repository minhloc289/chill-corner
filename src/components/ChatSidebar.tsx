import { useState, useEffect, useRef, useLayoutEffect, memo, useCallback, useMemo } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Send, Check, X, LogIn, LogOut, Sparkles, PenLine, Pencil } from 'lucide-react';
import {
  getUserColor,
  getUserId,
  formatMessageTime,
  formatRelativeTime,
  formatDateSeparator,
} from '@/lib/roomUtils';

interface Message {
  id: string;
  user_id: string;
  username: string;
  message: string;
  message_type: 'chat' | 'system';
  created_at: string;
}

interface RoomMember {
  id: string;
  user_id: string;
  username: string;
}

interface ChatSidebarProps {
  messages: Message[];
  members: RoomMember[];
  currentUsername: string;
  onSendMessage: (message: string) => void;
  onRename: (newName: string) => void;
  isOpen: boolean;
}

interface ProcessedMessage extends Message {
  formattedTime: string;
  userColor: string;
  isGrouped: boolean;
  isSelf: boolean;
  daySeparator: string | null;
}

const systemIconFor = (message: string) => {
  if (message.includes('joined')) return { Icon: LogIn, cls: 'sys-color-join' };
  if (message.includes('left')) return { Icon: LogOut, cls: 'sys-color-leave' };
  if (message.includes('is now')) return { Icon: PenLine, cls: 'sys-color-rename' };
  return { Icon: Sparkles, cls: 'sys-color-default' };
};

const MessageItem = memo(({ msg }: { msg: ProcessedMessage }) => {
  if (msg.message_type === 'system') {
    const { Icon, cls } = systemIconFor(msg.message);
    return (
      <div className="message message-system">
        <Icon className={`sys-lucide ${cls}`} />
        <span className="message-text-system">{msg.message}</span>
      </div>
    );
  }

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
        <div className={`msg-bubble ${msg.isSelf ? 'msg-bubble-self' : 'msg-bubble-other'}`}>
          {!msg.isSelf && !msg.isGrouped && (
            <div className="msg-bubble-name" style={{ color: msg.userColor }}>{msg.username}</div>
          )}
          <span className="msg-bubble-text">{msg.message}</span>
        </div>
        <span className="msg-bubble-time">{msg.formattedTime}</span>
      </div>
    </div>
  );
});
MessageItem.displayName = 'MessageItem';

export function ChatSidebar({
  messages,
  members,
  currentUsername,
  onSendMessage,
  onRename,
  isOpen,
}: ChatSidebarProps) {
  const [messageText, setMessageText] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(currentUsername);
  const [isTyping, setIsTyping] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const isNearBottomRef = useRef(true);
  const justSentRef = useRef(false);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Derived: last chat message per user_id for preview + sort
  const lastActivityByUser = useMemo(() => {
    const out = new Map<string, { ts: string; preview: string }>();
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.message_type !== 'chat') continue;
      if (!out.has(m.user_id)) out.set(m.user_id, { ts: m.created_at, preview: m.message });
    }
    return out;
  }, [messages]);

  // Sort: self first, then by recent activity, then alphabetically.
  // Defensive: guarantee the current user appears even if the `members` prop is
  // stale or empty (initial subscription lag, transient realtime disconnect).
  const sortedMembers = useMemo(() => {
    const hasSelf = members.some((m) => m.username === currentUsername);
    const base: RoomMember[] = hasSelf
      ? [...members]
      : [
          ...members,
          {
            id: `self-${currentUsername}`,
            user_id: getUserId(),
            username: currentUsername,
          },
        ];
    return base.sort((a, b) => {
      if (a.username === currentUsername) return -1;
      if (b.username === currentUsername) return 1;
      const ta = lastActivityByUser.get(a.user_id)?.ts;
      const tb = lastActivityByUser.get(b.user_id)?.ts;
      if (ta && tb) return tb.localeCompare(ta);
      if (ta) return -1;
      if (tb) return 1;
      return a.username.localeCompare(b.username);
    });
  }, [members, currentUsername, lastActivityByUser]);

  const processedMessages = useMemo<ProcessedMessage[]>(() => {
    let prevDay = '';
    return messages.map((msg, index) => {
      const prevMsg = index > 0 ? messages[index - 1] : null;
      const isGrouped =
        prevMsg !== null &&
        prevMsg.username === msg.username &&
        prevMsg.message_type === 'chat' &&
        msg.message_type === 'chat' &&
        new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() < 120_000;

      const day = formatDateSeparator(msg.created_at);
      const daySeparator = day !== prevDay ? day : null;
      prevDay = day;

      return {
        ...msg,
        formattedTime: formatMessageTime(msg.created_at),
        userColor: getUserColor(msg.user_id),
        isGrouped: isGrouped && !daySeparator,
        isSelf: msg.username === currentUsername,
        daySeparator,
      };
    });
  }, [messages, currentUsername]);

  const headerSubline = useMemo(() => {
    const lastChat = [...messages].reverse().find((m) => m.message_type === 'chat');
    if (!lastChat) return 'quiet room';
    return `active ${formatRelativeTime(lastChat.created_at)}`;
  }, [messages]);

  // Instant scroll — no animation race, no Radix, no scrollIntoView.
  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Track whether the user is within 80 px of the bottom. Mutable ref so
  // every scroll event is O(1) and doesn't re-render the component.
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  // After each DOM commit that added messages: scroll only when the user
  // was already near the bottom OR just sent a message themselves. If
  // they're scrolled up reading history, their position is preserved
  // and no toasts interrupt them.
  useLayoutEffect(() => {
    const currentCount = messages.length;
    const prevCount = prevMessageCountRef.current;

    if (currentCount > prevCount && currentCount > 0) {
      if (justSentRef.current || isNearBottomRef.current) {
        scrollToBottom();
        justSentRef.current = false;
      }
    }

    prevMessageCountRef.current = currentCount;
  }, [messages, scrollToBottom]);

  // Initial scroll on first load
  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length > 0]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value;
    setMessageText(value);

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (value.trim().length > 0) {
      setIsTyping(true);
      typingTimerRef.current = setTimeout(() => setIsTyping(false), 600);
    } else {
      setIsTyping(false);
    }
  }, []);

  const handleSendMessage = useCallback(() => {
    if (!messageText.trim()) return;
    justSentRef.current = true;
    onSendMessage(messageText);
    setMessageText('');
    setIsTyping(false);
  }, [messageText, onSendMessage]);

  const handleRename = useCallback(() => {
    if (!newName.trim() || newName === currentUsername) {
      setIsEditingName(false);
      setNewName(currentUsername);
      return;
    }
    onRename(newName);
    setIsEditingName(false);
  }, [newName, currentUsername, onRename]);

  useEffect(() => () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
  }, []);

  const charCount = messageText.length;
  const showCounter = charCount > 180;

  return (
    <div
      className={`chat-sidebar ${isOpen ? '' : 'chat-sidebar-closed'}`}
      aria-hidden={!isOpen}
      {...(!isOpen ? { inert: '' as any } : {})}
    >
      {/* Brand header */}
      <header className="chat-header-pixel">
        <div className="chat-header-row">
          <div className="chat-header-title">
            <span className="chat-brand-sun" aria-hidden="true" />
            <span>CHILL CORNER</span>
          </div>
          <div className="chat-header-status">
            <span className="pixel-dot" aria-hidden="true" />
            <span className="members-count">{sortedMembers.length} listening</span>
          </div>
        </div>
        <div className="chat-header-subline">
          <span>{headerSubline}</span>
        </div>
      </header>

      {/* Members section — minimal pixel chip grid */}
      <section className="members-section">
        <div className="section-label-row">
          <span className="section-label">
            In the room
            <span className="section-label-count">· {sortedMembers.length}</span>
          </span>
          <button
            className="section-rename-btn"
            onClick={() => {
              setIsEditingName(true);
              setNewName(currentUsername);
            }}
            title="Rename yourself"
            aria-label="Rename yourself"
            type="button"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </div>

        {isEditingName && (
          <div className="section-rename-row">
            <Input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleRename();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setIsEditingName(false);
                  setNewName(currentUsername);
                }
              }}
              className="member-name-input"
              autoFocus
            />
            <button className="member-name-confirm" onClick={handleRename} title="Save (Enter)" type="button">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              className="member-name-cancel"
              onClick={() => {
                setIsEditingName(false);
                setNewName(currentUsername);
              }}
              title="Cancel (Esc)"
              type="button"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="members-list">
          {sortedMembers.map((member) => {
            const isSelf = member.username === currentUsername;
            const color = getUserColor(member.user_id);
            const activity = lastActivityByUser.get(member.user_id);
            const justSpoke = activity
              ? Date.now() - new Date(activity.ts).getTime() < 4_000
              : false;

            return (
              <div
                key={member.id}
                className={`member-row ${isSelf ? 'member-row-self' : ''} ${justSpoke ? 'member-row-speaking' : ''}`}
                title={isSelf ? `${member.username} (you)` : member.username}
                aria-label={isSelf ? `${member.username}, you` : member.username}
              >
                <span className="member-row-avatar" style={{ backgroundColor: color }}>
                  {member.username[0].toUpperCase()}
                </span>
                <span className="member-row-name">{member.username}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Messages area */}
      <div className="messages-section">
        <div
          className="messages-scroll"
          ref={scrollContainerRef}
          onScroll={handleScroll}
        >
          <div className="messages-list">
            {processedMessages.length === 0 && (
              <div className="chat-empty-state">
                <div className="pixel-cat" aria-hidden="true" />
                <p>No messages yet</p>
                <p className="chat-empty-hint">Say hi to start the conversation</p>
              </div>
            )}
            {processedMessages.map((msg) => (
              <div key={msg.id}>
                {msg.daySeparator && (
                  <div className="date-separator" aria-label={msg.daySeparator}>
                    <span className="date-separator-chip">{msg.daySeparator}</span>
                  </div>
                )}
                <MessageItem msg={msg} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Composer */}
      <div className="chat-input-section">
        <div className="chat-composer-typing" aria-live="polite">
          {isTyping ? 'pressing keys…' : ''}
        </div>
        <div className="chat-input-wrapper">
          <Input
            type="text"
            placeholder="Message the room…"
            value={messageText}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            className="chat-input-field"
            aria-label="Message input"
          />
          <Button
            onClick={handleSendMessage}
            size="icon"
            type="button"
            className="chat-send-button"
            disabled={!messageText.trim()}
            title="Send message (Enter)"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {showCounter && (
          <div className="chat-composer-counter">{charCount} chars</div>
        )}
      </div>
    </div>
  );
}
