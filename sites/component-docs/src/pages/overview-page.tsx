import {
  Accordion,
  Alert,
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Calendar,
  Card,
  Checkbox,
  Input,
  Label,
  Pagination,
  Progress,
  RadioGroup,
  Select,
  Separator,
  Skeleton,
  Slider,
  Switch,
  Table,
  Tabs,
  Textarea,
  Toggle,
  ToggleGroup,
} from "@vertz/ui/components";
import { Header } from "../components/header";

// ── Shared styles ────────────────────────────────────────────
const cardStyle: Record<string, string> = {
  border: "1px solid var(--color-border)",
  borderRadius: "calc(var(--radius) * 2)",
  padding: "24px",
  backgroundColor: "var(--color-card)",
};

const cardTitleStyle: Record<string, string> = {
  fontSize: "14px",
  fontWeight: "600",
  color: "var(--color-foreground)",
  margin: "0 0 4px",
};

const cardDescStyle: Record<string, string> = {
  fontSize: "13px",
  color: "var(--color-muted-foreground)",
  margin: "0 0 16px",
};

// no longer used

// ── Demo cards ───────────────────────────────────────────────

function ButtonsDemo() {
  return (
    <div style={cardStyle}>
      <p style={cardTitleStyle}>Buttons</p>
      <p style={cardDescStyle}>All button variants and sizes.</p>
      <div
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <Button intent="primary" size="sm">
          Primary
        </Button>
        <Button intent="secondary" size="sm">
          Secondary
        </Button>
        <Button intent="outline" size="sm">
          Outline
        </Button>
        <Button intent="ghost" size="sm">
          Ghost
        </Button>
      </div>
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginTop: "12px",
          alignItems: "center",
        }}
      >
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large</Button>
      </div>
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginTop: "12px",
          alignItems: "center",
        }}
      >
        <Button intent="destructive" size="sm">
          Destructive
        </Button>
        <Button intent="link" size="sm">
          Link
        </Button>
        <Button disabled size="sm">
          Disabled
        </Button>
      </div>
    </div>
  );
}

function InputsDemo() {
  return (
    <div style={cardStyle}>
      <p style={cardDescStyle}>Text fields and textareas.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <Label>Email</Label>
          <Input type="email" placeholder="you@example.com" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <Label>Message</Label>
          <Textarea placeholder="Type your message here..." />
        </div>
      </div>
    </div>
  );
}

function SliderDemo() {
  return (
    <div style={cardStyle}>
      <p style={cardTitleStyle}>Slider</p>
      <p style={cardDescStyle}>Range input with track and thumb.</p>
      <Slider defaultValue={50} max={100} step={1} />
      <div style={{ marginTop: "16px" }}>
        <Slider defaultValue={75} max={100} step={5} />
      </div>
    </div>
  );
}

