import { Loader2 } from 'lucide-react';
import styles from './LoadingSpinner.module.css';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  fullScreen?: boolean;
}

export function LoadingSpinner({
  size = 'md',
  message,
  fullScreen = false,
}: LoadingSpinnerProps) {
  const sizeMap = {
    sm: 16,
    md: 24,
    lg: 40,
  };

  const content = (
    <div className={styles.container}>
      <Loader2 size={sizeMap[size]} className={styles.spinner} />
      {message && <p className={styles.message}>{message}</p>}
    </div>
  );

  if (fullScreen) {
    return <div className={styles.fullScreen}>{content}</div>;
  }

  return content;
}

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
}

export function Skeleton({
  width = '100%',
  height = 20,
  borderRadius = 'var(--radius-md)',
}: SkeletonProps) {
  return (
    <div
      className={styles.skeleton}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius,
      }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className={styles.skeletonCard}>
      <div className={styles.skeletonHeader}>
        <Skeleton width={32} height={32} borderRadius="var(--radius-md)" />
        <Skeleton width={120} height={16} />
      </div>
      <Skeleton height={16} />
      <Skeleton width="70%" height={16} />
    </div>
  );
}
