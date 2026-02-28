import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { FormGroup: FormGroupSuite, Label, Input } = themeComponents;

export function FormGroupDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Default form group</div>
        <FormGroupSuite.FormGroup>
          <Label>Username</Label>
          <Input name="username" placeholder="Enter username" />
        </FormGroupSuite.FormGroup>
      </div>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>With error</div>
        <FormGroupSuite.FormGroup>
          <Label>Email</Label>
          <Input name="email" placeholder="Enter email" />
          <FormGroupSuite.FormError>Please enter a valid email address</FormGroupSuite.FormError>
        </FormGroupSuite.FormGroup>
      </div>
    </div>
  );
}