function SelectionControlsDemo() {
  return (
    <div style={cardStyle}>
      <p style={cardTitleStyle}>Selection Controls</p>
      <p style={cardDescStyle}>Checkboxes, radios, switches, and toggles.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Checkbox defaultChecked />
          <Label>Accept terms</Label>
          <Checkbox />
          <Label>Subscribe</Label>
        </div>
        <RadioGroup defaultValue="option-1">
          <div style={{ display: "flex", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <RadioGroup.Item value="option-1">Default</RadioGroup.Item>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <RadioGroup.Item value="option-2">Comfortable</RadioGroup.Item>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <RadioGroup.Item value="option-3">Compact</RadioGroup.Item>
            </div>
          </div>
        </RadioGroup>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Switch />
          <Label>Airplane Mode</Label>
          <Switch defaultChecked />
          <Label>Notifications</Label>
        </div>
      </div>
    </div>
  );
}

function BadgesDemo() {
  return (
    <div style={cardStyle}>
      <p style={cardTitleStyle}>Badges</p>
      <p style={cardDescStyle}>Status indicators and labels.</p>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <Badge>Default</Badge>
        <Badge color="blue">Blue</Badge>
        <Badge color="green">Success</Badge>
        <Badge color="red">Error</Badge>
        <Badge color="yellow">Warning</Badge>
        <Badge color="gray">Gray</Badge>
      </div>
    </div>
  );
}

function ToggleDemo() {
  return (
    <div style={cardStyle}>
      <p style={cardTitleStyle}>Toggle & Toggle Group</p>
      <p style={cardDescStyle}>Single and grouped toggle buttons.</p>
      <div
        style={{
          display: "flex",
          gap: "8px",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <Toggle aria-label="Bold">B</Toggle>
        <Toggle aria-label="Italic">I</Toggle>
        <Toggle aria-label="Underline">U</Toggle>
      </div>
      <ToggleGroup type="single" defaultValue={["center"]}>
        <ToggleGroup.Item value="left">Left</ToggleGroup.Item>
        <ToggleGroup.Item value="center">Center</ToggleGroup.Item>
        <ToggleGroup.Item value="right">Right</ToggleGroup.Item>
      </ToggleGroup>
    </div>
  );
}

function CardDemo() {
  return (
    <div>
      <Card>
        <Card.Header>
          <Card.Title>Create project</Card.Title>
          <Card.Description>
            Deploy your new project in one-click.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <div
              style={{ display: "flex", flexDirection: "column", gap: "4px" }}
            >
              <Label>Name</Label>
              <Input placeholder="My awesome project" />
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "4px" }}
            >
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
  );
}

function TabsDemo() {
  return (
    <div style={cardStyle}>
      <p style={cardTitleStyle}>Tabs</p>
      <p style={cardDescStyle}>Tabbed content panels.</p>
      <Tabs defaultValue="account">
        <Tabs.List>
          <Tabs.Trigger value="account">Account</Tabs.Trigger>
          <Tabs.Trigger value="password">Password</Tabs.Trigger>
          <Tabs.Trigger value="settings">Settings</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="account">
          <div style={{ padding: "16px 0" }}>
            <p
              style={{
                fontSize: "14px",
                color: "var(--color-foreground)",
                margin: "0 0 8px",
              }}
            >
              Account Settings
            </p>
            <p
              style={{
                fontSize: "13px",
                color: "var(--color-muted-foreground)",
                margin: "0",
              }}
            >
              Manage your account preferences and profile information.
            </p>
          </div>
        </Tabs.Content>
        <Tabs.Content value="password">
          <div style={{ padding: "16px 0" }}>
            <p
              style={{
                fontSize: "14px",
                color: "var(--color-foreground)",
                margin: "0",
              }}
            >
              Change your password here.
            </p>
          </div>
        </Tabs.Content>
        <Tabs.Content value="settings">
          <div style={{ padding: "16px 0" }}>
            <p
              style={{
                fontSize: "14px",
                color: "var(--color-foreground)",
                margin: "0",
              }}
            >
              Configure your app settings.
            </p>
          </div>
        </Tabs.Content>
      </Tabs>
    </div>
  );
}

function SelectDemo() {
  return (
    <div style={cardStyle}>
      <p style={cardTitleStyle}>Select</p>
      <p style={cardDescStyle}>Dropdown selection menus.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <Label>Fruit</Label>
          <Select placeholder="Select a fruit">
            <Select.Trigger />
            <Select.Content>
              <Select.Item value="apple">Apple</Select.Item>
              <Select.Item value="banana">Banana</Select.Item>
              <Select.Item value="orange">Orange</Select.Item>
              <Select.Item value="grape">Grape</Select.Item>
            </Select.Content>
          </Select>
        </div>
      </div>
    </div>
  );
}

function TableDemo() {
  return (
    <div style={cardStyle}>
      <p style={cardTitleStyle}>Table</p>
      <p style={cardDescStyle}>Data table with header and rows.</p>
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.Head>Invoice</Table.Head>
            <Table.Head>Status</Table.Head>
            <Table.Head>Amount</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row>
            <Table.Cell>INV001</Table.Cell>
            <Table.Cell>Paid</Table.Cell>
            <Table.Cell>$250.00</Table.Cell>
          </Table.Row>
          <Table.Row>
            <Table.Cell>INV002</Table.Cell>
            <Table.Cell>Pending</Table.Cell>
            <Table.Cell>$150.00</Table.Cell>
          </Table.Row>
          <Table.Row>
            <Table.Cell>INV003</Table.Cell>
            <Table.Cell>Unpaid</Table.Cell>
            <Table.Cell>$350.00</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    </div>
  );
}

function AccordionDemo() {
  return (
    <div style={cardStyle}>
      <p style={cardTitleStyle}>Accordion</p>
      <p style={cardDescStyle}>Expandable content sections.</p>
      <Accordion type="single" defaultValue={["item-1"]}>
        <Accordion.Item value="item-1">
          <Accordion.Trigger>Is it accessible?</Accordion.Trigger>
          <Accordion.Content>
            Yes. It adheres to the WAI-ARIA design pattern.
          </Accordion.Content>
        </Accordion.Item>
        <Accordion.Item value="item-2">
          <Accordion.Trigger>Is it styled?</Accordion.Trigger>
          <Accordion.Content>
            Yes. It comes with default styles that match the theme.
          </Accordion.Content>
        </Accordion.Item>
        <Accordion.Item value="item-3">
          <Accordion.Trigger>Is it animated?</Accordion.Trigger>
          <Accordion.Content>
            Yes. It uses CSS transitions for smooth expand/collapse.
          </Accordion.Content>
        </Accordion.Item>
      </Accordion>
    </div>
  );
}

function AlertDemo() {
  return (
    <div style={cardStyle}>
      <p style={cardTitleStyle}>Alerts</p>
      <p style={cardDescStyle}>Informational messages and warnings.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <Alert>
          <Alert.Title>Heads up!</Alert.Title>
          <Alert.Description>
            You can add components to your app using the CLI.
          </Alert.Description>
        </Alert>
        <Alert>
          <Alert.Title>Error</Alert.Title>
          <Alert.Description>
            Your session has expired. Please log in again.
          </Alert.Description>
        </Alert>
      </div>
    </div>
  );
}

function CalendarDemo() {
  return (
    <div style={cardStyle}>
      <p style={cardTitleStyle}>Calendar</p>
      <p style={cardDescStyle}>Date picker calendar grid.</p>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Calendar mode="single" />
      </div>
    </div>
  );
}

function AvatarDemo() {
  return (
    <div style={cardStyle}>
      <p style={cardTitleStyle}>Avatar</p>
      <p style={cardDescStyle}>User profile images with fallback.</p>
      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <Avatar>
          <Avatar.Fallback>CN</Avatar.Fallback>
        </Avatar>
        <Avatar>
          <Avatar.Fallback>JD</Avatar.Fallback>
        </Avatar>
        <Avatar>
          <Avatar.Fallback>AB</Avatar.Fallback>
        </Avatar>
        <Avatar>
          <Avatar.Fallback>MK</Avatar.Fallback>
        </Avatar>
      </div>
    </div>
  );
}

function ProgressDemo() {
  return (
    <div style={cardStyle}>
      <p style={cardTitleStyle}>Progress</p>
      <p style={cardDescStyle}>Visual progress indicators.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <Progress defaultValue={25} />
        <Progress defaultValue={60} />
        <Progress defaultValue={90} />
      </div>
    </div>
  );
}

function SkeletonDemo() {
  return (
    <div style={cardStyle}>
      <p style={cardTitleStyle}>Skeleton</p>
      <p style={cardDescStyle}>Loading placeholder animations.</p>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <Skeleton width="48px" height="48px" className="skeleton-circle" />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            flex: "1",
          }}
        >
          <Skeleton width="60%" height="16px" />
          <Skeleton width="40%" height="14px" />
        </div>
      </div>
      <div
        style={{
          marginTop: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        <Skeleton width="100%" height="14px" />
        <Skeleton width="100%" height="14px" />
        <Skeleton width="80%" height="14px" />
      </div>
    </div>
  );
}

function BreadcrumbDemo() {
  return (
    <div style={cardStyle}>
      <p style={cardTitleStyle}>Breadcrumb</p>
      <p style={cardDescStyle}>Navigation path indicator.</p>
      <Breadcrumb>
        <Breadcrumb.Item href="#">Home</Breadcrumb.Item>
        <Breadcrumb.Item href="#">Components</Breadcrumb.Item>
        <Breadcrumb.Item>Breadcrumb</Breadcrumb.Item>
      </Breadcrumb>
    </div>
  );
}

function PaginationDemo() {
  let currentPage = 3;
  return (
    <div style={cardStyle}>
      <p style={cardTitleStyle}>Pagination</p>
      <p style={cardDescStyle}>Page navigation controls.</p>
      <Pagination
        currentPage={currentPage}
        totalPages={10}
        onPageChange={(page: number) => {
          currentPage = page;
        }}
      />
    </div>
  );
}

function SeparatorDemo() {
  return (
    <div style={cardStyle}>
      <p style={cardTitleStyle}>Separator</p>
      <p style={cardDescStyle}>Visual dividers between content.</p>
      <div>
        <p
          style={{
            fontSize: "14px",
            color: "var(--color-foreground)",
            margin: "0 0 8px",
          }}
        >
          Section A
        </p>
        <Separator />
        <p
          style={{
            fontSize: "14px",
            color: "var(--color-foreground)",
            margin: "8px 0",
          }}
        >
          Section B
        </p>
        <Separator />
        <p
          style={{
            fontSize: "14px",
            color: "var(--color-foreground)",
            margin: "8px 0 0",
          }}
        >
          Section C
        </p>
      </div>
    </div>
  );
}

function TypographyDemo() {
  return (
    <div style={cardStyle}>
      <p style={{ ...cardTitleStyle, fontSize: "16px", margin: "0 0 8px" }}>
        Typography & Colors
      </p>
      <p
        style={{
          fontSize: "13px",
          color: "var(--color-muted-foreground)",
          margin: "0 0 16px",
        }}
      >
        Theme tokens and type hierarchy.
      </p>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          marginBottom: "16px",
        }}
      >
        <p
          style={{
            fontSize: "24px",
            fontWeight: "700",
            color: "var(--color-foreground)",
            margin: "0",
          }}
        >
          Heading
        </p>
        <p
          style={{
            fontSize: "16px",
            fontWeight: "500",
            color: "var(--color-foreground)",
            margin: "0",
          }}
        >
          Subheading text
        </p>
        <p
          style={{
            fontSize: "14px",
            color: "var(--color-muted-foreground)",
            margin: "0",
          }}
        >
          Body text with muted color for descriptions and secondary content.
        </p>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "8px",
        }}
      >
        <ColorSwatch name="background" />
        <ColorSwatch name="foreground" />
        <ColorSwatch name="primary" />
        <ColorSwatch name="secondary" />
        <ColorSwatch name="muted" />
        <ColorSwatch name="accent" />
        <ColorSwatch name="border" />
        <ColorSwatch name="card" />
      </div>
    </div>
  );
}

