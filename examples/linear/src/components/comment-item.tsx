import { css } from '@vertz/ui';
import { formatRelativeTime } from '../lib/format';
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
