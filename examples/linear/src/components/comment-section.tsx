import type { FormSchema } from '@vertz/ui';
import { css, form, token } from '@vertz/ui';
import { api } from '../api/client';
import type { Comment, CreateCommentBody } from '../lib/types';
import { formStyles, inputStyles } from '../styles/components';
import { Button } from './button';
import { CommentItem } from './comment-item';

const styles = css({
  section: {
    marginTop: token.spacing[8],
    borderTopWidth: '1px',
    borderColor: token.color.border,
    paddingTop: token.spacing[6],
  },
  heading: {
    fontSize: token.font.size.base,
    fontWeight: token.font.weight.semibold,
    color: token.color.foreground,
    marginBottom: token.spacing[4],
    margin: token.spacing[0],
  },
  loading: {
    fontSize: token.font.size.sm,
    color: token.color['muted-foreground'],
    paddingBlock: token.spacing[4],
  },
  empty: {
    fontSize: token.font.size.sm,
    color: token.color['muted-foreground'],
    paddingBlock: token.spacing[4],
  },
  form: {
    marginTop: token.spacing[4],
    display: 'flex',
    flexDirection: 'column',
    gap: token.spacing[2],
  },
  submitRow: { display: 'flex', justifyContent: 'flex-end' },
});

const createCommentSchema: FormSchema<CreateCommentBody> = {
  parse(data: unknown) {
    if (typeof data !== 'object' || data === null) {
      return { ok: false as const, error: new Error('Invalid form data') };
    }
    const obj = data as Record<string, unknown>;
    const errors: Record<string, string> = {};

    if (!obj.body || typeof obj.body !== 'string' || obj.body.trim().length === 0) {
      errors.body = 'Comment cannot be empty';
    }

    if (Object.keys(errors).length > 0) {
      const err = new Error('Validation failed');
      (err as Error & { fieldErrors: Record<string, string> }).fieldErrors = errors;
      return { ok: false as const, error: err };
    }

    return {
      ok: true as const,
      data: {
        issueId: obj.issueId as string,
        body: (obj.body as string).trim(),
      },
    };
  },
};

interface CommentSectionProps {
  comments: Comment[];
  loading: boolean;
  issueId: string;
  userMap: Record<string, { name: string; avatarUrl: string | null }>;
  onCommentAdded: () => void;
}

export function CommentSection({
  comments,
  loading,
  issueId,
  userMap,
  onCommentAdded,
}: CommentSectionProps) {
  const commentForm = form(api.comments.create, {
    schema: createCommentSchema,
    initial: { issueId, body: '' },
    onSuccess: onCommentAdded,
  });

  return (
    <div className={styles.section} data-testid="comment-section">
      <h3 className={styles.heading}>Comments</h3>

      {loading && <div className={styles.loading}>Loading comments...</div>}

      {!loading && comments.length === 0 && (
        <div className={styles.empty} data-testid="comments-empty">
          No comments yet. Be the first to comment.
        </div>
      )}

      <div data-testid="comment-list">
        {comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            authorName={userMap[comment.authorId]?.name ?? 'Unknown'}
            authorAvatarUrl={userMap[comment.authorId]?.avatarUrl ?? null}
          />
        ))}
      </div>

      <form
        action={commentForm.action}
        method={commentForm.method}
        onSubmit={commentForm.onSubmit}
        className={styles.form}
        data-testid="comment-form"
      >
        <textarea
          name="body"
          placeholder="Add a comment..."
          className={inputStyles.base}
          style="min-height: 5rem; resize: vertical"
          data-testid="comment-input"
        />
        {commentForm.body.error && (
          <span className={formStyles.error}>{commentForm.body.error}</span>
        )}
        <input type="hidden" name="issueId" value={issueId} />
        <div className={styles.submitRow}>
          <Button type="submit" intent="primary" size="sm" disabled={commentForm.submitting.value}>
            {commentForm.submitting ? 'Posting...' : 'Comment'}
          </Button>
        </div>
      </form>
    </div>
  );
}
