export interface Addr {
  name: string;
  address: string;
}

export interface AttachmentMeta {
  name: string;
  type: string;
  size: number;
}

/** Everything the list and search need about one message, without its body. */
export interface MessageMeta {
  /** `${sourceId}:${index}` */
  id: string;
  sourceId: string;
  /** Byte offset of the mbox `From ` separator line within the source file. */
  offset: number;
  /** Byte length of the separator line (headers start at offset + headerOffset). */
  headerOffset: number;
  /** Total byte length including the separator line. */
  length: number;
  /** Message-ID without angle brackets, lowercase. Empty when the message has none. */
  messageId: string;
  /** Key used to skip duplicates when merging several files. */
  dedupeKey: string;
  gmThreadId?: string;
  inReplyTo?: string;
  references: string[];
  from: Addr;
  to: Addr[];
  cc: Addr[];
  bcc: Addr[];
  replyTo: Addr[];
  deliveredTo?: string;
  subject: string;
  /** Epoch ms, 0 when unknown. */
  date: number;
  snippet: string;
  /** Labels as written in the archive (Gmail X-Gmail-Labels), or synthesized. */
  labels: string[];
  /** The archive had no folder/label info for this message (e.g. Google Vault exports). */
  folderless?: boolean;
  attachments: AttachmentMeta[];
  unread: boolean;
  starred: boolean;
  important: boolean;
}

/** Local changes the user made (star, read state) on top of the archive's flags. */
export interface MessageFlags {
  id: string;
  unread?: boolean;
  starred?: boolean;
  important?: boolean;
}

export interface Source {
  id: string;
  name: string;
  /** Archive (zip/tgz) the mbox was extracted from, if any. */
  archive?: string;
  /** Size of the mbox data in bytes (uncompressed). */
  size: number;
  importedAt: number;
  messageCount: number;
  duplicateCount: number;
  /** True when the raw file was copied into the browser's private file storage. */
  persisted: boolean;
  /** Name of the file inside the origin-private file system. */
  opfsName?: string;
  /** Import finished without being cancelled. */
  complete: boolean;
}

export interface SearchChunk {
  id: string;
  sourceId: string;
  ids: string[];
  texts: string[];
}

export interface Thread {
  id: string;
  /** Message ids, oldest first. */
  messageIds: string[];
  subject: string;
  lastDate: number;
  labels: Set<string>;
  unread: boolean;
  starred: boolean;
  important: boolean;
  hasAttachments: boolean;
  /** Every message is in Spam or Trash, so the thread is hidden from other views. */
  junk: boolean;
}

export type Density = 'default' | 'comfortable' | 'compact';
export type ThemeChoice = 'system' | 'light' | 'dark';
export type ReadingPane = 'none' | 'right';
export type ImagePolicy = 'ask' | 'always';

export interface Settings {
  density: Density;
  theme: ThemeChoice;
  readingPane: ReadingPane;
  imagePolicy: ImagePolicy;
  pageSize: number;
  /** Addresses that should render as "me". Auto-detected after import, editable. */
  meAddresses: string[];
  /** Senders whose remote images are always shown. */
  trustedImageSenders: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  density: 'default',
  theme: 'system',
  readingPane: 'none',
  imagePolicy: 'ask',
  pageSize: 50,
  meAddresses: [],
  trustedImageSenders: [],
};

export interface ImportProgress {
  fileName: string;
  fileIndex: number;
  fileCount: number;
  bytesRead: number;
  totalBytes: number;
  messages: number;
  duplicates: number;
}
