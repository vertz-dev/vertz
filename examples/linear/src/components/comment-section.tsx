import type { FormSchema } from '@vertz/ui';
import { css, form } from '@vertz/ui';
import { commentApi } from '../api/client';
import type { Comment, CreateCommentBody } from '../lib/types';
import { CommentItem } from './comment-item';

const styles = css({
  section: ['mt:8', 'border-t:1', 'border:border', 'pt:6'],
  heading: ['font:md', 'font:semibold', 'text:foreground', 'mb:4', 'm:0'],
  loading: ['text:sm', 'text:muted-foreground', 'py:4'],
  empty: ['text:sm', 'text:muted-foreground', 'py:4'],
  form: ['mt:4', 'flex', 'flex-col', 'gap:2'],
  textarea: [
    'bg:background',
    'border:1',
    'border:border',
    'rounded:md',
    'px:3',
    'py:2',
    'text:sm',
    'text:foreground',
    'min-h:20',
    'resize:vertical',
  ],
  error: ['text:xs', 'text:destructive'],
  submit: [
    'self:end',
    'px:4',
    'py:2',
    'text:sm',
    'rounded:md',
    'bg:primary.600',
    'text:white',
    'border:0',
    'cursor:pointer',
  ],
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
  const commentForm = form(commentApi.create, {
    schema: createCommentSchema,
    initial: { issueId, body: '' },
    onSuccess: onCommentAdded,
  });

  return (
    <div class={styles.section}>
      <h3 class={styles.heading}>Comments</h3>

      {loading && <div class={styles.loading}>Loading comments...</div>}

      {!loading && comments.length === 0 && <div class={styles.empty}>No comments yet.</div>}

      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          authorName={userMap[comment.authorId]?.name ?? 'Unknown'}
          authorAvatarUrl={userMap[comment.authorId]?.avatarUrl ?? null}
        />
      ))}

      <form
        action={commentForm.action}
        method={commentForm.method}
        onSubmit={commentForm.onSubmit}
        class={styles.form}
      >
        <textarea name="body" placeholder="Add a comment..." class={styles.textarea} />
        {commentForm.body.error && <span class={styles.error}>{commentForm.body.error}</span>}
        <input type="hidden" name="issueId" value={issueId} />
        <button type="submit" disabled={commentForm.submitting} class={styles.submit}>
          {commentForm.submitting ? 'Posting...' : 'Comment'}
        </button>
      </form>
    </div>
  );
}
