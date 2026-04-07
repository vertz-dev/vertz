import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  apiDevelopmentRuleTemplate,
  appComponentTemplate,
  claudeMdTemplate,
  clientTemplate,
  dbTemplate,
  entryClientTemplate,
  envExampleTemplate,
  envModuleTemplate,
  envTemplate,
  faviconTemplate,
  gitignoreTemplate,
  helloWorldAboutPageTemplate,
  helloWorldAppTemplate,
  helloWorldClaudeMdTemplate,
  helloWorldHomePageTemplate,
  helloWorldNavBarTemplate,
  helloWorldPackageJsonTemplate,
  helloWorldRouterTemplate,
  helloWorldVertzConfigTemplate,
  homePageTemplate,
  packageJsonTemplate,
  schemaTemplate,
  serverTemplate,
  tasksEntityTemplate,
  themeTemplate,
  tsconfigTemplate,
  landingPageAppTemplate,
  landingPageClaudeMdTemplate,
  landingPageCtaSectionTemplate,
  landingPageFeaturesPageTemplate,
  landingPageFeaturesSectionTemplate,
  landingPageFooterTemplate,
  landingPageGlobalsTemplate,
  landingPageHeroTemplate,
  landingPageHomeTemplate,
  landingPageNavTemplate,
  landingPagePackageJsonTemplate,
  landingPagePricingPageTemplate,
  landingPageRouterTemplate,
  landingPageUiRuleTemplate,
  uiDevelopmentRuleTemplate,
  vertzConfigTemplate,
} from './templates/index.js';
import type { ScaffoldOptions } from './types.js';

/**
 * Error thrown when the project directory already exists
 */
export class DirectoryExistsError extends Error {
  constructor(projectName: string) {
    super(`Directory "${projectName}" already exists`);
    this.name = 'DirectoryExistsError';
  }
}

/**
 * Scaffolds a new Vertz project
 * @param parentDir - Parent directory where the project will be created
 * @param options - Scaffold options
 */
export async function scaffold(parentDir: string, options: ScaffoldOptions): Promise<void> {
  const { projectName, template } = options;
  const projectDir = path.join(parentDir, projectName);

  // Check if directory already exists
  try {
    await fs.access(projectDir);
    throw new DirectoryExistsError(projectName);
  } catch (err) {
    if (err instanceof DirectoryExistsError) {
      throw err;
    }
    // Directory doesn't exist, which is what we want
  }

  if (template === 'hello-world') {
    await scaffoldHelloWorld(projectDir, projectName);
  } else if (template === 'landing-page') {
    await scaffoldLandingPage(projectDir, projectName);
  } else {
    await scaffoldTodoApp(projectDir, projectName);
  }
}

/**
 * Scaffolds the hello-world template — UI-only with a reactive counter
 */
async function scaffoldHelloWorld(projectDir: string, projectName: string): Promise<void> {
  const srcDir = path.join(projectDir, 'src');
  const pagesDir = path.join(srcDir, 'pages');
  const componentsDir = path.join(srcDir, 'components');
  const stylesDir = path.join(srcDir, 'styles');
  const claudeRulesDir = path.join(projectDir, '.claude', 'rules');
  const publicDir = path.join(projectDir, 'public');

  await Promise.all([
    fs.mkdir(pagesDir, { recursive: true }),
    fs.mkdir(componentsDir, { recursive: true }),
    fs.mkdir(stylesDir, { recursive: true }),
    fs.mkdir(claudeRulesDir, { recursive: true }),
    fs.mkdir(publicDir, { recursive: true }),
  ]);

  await Promise.all([
    // Config files
    writeFile(projectDir, 'package.json', helloWorldPackageJsonTemplate(projectName)),
    writeFile(projectDir, 'tsconfig.json', tsconfigTemplate()),
    writeFile(projectDir, 'vertz.config.ts', helloWorldVertzConfigTemplate()),
    writeFile(projectDir, '.gitignore', gitignoreTemplate()),
    // UI source files
    writeFile(srcDir, 'app.tsx', helloWorldAppTemplate()),
    writeFile(srcDir, 'entry-client.ts', entryClientTemplate()),
    writeFile(srcDir, 'router.tsx', helloWorldRouterTemplate()),
    writeFile(pagesDir, 'home.tsx', helloWorldHomePageTemplate()),
    writeFile(pagesDir, 'about.tsx', helloWorldAboutPageTemplate()),
    writeFile(componentsDir, 'nav-bar.tsx', helloWorldNavBarTemplate()),
    writeFile(stylesDir, 'theme.ts', themeTemplate()),

    // Static assets
    writeFile(publicDir, 'favicon.svg', faviconTemplate()),

    // LLM rules
    writeFile(projectDir, 'CLAUDE.md', helloWorldClaudeMdTemplate(projectName)),
    writeFile(claudeRulesDir, 'ui-development.md', uiDevelopmentRuleTemplate()),
  ]);
}

/**
 * Scaffolds the todo-app template — full-stack with DB, API, entities, and UI
 */
