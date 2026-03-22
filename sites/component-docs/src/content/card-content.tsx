import { Badge, Button, Card, Input, Label, Separator } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2, DocH3 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { cardProps } from '../props/card-props';
export function Content() {
  return (
    <>
      <ComponentPreview>
        <div style={{ width: '100%', maxWidth: '420px' }}>
          <Card>
            <Card.Header>
              <Card.Title>Create project</Card.Title>
              <Card.Description>Deploy your new project in one-click.</Card.Description>
            </Card.Header>
            <Card.Content>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <Label>Name</Label>
                  <Input placeholder="My awesome project" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <Label>Framework</Label>
                  <Input placeholder="Vertz" />
                </div>
              </div>
            </Card.Content>
            <Card.Footer>
              <Card.Action>
                <Button intent="outline" size="sm">
                  Cancel
                </Button>
              </Card.Action>
              <Button size="sm">Create</Button>
            </Card.Footer>
          </Card>
        </div>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { Button, Card, Input, Label } from 'vertz/components';

<Card>
  <Card.Header>
    <Card.Title>Create project</Card.Title>
    <Card.Description>Deploy your new project in one-click.</Card.Description>
  </Card.Header>
  <Card.Content>
    <Label>Name</Label>
    <Input placeholder="My awesome project" />
  </Card.Content>
  <Card.Footer>
    <Card.Action>
      <Button intent="outline" size="sm">Cancel</Button>
    </Card.Action>
    <Button size="sm">Create</Button>
  </Card.Footer>
</Card>`}
        lang="tsx"
      />

      <DocH2>Examples</DocH2>

      <DocH3>Notifications</DocH3>
      <ComponentPreview>
        <div style={{ width: '100%', maxWidth: '420px' }}>
          <Card>
            <Card.Header>
              <Card.Title>Notifications</Card.Title>
              <Card.Description>You have 3 unread messages.</Card.Description>
            </Card.Header>
            <Card.Content>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--color-primary)',
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <p style={{ fontSize: '14px', margin: '0' }}>Your call has been confirmed.</p>
                    <p
                      style={{
                        fontSize: '13px',
                        color: 'var(--color-muted-foreground)',
                        margin: '0',
                      }}
                    >
                      5 min ago
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--color-primary)',
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <p style={{ fontSize: '14px', margin: '0' }}>You have a new message!</p>
                    <p
                      style={{
                        fontSize: '13px',
                        color: 'var(--color-muted-foreground)',
                        margin: '0',
                      }}
                    >
                      1 hour ago
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: 'transparent',
                      border: '1px solid var(--color-muted-foreground)',
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <p style={{ fontSize: '14px', margin: '0' }}>Your subscription is expiring.</p>
                    <p
                      style={{
                        fontSize: '13px',
                        color: 'var(--color-muted-foreground)',
                        margin: '0',
                      }}
                    >
                      2 hours ago
                    </p>
                  </div>
                </div>
              </div>
            </Card.Content>
          </Card>
        </div>
      </ComponentPreview>

      <DocH3>With Badges</DocH3>
      <ComponentPreview>
        <div style={{ width: '100%', maxWidth: '420px' }}>
          <Card>
            <Card.Header>
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <Card.Title>Team Members</Card.Title>
                <Badge>5 members</Badge>
              </div>
              <Card.Description>Manage who has access to this project.</Card.Description>
            </Card.Header>
            <Card.Content>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: '500', margin: '0' }}>Sofia Davis</p>
                    <p
                      style={{
                        fontSize: '13px',
                        color: 'var(--color-muted-foreground)',
                        margin: '0',
                      }}
                    >
                      sofia@example.com
                    </p>
                  </div>
                  <Badge color="blue">Owner</Badge>
                </div>
                <Separator />
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: '500', margin: '0' }}>Jackson Lee</p>
                    <p
                      style={{
                        fontSize: '13px',
                        color: 'var(--color-muted-foreground)',
                        margin: '0',
                      }}
                    >
                      jackson@example.com
                    </p>
                  </div>
                  <Badge color="gray">Member</Badge>
                </div>
                <Separator />
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: '500', margin: '0' }}>
                      Isabella Nguyen
                    </p>
                    <p
                      style={{
                        fontSize: '13px',
                        color: 'var(--color-muted-foreground)',
                        margin: '0',
                      }}
                    >
                      isabella@example.com
                    </p>
                  </div>
                  <Badge color="gray">Member</Badge>
                </div>
              </div>
            </Card.Content>
            <Card.Footer>
              <Card.Action>
                <Button size="sm">Invite Member</Button>
              </Card.Action>
            </Card.Footer>
          </Card>
        </div>
      </ComponentPreview>

      <DocH2>API Reference</DocH2>
      <PropsTable props={cardProps} />
    </>
  );
}
