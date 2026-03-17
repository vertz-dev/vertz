import { FormGroup as FormGroupSuite, Input, Label } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function FormGroupDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Default form group</div>
        <FormGroupSuite.FormGroup>
          <Label>Username</Label>
          <Input name="username" placeholder="Enter username" />
        </FormGroupSuite.FormGroup>
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>With error</div>
        <FormGroupSuite.FormGroup>
          <Label>Email</Label>
          <Input name="email" placeholder="Enter email" />
          <FormGroupSuite.FormError>Please enter a valid email address</FormGroupSuite.FormError>
        </FormGroupSuite.FormGroup>
      </div>
    </div>
  );
}
