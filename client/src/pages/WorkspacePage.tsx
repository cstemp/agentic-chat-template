import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  Send,
  ChevronDown,
  Star,
  MoreHorizontal,
  Loader2,
  FileText,
  File as FileIcon,
  Trash2,
  Edit3,
} from 'lucide-react';
import { useWorkspace, Message, AgentStep, MessageAttachment } from '../hooks/useWorkspaces';
import { useModels, Model } from '../hooks/useModels';
import { runAgent } from '../lib/api';
import { FileAttachment, AttachedFile } from '../components/FileAttachment';
import { LoadingSpinner } from '../components/LoadingSpinner';
import styles from './WorkspacePage.module.css';

interface LocationState {
  initialMessage?: string;
  selectedModel?: string;
}

export function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  const {
    workspace,
    loading: workspaceLoading,
    error: workspaceError,
    addMessage,
    updateMessage,
    toggleFavorite,
    deleteWorkspace,
    updateWorkspace,
  } = useWorkspace(id);

  const { models, defaultModel } = useModels();

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<Model>(defaultModel);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const headerMenuRef = useRef<HTMLDivElement>(null);

  // Update selected model when models load, respecting state if provided
  useEffect(() => {
    if (models.length > 0) {
      const stateModel = state?.selectedModel
        ? models.find((m) => m.id === state.selectedModel)
        : null;
      setSelectedModel(stateModel || defaultModel);
    }
  }, [models, defaultModel, state?.selectedModel]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initialMessageSentRef = useRef(false);

  // Handle initial message from home page
  useEffect(() => {
    if (
      state?.initialMessage &&
      workspace &&
      (!workspace.messages || workspace.messages.length === 0) &&
      !initialMessageSentRef.current
    ) {
      initialMessageSentRef.current = true;
      sendMessage(state.initialMessage);
      // Clear state to prevent re-sending on refresh
      window.history.replaceState({}, document.title);
    }
  }, [state, workspace]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [workspace?.messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close header menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (headerMenuRef.current && !headerMenuRef.current.contains(event.target as Node)) {
        setShowHeaderMenu(false);
      }
    }

    if (showHeaderMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showHeaderMenu]);

  const handleDeleteWorkspace = async () => {
    if (!confirm('Delete this workspace? This cannot be undone.')) return;
    try {
      await deleteWorkspace();
      navigate('/');
    } catch (error) {
      console.error('Failed to delete workspace:', error);
    }
  };

  const handleRenameWorkspace = () => {
    setEditTitle(workspace?.title || '');
    setIsEditingTitle(true);
    setShowHeaderMenu(false);
  };

  const handleSaveTitle = async () => {
    if (!editTitle.trim() || !workspace) return;
    try {
      await updateWorkspace({ title: editTitle.trim() });
      setIsEditingTitle(false);
    } catch (error) {
      console.error('Failed to rename workspace:', error);
    }
  };

  const handleAttach = (files: AttachedFile[]) => {
    setAttachments((prev) => [...prev, ...files]);
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const sendMessage = async (content: string, files: AttachedFile[] = []) => {
    if (!workspace || (!content.trim() && files.length === 0) || isLoading) return;

    // Build message content with file descriptions
    let messageContent = content.trim();
    if (files.length > 0) {
      const fileDescriptions = files
        .map((f) => `[Attached: ${f.file.name} (${f.type})]`)
        .join('\n');
      messageContent = messageContent
        ? `${messageContent}\n\n${fileDescriptions}`
        : fileDescriptions;
    }

    setInput('');
    setAttachments([]);
    setIsLoading(true);

    // Add user message with attachments info
    const userMsg = await addMessage({
      role: 'user',
      content: messageContent,
      attachments: files.map((f) => ({
        id: f.id,
        name: f.file.name,
        type: f.type,
        size: f.file.size,
        preview: f.preview,
      })),
    });

    // Create assistant message placeholder
    const assistantMsg = await addMessage({
      role: 'assistant',
      content: '',
      steps: [],
    });

    try {
      const messages = [
        ...(workspace.messages || []).map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: 'user' as const, content: content.trim() },
      ];

      const response = await runAgent(messages, {
        skill: workspace.selectedSkill || undefined,
        model: selectedModel.id,
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      const steps: AgentStep[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);

            switch (event.type) {
              case 'status':
                steps.push({ type: 'status', content: event.message });
                break;
              case 'plan':
                steps.push({
                  type: 'plan',
                  content: event.plan?.thought || 'Planning...',
                  data: event.plan,
                });
                break;
              case 'tool_result':
                steps.push({
                  type: 'tool_result',
                  content: `Tool: ${event.tool}`,
                  data: event.result,
                });
                break;
              case 'answer_delta':
                fullContent += event.content || '';
                break;
              case 'error':
                steps.push({ type: 'error', content: event.message });
                break;
            }

            // Update the message in real-time (local state only for streaming)
            updateMessage(assistantMsg.id, {
              content: fullContent,
              steps: [...steps],
            });
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
      updateMessage(assistantMsg.id, {
        content: 'Sorry, there was an error processing your request.',
        steps: [{ type: 'error', content: 'Request failed' }],
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input, attachments);
  };

  // Show loading state
  if (workspaceLoading) {
    return (
      <div className={styles.container}>
        <LoadingSpinner message="Loading workspace..." />
      </div>
    );
  }

  // Show error state
  if (workspaceError || !workspace) {
    return (
      <div className={styles.container}>
        <div className={styles.notFound}>
          {workspaceError || 'Workspace not found'}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          {isEditingTitle ? (
            <input
              type="text"
              className={styles.titleInput}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTitle();
                if (e.key === 'Escape') setIsEditingTitle(false);
              }}
              autoFocus
            />
          ) : (
            <h1 className={styles.title}>{workspace.title}</h1>
          )}
        </div>
        <div className={styles.headerRight}>
          <button
            className={`${styles.iconButton} ${
              workspace.isFavorite ? styles.favorited : ''
            }`}
            onClick={() => toggleFavorite()}
            title={workspace.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star size={18} fill={workspace.isFavorite ? 'currentColor' : 'none'} />
          </button>
          <div className={styles.headerMenuContainer} ref={headerMenuRef}>
            <button
              className={styles.iconButton}
              onClick={() => setShowHeaderMenu(!showHeaderMenu)}
              title="More options"
            >
              <MoreHorizontal size={18} />
            </button>
            {showHeaderMenu && (
              <div className={styles.headerDropdown}>
                <button
                  className={styles.headerMenuItem}
                  onClick={handleRenameWorkspace}
                >
                  <Edit3 size={16} />
                  <span>Rename</span>
                </button>
                <button
                  className={styles.headerMenuItem}
                  onClick={() => {
                    toggleFavorite();
                    setShowHeaderMenu(false);
                  }}
                >
                  <Star size={16} fill={workspace.isFavorite ? 'currentColor' : 'none'} />
                  <span>{workspace.isFavorite ? 'Remove from favorites' : 'Add to favorites'}</span>
                </button>
                <button
                  className={`${styles.headerMenuItem} ${styles.danger}`}
                  onClick={handleDeleteWorkspace}
                >
                  <Trash2 size={16} />
                  <span>Delete</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className={styles.messages}>
        {(!workspace.messages || workspace.messages.length === 0) ? (
          <div className={styles.emptyState}>
            <p>Start a conversation to begin working in this workspace.</p>
          </div>
        ) : (
          workspace.messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
        {isLoading && (
          <div className={styles.loadingIndicator}>
            <Loader2 size={18} className={styles.spinner} />
            <span>Agent is working...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className={styles.inputContainer}>
        <form onSubmit={handleSubmit} className={styles.inputForm}>
          <div className={styles.inputWrapper}>
            {/* Attachments preview */}
            {attachments.length > 0 && (
              <div className={styles.attachmentsPreview}>
                {attachments.map((attachment) => (
                  <div key={attachment.id} className={styles.attachmentItem}>
                    {attachment.type === 'image' && attachment.preview ? (
                      <img
                        src={attachment.preview}
                        alt={attachment.file.name}
                        className={styles.attachmentThumb}
                      />
                    ) : (
                      <div className={styles.attachmentIcon}>
                        {attachment.type === 'document' ? (
                          <FileText size={16} />
                        ) : (
                          <FileIcon size={16} />
                        )}
                      </div>
                    )}
                    <span className={styles.attachmentName}>
                      {attachment.file.name}
                    </span>
                    <button
                      type="button"
                      className={styles.removeAttachment}
                      onClick={() => handleRemoveAttachment(attachment.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              className={styles.input}
              rows={1}
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
            <div className={styles.inputActions}>
              <FileAttachment
                attachments={attachments}
                onAttach={handleAttach}
                onRemove={handleRemoveAttachment}
                disabled={isLoading}
              />

              <div className={styles.modelPicker}>
                <button
                  type="button"
                  className={styles.modelButton}
                  onClick={() => setShowModelPicker(!showModelPicker)}
                >
                  <span>{selectedModel.name}</span>
                  <ChevronDown size={14} />
                </button>
                {showModelPicker && (
                  <div className={styles.modelDropdown}>
                    {models.map((model) => (
                      <button
                        key={model.id}
                        type="button"
                        className={`${styles.modelOption} ${
                          model.id === selectedModel.id ? styles.selected : ''
                        }`}
                        onClick={() => {
                          setSelectedModel(model);
                          setShowModelPicker(false);
                        }}
                      >
                        <span className={styles.modelName}>{model.name}</span>
                        <span className={styles.modelProvider}>{model.provider}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="submit"
                className={styles.sendButton}
                disabled={(!input.trim() && attachments.length === 0) || isLoading}
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`${styles.message} ${isUser ? styles.user : styles.assistant}`}>
      {/* Agent Steps */}
      {!isUser && message.steps && message.steps.length > 0 && (
        <div className={styles.steps}>
          {message.steps.map((step, i) => (
            <div key={i} className={`${styles.step} ${styles[step.type]}`}>
              <span className={styles.stepLabel}>{step.type.toUpperCase()}</span>
              <span className={styles.stepContent}>{step.content}</span>
              {step.data && step.type === 'tool_result' && (
                <pre className={styles.stepData}>
                  {JSON.stringify(step.data, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Attachments */}
      {message.attachments && message.attachments.length > 0 && (
        <div className={styles.messageAttachments}>
          {message.attachments.map((attachment) => (
            <div key={attachment.id} className={styles.messageAttachment}>
              {attachment.type === 'image' && attachment.preview ? (
                <img
                  src={attachment.preview}
                  alt={attachment.name}
                  className={styles.messageAttachmentImage}
                />
              ) : (
                <div className={styles.messageAttachmentFile}>
                  {attachment.type === 'document' ? (
                    <FileText size={20} />
                  ) : (
                    <FileIcon size={20} />
                  )}
                  <span>{attachment.name}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Message Content */}
      {message.content && (
        <div className={styles.messageContent}>
          <p>{message.content}</p>
        </div>
      )}
    </div>
  );
}
