import { css } from '@vertz/ui';
import type { Comment } from '../lib/types';

const styles = css({
  comment: ['py:3', 'border-b:1', 'border:border'],
  header: ['flex', 'items:center', 'gap:2', 'mb:1'],
  avatar: ['w:6', 'h:6', 'rounded:full'],
  author: ['text:sm', 'font:medium', 'text:foreground'],
  date: ['text:xs', 'text:muted-foreground'],
  body: ['text:sm', 'text:foreground', 'leading:relaxed', 'm:0'],
});

interface CommentItemProps {
  comment: Comment;
  authorName: string;
  authorAvatarUrl: string | null;
}

export function CommentItem({ comment, authorName, authorAvatarUrl }: CommentItemProps) {
  return (
    <div class={styles.comment}>
      <div class={styles.header}>
        {authorAvatarUrl && <img class={styles.avatar} src={authorAvatarUrl} alt="" />}
        <span class={styles.author}>{authorName}</span>
        <span class={styles.date}>{formatRelativeTime(comment.createdAt)}</span>
      </div>
      <p class={styles.body}>{comment.body}</p>
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
