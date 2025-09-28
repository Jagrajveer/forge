// src/types/prompts.d.ts
declare module "prompts" {
  export interface PromptObject<T extends string = string> {
    type: string | ((prev: any, values: any, prompt: any) => string | Promise<string>);
    name: T;
    message: string | ((prev: any, values: any, prompt: any) => string | Promise<string>);
    initial?: any;
    choices?: Array<{ title: string; value: any }>;
    validate?: (value: any) => boolean | string | Promise<boolean | string>;
    format?: (value: any) => any | Promise<any>;
  }

  export type Prompt = <T extends string = string>(
    questions: PromptObject<T> | Array<PromptObject<T>>,
    options?: { onCancel?: () => void; onSubmit?: (prompt: any, answer: any) => void }
  ) => Promise<Record<T, any>>;

  const prompts: Prompt & { inject(values: any[]): void; override(fn: (prompt: any, answer: any) => any): void; };

  export default prompts;
}
