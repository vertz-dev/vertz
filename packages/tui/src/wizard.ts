import { prompt } from './prompt';
import { symbols } from './theme';

export interface WizardStep<TId extends string = string, TValue = unknown> {
  id: TId;
  prompt: (ctx: WizardContext) => Promise<TValue>;
}

export interface WizardContext {
  answers: Record<string, unknown>;
}

export interface WizardConfig<TSteps extends readonly WizardStep[]> {
  steps: TSteps;
  onStep?: (info: { current: number; total: number; id: string }) => void;
}

export type WizardResult<TSteps extends readonly WizardStep[]> = {
  [K in TSteps[number] as K['id']]: K extends WizardStep<string, infer V> ? V : never;
};

export async function wizard<const TSteps extends readonly WizardStep[]>(
  config: WizardConfig<TSteps>,
): Promise<WizardResult<TSteps>> {
  const { steps, onStep } = config;
  const answers: Record<string, unknown> = {};
  const total = steps.length;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step) continue;
    const current = i + 1;

    if (onStep) {
      onStep({ current, total, id: step.id });
    } else {
      prompt.log.info(`Step ${current}/${total} ${symbols.dash} ${step.id}`);
    }

    const ctx: WizardContext = { answers: { ...answers } };
    const value = await step.prompt(ctx);
    answers[step.id] = value;
  }

  return answers as WizardResult<TSteps>;
}
