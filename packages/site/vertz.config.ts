import { defineDocsConfig } from '@vertz/docs';

export default defineDocsConfig({
  name: 'Vertz',
  logo: { light: '/logo/light.svg', dark: '/logo/dark.svg' },
  favicon: '/favicon.svg',
  theme: {
    colors: { primary: '#3b82f6' },
    appearance: 'system',
  },
  navbar: {
    links: [
      { label: 'GitHub', href: 'https://github.com/vertz-dev/vertz', icon: 'github' },
    ],
    cta: { label: 'Get Started', href: '/quickstart' },
  },
  footer: {
    socials: {
      github: 'https://github.com/vertz-dev/vertz',
      x: 'https://x.com/veraborgesv',
    },
  },
  search: { enabled: true },
  sidebar: [
    {
      tab: 'Guides',
      groups: [
        {
          title: 'Getting Started',
          pages: [
            'index',
            'quickstart',
            'installation',
            'conventions',
            'philosophy',
            'guides/llm-quick-reference',
          ],
        },
        {
          title: 'vertz/ui',
          pages: [
            'guides/ui/overview',
            'guides/ui/components',
            'guides/ui/component-library',
            'guides/ui/reactivity',
            'guides/ui/styling',
            'guides/ui/routing',
            'guides/ui/data-fetching',
            'guides/ui/auto-field-selection',
            'guides/ui/forms',
            'guides/ui/auth',
            'guides/ui/multi-tenancy',
            'guides/ui/ssr',
            'guides/ui/access-control',
          ],
        },
        {
          title: 'vertz/ui-compiler',
          pages: ['guides/ui/compiler'],
        },
        {
          title: 'vertz/icons',
          pages: ['guides/ui/icons'],
        },
        {
          title: 'vertz/schema',
          pages: ['guides/schema'],
        },
        {
          title: 'vertz/errors',
          pages: ['guides/errors'],
        },
        {
          title: 'vertz/server',
          pages: [
            'guides/server/overview',
            'guides/server/entities',
            'guides/server/domains',
            'guides/server/entity-exposure',
            'guides/server/auth',
            'guides/server/multi-tenancy',
            'guides/server/codegen',
            'guides/server/oauth',
            'guides/server/services',
            'guides/env',
          ],
        },
        {
          title: 'vertz/db',
          pages: [
            'guides/db/overview',
            'guides/db/schema',
            'guides/db/queries',
            'guides/db/migrations',
            'guides/db/introspection',
            'guides/db/seeding',
          ],
        },
        {
          title: 'vertz/fetch',
          pages: ['guides/fetch'],
        },
        {
          title: 'Deployment',
          pages: [
            'guides/deploy/cloudflare',
            'guides/deploy/node',
            'guides/deploy/static-sites',
            'guides/deploy/ssg',
            'guides/deploy/og-images',
          ],
        },
        {
          title: 'Testing',
          pages: ['guides/testing', 'guides/testing-server'],
        },
      ],
    },
    {
      tab: 'API Reference',
      groups: [
        {
          title: 'Generated SDK',
          pages: ['api-reference/fetch/sdk'],
        },
        {
          title: 'vertz/ui',
          pages: [
            'api-reference/ui/reactivity',
            'api-reference/ui/css',
            'api-reference/ui/router',
            'api-reference/ui/query',
            'api-reference/ui/form',
            'api-reference/ui/context',
            'api-reference/ui/mount',
            'api-reference/ui/relative-time',
            'api-reference/ui/foreign',
            'api-reference/ui/list',
          ],
        },
      ],
    },
    {
      tab: 'Examples',
      groups: [
        {
          title: 'Examples',
          pages: ['examples/task-manager'],
        },
      ],
    },
  ],
  redirects: [
    { source: '/guides/getting-started', destination: '/quickstart' },
    { source: '/guides/ui/query', destination: '/guides/ui/data-fetching' },
    { source: '/guides/ui/primitives', destination: '/guides/ui/component-library' },
    { source: '/guides/ui/ui-primitives', destination: '/guides/ui/component-library' },
    { source: '/guides/ui/theme', destination: '/guides/ui/component-library' },
    { source: '/guides/components', destination: '/guides/ui/component-library' },
    { source: '/guides/ui/components-list', destination: '/guides/ui/component-library' },
    { source: '/vision', destination: '/philosophy' },
    { source: '/manifesto', destination: '/philosophy' },
  ],
  llm: { enabled: true },
});
