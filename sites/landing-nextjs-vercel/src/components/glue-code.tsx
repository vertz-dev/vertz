import { TOKENS_GLUE_SCHEMA, TOKENS_GLUE_UI } from '@/lib/highlighted-code';
import { TokenLines } from './token-lines';

const OLD_STACK = [
  { file: 'schema.prisma', desc: 'define the shape' },
  { file: 'server/todos.ts', desc: 'define it again for the API' },
  { file: 'lib/validators.ts', desc: 'define it again for validation' },
  { file: 'hooks/useTodos.ts', desc: 'define it again for fetching' },
  { file: 'components/TodoForm.tsx', desc: 'define it again for the form' },
];

export function GlueCode() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <p
          className="text-xs tracking-widest uppercase mb-12 text-center text-gray-500"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          The problem
        </p>

        <div className="grid grid-cols-2 gap-8 items-start">
          <div>
            <p
              className="text-xs uppercase tracking-wide mb-4"
              style={{ fontFamily: 'var(--font-mono)', color: '#a1a1aa' }}
            >
              The typical stack
            </p>
            <div
              className="border rounded-lg p-6 text-sm leading-relaxed bg-gray-950"
              style={{ borderColor: '#1e1e22' }}
            >
              {OLD_STACK.map((item) => (
                <div key={item.file} style={{ fontFamily: 'var(--font-mono)', color: '#52525b' }}>
                  <span className="text-gray-500">{'// '}</span>
                  <span className="text-gray-400">{item.file}</span>
                  <span className="text-gray-600"> — {item.desc}</span>
                </div>
              ))}
            </div>
            <p
              className="text-sm mt-4 text-center"
              style={{ fontFamily: 'var(--font-mono)', color: '#52525b' }}
            >
              5 files. Same shape. Pray they stay in sync.
            </p>
          </div>

          <div>
            <p
              className="text-xs uppercase tracking-wide mb-4"
              style={{ fontFamily: 'var(--font-mono)', color: '#3b82f6' }}
            >
              With Vertz
            </p>
            <div
              className="border rounded-lg p-6 text-sm leading-relaxed bg-gray-950"
              style={{ borderColor: 'rgba(59,130,246,0.3)' }}
            >
              <TokenLines lines={TOKENS_GLUE_SCHEMA} />
              <div style={{ marginTop: '1.25rem' }} />
              <TokenLines lines={TOKENS_GLUE_UI} />
            </div>
            <p
              className="text-sm mt-4 text-center"
              style={{ fontFamily: 'var(--font-mono)', color: '#3b82f6' }}
            >
              1 schema. Everything else is derived.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
