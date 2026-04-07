import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Send, Users } from 'lucide-react';

interface Message {
  id: string;
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
}

export function ChatSidebar({
  messages,
  members,
  currentUsername,
  onSendMessage,
  onRename,
}: ChatSidebarProps) {
  const [messageText, setMessageText] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(currentUsername);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = () => {
    if (!messageText.trim()) return;
    onSendMessage(messageText);
    setMessageText('');
  };

  const handleRename = () => {
    if (!newName.trim() || newName === currentUsername) {
      setIsEditingName(false);
      setNewName(currentUsername);
      return;
    }
    onRename(newName);
    setIsEditingName(false);
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <div className="chat-sidebar">
      {/* Members section */}
      <div className="members-section">
        <div className="members-header">
          <Users className="h-4 w-4" />
          <span className="font-semibold">
            {members.length} {members.length === 1 ? 'Person' : 'People'} here
          </span>
        </div>
        <div className="members-list">
          {members.map((member) => (
            <div
              key={member.id}
              className={`member-item ${
                member.username === currentUsername ? 'member-item-self' : ''
              }`}
            >
              <div className="member-avatar">{member.username[0].toUpperCase()}</div>
              {member.username === currentUsername && !isEditingName ? (
                <button
                  className="member-name member-name-editable"
                  onClick={() => {
                    setIsEditingName(true);
                    setNewName(currentUsername);
                  }}
                >
                  {member.username}
                  <span className="text-xs ml-1">(you)</span>
                </button>
              ) : member.username === currentUsername && isEditingName ? (
                <Input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onBlur={handleRename}
                  onKeyPress={(e) => e.key === 'Enter' && handleRename()}
                  className="member-name-input"
                  autoFocus
                />
              ) : (
                <span className="member-name">{member.username}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Messages section */}
      <div className="messages-section">
        <ScrollArea className="messages-scroll">
          <div className="messages-list">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`message ${
                  msg.message_type === 'system' ? 'message-system' : 'message-chat'
                }`}
              >
                {msg.message_type === 'chat' ? (
                  <>
                    <div className="message-header">
                      <span className="message-username">{msg.username}</span>
                      <span className="message-time">{formatTime(msg.created_at)}</span>
                    </div>
                    <div className="message-text">{msg.message}</div>
                  </>
                ) : (
                  <div className="message-text-system">{msg.message}</div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </div>

      {/* Input section */}
      <div className="chat-input-section">
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Type a message..."
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          />
          <Button onClick={handleSendMessage} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
