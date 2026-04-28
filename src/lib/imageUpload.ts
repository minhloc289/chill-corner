import { supabase } from './supabaseClient';

export const CHAT_IMAGE_BUCKET = 'chat-images';
export const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_IMAGE_ALLOWED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;

export type ChatImageType = (typeof CHAT_IMAGE_ALLOWED_TYPES)[number];

export type ChatImageErrorCode = 'too_large' | 'wrong_type' | 'upload_failed';

export class ChatImageError extends Error {
  code: ChatImageErrorCode;
  constructor(code: ChatImageErrorCode, message: string) {
    super(message);
    this.name = 'ChatImageError';
    this.code = code;
  }
}

export function validateImage(file: File): asserts file is File {
  if (!CHAT_IMAGE_ALLOWED_TYPES.includes(file.type as ChatImageType)) {
    throw new ChatImageError('wrong_type', 'Only PNG, JPEG, GIF, or WebP images are supported.');
  }
  if (file.size > CHAT_IMAGE_MAX_BYTES) {
    throw new ChatImageError('too_large', 'Image is over the 5 MB limit.');
  }
}

function extensionFor(file: File): string {
  switch (file.type) {
    case 'image/png':  return 'png';
    case 'image/jpeg': return 'jpg';
    case 'image/gif':  return 'gif';
    case 'image/webp': return 'webp';
    default:           return 'bin';
  }
}

export async function uploadChatImage(file: File, roomId: string): Promise<string> {
  validateImage(file);

  const path = `${roomId}/${crypto.randomUUID()}.${extensionFor(file)}`;
  const { error } = await supabase.storage
    .from(CHAT_IMAGE_BUCKET)
    .upload(path, file, {
      cacheControl: '31536000',
      contentType: file.type,
      upsert: false,
    });
  if (error) {
    throw new ChatImageError('upload_failed', error.message);
  }

  const { data } = supabase.storage.from(CHAT_IMAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