function ColorSwatch({ name }: { name: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "4px",
      }}
    >
      <div
        style={{
          width: "100%",
          aspectRatio: "1",
          borderRadius: "calc(var(--radius) * 1.33)",
          backgroundColor: `var(--color-${name})`,
          border: "1px solid var(--color-border)",
        }}
      />
      <span
        style={{ fontSize: "10px", color: "var(--color-muted-foreground)" }}
      >
        {name}
      </span>
    </div>
  );
}

function NotificationsCardDemo() {
  return (
    <div>
      <Card>
        <Card.Header>
          <Card.Title>Notifications</Card.Title>
          <Card.Description>You have 3 unread messages.</Card.Description>
        </Card.Header>
        <Card.Content>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: "var(--color-primary)",
                  flexShrink: "0",
                }}
              />
              <div>
                <p style={{ fontSize: "14px", margin: "0" }}>
                  Your call has been confirmed.
                </p>
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--color-muted-foreground)",
                    margin: "0",
                  }}
                >
                  5 min ago
                </p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: "var(--color-primary)",
                  flexShrink: "0",
                }}
              />
              <div>
                <p style={{ fontSize: "14px", margin: "0" }}>
                  You have a new message!
                </p>
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--color-muted-foreground)",
                    margin: "0",
                  }}
                >
                  1 hour ago
                </p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: "transparent",
                  border: "1px solid var(--color-muted-foreground)",
                  flexShrink: "0",
                }}
              />
              <div>
                <p style={{ fontSize: "14px", margin: "0" }}>
                  Your subscription is expiring.
                </p>
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--color-muted-foreground)",
                    margin: "0",
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
  );
}

