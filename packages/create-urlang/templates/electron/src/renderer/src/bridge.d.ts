// Types the preload bridge for the renderer — exactly like typing
// window.bridge in a TypeScript Electron app. One entry per exposed method.
declare const bridge: {
  greet(name: string): Promise<string>;
};
