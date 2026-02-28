import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Table: T } = themeComponents;

export function TableDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Basic table</div>
        <T.Table>
          <T.TableHeader>
            <T.TableRow>
              <T.TableHead>Name</T.TableHead>
              <T.TableHead>Status</T.TableHead>
              <T.TableHead>Role</T.TableHead>
            </T.TableRow>
          </T.TableHeader>
          <T.TableBody>
            <T.TableRow>
              <T.TableCell>Alice Johnson</T.TableCell>
              <T.TableCell>Active</T.TableCell>
              <T.TableCell>Admin</T.TableCell>
            </T.TableRow>
            <T.TableRow>
              <T.TableCell>Bob Smith</T.TableCell>
              <T.TableCell>Inactive</T.TableCell>
              <T.TableCell>User</T.TableCell>
            </T.TableRow>
            <T.TableRow>
              <T.TableCell>Carol White</T.TableCell>
              <T.TableCell>Active</T.TableCell>
              <T.TableCell>Editor</T.TableCell>
            </T.TableRow>
          </T.TableBody>
        </T.Table>
      </div>
    </div>
  );
}
