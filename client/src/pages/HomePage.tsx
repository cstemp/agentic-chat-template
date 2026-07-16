import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Plus, ChevronDown, Zap, GitBranch } from 'lucide-react';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { useModels } from '../hooks/useModels';
import styles from './HomePage.module.css';

interface Skill {
  name: string;
  description: string;
}

const TOOL_CONNECTIONS = [
  {
    id: 'gitlab',
    name: 'GitLab',
    description: 'Clone repos, inspect code, open MRs',
    icon: GitBranch,
    connected: false,
  },
];

export function HomePage() {
  const navigate = useNavigate();
  const { createWorkspace } = useWorkspaces();
  const { models, defaultModel } = useModels();
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [skills, setSkills] = useState<Skill[]>([]);

  // Update selected model when models load
  useEffect(() => {
    if (defaultModel && selectedModel.id !== defaultModel.id) {
      setSelectedModel(defaultModel);
    }
  }, [defaultModel]);

  useEffect(() => {
    // Load skills from API
    fetch('/api/skills')
      .then((res) => res.json())
      .then((data) => setSkills(data.skills || []))
      .catch(console.error);
  }, []);

  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isCreating) return;

    setIsCreating(true);
    try {
      // Create a new workspace and navigate to it with the initial message
      const workspace = await createWorkspace();
      navigate(`/workspace/${workspace.id}`, {
        state: { initialMessage: input.trim(), selectedModel: selectedModel.id },
      });
    } catch (error) {
      console.error('Failed to create workspace:', error);
      setIsCreating(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Mascot/Logo */}
        <div className={styles.mascot}>
          <div className={styles.mascotIcon}>
            <Zap size={48} />
          </div>
        </div>

        {/* Heading */}
        <h1 className={styles.heading}>What would you like to do?</h1>
        <p className={styles.subheading}>Start a new workspace for your task</p>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputWrapper}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Agent to research, write, analyze, or create something..."
              className={styles.input}
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
            <div className={styles.inputActions}>
              <button type="button" className={styles.attachButton}>
                <Plus size={18} />
              </button>

              {/* Model Picker */}
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
                disabled={!input.trim() || isCreating}
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </form>

        <p className={styles.hint}>
          Each workspace is an isolated environment with its own sandbox, tools, and
          conversation.
        </p>

        {/* Tool Connections */}
        <div className={styles.toolConnections}>
          <h3 className={styles.toolsHeading}>Connect tools</h3>
          {TOOL_CONNECTIONS.map((tool) => (
            <div key={tool.id} className={styles.toolItem}>
              <tool.icon size={18} className={styles.toolIcon} />
              <div className={styles.toolInfo}>
                <span className={styles.toolName}>{tool.name}</span>
                <span className={styles.toolDesc}>{tool.description}</span>
              </div>
              <button className={styles.connectButton}>
                {tool.connected ? 'Connected' : 'Connect'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
