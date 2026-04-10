import { useState, useEffect, useRef, useLayoutEffect, memo, useCallback, useMemo } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Send, Check, X, LogIn, LogOut, Sparkles, PenLine } from 'lucide-react';

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

const USER_COLORS = [
  '#6d28d9', '#0891b2', '#b45309', '#059669', '#db2777',
  '#2563eb', '#dc2626', '#7c3aed', '#0d9488', '#c2410c'
];

function getUserColor(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

const MessageItem = memo(({ msg, formattedTime, userColor, isGrouped, isSelf }: {
  msg: Message;
  formattedTime: string;
  userColor: string;
  isGrouped: boolean;
  isSelf: boolean;
}) => {
  if (msg.message_type === 'system') {
    const isJoin = msg.message.includes('joined');
    const isLeft = msg.message.includes('left');
    const isRenamed = msg.message.includes('is now');
    return (
      <div className="message message-system">
        {isJoin ? (
          <LogIn className="sys-lucide sys-color-join" />
        ) : isLeft ? (
          <LogOut className="sys-lucide sys-color-leave" />
        ) : isRenamed ? (
          <PenLine className="sys-lucide sys-color-rename" />
        ) : (
          <Sparkles className="sys-lucide sys-color-default" />
        )}
        <span className="message-text-system">{msg.message}</span>
      </div>
    );
  }

  return (
    <div className={`message msg-row ${isSelf ? 'msg-self' : 'msg-other'} ${isGrouped ? 'msg-grouped' : ''}`}>
      {!isSelf && !isGrouped && (
        <div className="msg-avatar" style={{ backgroundColor: userColor }}>
          {msg.username[0].toUpperCase()}
        </div>
      )}
      {!isSelf && isGrouped && <div className="msg-avatar-spacer" />}

      <div className="msg-bubble-wrap">
        <div className={`msg-bubble ${isSelf ? 'msg-bubble-self' : 'msg-bubble-other'}`}>
          {!isSelf && !isGrouped && (
            <div className="msg-bubble-name" style={{ color: userColor }}>{msg.username}</div>
          )}
          <span className="msg-bubble-text">{msg.message}</span>
        </div>
        <span className="msg-bubble-time">{formattedTime}</span>
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const isNearBottomRef = useRef(true);
  const justSentRef = useRef(false);
  const timeCache = useRef<Map<string, string>>(new Map());
  const inputDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastInputTimeRef = useRef(0);

  const formatTime = useCallback((timestamp: string): string => {
    if (timeCache.current.has(timestamp)) {
      return timeCache.current.get(timestamp)!;
    }
    const date = new Date(timestamp);
    const formatted = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    timeCache.current.set(timestamp, formatted);
    return formatted;
  }, []);

  const processedMessages = useMemo(() => {
    return messages.map((msg, index) => {
      const prevMsg = index > 0 ? messages[index - 1] : null;
      const isGrouped = prevMsg !== null
        && prevMsg.username === msg.username
        && prevMsg.message_type === 'chat'
        && msg.message_type === 'chat'
        && (new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime()) < 120000;

      return {
        ...msg,
        formattedTime: formatTime(msg.created_at),
        userColor: getUserColor(msg.user_id),
        isGrouped,
        isSelf: msg.username === currentUsername,
      };
    });
  }, [messages, formatTime, currentUsername]);

  // Direct scroll — no Radix, no scrollIntoView, just scrollTop
  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  // Track if user is near the bottom
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) {
      isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    }
  }, []);

  // Auto-scroll after DOM updates (useLayoutEffect fires before paint = scrollHeight is accurate)
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
    if (messages.length > 0) {
      scrollToBottom();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length > 0]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.currentTarget.value;
    const now = Date.now();

    if (inputDebounceRef.current) {
      clearTimeout(inputDebounceRef.current);
    }

    setMessageText(newValue);
    lastInputTimeRef.current = now;

    inputDebounceRef.current = setTimeout(() => {
      lastInputTimeRef.current = 0;
    }, 50);
  }, []);

  const handleSendMessage = useCallback(() => {
    if (!messageText.trim()) return;

    if (inputDebounceRef.current) {
      clearTimeout(inputDebounceRef.current);
    }

    justSentRef.current = true;
    onSendMessage(messageText);
    setMessageText('');
    lastInputTimeRef.current = 0;
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

  useEffect(() => {
    return () => {
      if (inputDebounceRef.current) {
        clearTimeout(inputDebounceRef.current);
      }
    };
  }, []);

  return (
    <div
      className={`chat-sidebar ${isOpen ? '' : 'chat-sidebar-closed'}`}
      aria-hidden={!isOpen}
      {...(!isOpen ? { inert: '' as any } : {})}
    >
      {/* Chat header */}
      <div className="chat-header-pixel">
        <div className="chat-header-title">
          <span className="pixel-chat-icon" aria-hidden="true">&gt;_</span>
          <span>Chat</span>
        </div>
        <div className="chat-header-status">
          <span className="pixel-dot" aria-hidden="true" />
          <span className="members-count">{members.length} online</span>
        </div>
      </div>

      {/* Members section */}
      <div className="members-section">
        <div className="members-header-row">
        </div>
        <div className="members-list">
          {members.map((member) => {
            const isSelf = member.username === currentUsername;
            const color = getUserColor(member.user_id);

            return (
              <div key={member.id} className="member-row">
                <div
                  className={`member-avatar-compact ${isSelf ? 'member-avatar-self' : ''}`}
                  style={{ backgroundColor: color }}
                >
                  {member.username[0].toUpperCase()}
                </div>

                {isSelf && !isEditingName ? (
                  <button
                    className="member-self-name"
                    onClick={() => {
                      setIsEditingName(true);
                      setNewName(currentUsername);
                    }}
                    title="Click to edit your name"
                  >
                    <span className="member-name-text">{member.username}</span>
                    <span className="member-you-tag">you</span>
                  </button>
                ) : isSelf && isEditingName ? (
                  <div className="member-name-edit-container">
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
                    <button
                      className="member-name-confirm"
                      onClick={handleRename}
                      title="Confirm (Enter)"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="member-name-cancel"
                      onClick={() => {
                        setIsEditingName(false);
                        setNewName(currentUsername);
                      }}
                      title="Cancel (Esc)"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <span className="member-name-text">{member.username}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Messages section */}
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
              <MessageItem
                key={msg.id}
                msg={msg}
                formattedTime={msg.formattedTime}
                userColor={msg.userColor}
                isGrouped={msg.isGrouped}
                isSelf={msg.isSelf}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Input section */}
      <div className="chat-input-section">
        <div className="chat-input-wrapper">
          <Input
            type="text"
            placeholder="Message..."
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
      </div>
    </div>
  );
}