function TeamCardDemo() {
  return (
    <div>
      <Card>
        <Card.Header>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Card.Title>Team Members</Card.Title>
            <Badge>5 members</Badge>
          </div>
          <Card.Description>
            Manage who has access to this project.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <p style={{ fontSize: "14px", fontWeight: "500", margin: "0" }}>
                  Sofia Davis
                </p>
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--color-muted-foreground)",
                    margin: "0",
                  }}
                >
                  sofia@example.com
                </p>
              </div>
              <Badge color="blue">Owner</Badge>
            </div>
            <Separator />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <p style={{ fontSize: "14px", fontWeight: "500", margin: "0" }}>
                  Jackson Lee
                </p>
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--color-muted-foreground)",
                    margin: "0",
                  }}
                >
                  jackson@example.com
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
  );
}

// ── Page layout ──────────────────────────────────────────────

export function OverviewPage() {
  return (
    <div>
      <Header />
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "32px 24px",
        }}
      >
        <h1
          style={{
            fontSize: "30px",
            fontWeight: "700",
            lineHeight: "1.2",
            color: "var(--color-foreground)",
            margin: "0 0 8px",
          }}
        >
          Component Overview
        </h1>
        <p
          style={{
            fontSize: "16px",
            lineHeight: "1.6",
            color: "var(--color-muted-foreground)",
            margin: "0 0 32px",
          }}
        >
          All components on a single page. Use the theme customizer to preview
          how they look together.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "16px",
          }}
        >
          <TypographyDemo />
          <ButtonsDemo />
          <InputsDemo />
          <BadgesDemo />
          <SliderDemo />
          <SelectDemo />
          <AvatarDemo />
          <ToggleDemo />
          <SelectionControlsDemo />
          <ProgressDemo />
          <SeparatorDemo />
          <BreadcrumbDemo />
          <CardDemo />
          <TabsDemo />
          <AccordionDemo />
          <NotificationsCardDemo />
          <TableDemo />
          <AlertDemo />
          <SkeletonDemo />
          <PaginationDemo />
          <CalendarDemo />
          <TeamCardDemo />
        </div>
      </div>
    </div>
  );
}
