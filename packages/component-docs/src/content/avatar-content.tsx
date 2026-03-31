import { Avatar } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { avatarImageProps, avatarProps } from '../props/avatar-props';
export function Content() {
  return (
    <>
      <ComponentPreview>
        <Avatar>
          <Avatar.Image src="https://github.com/shadcn.png" alt="User avatar" />
          <Avatar.Fallback>CN</Avatar.Fallback>
        </Avatar>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { Avatar } from 'vertz/components';

<Avatar>
  <Avatar.Image src="/avatar.png" alt="User avatar" />
  <Avatar.Fallback>CN</Avatar.Fallback>
</Avatar>`}
        lang="tsx"
      />

      <DocH2>API Reference</DocH2>
      <PropsTable props={avatarProps} />

      <DocH2>AvatarImage Props</DocH2>
      <PropsTable props={avatarImageProps} />
    </>
  );
}
