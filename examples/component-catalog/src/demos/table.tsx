import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Table: T } = themeComponents;

export function TableDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Basic table</div>
        {T.Table({
          children: [
            T.TableHeader({
              children: T.TableRow({
                children: [
                  T.TableHead({ children: 'Name' }),
                  T.TableHead({ children: 'Status' }),
                  T.TableHead({ children: 'Role' }),
                ] as any,
              }),
            }),
            T.TableBody({
              children: [
                T.TableRow({
                  children: [
                    T.TableCell({ children: 'Alice Johnson' }),
                    T.TableCell({ children: 'Active' }),
                    T.TableCell({ children: 'Admin' }),
                  ] as any,
                }),
                T.TableRow({
                  children: [
                    T.TableCell({ children: 'Bob Smith' }),
                    T.TableCell({ children: 'Inactive' }),
                    T.TableCell({ children: 'User' }),
                  ] as any,
                }),
                T.TableRow({
                  children: [
                    T.TableCell({ children: 'Carol White' }),
                    T.TableCell({ children: 'Active' }),
                    T.TableCell({ children: 'Editor' }),
                  ] as any,
                }),
              ] as any,
            }),
          ] as any,
        })}
      </div>
    </div>
  );
}
