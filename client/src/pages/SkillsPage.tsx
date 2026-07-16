import { useEffect, useState } from 'react';
import { Sparkles, Plus, FileText } from 'lucide-react';
import styles from './SkillsPage.module.css';

interface Skill {
  name: string;
  description: string;
  tools?: string[];
}

export function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/skills')
      .then((res) => res.json())
      .then((data) => {
        setSkills(data.skills || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load skills:', err);
        setLoading(false);
      });
  }, []);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Sparkles size={24} className={styles.headerIcon} />
          <div>
            <h1 className={styles.title}>Skills</h1>
            <p className={styles.subtitle}>
              Reusable workflow templates that define how the agent handles specific tasks
            </p>
          </div>
        </div>
        <button className={styles.addButton}>
          <Plus size={18} />
          <span>Create Skill</span>
        </button>
      </header>

      <div className={styles.content}>
        {loading ? (
          <div className={styles.loading}>Loading skills...</div>
        ) : skills.length === 0 ? (
          <div className={styles.emptyState}>
            <FileText size={48} className={styles.emptyIcon} />
            <h3>No skills found</h3>
            <p>Create your first skill to define reusable agent workflows.</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {skills.map((skill) => (
              <SkillCard key={skill.name} skill={skill} />
            ))}
          </div>
        )}
      </div>

      <div className={styles.info}>
        <h3>About Skills</h3>
        <p>
          Skills are lightweight markdown workflow recipes that define how the agent
          should handle specific types of tasks. Each skill can specify:
        </p>
        <ul>
          <li>
            <strong>Name & Description:</strong> Identifies the skill and when to use it
          </li>
          <li>
            <strong>Tools:</strong> Which tools the agent can use during the workflow
          </li>
          <li>
            <strong>Instructions:</strong> Detailed guidance for the agent's behavior
          </li>
        </ul>
        <p>
          Skills are stored as markdown files in <code>public/skills/</code> and can be
          easily customized or extended.
        </p>
      </div>
    </div>
  );
}

function SkillCard({ skill }: { skill: Skill }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardIcon}>
          <Sparkles size={18} />
        </div>
        <h3 className={styles.cardTitle}>{skill.name}</h3>
      </div>
      <p className={styles.cardDescription}>{skill.description}</p>
      {skill.tools && skill.tools.length > 0 && (
        <div className={styles.cardTools}>
          <span className={styles.toolsLabel}>Tools:</span>
          <div className={styles.toolsList}>
            {skill.tools.map((tool) => (
              <span key={tool} className={styles.toolBadge}>
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
