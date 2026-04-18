import { css, formatRelativeTime, token } from '@vertz/ui';
import type { Comment } from '../lib/types';

const styles = css({
  comment: {
    paddingBlock: token.spacing[3],
    borderBottomWidth: '1px',
    borderColor: token.color.border,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: token.spacing[2],
    marginBottom: token.spacing[1],
  },
  avatar: { width: token.spacing[6], height: token.spacing[6], borderRadius: token.radius.full },
  author: {
    fontSize: token.font.size.sm,
    fontWeight: token.font.weight.medium,
    color: token.color.foreground,
  },
  date: { fontSize: token.font.size.xs, color: token.color['muted-foreground'] },
  body: {
    fontSize: token.font.size.sm,
    color: token.color.foreground,
    lineHeight: token.font.lineHeight.relaxed,
    margin: token.spacing[0],
  },
});

interface CommentItemProps {
  comment: Comment;
  authorName: string;
  authorAvatarUrl: string | null;
}

export function CommentItem({ comment, authorName, authorAvatarUrl }: CommentItemProps) {
  return (
    <div className={styles.comment}>
      <div className={styles.header}>
        {authorAvatarUrl && <img className={styles.avatar} src={authorAvatarUrl} alt="" />}
        <span className={styles.author}>{authorName}</span>
        <span className={styles.date}>{formatRelativeTime(comment.createdAt)}</span>
      </div>
      <p className={styles.body}>{comment.body}</p>
    </div>
  );
}
