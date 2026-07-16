import { useState, useEffect } from 'react';
import { getModels, Model } from '../lib/api';

// Default model to use while loading or if fetch fails
const DEFAULT_MODEL: Model = {
  id: 'llama-3.1-8b-instruct',
  name: 'Llama 3.1 8B Instruct',
  provider: 'Meta',
  description: 'Fast and efficient',
};

export function useModels() {
  const [models, setModels] = useState<Model[]>([DEFAULT_MODEL]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchModels() {
      try {
        const data = await getModels();
        if (mounted) {
          setModels(data.length > 0 ? data : [DEFAULT_MODEL]);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error('Failed to fetch models'));
          // Keep the default model on error
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchModels();

    return () => {
      mounted = false;
    };
  }, []);

  return { models, loading, error, defaultModel: models[0] };
}

export type { Model };
