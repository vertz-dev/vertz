import { Avatar } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
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
      <CodeFence>
        <code>
          {`import { Avatar } from 'vertz/components';

<Avatar>
  <Avatar.Image src="/avatar.png" alt="User avatar" />
  <Avatar.Fallback>CN</Avatar.Fallback>
</Avatar>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={avatarProps} />

      <DocH2>AvatarImage Props</DocH2>
      <PropsTable props={avatarImageProps} />
    </>
  );
}
