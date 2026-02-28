import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { FormGroup: FormGroupSuite, Label, Input } = themeComponents;

export function FormGroupDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Default form group</div>
        {FormGroupSuite.FormGroup({
          children: [
            Label({ children: 'Username' }),
            Input({ name: 'username', placeholder: 'Enter username' }),
          ] as any,
        })}
      </div>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>With error</div>
        {FormGroupSuite.FormGroup({
          children: [
            Label({ children: 'Email' }),
            Input({ name: 'email', placeholder: 'Enter email' }),
            FormGroupSuite.FormError({ children: 'Please enter a valid email address' }),
          ] as any,
        })}
      </div>
    </div>
  );
}
