import { useRef, useState } from 'react';
import { Paperclip, X, FileText, Image, File as FileIcon } from 'lucide-react';
import styles from './FileAttachment.module.css';

export interface AttachedFile {
  id: string;
  file: File;
  preview?: string;
  type: 'image' | 'document' | 'other';
}

interface FileAttachmentProps {
  attachments: AttachedFile[];
  onAttach: (files: AttachedFile[]) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/json',
];

function generateId(): string {
  return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getFileType(file: File): 'image' | 'document' | 'other' {
  if (file.type.startsWith('image/')) return 'image';
  if (
    file.type === 'application/pdf' ||
    file.type.startsWith('text/') ||
    file.type === 'application/json'
  ) {
    return 'document';
  }
  return 'other';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileAttachment({
  attachments,
  onAttach,
  onRemove,
  disabled,
}: FileAttachmentProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setError(null);

    const validFiles: AttachedFile[] = [];

    for (const file of files) {
      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        setError(`${file.name} is too large (max 10MB)`);
        continue;
      }

      // Check file type
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`${file.name} has an unsupported file type`);
        continue;
      }

      const fileType = getFileType(file);
      let preview: string | undefined;

      // Generate preview for images
      if (fileType === 'image') {
        preview = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      }

      validFiles.push({
        id: generateId(),
        file,
        preview,
        type: fileType,
      });
    }

    if (validFiles.length > 0) {
      onAttach(validFiles);
    }

    // Reset input
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className={styles.container}>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ALLOWED_TYPES.join(',')}
        onChange={handleChange}
        className={styles.input}
        disabled={disabled}
      />

      <button
        type="button"
        className={styles.button}
        onClick={handleClick}
        disabled={disabled}
        title="Attach files"
      >
        <Paperclip size={18} />
      </button>

      {attachments.length > 0 && (
        <div className={styles.attachments}>
          {attachments.map((attachment) => (
            <div key={attachment.id} className={styles.attachment}>
              {attachment.type === 'image' && attachment.preview ? (
                <img
                  src={attachment.preview}
                  alt={attachment.file.name}
                  className={styles.preview}
                />
              ) : (
                <div className={styles.fileIcon}>
                  {attachment.type === 'document' ? (
                    <FileText size={16} />
                  ) : (
                    <FileIcon size={16} />
                  )}
                </div>
              )}
              <div className={styles.fileInfo}>
                <span className={styles.fileName}>{attachment.file.name}</span>
                <span className={styles.fileSize}>
                  {formatFileSize(attachment.file.size)}
                </span>
              </div>
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => onRemove(attachment.id)}
                title="Remove"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
}

export function AttachmentPreview({ attachment }: { attachment: AttachedFile }) {
  return (
    <div className={styles.previewContainer}>
      {attachment.type === 'image' && attachment.preview ? (
        <img
          src={attachment.preview}
          alt={attachment.file.name}
          className={styles.previewImage}
        />
      ) : (
        <div className={styles.previewFile}>
          {attachment.type === 'document' ? (
            <FileText size={24} />
          ) : (
            <FileIcon size={24} />
          )}
          <span>{attachment.file.name}</span>
        </div>
      )}
    </div>
  );
}
