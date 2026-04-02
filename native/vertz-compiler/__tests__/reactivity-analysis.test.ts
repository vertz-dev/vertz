import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

const NATIVE_MODULE_PATH = join(
  import.meta.dir,
  '..',
  'vertz-compiler.darwin-arm64.node',
);

interface VariableInfo {
  name: string;
  kind: string;
  start: number;
  end: number;
  signalProperties?: string[];
  plainProperties?: string[];
  fieldSignalProperties?: string[];
  isReactiveSource?: boolean;
}

interface ComponentInfo {
  name: string;
  bodyStart: number;
  bodyEnd: number;
  variables?: VariableInfo[];
}

function loadCompiler() {
  return require(NATIVE_MODULE_PATH) as {
    compile: (
      source: string,
      options?: { filename?: string },
    ) => {
      code: string;
      components?: ComponentInfo[];
    };
  };
}

function findVar(
  components: ComponentInfo[] | undefined,
  componentName: string,
  varName: string,
): VariableInfo | undefined {
  const comp = components?.find((c) => c.name === componentName);
  return comp?.variables?.find((v) => v.name === varName);
}

describe('Feature: Reactivity classification', () => {
  describe('Given a let variable referenced in JSX', () => {
    describe('When analyzed', () => {
      it('Then classifies it as a signal', () => {
        const { compile } = loadCompiler();
        const source = `
          function Counter() {
            let count = 0;
            return <div>{count}</div>;
          }
        `;
        const result = compile(source, { filename: 'test.tsx' });
        const countVar = findVar(result.components, 'Counter', 'count');
        expect(countVar).toBeDefined();
        expect(countVar!.kind).toBe('signal');
      });
    });
  });

  describe('Given a let variable NOT referenced in JSX', () => {
    describe('When analyzed', () => {
      it('Then classifies it as static', () => {
        const { compile } = loadCompiler();
        const source = `
          function Counter() {
            let temp = 0;
            console.log(temp);
            return <div>hello</div>;
          }
        `;
        const result = compile(source, { filename: 'test.tsx' });
        const tempVar = findVar(result.components, 'Counter', 'temp');
        expect(tempVar).toBeDefined();
        expect(tempVar!.kind).toBe('static');
      });
    });
  });

  describe('Given a const derived from a signal variable', () => {
    describe('When analyzed', () => {
      it('Then classifies it as computed', () => {
        const { compile } = loadCompiler();
        const source = `
          function Counter() {
            let count = 0;
            const doubled = count * 2;
            return <div>{doubled}</div>;
          }
        `;
        const result = compile(source, { filename: 'test.tsx' });
        const doubledVar = findVar(result.components, 'Counter', 'doubled');
        expect(doubledVar).toBeDefined();
        expect(doubledVar!.kind).toBe('computed');
      });
    });
  });

  describe('Given a transitive computed chain', () => {
    describe('When analyzed', () => {
      it('Then classifies all intermediates correctly', () => {
        const { compile } = loadCompiler();
        const source = `
          function Counter() {
            let count = 0;
            const doubled = count * 2;
            const label = 'x: ' + doubled;
            return <div>{label}</div>;
          }
        `;
        const result = compile(source, { filename: 'test.tsx' });
        expect(findVar(result.components, 'Counter', 'count')!.kind).toBe(
          'signal',
        );
        expect(findVar(result.components, 'Counter', 'doubled')!.kind).toBe(
          'computed',
        );
        expect(findVar(result.components, 'Counter', 'label')!.kind).toBe(
          'computed',
        );
      });
    });
  });

  describe('Given a const with no reactive dependencies', () => {
    describe('When analyzed', () => {
      it('Then classifies it as static', () => {
        const { compile } = loadCompiler();
        const source = `
          function App() {
            const title = 'Hello';
            return <div>{title}</div>;
          }
        `;
        const result = compile(source, { filename: 'test.tsx' });
        const titleVar = findVar(result.components, 'App', 'title');
        expect(titleVar).toBeDefined();
        expect(titleVar!.kind).toBe('static');
      });
    });
  });

  describe('Given a const function definition depending on a signal', () => {
    describe('When analyzed', () => {
      it('Then classifies the function as static (stable reference)', () => {
        const { compile } = loadCompiler();
        const source = `
          function App() {
            let count = 0;
            const handler = () => { count++; };
            return <button onClick={handler}>{count}</button>;
          }
        `;
        const result = compile(source, { filename: 'test.tsx' });
        const handlerVar = findVar(result.components, 'App', 'handler');
        expect(handlerVar).toBeDefined();
        expect(handlerVar!.kind).toBe('static');
      });
    });
  });

  describe('Given a query() call with signal properties', () => {
    describe('When analyzed', () => {
      it('Then tracks signal and plain properties', () => {
        const { compile } = loadCompiler();
        const source = `
          import { query } from '@vertz/ui';
          function TaskList() {
            const tasks = query(() => fetchTasks());
            return <div>{tasks.data}</div>;
          }
        `;
        const result = compile(source, { filename: 'test.tsx' });
        const tasksVar = findVar(result.components, 'TaskList', 'tasks');
        expect(tasksVar).toBeDefined();
        expect(tasksVar!.kind).toBe('static');
        expect(tasksVar!.signalProperties).toBeDefined();
        expect(tasksVar!.signalProperties).toContain('data');
        expect(tasksVar!.signalProperties).toContain('loading');
        expect(tasksVar!.signalProperties).toContain('error');
        expect(tasksVar!.plainProperties).toBeDefined();
        expect(tasksVar!.plainProperties).toContain('refetch');
      });
    });
  });

  describe('Given a form() call', () => {
    describe('When analyzed', () => {
      it('Then tracks form signal and plain properties', () => {
        const { compile } = loadCompiler();
        const source = `
          import { form } from '@vertz/ui';
          function CreateTask() {
            const taskForm = form(() => createTask());
            return <form>{taskForm.submitting}</form>;
          }
        `;
        const result = compile(source, { filename: 'test.tsx' });
        const formVar = findVar(result.components, 'CreateTask', 'taskForm');
        expect(formVar).toBeDefined();
        expect(formVar!.kind).toBe('static');
        expect(formVar!.signalProperties).toContain('submitting');
        expect(formVar!.signalProperties).toContain('dirty');
        expect(formVar!.plainProperties).toContain('action');
        expect(formVar!.plainProperties).toContain('onSubmit');
      });
    });
  });

  describe('Given a const derived from a signal API signal property', () => {
    describe('When analyzed', () => {
      it('Then classifies it as computed', () => {
        const { compile } = loadCompiler();
        const source = `
          import { query } from '@vertz/ui';
          function TaskList() {
            const tasks = query(() => fetchTasks());
            const errorMsg = tasks.error ? 'Error' : '';
            return <div>{errorMsg}</div>;
          }
        `;
        const result = compile(source, { filename: 'test.tsx' });
        const errorMsgVar = findVar(
          result.components,
          'TaskList',
          'errorMsg',
        );
        expect(errorMsgVar).toBeDefined();
        expect(errorMsgVar!.kind).toBe('computed');
      });
    });
  });

  describe('Given an aliased signal API import', () => {
    describe('When analyzed', () => {
      it('Then still detects signal properties', () => {
        const { compile } = loadCompiler();
        const source = `
          import { query as fetchData } from '@vertz/ui';
          function TaskList() {
            const tasks = fetchData(() => getTasks());
            return <div>{tasks.data}</div>;
          }
        `;
        const result = compile(source, { filename: 'test.tsx' });
        const tasksVar = findVar(result.components, 'TaskList', 'tasks');
        expect(tasksVar).toBeDefined();
        expect(tasksVar!.signalProperties).toContain('data');
      });
    });
  });

  describe('Given multiple let variables where only some are in JSX', () => {
    describe('When analyzed', () => {
      it('Then only the JSX-referenced ones are signals', () => {
        const { compile } = loadCompiler();
        const source = `
          function App() {
            let visible = true;
            let internalCounter = 0;
            return <div>{visible}</div>;
          }
        `;
        const result = compile(source, { filename: 'test.tsx' });
        expect(findVar(result.components, 'App', 'visible')!.kind).toBe(
          'signal',
        );
        expect(
          findVar(result.components, 'App', 'internalCounter')!.kind,
        ).toBe('static');
      });
    });
  });

  describe('Given a let variable only used in a non-JSX context', () => {
    describe('When analyzed', () => {
      it('Then classifies both the let and its derived const as static', () => {
        const { compile } = loadCompiler();
        const source = `
          function App() {
            let temp = 0;
            const derived = temp + 1;
            console.log(derived);
            return <div>hello</div>;
          }
        `;
        const result = compile(source, { filename: 'test.tsx' });
        expect(findVar(result.components, 'App', 'temp')!.kind).toBe(
          'static',
        );
        expect(findVar(result.components, 'App', 'derived')!.kind).toBe(
          'static',
        );
      });
    });
  });

  describe('Given a let variable transitively reachable from JSX via const', () => {
    describe('When analyzed', () => {
      it('Then classifies the let as signal and the const as computed', () => {
        const { compile } = loadCompiler();
        const source = `
          function App() {
            let temp = 0;
            const derived = temp + 1;
            return <div>{derived}</div>;
          }
        `;
        const result = compile(source, { filename: 'test.tsx' });
        // temp is transitively JSX-reachable (through derived) → signal
        expect(findVar(result.components, 'App', 'temp')!.kind).toBe(
          'signal',
        );
        // derived depends on a signal → computed
        expect(findVar(result.components, 'App', 'derived')!.kind).toBe(
          'computed',
        );
      });
    });
  });

  describe('Given a form() call with field signal properties', () => {
    describe('When analyzed', () => {
      it('Then includes fieldSignalProperties in the output', () => {
        const { compile } = loadCompiler();
        const source = `
          import { form } from '@vertz/ui';
          function CreateTask() {
            const taskForm = form(() => createTask());
            return <form>{taskForm.submitting}</form>;
          }
        `;
        const result = compile(source, { filename: 'test.tsx' });
        const formVar = findVar(result.components, 'CreateTask', 'taskForm');
        expect(formVar).toBeDefined();
        expect(formVar!.fieldSignalProperties).toBeDefined();
        expect(formVar!.fieldSignalProperties).toContain('error');
        expect(formVar!.fieldSignalProperties).toContain('dirty');
        expect(formVar!.fieldSignalProperties).toContain('touched');
        expect(formVar!.fieldSignalProperties).toContain('value');
      });
    });
  });

  describe('Given a destructured signal API call', () => {
    describe('When analyzed', () => {
      it('Then classifies destructured bindings based on property type', () => {
        const { compile } = loadCompiler();
        const source = `
          import { query } from '@vertz/ui';
          function TaskList() {
            const { data, loading, refetch } = query(() => fetchTasks());
            return <div>{data}{loading}</div>;
          }
        `;
        const result = compile(source, { filename: 'test.tsx' });
        const dataVar = findVar(result.components, 'TaskList', 'data');
        expect(dataVar).toBeDefined();
        expect(dataVar!.kind).toBe('signal');
        const loadingVar = findVar(result.components, 'TaskList', 'loading');
        expect(loadingVar).toBeDefined();
        expect(loadingVar!.kind).toBe('signal');
        const refetchVar = findVar(result.components, 'TaskList', 'refetch');
        expect(refetchVar).toBeDefined();
        expect(refetchVar!.kind).toBe('static');
      });
    });
  });

  describe('Given a useContext() call with non-null assertion', () => {
    describe('When analyzed', () => {
      it('Then detects it as a reactive source', () => {
        const { compile } = loadCompiler();
        const source = `
          import { useContext } from '@vertz/ui';
          function App() {
            const ctx = useContext(SomeCtx)!;
            return <div>{ctx.value}</div>;
          }
        `;
        const result = compile(source, { filename: 'test.tsx' });
        const ctxVar = findVar(result.components, 'App', 'ctx');
        expect(ctxVar).toBeDefined();
        expect(ctxVar!.isReactiveSource).toBe(true);
      });
    });
  });

  describe('Given a useAuth() reactive source API', () => {
    describe('When analyzed', () => {
      it('Then marks the variable as a reactive source', () => {
        const { compile } = loadCompiler();
        const source = `
          import { useAuth } from '@vertz/ui';
          function App() {
            const auth = useAuth();
            return <div>{auth.user}</div>;
          }
        `;
        const result = compile(source, { filename: 'test.tsx' });
        const authVar = findVar(result.components, 'App', 'auth');
        expect(authVar).toBeDefined();
        expect(authVar!.isReactiveSource).toBe(true);
      });
    });
  });

  describe('Given a createLoader() call', () => {
    describe('When analyzed', () => {
      it('Then tracks createLoader signal properties', () => {
        const { compile } = loadCompiler();
        const source = `
          import { createLoader } from '@vertz/ui';
          function App() {
            const loader = createLoader(() => fetchData());
            return <div>{loader.data}</div>;
          }
        `;
        const result = compile(source, { filename: 'test.tsx' });
        const loaderVar = findVar(result.components, 'App', 'loader');
        expect(loaderVar).toBeDefined();
        expect(loaderVar!.signalProperties).toContain('data');
        expect(loaderVar!.signalProperties).toContain('loading');
        expect(loaderVar!.signalProperties).toContain('error');
        expect(loaderVar!.plainProperties).toContain('refetch');
      });
    });
  });

  describe('Given a can() call', () => {
    describe('When analyzed', () => {
      it('Then tracks can signal properties', () => {
        const { compile } = loadCompiler();
        const source = `
          import { can } from '@vertz/ui';
          function App() {
            const perm = can('task:update');
            return <div>{perm.allowed}</div>;
          }
        `;
        const result = compile(source, { filename: 'test.tsx' });
        const permVar = findVar(result.components, 'App', 'perm');
        expect(permVar).toBeDefined();
        expect(permVar!.signalProperties).toContain('allowed');
        expect(permVar!.signalProperties).toContain('loading');
        expect(permVar!.signalProperties).toContain('reasons');
      });
    });
  });
});