async function scaffoldTodoApp(projectDir: string, projectName: string): Promise<void> {
  const srcDir = path.join(projectDir, 'src');
  const apiDir = path.join(srcDir, 'api');
  const entitiesDir = path.join(apiDir, 'entities');
  const pagesDir = path.join(srcDir, 'pages');
  const stylesDir = path.join(srcDir, 'styles');
  const claudeRulesDir = path.join(projectDir, '.claude', 'rules');
  const publicDir = path.join(projectDir, 'public');

  await Promise.all([
    fs.mkdir(entitiesDir, { recursive: true }),
    fs.mkdir(pagesDir, { recursive: true }),
    fs.mkdir(stylesDir, { recursive: true }),
    fs.mkdir(claudeRulesDir, { recursive: true }),
    fs.mkdir(publicDir, { recursive: true }),
  ]);

  await Promise.all([
    // Config files
    writeFile(projectDir, 'package.json', packageJsonTemplate(projectName)),
    writeFile(projectDir, 'tsconfig.json', tsconfigTemplate()),
    writeFile(projectDir, 'vertz.config.ts', vertzConfigTemplate()),
    writeFile(projectDir, '.env', envTemplate()),
    writeFile(projectDir, '.env.example', envExampleTemplate()),
    writeFile(projectDir, '.gitignore', gitignoreTemplate()),

    // API source files
    writeFile(apiDir, 'env.ts', envModuleTemplate()),
    writeFile(apiDir, 'server.ts', serverTemplate()),
    writeFile(apiDir, 'schema.ts', schemaTemplate()),
    writeFile(apiDir, 'db.ts', dbTemplate()),
    writeFile(entitiesDir, 'tasks.entity.ts', tasksEntityTemplate()),

    // UI source files
    writeFile(srcDir, 'client.ts', clientTemplate()),
    writeFile(srcDir, 'app.tsx', appComponentTemplate()),
    writeFile(srcDir, 'entry-client.ts', entryClientTemplate()),
    writeFile(pagesDir, 'home.tsx', homePageTemplate()),
    writeFile(stylesDir, 'theme.ts', themeTemplate()),

    // Static assets
    writeFile(publicDir, 'favicon.svg', faviconTemplate()),

    // LLM rules
    writeFile(projectDir, 'CLAUDE.md', claudeMdTemplate(projectName)),
    writeFile(claudeRulesDir, 'api-development.md', apiDevelopmentRuleTemplate()),
    writeFile(claudeRulesDir, 'ui-development.md', uiDevelopmentRuleTemplate()),
  ]);
}

/**
 * Scaffolds the landing-page template — static, section-driven marketing site
 */
async function scaffoldLandingPage(projectDir: string, projectName: string): Promise<void> {
  const srcDir = path.join(projectDir, 'src');
  const pagesDir = path.join(srcDir, 'pages');
  const componentsDir = path.join(srcDir, 'components');
  const stylesDir = path.join(srcDir, 'styles');
  const claudeRulesDir = path.join(projectDir, '.claude', 'rules');
  const publicDir = path.join(projectDir, 'public');

  await Promise.all([
    fs.mkdir(pagesDir, { recursive: true }),
    fs.mkdir(componentsDir, { recursive: true }),
    fs.mkdir(stylesDir, { recursive: true }),
    fs.mkdir(claudeRulesDir, { recursive: true }),
    fs.mkdir(publicDir, { recursive: true }),
  ]);

  await Promise.all([
    // Config files
    writeFile(projectDir, 'package.json', landingPagePackageJsonTemplate(projectName)),
    writeFile(projectDir, 'tsconfig.json', tsconfigTemplate()),
    writeFile(projectDir, 'vertz.config.ts', helloWorldVertzConfigTemplate()),
    writeFile(projectDir, '.gitignore', gitignoreTemplate()),
    // UI source files
    writeFile(srcDir, 'app.tsx', landingPageAppTemplate()),
    writeFile(srcDir, 'entry-client.ts', entryClientTemplate()),
    writeFile(srcDir, 'router.tsx', landingPageRouterTemplate()),
    writeFile(pagesDir, 'home.tsx', landingPageHomeTemplate()),
    writeFile(pagesDir, 'features.tsx', landingPageFeaturesPageTemplate()),
    writeFile(pagesDir, 'pricing.tsx', landingPagePricingPageTemplate()),
    writeFile(componentsDir, 'nav.tsx', landingPageNavTemplate()),
    writeFile(componentsDir, 'footer.tsx', landingPageFooterTemplate()),
    writeFile(componentsDir, 'hero.tsx', landingPageHeroTemplate()),
    writeFile(componentsDir, 'features-section.tsx', landingPageFeaturesSectionTemplate()),
    writeFile(componentsDir, 'cta-section.tsx', landingPageCtaSectionTemplate()),
    writeFile(stylesDir, 'theme.ts', themeTemplate()),
    writeFile(stylesDir, 'globals.ts', landingPageGlobalsTemplate()),

    // Static assets
    writeFile(publicDir, 'favicon.svg', faviconTemplate()),

    // LLM rules
    writeFile(projectDir, 'CLAUDE.md', landingPageClaudeMdTemplate(projectName)),
    writeFile(claudeRulesDir, 'ui-development.md', landingPageUiRuleTemplate()),
  ]);
}

/**
 * Helper to write a file with consistent formatting
 */
async function writeFile(dir: string, filename: string, content: string): Promise<void> {
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, content, 'utf-8');
}
