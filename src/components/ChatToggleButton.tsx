import { MessageSquare, ChevronRight } from 'lucide-react';

interface ChatToggleButtonProps {
  isOpen: boolean;
  onToggle: () => void;
  unreadCount: number;
}

export function ChatToggleButton({ isOpen, onToggle, unreadCount }: ChatToggleButtonProps) {
  return (
    <div className="chat-toggle-wrapper">
      <button
        onClick={onToggle}
        className="chat-toggle-btn"
        aria-label={isOpen ? 'Hide chat' : 'Show chat'}
        aria-expanded={isOpen}
        title={isOpen ? 'Hide chat' : 'Show chat'}
      >
        {isOpen ? (
          <ChevronRight className="h-5 w-5" />
        ) : (
          <MessageSquare className="h-5 w-5" />
        )}

        {!isOpen && unreadCount > 0 && (
          <span className="chat-toggle-badge animate-pixel-pop">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <span className="sr-only" aria-live="polite">
        {unreadCount > 0 ? `${unreadCount} unread messages` : ''}
      </span>
    </div>
  );
}
